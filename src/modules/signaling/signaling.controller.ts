import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../middleware/decorators/public.decorator';
import { SignalingService } from './signaling.service';

@ApiTags('Signaling')
@Controller('signaling')
export class SignalingController {
  constructor(private readonly signaling: SignalingService) {}

  @Public()
  @Get('health')
  @ApiOperation({
    summary: 'Signaling connection stats (debug)',
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
