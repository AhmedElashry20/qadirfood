import {
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  ArrayMinSize,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus, PaymentMethod } from '@prisma/client';

class OrderLineDto {
  @IsUUID()
  menuItemId!: string;

  @IsInt()
  @Min(1)
  @Max(50)
  quantity!: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @IsUUID('all', { each: true })
  optionIds: string[] = [];
}

export class CreateOrderDto {
  @IsUUID()
  branchId!: string;

  @IsUUID()
  addressId!: string;

  // WALLET مستثناة عمداً: مافيش شحن محفظة للعميل، فالخيار ده مايخصمش رصيد فعلاً
  // (كان بيوجّه لبوابة البطاقة). بنرفضه صراحةً لحد ما تتبني المحفظة كاملة.
  @IsEnum(PaymentMethod)
  @IsIn([PaymentMethod.CASH, PaymentMethod.CARD, PaymentMethod.MADA, PaymentMethod.APPLE_PAY], {
    message: 'طريقة الدفع غير مدعومة',
  })
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerNotes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  items!: OrderLineDto[];
}

export class AcceptOrderDto {
  /** ١٠ / ١٥ / ٢٠ / ٣٠ أو قيمة مخصصة. */
  @IsInt()
  @Min(1)
  @Max(180)
  prepMinutes!: number;
}

export class RejectOrderDto {
  /** إلزامي — بيدخل في معدل الرفض في التقارير. */
  @IsString()
  @IsNotEmpty({ message: 'سبب الرفض إلزامي' })
  @MaxLength(300)
  reason!: string;
}

export class CancelOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class PickupDto {
  @IsString()
  @IsNotEmpty()
  pickupCode!: string;
}

/** تسليم العميل — كود العميل + صورة إثبات التسليم. */
export class DeliveredDto {
  @IsString()
  @IsNotEmpty({ message: 'كود التسليم مطلوب' })
  code!: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;
}

/** شاشة التقييم — بتتبعت مرة واحدة بس بعد ما الطلب يتسلّم. */
export class CreateReviewDto {
  /** تقييم المطعم من ١ إلى ٥ — إلزامي. */
  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  restaurantStars!: number;

  /** تقييم الكابتن من ١ إلى ٥ — اختياري (العميل ممكن يقيّم المطعم بس). */
  @ApiPropertyOptional({ minimum: 1, maximum: 5, example: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  captainStars?: number;

  /** تعليق حر — اختياري. */
  @ApiPropertyOptional({ maxLength: 500, example: 'الأكل وصل سخن والكابتن محترم' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class ListOrdersDto {
  @IsOptional()
  @IsArray()
  @IsEnum(OrderStatus, { each: true })
  status?: OrderStatus[];

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

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
