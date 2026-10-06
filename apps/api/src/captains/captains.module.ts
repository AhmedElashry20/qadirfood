import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CaptainsService } from './captains.service';
import {
  ComplianceQueryDto,
  CreatePayoutMethodDto,
  CreateWithdrawalDto,
  EarningsQueryDto,
  EarningsRange,
  ListCaptainsDto,
  ListWithdrawalsDto,
  PaginationDto,
  RejectWithdrawalDto,
  ReviewDocumentDto,
  SuspendCaptainDto,
  UpdateCaptainDto,
  UploadDocumentDto,
} from './captains.dto';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthUser } from '../common';
import { FaceModule } from '../face/face.module';

/**
 * خدمة الكابتن لنفسه — كل مسار هنا بيتقفل على `user.captainId`.
 * لازم يتسجّل **قبل** كنترولر الأدمن عشان `/captains/me` ما يقعش على `/captains/:id`.
 */
@ApiTags('captains')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CAPTAIN)
@Controller('captains/me')
export class CaptainsMeController {
  constructor(private readonly service: CaptainsService) {}

  // ── الملف الشخصي ──

  @Get()
  @ApiOperation({ summary: 'ملف الكابتن — التقييم والرصيد وملخّص الوثائق' })
  me(@CurrentUser() user: AuthUser) {
    return this.service.getProfile(this.service.requireCaptainId(user));
  }

  @Patch()
  @ApiOperation({ summary: 'تعديل المركبة / رقم اللوحة / الصورة الشخصية' })
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateCaptainDto) {
    return this.service.updateProfile(this.service.requireCaptainId(user), user.userId, dto);
  }

  // ── الوثائق ──

  @Get('documents')
  @ApiOperation({ summary: 'الخمس وثائق كلها — الناقص بيرجع MISSING' })
  documents(@CurrentUser() user: AuthUser) {
    return this.service.listMyDocuments(this.service.requireCaptainId(user));
  }

  @Post('documents')
  @ApiOperation({ summary: 'رفع/استبدال وثيقة — الرابط من POST /api/uploads' })
  uploadDocument(@CurrentUser() user: AuthUser, @Body() dto: UploadDocumentDto) {
    return this.service.upsertMyDocument(this.service.requireCaptainId(user), dto);
  }

  // ── الأرباح ──

  @Get('earnings')
  @ApiOperation({ summary: 'أرباح اليوم / الأسبوع / الشهر بسلسلة يومية مملّية أصفار' })
  earnings(@CurrentUser() user: AuthUser, @Query() query: EarningsQueryDto) {
    return this.service.getMyEarnings(this.service.requireCaptainId(user), query);
  }

  @Get('distributions')
  @ApiOperation({ summary: 'توزيعات شركتي — إن كان تابعاً لشركة، فهذه أرباحه بدل المحفظة' })
  distributions(@CurrentUser() user: AuthUser) {
    return this.service.myDistributions(this.service.requireCaptainId(user));
  }

  // ── الورديات ──

  @Post('shifts/start')
  @HttpCode(200)
  @ApiOperation({ summary: 'بدء وردية — الكابتن بيبقى أونلاين' })
  startShift(@CurrentUser() user: AuthUser) {
    return this.service.startShift(this.service.requireCaptainId(user));
  }

  @Post('shifts/end')
  @HttpCode(200)
  @ApiOperation({ summary: 'إنهاء الوردية — الكابتن بيبقى أوفلاين' })
  endShift(@CurrentUser() user: AuthUser) {
    return this.service.endShift(this.service.requireCaptainId(user));
  }

  @Get('shifts')
  @ApiOperation({ summary: 'ورديات الفترة + ساعات الاتصال والرحلات والأرباح' })
  shifts(@CurrentUser() user: AuthUser, @Query() query: EarningsQueryDto) {
    return this.service.getMyShifts(this.service.requireCaptainId(user), query.range ?? EarningsRange.TODAY);
  }

  // ── المحفظة ──

  @Get('wallet')
  @ApiOperation({ summary: 'الرصيد والمعلّق والمتاح للسحب وحسابات الاستلام' })
  wallet(@CurrentUser() user: AuthUser) {
    return this.service.getMyWallet(this.service.requireCaptainId(user));
  }

  @Get('wallet/transactions')
  @ApiOperation({ summary: 'كشف حركة المحفظة — الأحدث أولاً' })
  transactions(@CurrentUser() user: AuthUser, @Query() query: PaginationDto) {
    return this.service.listMyTransactions(this.service.requireCaptainId(user), query);
  }

  // ── السحب ──

  @Post('withdrawals')
  @ApiOperation({ summary: 'طلب سحب — الحد الأدنى ٥٠ ر.س، الخصم عند الاعتماد' })
  createWithdrawal(@CurrentUser() user: AuthUser, @Body() dto: CreateWithdrawalDto) {
    return this.service.createMyWithdrawal(this.service.requireCaptainId(user), dto);
  }

  @Get('withdrawals')
  @ApiOperation({ summary: 'طلبات السحب بتاعة الكابتن' })
  withdrawals(@CurrentUser() user: AuthUser, @Query() query: PaginationDto) {
    return this.service.listMyWithdrawals(this.service.requireCaptainId(user), query);
  }

  // ── حسابات الاستلام ──

  @Get('payout-methods')
  @ApiOperation({ summary: 'حسابات استلام الأرباح — أرقام الحسابات بترجع مقنّعة' })
  payoutMethods(@CurrentUser() user: AuthUser) {
    return this.service.listMyPayoutMethods(this.service.requireCaptainId(user));
  }

  @Post('payout-methods')
  @ApiOperation({ summary: 'إضافة حساب استلام — أول حساب بيبقى الافتراضي' })
  createPayoutMethod(@CurrentUser() user: AuthUser, @Body() dto: CreatePayoutMethodDto) {
    return this.service.createMyPayoutMethod(this.service.requireCaptainId(user), dto);
  }

  @Delete('payout-methods/:id')
  @ApiOperation({ summary: 'حذف حساب استلام — لو كان الافتراضي بيترقّى غيره' })
  deletePayoutMethod(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteMyPayoutMethod(this.service.requireCaptainId(user), id);
  }
}

