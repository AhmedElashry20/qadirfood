import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsBooleanString,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CaptainStatus,
  DocumentType,
  PayoutDestination,
  VehicleType,
  WithdrawalStatus,
} from '@prisma/client';

/** مدى تقرير الأرباح — الأسبوع بيبدأ من السبت والشهر من أول يوم فيه. */
export enum EarningsRange {
  TODAY = 'today',
  WEEK = 'week',
  MONTH = 'month',
}

/** فلتر مصفوفة الوثائق في لوحة الأدمن. */
export enum ComplianceFilter {
  ALL = 'all',
  EXPIRING = 'expiring',
  EXPIRED = 'expired',
}

// ── مشترك ──

/** ترقيم الصفحات — نفس أسماء ListOrdersDto عشان الواجهات تتعامل مع شكل واحد. */
export class PaginationDto {
  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

// ── الملف الشخصي ──

export class UpdateCaptainDto {
  @ApiPropertyOptional({ enum: VehicleType, example: VehicleType.MOTORCYCLE })
  @IsOptional()
  @IsEnum(VehicleType, { message: 'نوع المركبة غير صحيح' })
  vehicleType?: VehicleType;

  @ApiPropertyOptional({ example: 'ط ح ب ٤٢٨١' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'رقم اللوحة لا يمكن أن يكون فارغاً' })
  @MaxLength(20)
  plateNumber?: string;

  /** الرابط الراجع من `POST /api/uploads` بمجلد avatars. */
  @ApiPropertyOptional({ example: '/uploads/avatars/6f1c…-9ab2c1d0e3f4.jpg' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'رابط الصورة لا يمكن أن يكون فارغاً' })
  avatarUrl?: string;
}

// ── الوثائق ──

export class UploadDocumentDto {
  @ApiProperty({ enum: DocumentType, example: DocumentType.LICENSE })
  @IsEnum(DocumentType, { message: 'نوع الوثيقة غير صحيح' })
  type!: DocumentType;

  /** الرابط الراجع من `POST /api/uploads` بمجلد documents — مافيش رفع من هنا. */
  @ApiProperty({ example: '/uploads/documents/6f1c…-9ab2c1d0e3f4.pdf' })
  @IsString()
  @IsNotEmpty({ message: 'رابط الملف إلزامي' })
  fileUrl!: string;

  @ApiPropertyOptional({ example: '2027-03-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString({}, { message: 'تاريخ الانتهاء غير صحيح' })
  expiresAt?: string;
}

export class ReviewDocumentDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  approved!: boolean;

  /** إلزامي لما `approved = false` — الكابتن لازم يعرف يصلّح إيه. */
  @ApiPropertyOptional({ example: 'الصورة غير واضحة' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'سبب الرفض مطلوب' })
  @MaxLength(300)
  rejectReason?: string;

  @ApiPropertyOptional({ example: '2027-03-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString({}, { message: 'تاريخ الانتهاء غير صحيح' })
  expiresAt?: string;
}

// ── الأرباح ──

export class EarningsQueryDto {
  @ApiPropertyOptional({ enum: EarningsRange, default: EarningsRange.TODAY })
  @IsOptional()
  @IsEnum(EarningsRange, { message: 'المدى غير صحيح' })
  range?: EarningsRange;
}

// ── المحفظة والسحب ──

export class CreateWithdrawalDto {
  @ApiProperty({ example: 250, minimum: 50 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'المبلغ غير صحيح' })
  @Min(50, { message: 'الحد الأدنى للسحب ٥٠ ر.س' })
  amount!: number;

  @ApiProperty({ example: '8e1b0e2a-7c1f-4b8e-9d3a-0a5f2c6d1b44' })
  @IsUUID(undefined, { message: 'حساب الاستلام غير صحيح' })
  payoutMethodId!: string;
}

export class RejectWithdrawalDto {
  @ApiProperty({ example: 'الآيبان غير مطابق لاسم الكابتن' })
  @IsString()
  @IsNotEmpty({ message: 'سبب الرفض مطلوب' })
  @MaxLength(300)
  reason!: string;
}

export class SuspendCaptainDto {
  @ApiProperty({ example: 'تكرار إلغاء الرحلات بعد الاستلام' })
  @IsString()
  @IsNotEmpty({ message: 'سبب الإيقاف مطلوب' })
  @MaxLength(300)
  reason!: string;

  /** إيقاف كابتن في مهمة جارية — الطلب هيتعلّق لحد ما يتعاد إسناده. */
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class ListWithdrawalsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: WithdrawalStatus, default: WithdrawalStatus.PENDING })
  @IsOptional()
  @IsEnum(WithdrawalStatus, { message: 'حالة الطلب غير صحيحة' })
  status?: WithdrawalStatus;
}

export class CreatePayoutMethodDto {
  @ApiProperty({ enum: PayoutDestination, example: PayoutDestination.BANK })
  @IsEnum(PayoutDestination, { message: 'جهة الاستلام غير صحيحة' })
  destination!: PayoutDestination;

  @ApiProperty({ example: 'بنك الراجحي' })
  @IsString()
  @IsNotEmpty({ message: 'اسم الجهة إلزامي' })
  @MaxLength(60)
  label!: string;

  /** الآيبان أو رقم الجوال — بيتخزن كامل وبيرجع مقنّع دايماً. */
  @ApiProperty({ example: 'SA0380000000608010167519' })
  @IsString()
  @IsNotEmpty({ message: 'رقم الحساب إلزامي' })
  @MinLength(6, { message: 'رقم الحساب غير صحيح' })
  @MaxLength(34)
  accountRef!: string;
}

// ── الأدمن ──

export class ListCaptainsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: CaptainStatus })
  @IsOptional()
  @IsEnum(CaptainStatus, { message: 'حالة الكابتن غير صحيحة' })
  status?: CaptainStatus;

  /** بحث بالاسم أو الجوال أو رقم اللوحة أو الهوية. */
  @ApiPropertyOptional({ example: 'أحمد' })
  @IsOptional()
  @IsString()
  search?: string;

  /** فلترة على شركة أسطول. للأدمن اختياري؛ لمستخدم الشركة بيتفرض على شركته. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  companyId?: string;

  /** `true` = المستقلين بس (بدون شركة). بيتجاهل مع `companyId`. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBooleanString()
  freelanceOnly?: string;
}

export class ComplianceQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ComplianceFilter, default: ComplianceFilter.ALL })
  @IsOptional()
  @IsEnum(ComplianceFilter, { message: 'الفلتر غير صحيح' })
  filter?: ComplianceFilter;
}
