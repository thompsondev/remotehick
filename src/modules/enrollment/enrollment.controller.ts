import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { EnrollmentService } from './enrollment.service';
import { EnrollmentTrackingService } from './enrollment-tracking.service';
import { BulkDeleteEnrollmentLinksDto } from './dto/bulk-delete-links.dto';
import { CreateEnrollmentLinkDto } from './dto/create-link.dto';
import { Public } from '../../middleware/decorators/public.decorator';
import {
  AdminRoute,
  type AdminPayload,
} from '../../middleware/decorators/remote.decorator';
import { AdminJwtGuard } from '../../middleware/guards/admin-jwt.guard';

@ApiTags('Enrollment')
@Controller('enrollment-links')
export class EnrollmentController {
  constructor(
    private readonly enrollmentService: EnrollmentService,
    private readonly trackingService: EnrollmentTrackingService,
  ) {}

  @AdminRoute()
  @UseGuards(AdminJwtGuard)
  @Post()
  createLink(
    @Req() req: Request & { admin: AdminPayload },
    @Body() body: CreateEnrollmentLinkDto,
  ) {
    return this.enrollmentService.createLink(req.admin.sub, body.kind);
  }

  @AdminRoute()
  @UseGuards(AdminJwtGuard)
  @Get()
  listLinks(@Req() req: Request & { admin: AdminPayload }) {
    return this.enrollmentService.listLinks(req.admin.sub);
  }

  @AdminRoute()
  @UseGuards(AdminJwtGuard)
  @Delete('expired')
  deleteExpired(@Req() req: Request & { admin: AdminPayload }) {
    return this.enrollmentService.deleteExpiredLinks(req.admin.sub);
  }

  @AdminRoute()
  @UseGuards(AdminJwtGuard)
  @Post('bulk-delete')
  bulkDelete(
    @Req() req: Request & { admin: AdminPayload },
    @Body() body: BulkDeleteEnrollmentLinksDto,
  ) {
    return this.enrollmentService.deleteLinks(req.admin.sub, body.ids);
  }

  @AdminRoute()
  @UseGuards(AdminJwtGuard)
  @Delete(':id')
  deleteLink(
    @Param('id') id: string,
    @Req() req: Request & { admin: AdminPayload },
  ) {
    return this.enrollmentService.deleteLink(req.admin.sub, id);
  }

  @Public()
  @Get(':code/validate')
  validate(@Param('code') code: string) {
    return this.enrollmentService.validateCode(code);
  }

  @Public()
  @Get(':code/validate-connect')
  validateConnect(@Param('code') code: string) {
    return this.enrollmentService.validateConnectCode(code);
  }

  @Public()
  @Get(':code/agent-bootstrap')
  agentBootstrap(@Param('code') code: string) {
    return this.enrollmentService.validateAgentCode(code);
  }

  @Public()
  @Post(':code/track/open')
  trackOpen(@Param('code') code: string, @Req() req: Request) {
    return this.trackingService.trackOpen(code, req);
  }

  @Public()
  @Post(':code/track/connect')
  trackConnect(@Param('code') code: string, @Req() req: Request) {
    return this.trackingService.trackConnect(code, req);
  }

  @AdminRoute()
  @UseGuards(AdminJwtGuard)
  @Get(':id/events')
  listEvents(
    @Param('id') id: string,
    @Req() req: Request & { admin: AdminPayload },
  ) {
    return this.trackingService.listEventsForLink(id, req.admin.sub);
  }
}
