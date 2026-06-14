import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRoute } from '../../middleware/decorators/remote.decorator';
import { WebrtcAuthGuard } from '../../middleware/guards/webrtc-auth.guard';
import { WebrtcService } from './webrtc.service';

@ApiTags('WebRTC')
@Controller('webrtc')
@AdminRoute()
@UseGuards(WebrtcAuthGuard)
export class WebrtcController {
  constructor(private readonly webrtc: WebrtcService) {}

  @Get('ice-servers')
  @ApiOperation({
    summary: 'Short-lived ICE servers (Cloudflare TURN + STUN)',
    description:
      'Requires admin JWT (Authorization: Bearer) or device token (x-device-token).',
  })
  getIceServers() {
    return this.webrtc.getIceServers();
  }
}
