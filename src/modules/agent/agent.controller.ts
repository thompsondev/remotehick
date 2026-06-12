import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import {
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../middleware/decorators/public.decorator';
import { AgentService } from './agent.service';
import { EnrollmentTrackingService } from '../enrollment/enrollment-tracking.service';

@ApiTags('Agent')
@Controller('agent')
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    private readonly trackingService: EnrollmentTrackingService,
  ) {}

  @Public()
  @Get('download')
  @ApiOperation({
    summary: 'Download Windows agent installer',
    description:
      'Redirects to the Cloudinary-hosted Remote Agent installer, or serves a local build in development. Pass ?code= to attribute the download to an enrollment link.',
  })
  @ApiQuery({
    name: 'code',
    required: false,
    description: 'Enrollment link code for download tracking',
  })
  @ApiQuery({
    name: 'variant',
    required: false,
    description:
      'Installer variant: setup (default one-click NSIS), portable, or zip',
    enum: ['setup', 'portable', 'zip'],
  })
  @ApiProduces('application/octet-stream')
  @ApiResponse({ status: 200, description: 'Installer file download' })
  @ApiResponse({
    status: 302,
    description: 'Redirect to AGENT_DOWNLOAD_URL when configured',
  })
  @ApiResponse({
    status: 404,
    description: 'No local installer and no AGENT_DOWNLOAD_URL configured',
  })
  async download(
    @Query('code') code: string | undefined,
    @Query('variant') variant: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.trackingService.trackDownload(code, req);

    const target =
      await this.agentService.resolveDownloadTargetFromQuery(variant);

    if (target.kind === 'redirect') {
      res.redirect(302, target.url);
      return;
    }

    if (target.kind === 'stream') {
      const contentType = target.downloadName.endsWith('.zip')
        ? 'application/zip'
        : 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${target.downloadName}"`,
      );
      target.stream.pipe(res);
      return;
    }

    res.download(target.filePath, target.downloadName);
  }
}
