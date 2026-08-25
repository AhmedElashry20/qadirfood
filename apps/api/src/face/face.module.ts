import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthUser } from '../common';
import { PermissionsGuard, RequirePermission } from '../common/permissions';
import { PrismaModule } from '../prisma/prisma.module';
import { FaceService } from './face.service';
import { FaceGateway, StubFaceGateway } from './face-gateway';

export class SubmitFaceCheckDto {
  /// رابط السيلفي اللي اترفعت على /uploads قبل كده.
  @IsString()
  @MinLength(4)
  @MaxLength(500)
  selfieUrl!: string;
}

export class ReviewFaceCheckDto {
  @IsBoolean()
  approve!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

// التحقق اليومي بالوجه — المندوب بيرفع سيلفي كل يوم، والنظام بيطابقها بالوجه
// المرجعي عبر بوابة مجرّدة، ولازم يبقى موثّق النهاردة عشان يشتغل.
@ApiTags('التحقق بالوجه')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('face')
export class FaceController {
  constructor(private readonly face: FaceService) {}

  @Post('me/check')
  @Roles(UserRole.CAPTAIN)
  @ApiOperation({ summary: 'المندوب بيرفع سيلفي التحقق اليومي' })
  submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitFaceCheckDto) {
    return this.face.submit(user.captainId!, dto.selfieUrl);
  }

  @Get('me/today')
  @Roles(UserRole.CAPTAIN)
  @ApiOperation({ summary: 'حالة تحقّق المندوب النهاردة' })
  today(@CurrentUser() user: AuthUser) {
    return this.face.todayStatus(user.captainId!);
  }

  @Get('roster')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'حالة التحقق اليومي لكل المناديب (أدمن)' })
  roster() {
    return this.face.roster();
  }

  @Patch('checks/:id/review')
  @RequirePermission('compliance.review')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'مراجعة أدمن لسيلفي — اعتماد أو رفض بسبب' })
  review(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewFaceCheckDto,
  ) {
    return this.face.review(user, id, dto.approve, dto.reason);
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [FaceController],
  providers: [FaceService, { provide: FaceGateway, useClass: StubFaceGateway }],
  exports: [FaceService],
})
export class FaceModule {}
