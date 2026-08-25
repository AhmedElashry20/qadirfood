import {
  Body,
  Controller,
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

import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthUser } from '../common';
import { PrismaModule } from '../prisma/prisma.module';
import { TrackingModule } from '../tracking/tracking.module';
import { SupportService } from './support.service';
import { ListTicketsQueryDto, RaiseTicketDto, ReplyTicketDto, UpdateTicketDto } from './support.dto';

// الشكاوى والدعم — تذاكر ليها محادثة وحالة وأولوية وإسناد وربط بطلب. العميل
// بيفتح ويرد، والأدمن بيدير ويصعّد ويقفل. أحداث سوكيت حيّة للوحة الدعم.
@ApiTags('الدعم')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  // ── العميل ──
  @Post('tickets')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'العميل بيفتح تذكرة دعم' })
  raise(@CurrentUser() user: AuthUser, @Body() dto: RaiseTicketDto) {
    return this.support.raise(user.customerId!, dto);
  }

  @Get('tickets/mine')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'تذاكر العميل' })
  mine(@CurrentUser() user: AuthUser) {
    return this.support.myTickets(user.customerId!);
  }

  // ── الأدمن ──
  @Get('stats')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'عدّادات التذاكر حسب الحالة + غير المسندة' })
  stats() {
    return this.support.stats();
  }

  @Get('tickets')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'روستر التذاكر (فلاتر: حالة/تصنيف/أولوية/بحث)' })
  list(@Query() query: ListTicketsQueryDto) {
    return this.support.list(query);
  }

  // ── مشترك (العميل بيشوف تذكرته بس، الأدمن كله) ──
  @Get('tickets/:id')
  @Roles(UserRole.ADMIN, UserRole.CUSTOMER)
  @ApiOperation({ summary: 'تفاصيل تذكرة + المحادثة' })
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.support.detail(user, id);
  }

  @Post('tickets/:id/messages')
  @Roles(UserRole.ADMIN, UserRole.CUSTOMER)
  @ApiOperation({ summary: 'رد على تذكرة' })
  reply(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplyTicketDto,
  ) {
    return this.support.reply(user, id, dto);
  }

  @Patch('tickets/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'تغيير حالة/أولوية/إسناد التذكرة' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTicketDto,
  ) {
    return this.support.update(user, id, dto);
  }
}

@Module({
  imports: [PrismaModule, TrackingModule],
  controllers: [SupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
