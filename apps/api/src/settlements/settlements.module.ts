import {
  Body,
  Controller,
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

import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthUser } from '../common';
import { PermissionsGuard, RequirePermission } from '../common/permissions';
import { PrismaModule } from '../prisma/prisma.module';
import {
  ListSettlementsDto,
  RunSettlementDto,
  SavePayoutAccountDto,
  TransferSettlementDto,
} from './settlements.dto';
import { SettlementsService } from './settlements.service';

@ApiTags('settlements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.ADMIN)
@Controller('settlements')
export class SettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Post('run')
  @RequirePermission('finance.settle')
  @ApiOperation({ summary: 'تشغيل دورة تسوية لكل المطاعم' })
  run(@CurrentUser() user: AuthUser, @Body() dto: RunSettlementDto) {
    return this.settlements.run(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'قائمة التسويات' })
  list(@CurrentUser() user: AuthUser, @Query() query: ListSettlementsDto) {
    return this.settlements.list(user, query.status, query.page ?? 1, query.pageSize ?? 20);
  }

  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل تسوية + سطورها' })
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.settlements.detail(user, id);
  }

  @Patch(':id/transfer')
  @RequirePermission('finance.settle')
  @ApiOperation({ summary: 'تسجيل تحويل تسوية' })
  transfer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferSettlementDto,
  ) {
    return this.settlements.transfer(user, id, dto);
  }

  @Get('accounts/:restaurantId')
  @ApiOperation({ summary: 'حساب استلام المطعم (مقنّع)' })
  getAccount(@CurrentUser() user: AuthUser, @Param('restaurantId', ParseUUIDPipe) restaurantId: string) {
    return this.settlements.getPayoutAccount(user, restaurantId);
  }

  @Put('accounts/:restaurantId')
  @ApiOperation({ summary: 'حفظ حساب استلام المطعم' })
  saveAccount(
    @CurrentUser() user: AuthUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Body() dto: SavePayoutAccountDto,
  ) {
    return this.settlements.savePayoutAccount(user, restaurantId, dto);
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [SettlementsController],
  providers: [SettlementsService],
  exports: [SettlementsService],
})
export class SettlementsModule {}
