import { Body, Controller, Delete, Global, Module, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '../common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsService } from './notifications.service';

class FcmTokenDto {
  @IsString()
  token!: string;
}

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('token')
  @ApiOperation({ summary: 'تسجيل توكن جهاز لاستقبال الإشعارات' })
  async register(@CurrentUser() user: AuthUser, @Body() dto: FcmTokenDto) {
    await this.notifications.registerToken(user.userId, dto.token);
    return { ok: true };
  }

  @Delete('token')
  @ApiOperation({ summary: 'إزالة توكن جهاز (تسجيل خروج)' })
  async remove(@CurrentUser() user: AuthUser, @Body() dto: FcmTokenDto) {
    await this.notifications.removeToken(user.userId, dto.token);
    return { ok: true };
  }
}

/** عام — أي موديول (Orders / Dispatch) يقدر يحقن `NotificationsService`. */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
