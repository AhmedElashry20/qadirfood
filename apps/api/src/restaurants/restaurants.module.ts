import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Patch, Query, UseGuards, forwardRef } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RestaurantStatus, UserRole } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsBooleanString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
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

class AdminListRestaurantsDto {
  @IsOptional() @IsString() @MaxLength(60) q?: string;
  @IsOptional() @IsBooleanString() isActive?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

class SetCommissionDto {
  /** نسبة مئوية — بين ٠ و ٥٠٪. */
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(50)
  rate!: number;
}

class ToggleActiveDto {
  @IsBoolean() isActive!: boolean;
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

/**
 * إدارة المطاعم من اللوحة — الأدمن كان بيعرف الفروع من الطلبات بس، ومافيش
 * طريقة يقفل فرع أو يعدّل عمولة. تعديل العمولة بيتسجّل في التدقيق لأنه قرار
 * مالي، وبيسري على الطلبات الجديدة بس (كل طلب بيخزّن عمولته وقت الإنشاء).
 */
@ApiTags('admin/restaurants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class RestaurantsAdminController {
  constructor(private readonly service: RestaurantsService) {}

  @Get('restaurants')
  @ApiOperation({ summary: 'قائمة المطاعم بفروعها وعمولتها وحجم تشغيلها' })
  list(@Query() query: AdminListRestaurantsDto) {
    return this.service.adminListRestaurants({
      q: query.q,
      isActive: query.isActive === undefined ? undefined : query.isActive === 'true',
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Patch('restaurants/:id/commission')
  @ApiOperation({ summary: 'تعديل نسبة عمولة المنصة (على الطلبات الجديدة فقط)' })
  commission(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetCommissionDto,
  ) {
    return this.service.adminSetCommission(id, dto.rate, user.userId);
  }

  @Patch('restaurants/:id/active')
  @ApiOperation({ summary: 'تفعيل/إيقاف مطعم — الإيقاف بيقفل كل فروعه' })
  toggle(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ToggleActiveDto,
  ) {
    return this.service.adminSetRestaurantActive(id, dto.isActive, user.userId);
  }

  @Patch('branches/:id/status')
  @ApiOperation({ summary: 'فتح/إغلاق/مشغول لفرع من اللوحة' })
  branchStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetStatusDto,
  ) {
    return this.service.adminSetBranchStatus(id, dto.status, user.userId, dto.busyExtraMinutes);
  }
}

@Module({
  imports: [forwardRef(() => TrackingModule)],
  providers: [RestaurantsService],
  controllers: [RestaurantsController, RestaurantsAdminController],
  exports: [RestaurantsService],
})
export class RestaurantsModule {}
