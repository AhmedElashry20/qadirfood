import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CustomerService } from './customer.service';
import {
  BrowseBranchesDto,
  CreateAddressDto,
  GeoQueryDto,
  UpdateAddressDto,
  UpdateMeDto,
  ValidateCouponDto,
} from './customer.dto';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthUser } from '../common';

@ApiTags('customer')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
@Controller('customer')
export class CustomerController {
  constructor(private readonly service: CustomerService) {}

  // ── الملف الشخصي ──

  @Get('me')
  @ApiOperation({ summary: 'بيانات العميل + رصيد المحفظة وعدد الطلبات والمفضلة' })
  me(@CurrentUser() user: AuthUser) {
    return this.service.getMe(user.customerId!);
  }

  @Patch('me')
  @ApiOperation({ summary: 'تعديل الاسم / البريد الإلكتروني' })
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return this.service.updateMe(user.customerId!, user.userId, dto);
  }

  // ── العناوين ──

  @Get('addresses')
  @ApiOperation({ summary: 'عناوين العميل — الافتراضي الأول' })
  addresses(@CurrentUser() user: AuthUser) {
    return this.service.listAddresses(user.customerId!);
  }

  @Post('addresses')
  @ApiOperation({ summary: 'إضافة عنوان — أول عنوان بيبقى افتراضي تلقائياً' })
  createAddress(@CurrentUser() user: AuthUser, @Body() dto: CreateAddressDto) {
    return this.service.createAddress(user.customerId!, dto);
  }

  @Patch('addresses/:id')
  updateAddress(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.service.updateAddress(user.customerId!, id, dto);
  }

  @Delete('addresses/:id')
  @ApiOperation({ summary: 'حذف عنوان — آخر عنوان ما ينفعش يتحذف' })
  deleteAddress(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteAddress(user.customerId!, id);
  }

  @Patch('addresses/:id/default')
  setDefaultAddress(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.setDefaultAddress(user.customerId!, id);
  }

  // ── التصفح ──

  @Get('branches')
  @ApiOperation({ summary: 'المطاعم القريبة — بحث وترتيب (الأقرب / الأسرع / الأعلى تقييماً)' })
  branches(@CurrentUser() user: AuthUser, @Query() query: BrowseBranchesDto) {
    return this.service.browseBranches(user.customerId!, query);
  }

  @Get('branches/:id')
  @ApiOperation({ summary: 'تفاصيل الفرع + الموقع وأوقات العمل' })
  branch(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() geo: GeoQueryDto,
  ) {
    return this.service.getBranch(user.customerId!, id, geo);
  }

  @Get('branches/:id/menu')
  @ApiOperation({ summary: 'منيو الفرع — التصنيفات والأصناف المتاحة بخياراتها' })
  branchMenu(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getBranchMenu(id);
  }

  // ── المفضلة ──

  @Get('favorites')
  @ApiOperation({ summary: 'مطاعم المفضلة — بنفس شكل بطاقة التصفح' })
  favorites(@CurrentUser() user: AuthUser, @Query() geo: GeoQueryDto) {
    return this.service.listFavorites(user.customerId!, geo);
  }

  @Post('favorites/:branchId')
  addFavorite(@CurrentUser() user: AuthUser, @Param('branchId', ParseUUIDPipe) branchId: string) {
    return this.service.addFavorite(user.customerId!, branchId);
  }

  @Delete('favorites/:branchId')
  removeFavorite(@CurrentUser() user: AuthUser, @Param('branchId', ParseUUIDPipe) branchId: string) {
    return this.service.removeFavorite(user.customerId!, branchId);
  }

  // ── الكوبونات ──

  @Get('coupons')
  @ApiOperation({ summary: 'الكوبونات السارية' })
  coupons() {
    return this.service.listCoupons();
  }

  @Post('coupons/validate')
  @ApiOperation({ summary: 'تحقق من الكوبون وقيمة الخصم قبل إتمام الطلب' })
  validateCoupon(@Body() dto: ValidateCouponDto) {
    return this.service.validateCoupon(dto);
  }
}

@Module({
  providers: [CustomerService],
  controllers: [CustomerController],
  exports: [CustomerService],
})
export class CustomerModule {}
