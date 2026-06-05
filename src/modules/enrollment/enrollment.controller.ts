import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { EnrollmentService } from './enrollment.service';
import { Public } from '../../middleware/decorators/public.decorator';
import {
  AdminRoute,
  type AdminPayload,
} from '../../middleware/decorators/remote.decorator';
import { AdminJwtGuard } from '../../middleware/guards/admin-jwt.guard';

@ApiTags('Enrollment')
@Controller('enrollment-links')
export class EnrollmentController {
  constructor(private readonly enrollmentService: EnrollmentService) {}

  @AdminRoute()
  @UseGuards(AdminJwtGuard)
  @Post()
  createLink(@Req() req: Request & { admin: AdminPayload }) {
    return this.enrollmentService.createLink(req.admin.sub);
  }

  @AdminRoute()
  @UseGuards(AdminJwtGuard)
  @Get()
  listLinks(@Req() req: Request & { admin: AdminPayload }) {
    return this.enrollmentService.listLinks(req.admin.sub);
  }

  @Public()
  @Get(':code/validate')
  validate(@Param('code') code: string) {
    return this.enrollmentService.validateCode(code);
  }
}
