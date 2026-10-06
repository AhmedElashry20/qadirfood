import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  forwardRef,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { UserRole } from '@prisma/client';

import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthUser } from '../common';
import { PrismaModule } from '../prisma/prisma.module';
import { TrackingModule } from '../tracking/tracking.module';
import { ZonesModule } from '../zones/zones.module';
import { DispatchService } from './dispatch.service';

class AssignCaptainDto {
  @IsUUID() captainId!: string;
}

class DispatchConfigItemDto {
  @IsString() key!: string;
  @IsOptional() @IsString() value?: string;
}

class SaveDispatchConfigDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DispatchConfigItemDto)
  items!: DispatchConfigItemDto[];
}

/**
 * التحكم في التوزيع — `DispatchService` كان بيشتغل في السيرفر من غير أي واجهة
 * تشوفه أو توقفه. الطابور بيوضّح كل طلب مستني كابتن وسبب انتظاره، والإسناد
 * اليدوي هو مخرج الطوارئ لما البحث الآلي مايلاقيش حد.
 *
 * الإسناد اليدوي **مش تجاوز للالتزام**: بيمرّ على نفس شروط أهلية التوزيع الآلي
 * (وثائق سارية، بطاقة هيئة النقل، التحقق بالوجه)، وبيرفض لو الكابتن مش مؤهّل.
 */
@ApiTags('admin/dispatch')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/dispatch')
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  @Get('queue')
  @ApiOperation({ summary: 'طابور التوزيع — كل طلب مستني كابتن وسبب انتظاره' })
  queue() {
    return this.dispatch.adminQueue();
  }

  @Get('config')
  @ApiOperation({ summary: 'إعدادات التوزيع الفعّالة ومصدر كل قيمة' })
  config() {
    return this.dispatch.dispatchConfig();
  }

  @Patch('config')
  @ApiOperation({ summary: 'تعديل إعدادات التوزيع (فراغ = رجوع لمتغيّر البيئة)' })
  saveConfig(@Body() dto: SaveDispatchConfigDto) {
    return this.dispatch.saveDispatchConfig(dto.items);
  }

  @Get(':orderId/offers')
  @ApiOperation({ summary: 'سجل العروض على طلب — على من عُرض وما كان رده' })
  offers(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.dispatch.offersFor(orderId);
  }

  @Get(':orderId/eligible-captains')
  @ApiOperation({ summary: 'الكباتن المؤهّلين للطلب — بنفس شروط التوزيع الآلي' })
  eligible(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.dispatch.eligibleCaptainsFor(orderId);
  }

  @Post(':orderId/assign')
  @ApiOperation({ summary: 'إسناد الطلب لكابتن يدوياً' })
  assign(
    @CurrentUser() user: AuthUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: AssignCaptainDto,
  ) {
    return this.dispatch.adminAssign(orderId, dto.captainId, user.userId);
  }

  @Post(':orderId/redispatch')
  @ApiOperation({ summary: 'إعادة تشغيل البحث عن كابتن فوراً' })
  redispatch(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.dispatch.adminRedispatch(orderId);
  }
}

@Module({
  imports: [PrismaModule, forwardRef(() => TrackingModule), ZonesModule],
  controllers: [DispatchController],
  providers: [DispatchService],
  exports: [DispatchService],
})
export class DispatchModule {}
