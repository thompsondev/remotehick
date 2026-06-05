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
      'Serves the packaged Remote Agent installer for enrollment on Windows PCs.',
  })
  @ApiProduces('application/octet-stream')
  @ApiResponse({ status: 200, description: 'Installer file download' })
  @ApiResponse({
    status: 404,
    description: 'Installer has not been built or copied to the server yet',
  })
  download(@Res() res: Response): void {
    const { filePath, downloadName } = this.agentService.resolveInstallerPath();
    res.download(filePath, downloadName);
  }
}
