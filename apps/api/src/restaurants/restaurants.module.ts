import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Patch, Query, UseGuards, forwardRef } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RestaurantStatus, UserRole } from '@prisma/client';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { RestaurantsService } from './restaurants.service';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthUser } from '../common';
import { TrackingModule } from '../tracking/tracking.module';

class SetStatusDto {
  @IsEnum(RestaurantStatus)
  status!: RestaurantStatus;

  /** مطلوب مع BUSY — بين ١٥ و ٣٠ دقيقة. */
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(30)
  busyExtraMinutes?: number;
}

class WorkingHourDto {
  @IsInt() @Min(0) @Max(6) weekday!: number;
  @IsString() opensAt!: string; // "09:00"
  @IsString() closesAt!: string; // "23:30"
  @IsOptional() @IsBoolean() isClosed?: boolean;
  @IsOptional() @IsBoolean() isRamadan?: boolean;
}

class SetWorkingHoursDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingHourDto)
  hours!: WorkingHourDto[];
}

@ApiTags('restaurants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly service: RestaurantsService) {}

  @Patch('branch/status')
  @Roles(UserRole.MERCHANT)
  @ApiOperation({ summary: 'فتح / إغلاق مؤقت / مشغول (شاشة ١١)' })
  setStatus(@CurrentUser() user: AuthUser, @Body() dto: SetStatusDto) {
    return this.service.setStatus(user.branchId!, dto.status, dto.busyExtraMinutes);
  }

  @Get('branch/working-hours')
  @Roles(UserRole.MERCHANT)
  getWorkingHours(@CurrentUser() user: AuthUser) {
    return this.service.getWorkingHours(user.branchId!);
  }

  @Patch('branch/working-hours')
  @Roles(UserRole.MERCHANT)
  @ApiOperation({ summary: 'أوقات العمل — فترات متعددة + رمضان (شاشة ١٠)' })
  setWorkingHours(@CurrentUser() user: AuthUser, @Body() dto: SetWorkingHoursDto) {
    return this.service.setWorkingHours(user.branchId!, dto.hours);
  }

  @Get('branch/users')
  @Roles(UserRole.MERCHANT)
  @ApiOperation({ summary: 'مستخدمي الفرع — كاشير/مدير (شاشة ١٣)' })
  branchUsers(@CurrentUser() user: AuthUser) {
    return this.service.listBranchUsers(user.branchId!);
  }

  @Get('nearby')
  @ApiOperation({ summary: 'المطاعم القريبة من العميل — مرتّبة بالأقرب' })
  nearby(@Query('lat') lat: string, @Query('lng') lng: string, @Query('radiusKm') radiusKm?: string) {
    return this.service.findNearbyBranches(Number(lat), Number(lng), radiusKm ? Number(radiusKm) : 10);
  }

  @Get('branches/:id')
  findBranch(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findBranch(id);
  }
}

@Module({
  imports: [forwardRef(() => TrackingModule)],
  providers: [RestaurantsService],
  controllers: [RestaurantsController],
  exports: [RestaurantsService],
})
export class RestaurantsModule {}
