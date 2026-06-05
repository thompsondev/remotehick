import { Module } from '@nestjs/common';
import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';
import { DeviceTokenGuard } from '../../middleware/guards/device-token.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [DeviceController],
  providers: [DeviceService, DeviceTokenGuard],
  exports: [DeviceService],
})
export class DeviceModule {}
