import { Module, forwardRef } from '@nestjs/common';
import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';
import { DeviceTokenGuard } from '../../middleware/guards/device-token.guard';
import { AuthModule } from '../auth/auth.module';
import { SignalingModule } from '../signaling/signaling.module';

@Module({
  imports: [AuthModule, forwardRef(() => SignalingModule)],
  controllers: [DeviceController],
  providers: [DeviceService, DeviceTokenGuard],
  exports: [DeviceService],
})
export class DeviceModule {}
