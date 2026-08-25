import { Controller, Get, Module, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ReportsService } from './reports.service';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthUser } from '../common';

type Range = 'today' | 'week' | 'month';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('merchant')
  @Roles(UserRole.MERCHANT)
  @ApiOperation({ summary: 'تقارير ومبيعات المطعم (شاشة ١٢)' })
  merchant(@CurrentUser() user: AuthUser, @Query('range') range: Range = 'today') {
    return this.reports.merchantReport(user.branchId!, range);
  }

  @Get('platform')
  @Roles(UserRole.ADMIN)
  platform(@Query('range') range: Range = 'today') {
    return this.reports.platformReport(range);
  }

  @Get('timeseries')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'سلسلة زمنية للطلبات والإيراد (بالساعة/اليوم)' })
  timeseries(@Query('range') range: Range = 'today') {
    return this.reports.timeseries(range);
  }

  @Get('analytics')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'تحليلات BI: قمع، ذروة، أفضل مطاعم/أصناف، مزيج دفع' })
  analytics(@Query('range') range: Range = 'today') {
    return this.reports.analytics(range);
  }

  @Get('live-map')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'لقطة حيّة: مواقع الكباتن والطلبات النشطة' })
  liveMap() {
    return this.reports.liveMap();
  }
}

@Module({
  providers: [ReportsService],
  controllers: [ReportsController],
  exports: [ReportsService],
})
export class ReportsModule {}
