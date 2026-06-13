import { Module, forwardRef } from '@nestjs/common';
import { SignalingGateway } from './signaling.gateway';
import { SignalingController } from './signaling.controller';
import { SignalingService } from './signaling.service';
import { AuthModule } from '../auth/auth.module';
import { DeviceModule } from '../device/device.module';

@Module({
  imports: [AuthModule, forwardRef(() => DeviceModule)],
  controllers: [SignalingController],
  providers: [SignalingGateway, SignalingService],
  exports: [SignalingService],
})
export class SignalingModule {}
