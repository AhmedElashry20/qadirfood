import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CaptainsModule } from '../captains/captains.module';
import { CaptainsService } from '../captains/captains.service';
import { ListCaptainsDto } from '../captains/captains.dto';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthUser } from '../common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  AssignCaptainDto,
  CreateCompanyDto,
  CreateCompanyUserDto,
  ListCompaniesDto,
  ListCompanySettlementsDto,
  PayDistributionDto,
  RunCompanySettlementDto,
  SaveCompanyPayoutAccountDto,
  TransferCompanySettlementDto,
  UpdateCompanyDto,
} from './companies.dto';
import { CompaniesService } from './companies.service';
import { CompanySettlementsService } from './company-settlements.service';

@ApiTags('companies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly companies: CompaniesService,
    private readonly captains: CaptainsService,
  ) {}

  // ── مستخدم الشركة ──

  @Get('me')
  @Roles(UserRole.COMPANY)
  @ApiOperation({ summary: 'بيانات شركتي' })
  me(@CurrentUser() user: AuthUser) {
    return this.companies.me(user);
  }

  @Get('me/captains')
  @Roles(UserRole.COMPANY)
  @ApiOperation({ summary: 'مناديب شركتي' })
  myCaptains(@CurrentUser() user: AuthUser, @Query() query: ListCaptainsDto) {
    if (!user.companyId) throw new ForbiddenException('الجلسة غير مرتبطة بشركة');
    // النطاق بيتفرض هنا — أي companyId في الكويري بيتتجاهل لصالح شركة المستخدم.
    return this.captains.listCaptains({ ...query, companyId: user.companyId, freelanceOnly: undefined });
  }

  // ── الأدمن ──

  @Get()
  @Roles(UserRole.ADMIN, UserRole.COMPANY)
  @ApiOperation({ summary: 'قائمة الشركات (ترى الشركة نفسها فقط)' })
  list(@CurrentUser() user: AuthUser, @Query() query: ListCompaniesDto) {
    return this.companies.list(user, query.page ?? 1, query.pageSize ?? 20);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'إنشاء شركة أسطول' })
  create(@Body() dto: CreateCompanyDto) {
    return this.companies.create(dto);
  }

  @Post('assign-captain')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'ربط/فكّ كابتن بشركة' })
  assign(@Body() dto: AssignCaptainDto) {
    return this.companies.assignCaptain(dto);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.COMPANY)
  @ApiOperation({ summary: 'تفاصيل شركة' })
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.companies.detail(user, id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'تعديل شركة (اسم/عمولة/حالة)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCompanyDto) {
    return this.companies.update(id, dto);
  }

  @Post(':id/users')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'إنشاء مستخدم لوحة للشركة' })
  createUser(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateCompanyUserDto) {
    return this.companies.createUser(id, dto);
  }

  @Get(':id/users')
  @Roles(UserRole.ADMIN, UserRole.COMPANY)
  @ApiOperation({ summary: 'مستخدمو لوحة الشركة' })
  listUsers(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.companies.listUsers(user, id);
  }

  @Get(':id/captains')
  @Roles(UserRole.ADMIN, UserRole.COMPANY)
  @ApiOperation({ summary: 'مناديب شركة معيّنة' })
  companyCaptains(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListCaptainsDto,
  ) {
    // مستخدم الشركة مقفول على شركته — لو طلب شركة تانية بنرفض.
    if (user.role === UserRole.COMPANY && user.companyId !== id) {
      throw new ForbiddenException('غير مسموح لك بشركة أخرى');
    }
    return this.captains.listCaptains({ ...query, companyId: id, freelanceOnly: undefined });
  }
}

@ApiTags('company-settlements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('company-settlements')
export class CompanySettlementsController {
  constructor(private readonly settlements: CompanySettlementsService) {}

  @Post('run')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'تشغيل دورة تسوية للشركات' })
  run(@CurrentUser() user: AuthUser, @Body() dto: RunCompanySettlementDto) {
    return this.settlements.run(user, dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.COMPANY)
  @ApiOperation({ summary: 'تسويات الشركات (ترى الشركة تسوياتها فقط)' })
  list(@CurrentUser() user: AuthUser, @Query() query: ListCompanySettlementsDto) {
    return this.settlements.list(user, query.companyId, query.status, query.page ?? 1, query.pageSize ?? 20);
  }

  @Get('accounts/:companyId')
  @Roles(UserRole.ADMIN, UserRole.COMPANY)
  @ApiOperation({ summary: 'حساب استلام الشركة (مقنّع)' })
  getAccount(@CurrentUser() user: AuthUser, @Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.settlements.getPayoutAccount(user, companyId);
  }

  @Put('accounts/:companyId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'حفظ حساب استلام الشركة' })
  saveAccount(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: SaveCompanyPayoutAccountDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.settlements.savePayoutAccount(user, companyId, dto);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.COMPANY)
  @ApiOperation({ summary: 'تفاصيل تسوية شركة + سطورها' })
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.settlements.detail(user, id);
  }

  @Get(':id/breakdown')
  @Roles(UserRole.ADMIN, UserRole.COMPANY)
  @ApiOperation({ summary: 'توزيع التسوية على المناديب — حصة كل مندوب وحالة دفعها' })
  breakdown(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.settlements.captainBreakdown(user, id);
  }

  @Patch('distributions/:distributionId/pay')
  @Roles(UserRole.ADMIN, UserRole.COMPANY)
  @ApiOperation({ summary: 'الشركة بتسجّل إنها دفعت لمندوب حصته' })
  payDistribution(
    @CurrentUser() user: AuthUser,
    @Param('distributionId', ParseUUIDPipe) distributionId: string,
    @Body() dto: PayDistributionDto,
  ) {
    return this.settlements.payDistribution(user, distributionId, dto.reference);
  }

  @Patch(':id/transfer')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'تسجيل تحويل تسوية شركة' })
  transfer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferCompanySettlementDto,
  ) {
    return this.settlements.transfer(user, id, dto);
  }
}

@Module({
  imports: [PrismaModule, CaptainsModule],
  controllers: [CompaniesController, CompanySettlementsController],
  providers: [CompaniesService, CompanySettlementsService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
