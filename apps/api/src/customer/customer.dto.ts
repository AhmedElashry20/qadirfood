import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** ترتيب نتائج التصفح في تطبيق العميل. */
export enum BranchSort {
  NEAREST = 'nearest',
  FASTEST = 'fastest',
  TOP_RATED = 'top_rated',
}

// ── الملف الشخصي ──

export class UpdateMeDto {
  @ApiPropertyOptional({ example: 'أحمد العشري' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'الاسم لا يمكن أن يكون فارغاً' })
  fullName?: string;

  @ApiPropertyOptional({ example: 'ahmed@example.com' })
  @IsOptional()
  @IsEmail({}, { message: 'البريد الإلكتروني غير صحيح' })
  email?: string;
}

// ── العناوين ──

export class CreateAddressDto {
  @ApiProperty({ example: 'البيت' })
  @IsString()
  @IsNotEmpty({ message: 'اسم العنوان إلزامي' })
  label!: string;

  @ApiProperty({ example: 'الرياض' })
  @IsString()
  @IsNotEmpty({ message: 'المدينة إلزامية' })
  city!: string;

  @ApiPropertyOptional({ example: 'حي النرجس' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({ example: 'شارع الملك فهد' })
  @IsOptional()
  @IsString()
  street?: string;

  @ApiPropertyOptional({ example: 'عمارة ١٢ — الدور ٣' })
  @IsOptional()
  @IsString()
  building?: string;

  @ApiPropertyOptional({ example: 'الجرس معطّل — اتصل بي' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ example: 24.7136, minimum: -90, maximum: 90 })
  @Type(() => Number)
  @IsNumber({}, { message: 'خط العرض غير صحيح' })
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ example: 46.6753, minimum: -180, maximum: 180 })
  @Type(() => Number)
  @IsNumber({}, { message: 'خط الطول غير صحيح' })
  @Min(-180)
  @Max(180)
  lng!: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateAddressDto {
  @ApiPropertyOptional({ example: 'الشغل' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'اسم العنوان لا يمكن أن يكون فارغاً' })
  label?: string;

  @ApiPropertyOptional({ example: 'الرياض' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'المدينة لا يمكن أن تكون فارغة' })
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  street?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  building?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ minimum: -90, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'خط العرض غير صحيح' })
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ minimum: -180, maximum: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'خط الطول غير صحيح' })
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

// ── التصفح ──

export class BrowseBranchesDto {
  @ApiProperty({ example: 24.7136 })
  @Type(() => Number)
  @IsNumber({}, { message: 'خط العرض غير صحيح' })
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ example: 46.6753 })
  @Type(() => Number)
  @IsNumber({}, { message: 'خط الطول غير صحيح' })
  @Min(-180)
  @Max(180)
  lng!: number;

  /** نطاق البحث بالكيلومتر — الافتراضي ١٠. */
  @ApiPropertyOptional({ example: 10, minimum: 0.1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'نطاق البحث غير صحيح' })
  @Min(0.1)
  @Max(50)
  radiusKm?: number;

  /** بحث باسم المطعم أو نوع المطبخ أو اسم صنف في المنيو. */
  @ApiPropertyOptional({ example: 'برجر' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: BranchSort, default: BranchSort.NEAREST })
  @IsOptional()
  @IsEnum(BranchSort)
  sort?: BranchSort;
}

/** إحداثيات اختيارية — بتستخدم لحساب المسافة في المفضلة وصفحة الفرع. */
export class GeoQueryDto {
  @ApiPropertyOptional({ example: 24.7136 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'خط العرض غير صحيح' })
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ example: 46.6753 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'خط الطول غير صحيح' })
  @Min(-180)
  @Max(180)
  lng?: number;
}

// ── الكوبونات ──

export class ValidateCouponDto {
  @ApiProperty({ example: 'WELCOME20' })
  @IsString()
  @IsNotEmpty({ message: 'كود الكوبون إلزامي' })
  code!: string;

  /** مجموع السلة قبل التوصيل والضريبة. */
  @ApiProperty({ example: 85.5 })
  @Type(() => Number)
  @IsNumber({}, { message: 'قيمة الطلب غير صحيحة' })
  @Min(0)
  subtotal!: number;
}

/** POST /customer/loyalty/quote */
export class QuoteRedemptionDto {
  @ApiProperty({ example: 500, description: 'النقاط المطلوب استبدالها' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  points!: number;

  /** سقف الخصم بالريال — عادةً مجموع السلة ناقص خصم الكوبون. */
  @ApiProperty({ example: 45.5 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxDiscountSar!: number;
}

/** POST /customer/referral/apply */
export class ApplyReferralDto {
  @ApiProperty({ example: 'K7M2PQR' })
  @IsString()
  @IsNotEmpty({ message: 'رمز الإحالة مطلوب' })
  @MaxLength(16)
  code!: string;
}