/**
 * سطح الأدمن — شاشات الالتزام والمحافظ. المسارات الثابتة (compliance /
 * withdrawals / documents) لازم تفضل **فوق** `:id` عشان ما تتبلعش فيه.
 */
@ApiTags('captains')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('captains')
export class CaptainsAdminController {
  constructor(private readonly service: CaptainsService) {}

  @Get('compliance')
  @ApiOperation({ summary: 'مصفوفة الوثائق — صف لكل كابتن + dispatchAllowed' })
  compliance(@Query() query: ComplianceQueryDto) {
    return this.service.getCompliance(query);
  }

  @Get('withdrawals/pending')
  @ApiOperation({ summary: 'طلبات السحب — المعلّقة افتراضياً، و ?status= بيغيّرها' })
  withdrawals(@Query() query: ListWithdrawalsDto) {
    return this.service.listWithdrawals(query);
  }

  @Patch('withdrawals/:id/approve')
  @ApiOperation({ summary: 'اعتماد سحب — خصم الرصيد وسطر في الكشف في معاملة واحدة' })
  approveWithdrawal(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.approveWithdrawal(id, user.userId);
  }

  @Patch('withdrawals/:id/reject')
  @ApiOperation({ summary: 'رفض سحب — السبب إلزامي، الرصيد ما بيتغيّرش' })
  rejectWithdrawal(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectWithdrawalDto,
  ) {
    return this.service.rejectWithdrawal(id, user.userId, dto.reason);
  }

  @Patch('documents/:id/review')
  @ApiOperation({ summary: 'اعتماد/رفض وثيقة — وبيحدّث توثيق الكابتن في نفس المعاملة' })
  reviewDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.service.reviewDocument(id, user.userId, dto);
  }

  @Patch(':id/suspend')
  @ApiOperation({ summary: 'إيقاف كابتن — منع فوري للدخول والتوزيع (السبب إلزامي)' })
  suspend(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuspendCaptainDto,
  ) {
    return this.service.suspendCaptain(id, user.userId, dto.reason, dto.force ?? false);
  }

  @Patch(':id/reinstate')
  @ApiOperation({ summary: 'رفع الإيقاف عن كابتن' })
  reinstate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.reinstateCaptain(id, user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'قايمة الكباتن — فلترة بالحالة وبحث بالاسم/الجوال/اللوحة' })
  list(@Query() query: ListCaptainsDto) {
    return this.service.listCaptains(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ملف كابتن معيّن — نفس شكل /captains/me' })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getProfile(id);
  }
}

@Module({
  imports: [FaceModule],
  providers: [CaptainsService],
  controllers: [CaptainsMeController, CaptainsAdminController],
  exports: [CaptainsService],
})
export class CaptainsModule {}
