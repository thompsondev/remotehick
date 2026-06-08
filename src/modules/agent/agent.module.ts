import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { EnrollmentModule } from '../enrollment/enrollment.module';

@Module({
  imports: [EnrollmentModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
