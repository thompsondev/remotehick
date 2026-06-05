import { Controller, Get, Res } from '@nestjs/common';
import {
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../middleware/decorators/public.decorator';
import { AgentService } from './agent.service';

@ApiTags('Agent')
@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Public()
  @Get('download')
  @ApiOperation({
    summary: 'Download Windows agent installer',
    description:
      'Redirects to the Cloudinary-hosted Remote Agent installer, or serves a local build in development.',
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
  async download(@Res() res: Response): Promise<void> {
    const target = await this.agentService.resolveDownloadTarget();

    if (target.kind === 'redirect') {
      res.redirect(302, target.url);
      return;
    }

    if (target.kind === 'stream') {
      res.setHeader('Content-Type', 'application/zip');
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
