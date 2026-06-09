import { Global, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { EmailModule } from '../email/email.module';

@Global()
@Module({
  imports: [EmailModule],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
