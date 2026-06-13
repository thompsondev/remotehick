import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRoute } from '../../middleware/decorators/remote.decorator';
import { AdminJwtGuard } from '../../middleware/guards/admin-jwt.guard';
import { SignalingService } from './signaling.service';

@ApiTags('Signaling')
@Controller('signaling')
@AdminRoute()
@UseGuards(AdminJwtGuard)
export class SignalingController {
  constructor(private readonly signaling: SignalingService) {}

  @Get('health')
  @ApiOperation({
    summary: 'Signaling connection stats (admin debug)',
    description:
      'Shows how many devices/admins have an active WebSocket. connectedDevices must be > 0 before Connect will work.',
  })
  health() {
    return {
      ok: true,
      ...this.signaling.getSignalingStats(),
    };
  }
}
