import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthUser } from '../common';
import { PermissionsGuard, RequirePermission } from '../common/permissions';
import { PrismaModule } from '../prisma/prisma.module';
import { TeamService } from './team.service';
import { CreateStaffDto, SetPermissionsDto, UpdateStaffDto } from './team.dto';

// إدارة موظفي اللوحة (ADMIN) — سرد/إضافة/تفعيل/تعطيل. أدمن بس، وكله في التدقيق.
@ApiTags('الفريق')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/users')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  @ApiOperation({ summary: 'موظفو اللوحة + صلاحياتهم + التذاكر المسندة المفتوحة' })
  list() {
    return this.team.list();
  }

  @Get('permissions/catalog')
  @ApiOperation({ summary: 'كتالوج الصلاحيات المتاحة' })
  catalog() {
    return this.team.catalog();
  }

  @Put(':id/permissions')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'ضبط صلاحيات موظف (فارغة = صلاحية كاملة)' })
  setPermissions(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPermissionsDto,
  ) {
    return this.team.setPermissions({ userId: user.userId, role: user.role }, id, dto.permissions);
  }

  @Post()
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'إضافة موظف لوحة جديد' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStaffDto) {
    return this.team.create({ userId: user.userId, role: user.role }, dto);
  }

  @Patch(':id')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'تعديل موظف (اسم/تفعيل/كلمة مرور)' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.team.update({ userId: user.userId, role: user.role }, id, dto);
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [TeamController],
  providers: [TeamService],
  exports: [TeamService],
})
export class TeamModule {}
