import { Module } from '@nestjs/common';
import { EnrollmentService } from './enrollment.service';
import { EnrollmentController } from './enrollment.controller';
import { EnrollmentTrackingService } from './enrollment-tracking.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [EnrollmentController],
  providers: [EnrollmentService, EnrollmentTrackingService],
  exports: [EnrollmentService, EnrollmentTrackingService],
})
export class EnrollmentModule {}
