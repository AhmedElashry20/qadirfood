import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyStatus, SettlementStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCompanyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'اسم الشركة مطلوب' })
  @MaxLength(120)
  nameAr!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  contactPhone?: string;

  @ApiPropertyOptional({ description: 'عمولة المنصة على مستحقات المناديب (٪)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100, { message: 'العمولة لازم تكون بين ٠ و١٠٠' })
  commissionRate?: number;
}

export class UpdateCompanyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameAr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100, { message: 'العمولة لازم تكون بين ٠ و١٠٠' })
  commissionRate?: number;

  @ApiPropertyOptional({ enum: CompanyStatus })
  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus;
}

export class AssignCaptainDto {
  @ApiProperty()
  @IsUUID()
  captainId!: string;

  @ApiPropertyOptional({ description: 'الشركة — null لفكّ ربط الكابتن (يرجع مستقل)' })
  @IsOptional()
  @IsUUID()
  companyId?: string | null;
}

export class CreateCompanyUserDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'اسم المستخدم مطلوب' })
  fullName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'الإيميل مطلوب' })
  email!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'الجوال مطلوب' })
  phone!: string;

  @ApiProperty()
  @IsString()
  @MinLength(6, { message: 'كلمة المرور ٦ أحرف على الأقل' })
  password!: string;
}

export class ListCompaniesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

// ── تسويات الشركة ──

export class RunCompanySettlementDto {
  @ApiPropertyOptional({ description: 'نهاية الفترة — إن كان فارغاً يأخذ الآن' })
  @IsOptional()
  @IsDateString({}, { message: 'تاريخ نهاية الفترة غير صحيح' })
  periodEnd?: string;
}

export class TransferCompanySettlementDto {
  @ApiProperty({ description: 'مرجع الحوالة البنكية' })
  @IsString()
  @IsNotEmpty({ message: 'مرجع الحوالة مطلوب' })
  transferRef!: string;
}

export class SaveCompanyPayoutAccountDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'اسم البنك مطلوب' })
  bankName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'اسم صاحب الحساب مطلوب' })
  accountName!: string;

  @ApiProperty({ description: 'آيبان سعودي — SA + ٢٢ رقم' })
  @IsString()
  @IsNotEmpty({ message: 'الآيبان مطلوب' })
  iban!: string;
}

export class ListCompanySettlementsDto {
  @ApiPropertyOptional({ enum: SettlementStatus })
  @IsOptional()
  @IsEnum(SettlementStatus)
  status?: SettlementStatus;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class PayDistributionDto {
  @ApiPropertyOptional({ description: 'مرجع الدفع للمندوب (حوالة/كاش)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}
