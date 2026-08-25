import { Module } from '@nestjs/common';

import { DemoFlowService } from './demo-flow.service';
import { OrdersModule } from '../orders/orders.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { TrackingModule } from '../tracking/tracking.module';

// وحدة العرض الحيّ — بتشغّل DemoFlowService اللي بيسوق طلبات حقيقية عبر الخدمات
// الفعلية عشان المنصة تبان حيّة. متحكومة بـ `DEMO_FLOW` وبتتعطّل في الإنتاج.
@Module({
  imports: [OrdersModule, DispatchModule, TrackingModule],
  providers: [DemoFlowService],
})
export class DemoModule {}
