import { IsDateString, IsOptional, IsString, MaxLength, MinLength, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TgaStatus } from '@prisma/client';

/** ربط/تحديث بطاقة توصيل هيئة النقل لكابتن. */
export class LinkTgaCardDto {
  @ApiProperty({ example: 'TGA-4471120', description: 'رقم بطاقة التوصيل من الهيئة' })
  @IsString()
  @MinLength(4)
  @MaxLength(40)
  cardNumber!: string;

  @ApiProperty({ example: '2027-01-15', description: 'تاريخ انتهاء البطاقة' })
  @IsDateString()
  expiresAt!: string;
}

/** فلاتر روستر هيئة النقل. */
export class TgaRosterQueryDto {
  @ApiPropertyOptional({ enum: TgaStatus })
  @IsOptional()
  @IsEnum(TgaStatus)
  status?: TgaStatus;

  @ApiPropertyOptional({ description: 'بحث بالاسم أو رقم البطاقة' })
  @IsOptional()
  @IsString()
  search?: string;
}
