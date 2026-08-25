import { Module, forwardRef } from '@nestjs/common';
import { DispatchService } from './dispatch.service';
import { TrackingModule } from '../tracking/tracking.module';
import { ZonesModule } from '../zones/zones.module';

@Module({
  imports: [forwardRef(() => TrackingModule), ZonesModule],
  providers: [DispatchService],
  exports: [DispatchService],
})
export class DispatchModule {}
