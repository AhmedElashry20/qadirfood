import { Module, forwardRef } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { TrackingModule } from '../tracking/tracking.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { CaptainsModule } from '../captains/captains.module';
import { PaymentsModule } from '../payments/payments.module';
import { ZonesModule } from '../zones/zones.module';

@Module({
  imports: [CaptainsModule, PaymentsModule, ZonesModule, forwardRef(() => TrackingModule), forwardRef(() => DispatchModule)],
  providers: [OrdersService],
  controllers: [OrdersController],
  exports: [OrdersService],
})
export class OrdersModule {}
