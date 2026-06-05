import { Module, forwardRef } from '@nestjs/common';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';
import { DeviceModule } from '../device/device.module';
import { SignalingModule } from '../signaling/signaling.module';

@Module({
  imports: [DeviceModule, forwardRef(() => SignalingModule)],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
