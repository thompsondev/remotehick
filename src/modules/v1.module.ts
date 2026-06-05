import { Module } from '@nestjs/common';
import { ChatModule } from './chat/chat.module';
import { AuthModule } from './auth/auth.module';
import { DeviceModule } from './device/device.module';
import { EnrollmentModule } from './enrollment/enrollment.module';
import { SessionModule } from './session/session.module';
import { SignalingModule } from './signaling/signaling.module';
import { AgentModule } from './agent/agent.module';

@Module({
  imports: [
    ChatModule,
    AuthModule,
    DeviceModule,
    EnrollmentModule,
    SessionModule,
    SignalingModule,
    AgentModule,
  ],
})
export class V1Module {}
