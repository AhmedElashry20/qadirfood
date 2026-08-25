import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthUser } from '../common';
import { PrismaModule } from '../prisma/prisma.module';
import { TgaService } from './tga.service';
import { TgaGateway, ManualTgaGateway } from './tga-gateway';
import { LinkTgaCardDto, TgaRosterQueryDto } from './tga.dto';

// ربط هيئة النقل — بطاقة التوصيل/التشغيل لكل كابتن. الأدمن بس، وكله متسجّل في
// التدقيق. الطرق تحت `/compliance/tga` عشان تكمّل صفحة الالتزام.
@ApiTags('هيئة النقل')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('compliance/tga')
export class TgaController {
  constructor(private readonly tga: TgaService) {}

  @Get('link-status')
  @ApiOperation({ summary: 'حالة ربط المنصة بالهيئة + عدّاد الحالات' })
  linkStatus() {
    return this.tga.linkStatus();
  }

  @Get('report')
  @ApiOperation({ summary: 'تقرير الهيئة — الكباتن وبطاقاتهم (للتصدير)' })
  report() {
    return this.tga.report();
  }

  @Get()
  @ApiOperation({ summary: 'روستر الكباتن وحالتهم مع الهيئة' })
  roster(@Query() query: TgaRosterQueryDto) {
    return this.tga.roster(query);
  }

  @Put(':captainId')
  @ApiOperation({ summary: 'ربط/تحديث بطاقة توصيل لكابتن' })
  link(
    @CurrentUser() user: AuthUser,
    @Param('captainId', ParseUUIDPipe) captainId: string,
    @Body() dto: LinkTgaCardDto,
  ) {
    return this.tga.linkCard({ userId: user.userId, role: user.role }, captainId, dto);
  }

  @Post(':captainId/verify')
  @ApiOperation({ summary: 'تشغيل تحقّق الهيئة على بطاقة الكابتن' })
  verify(@CurrentUser() user: AuthUser, @Param('captainId', ParseUUIDPipe) captainId: string) {
    return this.tga.verify({ userId: user.userId, role: user.role }, captainId);
  }

  @Delete(':captainId')
  @ApiOperation({ summary: 'فك ربط بطاقة التوصيل' })
  unlink(@CurrentUser() user: AuthUser, @Param('captainId', ParseUUIDPipe) captainId: string) {
    return this.tga.unlink({ userId: user.userId, role: user.role }, captainId);
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [TgaController],
  providers: [TgaService, { provide: TgaGateway, useClass: ManualTgaGateway }],
  exports: [TgaService],
})
export class TgaModule {}
