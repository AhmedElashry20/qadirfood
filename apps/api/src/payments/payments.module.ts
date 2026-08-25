import { timingSafeEqual } from 'node:crypto';

import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Logger,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthUser } from '../common';
import { PermissionsGuard, RequirePermission } from '../common/permissions';
import { CaptainsModule } from '../captains/captains.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CashGateway, SandboxGateway } from './payment-gateway';
import { MoyasarGateway } from './moyasar-gateway';
import {
  CreateRefundDto,
  ListRefundsDto,
  PaymentWebhookDto,
  RejectRefundApprovalDto,
  SettleRefundDto,
} from './payments.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('orders/:id')
  @Roles(UserRole.ADMIN, UserRole.CUSTOMER)
  @ApiOperation({ summary: 'تفاصيل دفع الطلب — العملية والاستردادات' })
  payment(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.paymentOf(user, id);
  }

  @Post('orders/:id/refund')
  @Roles(UserRole.ADMIN)
  @RequirePermission('payments.refund')
  @ApiOperation({ summary: 'استرداد كامل أو جزئي' })
  refund(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRefundDto,
  ) {
    return this.payments.refund(user, id, dto);
  }

  @Get('refunds')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'كل الاستردادات' })
  refunds(@Query() query: ListRefundsDto) {
    return this.payments.listRefunds(query.status, query.page ?? 1, query.pageSize ?? 20);
  }

  @Post('refunds/:id/approve')
  @Roles(UserRole.ADMIN)
  @RequirePermission('payments.refund')
  @ApiOperation({ summary: 'موافقة أدمن تاني على استرداد كبير وتنفيذه' })
  approve(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.approveRefund(user, id);
  }

  @Post('refunds/:id/reject')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'رفض الموافقة على استرداد كبير' })
  rejectApproval(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectRefundApprovalDto,
  ) {
    return this.payments.rejectRefundApproval(user, id, dto.reason);
  }

  @Patch('refunds/:id/settle')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'تأكيد تسوية استرداد يدوي (الكاش)' })
  settle(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SettleRefundDto,
  ) {
    return this.payments.settleRefund(user, id, dto.note);
  }

  @Post('refunds/:id/retry')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'إعادة محاولة استرداد فشل' })
  retry(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.retryRefund(id, user);
  }
}

/**
 * رد البوابة — بره الـ JWT لأن اللي بينده مش مستخدم.
 *
 * التحقق بسر مشترك في الهيدر، ومقفول افتراضياً: لو `PAYMENTS_WEBHOOK_SECRET`
 * مش متظبّط الـ endpoint بيرفض كل حاجة. بوابة حقيقية هتستبدل ده بتوقيع HMAC
 * على جسم الطلب — نفس المكان بالظبط.
 */
@ApiTags('payments')
@Controller('payments')
export class PaymentsWebhookController {
  private readonly logger = new Logger(PaymentsWebhookController.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  webhook(@Headers('x-webhook-secret') secret: string | undefined, @Body() dto: PaymentWebhookDto) {
    // الـ webhook العام ده بيصدّق حالة الدفع من **جسم الطلب** (مناسب للـ sandbox/
    // التأكيد اليدوي بس). مع بوابة حقيقية، التأكيد الوحيد المعتمد بيجي من
    // /payments/moyasar/webhook اللي بيعيد التأكد من ميسّر — فبنقفل ده تماماً
    // عشان ماحدّش يزوّر حالة دفع حتى لو السرّ اتسرّب.
    if (this.config.get<string>('PAYMENT_PROVIDER') === 'moyasar') {
      throw new UnauthorizedException('الـ webhook العام مقفول — استخدم webhook البوابة');
    }
    const expected = this.config.get<string>('PAYMENTS_WEBHOOK_SECRET');
    if (!expected) {
      this.logger.error('PAYMENTS_WEBHOOK_SECRET مش متظبّط — الـ webhook مقفول');
      throw new UnauthorizedException('الـ webhook غير مفعّل');
    }
    if (!secret || !this.matches(secret, expected)) {
      throw new UnauthorizedException('توقيع غير صحيح');
    }
    return this.payments.handleWebhook(dto.providerRefId, dto.status);
  }

  /** مقارنة بوقت ثابت — المقارنة العادية بتسرّب طول البادئة الصح. */
  private matches(given: string, expected: string): boolean {
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

/**
 * webhook + رجوع ميسّر — بره الـ JWT (اللي بينده ميسّر مش مستخدم).
 *
 * الأمان: التحقق من `secret_token` (اللي بتظبّطه في لوحة ميسّر) بمقارنة وقت ثابت،
 * وبعدها الخدمة بترجع تسأل ميسّر عن الحالة الرسمية قبل ما تأكّد أي دفع.
 */
@ApiTags('payments')
@Controller('payments/moyasar')
export class MoyasarWebhookController {
  private readonly logger = new Logger(MoyasarWebhookController.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  webhook(@Body() body: Record<string, unknown>) {
    const expected = this.config.get<string>('MOYASAR_WEBHOOK_SECRET');
    if (!expected) {
      this.logger.error('MOYASAR_WEBHOOK_SECRET مش متظبّط — الـ webhook مقفول');
      throw new UnauthorizedException('الـ webhook غير مفعّل');
    }
    const token = typeof body?.secret_token === 'string' ? body.secret_token : '';
    if (!token || !this.matches(token, expected)) {
      throw new UnauthorizedException('توقيع غير صحيح');
    }
    return this.payments.handleMoyasarWebhook(body);
  }

  /** رجوع العميل بعد الدفع — صفحة بسيطة بتقوله يرجّع للتطبيق (التأكيد بالـ webhook). */
  @Get('callback')
  @ApiExcludeEndpoint()
  @Header('Content-Type', 'text/html; charset=utf-8')
  callback() {
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>تم استلام الدفع</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:48px 24px;background:#0b0b0b;color:#fff">
<div style="font-size:56px">✅</div>
<h2>تم استلام عملية الدفع</h2>
<p style="color:#bbb">تقدر ترجع للتطبيق — هنأكّد طلبك خلال لحظات.</p>
</body></html>`;
  }

  private matches(given: string, expected: string): boolean {
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

@Module({
  imports: [PrismaModule, CaptainsModule],
  controllers: [PaymentsController, PaymentsWebhookController, MoyasarWebhookController],
  providers: [PaymentsService, SandboxGateway, CashGateway, MoyasarGateway],
  exports: [PaymentsService],
})
export class PaymentsModule {}
