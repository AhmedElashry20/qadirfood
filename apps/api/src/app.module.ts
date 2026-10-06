import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { OrdersModule } from './orders/orders.module';
import { MenuModule } from './menu/menu.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { CustomerModule } from './customer/customer.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { RoutingModule } from './routing/routing.module';
import { TrackingModule } from './tracking/tracking.module';
import { ReportsModule } from './reports/reports.module';
import { CaptainsModule } from './captains/captains.module';
import { PaymentsModule } from './payments/payments.module';
import { SettlementsModule } from './settlements/settlements.module';
import { InvoicesModule } from './invoices/invoices.module';
import { AuditModule } from './audit/audit.module';
import { CompaniesModule } from './companies/companies.module';
import { UploadsModule } from './uploads/uploads.module';
import { TgaModule } from './tga/tga.module';
import { SupportModule } from './support/support.module';
import { QualityModule } from './quality/quality.module';
import { ZonesModule } from './zones/zones.module';
import { RelayModule } from './relay/relay.module';
import { TeamModule } from './team/team.module';
import { FaceModule } from './face/face.module';
import { SettingsModule } from './settings/settings.module';
import { SmsModule } from './sms/sms.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DemoModule } from './demo/demo.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    // سقف عام على كل الطلبات لكل IP (٣٠٠/دقيقة) — درع أساسي ضد الإغراق.
    // مسارات الدخول/OTP فوقها سقف أصرم عبر @Throttle في الـ controller.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    RedisModule,
    AuthModule,
    OrdersModule,
    MenuModule,
    RestaurantsModule,
    CustomerModule,
    DispatchModule,
    RoutingModule,
    TrackingModule,
    ReportsModule,
    CaptainsModule,
    UploadsModule,
    PaymentsModule,
    SettlementsModule,
    InvoicesModule,
    AuditModule,
    CompaniesModule,
    TgaModule,
    SupportModule,
    QualityModule,
    ZonesModule,
    RelayModule,
    TeamModule,
    FaceModule,
    SettingsModule,
    SmsModule,
    NotificationsModule,
    DemoModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
