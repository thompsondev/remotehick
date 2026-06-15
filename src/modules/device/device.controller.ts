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
import {
  EnrollBrowserDto,
  EnrollDeviceDto,
  HeartbeatDto,
} from './dto/device.dto';
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
  enroll(@Body() dto: EnrollDeviceDto, @Req() req: Request) {
    return this.deviceService.enroll(dto, req);
  }

  @Public()
  @Post('enroll-browser')
  enrollBrowser(@Body() dto: EnrollBrowserDto, @Req() req: Request) {
    return this.deviceService.enrollBrowser(dto, req);
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
      return this.deviceService.heartbeat(req.device.deviceId, dto, req);
    }
    return this.deviceService.heartbeat(id, dto, req);
  }

  @AdminRoute()
  @UseGuards(AdminJwtGuard)
  @Post(':id/revoke')
  revoke(@Param('id') id: string) {
    return this.deviceService.revoke(id);
  }
}
