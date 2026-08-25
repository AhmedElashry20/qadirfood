import { IsArray, IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// موظفو اللوحة = مستخدمون بدور ADMIN. الأنواع التانية (مطعم/كابتن/عميل/شركة)
// بتتدار من موديولاتها.

export class CreateStaffDto {
  @ApiProperty({ example: 'سارة الدعم' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  fullName!: string;

  @ApiProperty({ example: 'sara@delivery.sa' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '0512345678' })
  @IsString()
  @Matches(/^0\d{9}$/, { message: 'رقم جوال سعودي غير صحيح (٠ + ٩ أرقام)' })
  phone!: string;

  @ApiProperty({ example: 'Passw0rd!' })
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password!: string;
}

export class UpdateStaffDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  fullName?: string;

  @ApiPropertyOptional({ description: 'تفعيل/تعطيل الدخول' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'إعادة تعيين كلمة المرور' })
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password?: string;
}

/** ضبط صلاحيات موظف — مصفوفة فاضية = صلاحية كاملة (سوبر أدمن). */
export class SetPermissionsDto {
  @ApiProperty({ example: ['payments.refund', 'finance.settle'], type: [String] })
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}
