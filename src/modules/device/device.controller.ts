import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { DeviceService } from './device.service';
import { EnrollDeviceDto, HeartbeatDto } from './dto/device.dto';
import { Public } from '../../middleware/decorators/public.decorator';
import {
  AdminRoute,
  DeviceRoute,
  type AdminPayload,
  type DevicePayload,
} from '../../middleware/decorators/remote.decorator';
import { AdminJwtGuard } from '../../middleware/guards/admin-jwt.guard';
import { DeviceTokenGuard } from '../../middleware/guards/device-token.guard';

@ApiTags('Devices')
@Controller('devices')
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @AdminRoute()
  @UseGuards(AdminJwtGuard)
  @Get()
  listDevices() {
    return this.deviceService.listDevices();
  }

  @AdminRoute()
  @UseGuards(AdminJwtGuard)
  @Get(':id')
  getDevice(@Param('id') id: string) {
    return this.deviceService.getDevice(id);
  }

  @Public()
  @Post('enroll')
  enroll(@Body() dto: EnrollDeviceDto) {
    return this.deviceService.enroll(dto);
  }

  @DeviceRoute()
  @UseGuards(DeviceTokenGuard)
  @Patch(':id/heartbeat')
  heartbeat(
    @Param('id') id: string,
    @Body() dto: HeartbeatDto,
    @Req() req: Request & { device: DevicePayload },
  ) {
    if (req.device.deviceId !== id) {
      return this.deviceService.heartbeat(req.device.deviceId, dto);
    }
    return this.deviceService.heartbeat(id, dto);
  }

  @AdminRoute()
  @UseGuards(AdminJwtGuard)
  @Post(':id/revoke')
  revoke(@Param('id') id: string) {
    return this.deviceService.revoke(id);
  }
}
