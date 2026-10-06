import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SettlementStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class RunSettlementDto {
  @ApiPropertyOptional({ description: 'نهاية الفترة — إن كان فارغاً يأخذ الآن' })
  @IsOptional()
  @IsDateString({}, { message: 'تاريخ نهاية الفترة غير صحيح' })
  periodEnd?: string;
}

export class TransferSettlementDto {
  @ApiProperty({ description: 'مرجع الحوالة البنكية — بيتسجّل للتدقيق' })
  @IsString()
  @IsNotEmpty({ message: 'مرجع الحوالة مطلوب' })
  transferRef!: string;
}

export class SavePayoutAccountDto {
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

export class ListSettlementsDto {
  @ApiPropertyOptional({ enum: SettlementStatus })
  @IsOptional()
  @IsEnum(SettlementStatus)
  status?: SettlementStatus;

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
