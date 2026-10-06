import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RefundLiability, RefundStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateRefundDto {
  @ApiPropertyOptional({ description: 'المبلغ — إن كان فارغاً يُسترد الباقي كله' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'المبلغ لازم يكون رقم بمنزلتين عشريتين على الأكتر' })
  @Min(0.01, { message: 'المبلغ لازم يكون أكبر من صفر' })
  amount?: number;

  @ApiProperty({ description: 'سبب الاسترداد — بيتسجّل ويبان للعميل' })
  @IsString()
  @IsNotEmpty({ message: 'سبب الاسترداد مطلوب' })
  @MaxLength(300, { message: 'سبب الاسترداد طويل — ٣٠٠ حرف كحد أقصى' })
  reason!: string;

  @ApiPropertyOptional({
    enum: RefundLiability,
    description: 'من يتحمّل التكلفة — يحدّد رجوع العمولة والخصم من الكابتن',
  })
  @IsOptional()
  @IsEnum(RefundLiability, { message: 'جهة التحمّل غير معروفة' })
  liability?: RefundLiability;
}

export class ListRefundsDto {
  @ApiPropertyOptional({ enum: RefundStatus })
  @IsOptional()
  @IsEnum(RefundStatus)
  status?: RefundStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

/** شكل الـ webhook — البوابات الحقيقية بتبعت أكتر من كده، بناخد اللي يهمنا. */
export class PaymentWebhookDto {
  @IsString()
  @IsNotEmpty()
  providerRefId!: string;

  @IsIn(['PAID', 'FAILED'], { message: 'حالة غير معروفة' })
  status!: 'PAID' | 'FAILED';
}

export class SettleRefundDto {
  @ApiPropertyOptional({ description: 'ملاحظة التسوية — رقم الحوالة أو إيصال التسليم' })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'الملاحظة طويلة — ٢٠٠ حرف كحد أقصى' })
  note?: string;
}

export class RejectRefundApprovalDto {
  @ApiProperty({ description: 'سبب رفض الموافقة' })
  @IsString()
  @IsNotEmpty({ message: 'سبب الرفض مطلوب' })
  @MaxLength(300, { message: 'السبب طويل — ٣٠٠ حرف كحد أقصى' })
  reason!: string;
}
