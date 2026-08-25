import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TrackingGateway } from './tracking.gateway';
import { LiveSimService } from './live-sim.service';
import { DispatchModule } from '../dispatch/dispatch.module';
import { CaptainsModule } from '../captains/captains.module';

@Module({
  imports: [
    forwardRef(() => DispatchModule),
    CaptainsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [TrackingGateway, LiveSimService],
  exports: [TrackingGateway, LiveSimService],
})
export class TrackingModule {}
