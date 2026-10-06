import { Global, Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { RoutingService } from './routing.service';

/**
 * عام: المسافة بتتحسب في إنشاء الطلب والتوزيع والتقارير، وكلهم موديولات
 * مختلفة. حقنها في كل واحد على حدة مافيهوش غير تكرار.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [RoutingService],
  exports: [RoutingService],
})
export class RoutingModule {}
