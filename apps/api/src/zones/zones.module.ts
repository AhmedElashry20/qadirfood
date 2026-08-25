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

import { JwtAuthGuard, Roles, RolesGuard } from '../common';
import { PrismaModule } from '../prisma/prisma.module';
import { ZonesService } from './zones.service';
import { AssignCaptainZoneDto, CreateZoneDto, UpdateZoneDto } from './zones.dto';

// مناطق التوصيل — مستطيلات جغرافية بتسعيرة خاصة. الأدمن بيدير، والطلب بياخد
// رسومه من المنطقة اللي بتغطّي عنوان العميل.
@ApiTags('المناطق')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('zones')
export class ZonesController {
  constructor(private readonly zones: ZonesService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'كل مناطق التوصيل' })
  list() {
    return this.zones.list();
  }

  @Get('lookup')
  @Roles(UserRole.ADMIN, UserRole.CUSTOMER)
  @ApiOperation({ summary: 'المنطقة اللي بتغطّي إحداثي (ورسومها)' })
  lookup(@Query('lat') lat: string, @Query('lng') lng: string) {
    return this.zones.lookup(Number(lat), Number(lng));
  }

  @Get('captains')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'كل الكباتن ومناطق عملهم المسندة' })
  captains() {
    return this.zones.captainAssignments();
  }

  @Post('assign')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'إسناد كابتن لمنطقة عمل (أو إلغاء الإسناد)' })
  assign(@Body() dto: AssignCaptainZoneDto) {
    return this.zones.assignCaptain(dto);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'إنشاء منطقة' })
  create(@Body() dto: CreateZoneDto) {
    return this.zones.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'تعديل منطقة (رسوم/حدود/تفعيل)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateZoneDto) {
    return this.zones.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'حذف منطقة' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.zones.remove(id);
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [ZonesController],
  providers: [ZonesService],
  exports: [ZonesService],
})
export class ZonesModule {}
