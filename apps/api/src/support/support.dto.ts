import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TicketCategory, TicketPriority, TicketStatus } from '@prisma/client';

/** العميل بيفتح تذكرة. */
export class RaiseTicketDto {
  @ApiProperty({ example: 'الطلب وصل ناقص صنف' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  subject!: string;

  @ApiProperty({ enum: TicketCategory })
  @IsEnum(TicketCategory)
  category!: TicketCategory;

  @ApiProperty({ example: 'طُلب برجران ووصل واحد فقط' })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  body!: string;

  @ApiPropertyOptional({ description: 'ربط بطلب' })
  @IsOptional()
  @IsUUID()
  orderId?: string;
}

/** رد على تذكرة (عميل أو موظف دعم). */
export class ReplyTicketDto {
  @ApiProperty({ example: 'اتحلّت المشكلة، اتعمل استرداد ١٠ ر.س' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;

  /** ملاحظة داخلية بين الموظفين — الأدمن بس، مابتوصلش العميل. */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  internal?: boolean;
}

/** الأدمن بيغيّر حالة/أولوية/إسناد التذكرة. */
export class UpdateTicketDto {
  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({ enum: TicketPriority })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @ApiPropertyOptional({ description: 'userId لموظف الدعم — أو null لفك الإسناد' })
  @IsOptional()
  @IsString()
  assignedToId?: string | null;
}

/** فلاتر روستر التذاكر (أدمن). */
export class ListTicketsQueryDto {
  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({ enum: TicketCategory })
  @IsOptional()
  @IsEnum(TicketCategory)
  category?: TicketCategory;

  @ApiPropertyOptional({ enum: TicketPriority })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @ApiPropertyOptional({ description: 'بحث برقم التذكرة/الطلب أو الموضوع أو اسم العميل' })
  @IsOptional()
  @IsString()
  search?: string;
}
