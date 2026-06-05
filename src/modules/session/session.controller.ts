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
import { SessionService } from './session.service';
import { CreateSessionDto } from './dto/session.dto';
import {
  AdminRoute,
  type AdminPayload,
} from '../../middleware/decorators/remote.decorator';
import { AdminJwtGuard } from '../../middleware/guards/admin-jwt.guard';

@ApiTags('Sessions')
@Controller('sessions')
@AdminRoute()
@UseGuards(AdminJwtGuard)
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post()
  create(
    @Req() req: Request & { admin: AdminPayload },
    @Body() dto: CreateSessionDto,
  ) {
    return this.sessionService.createSession(req.admin.sub, dto);
  }

  @Get()
  list(@Req() req: Request & { admin: AdminPayload }) {
    return this.sessionService.listSessions(req.admin.sub);
  }

  @Get(':id')
  get(@Param('id') id: string, @Req() req: Request & { admin: AdminPayload }) {
    return this.sessionService.getSession(id, req.admin.sub);
  }

  @Delete(':id')
  end(@Param('id') id: string, @Req() req: Request & { admin: AdminPayload }) {
    return this.sessionService.endSession(id, req.admin.sub);
  }
}
