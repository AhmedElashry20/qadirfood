import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsHexColor,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ZoneType } from '@prisma/client';

/** نقطة على الخريطة — رأس من رؤوس البولي‑جون المرسوم. */
export class ZonePointDto {
  @IsNumber() @Min(-90) @Max(90) lat!: number;
  @IsNumber() @Min(-180) @Max(180) lng!: number;
}

/** نقطة التقاء/تسليم مسمّاة بإحداثيات دقيقة. */
export class HandoffPointDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsNumber() @Min(-90) @Max(90) lat!: number;
  @IsNumber() @Min(-180) @Max(180) lng!: number;
}

export class CreateZoneDto {
  @ApiProperty({ example: 'العليا' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  @ApiPropertyOptional({ enum: ZoneType })
  @IsOptional()
  @IsEnum(ZoneType)
  type?: ZoneType;

  @ApiPropertyOptional({ example: 'مكة' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  city?: string;

  // البولي‑جون المرسوم يدوياً (خطوط). لو موجود، الحدود (bbox) بتتحسب منه تلقائياً.
  @ApiPropertyOptional({ type: [ZonePointDto], description: 'رؤوس المنطقة المرسومة (٣ نقاط على الأقل)' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(3)
  @ValidateNested({ each: true })
  @Type(() => ZonePointDto)
  polygon?: ZonePointDto[];

  // الحدود (bbox) — اختيارية لو فيه polygon.
  @IsOptional() @IsNumber() @Min(-90) @Max(90) minLat?: number;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) maxLat?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) minLng?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) maxLng?: number;

  // نقطة الالتقاء/التسليم (للحرم) — نقطة رئيسية واحدة (توافقية).
  @IsOptional() @IsNumber() @Min(-90) @Max(90) handoffLat?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) handoffLng?: number;
  @IsOptional() @IsString() @MaxLength(80) handoffName?: string;

  // قائمة نقاط الالتقاء (ممكن أكتر من نقطة — بوابات الحرم).
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HandoffPointDto)
  handoffPoints?: HandoffPointDto[];

  @ApiProperty({ example: 10 })
  @IsNumber()
  @Min(0)
  @Max(500)
  deliveryFee!: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderTotal?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiPropertyOptional({ example: '#F5C518' })
  @IsOptional()
  @IsHexColor()
  color?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateZoneDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) name?: string;
  @IsOptional() @IsEnum(ZoneType) type?: ZoneType;
  @IsOptional() @IsString() @MaxLength(40) city?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(3)
  @ValidateNested({ each: true })
  @Type(() => ZonePointDto)
  polygon?: ZonePointDto[];

  @IsOptional() @IsNumber() @Min(-90) @Max(90) minLat?: number;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) maxLat?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) minLng?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) maxLng?: number;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) handoffLat?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) handoffLng?: number;
  @IsOptional() @IsString() @MaxLength(80) handoffName?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HandoffPointDto)
  handoffPoints?: HandoffPointDto[];
  @IsOptional() @IsNumber() @Min(0) @Max(500) deliveryFee?: number;
  @IsOptional() @IsNumber() @Min(0) minOrderTotal?: number;
  @IsOptional() @IsInt() @Min(0) priority?: number;
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/** إسناد كابتن لمنطقة عمل. */
export class AssignCaptainZoneDto {
  @IsString() captainId!: string;
  @IsOptional() @IsString() zoneId?: string | null; // null = إلغاء الإسناد
  @IsOptional() @IsBoolean() isFootCourier?: boolean;
}
