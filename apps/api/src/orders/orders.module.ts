import { Module, forwardRef } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrderChatService } from './order-chat.service';
import { OrdersController } from './orders.controller';
import { TrackingModule } from '../tracking/tracking.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { CaptainsModule } from '../captains/captains.module';
import { PaymentsModule } from '../payments/payments.module';
import { ZonesModule } from '../zones/zones.module';
import { CustomerModule } from '../customer/customer.module';

@Module({
  imports: [CaptainsModule, PaymentsModule, ZonesModule, CustomerModule, forwardRef(() => TrackingModule), forwardRef(() => DispatchModule)],
  providers: [OrdersService, OrderChatService],
  controllers: [OrdersController],
  exports: [OrdersService, OrderChatService],
})
export class OrdersModule {}
