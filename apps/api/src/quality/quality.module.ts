import { Controller, Get, Module, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { JwtAuthGuard, Roles, RolesGuard } from '../common';
import { PrismaModule } from '../prisma/prisma.module';
import { QualityService } from './quality.service';

type Range = 'today' | 'week' | 'month' | 'all';

// الجودة — قراءة التقييمات والتعليقات للأدمن (اللي كانت ناقصة): نظرة عامة
// بتوزيعات النجوم وأسوأ أداء وأحدث الشكاوى واتجاه، + قائمة تقييمات بفلاتر.
@ApiTags('الجودة')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('quality')
export class QualityController {
  constructor(private readonly quality: QualityService) {}

  @Get('overview')
  @ApiOperation({ summary: 'نظرة عامة على الجودة (توزيع/أسوأ أداء/شكاوى/اتجاه)' })
  overview(@Query('range') range: Range = 'month') {
    return this.quality.overview(range);
  }

  @Get('reviews')
  @ApiOperation({ summary: 'قائمة التقييمات بفلاتر (نجوم/فرع/كابتن/تعليق/بحث)' })
  reviews(
    @Query('stars') stars?: string,
    @Query('maxStars') maxStars?: string,
    @Query('branchId') branchId?: string,
    @Query('captainId') captainId?: string,
    @Query('hasComment') hasComment?: string,
    @Query('search') search?: string,
    @Query('range') range: Range = 'all',
  ) {
    return this.quality.reviews({
      stars: stars ? Number(stars) : undefined,
      maxStars: maxStars ? Number(maxStars) : undefined,
      branchId: branchId || undefined,
      captainId: captainId || undefined,
      hasComment: hasComment === 'true' || hasComment === '1',
      search: search || undefined,
      range,
    });
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [QualityController],
  providers: [QualityService],
  exports: [QualityService],
})
export class QualityModule {}
