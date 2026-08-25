import { Global, Module } from '@nestjs/common';
import { SmsService } from './sms.service';

/** عام — أي موديول (Auth دلوقتي) يقدر يحقن `SmsService` من غير استيراد متكرر. */
@Global()
@Module({
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
