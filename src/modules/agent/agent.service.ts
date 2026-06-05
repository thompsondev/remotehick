import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AgentService {
  constructor(private readonly config: ConfigService) {}

  resolveInstallerPath(): { filePath: string; downloadName: string } {
    const configured = this.config.get<string>('AGENT_INSTALLER_PATH')?.trim();
    const candidates = [
      configured,
      path.join(process.cwd(), 'public', 'agents', 'Remote-Agent-Setup.exe'),
      path.join(process.cwd(), 'public', 'agents', 'Remote-Agent-Portable.exe'),
      path.join(process.cwd(), 'public', 'agents', 'Remote-Agent-win.zip'),
    ].filter((value): value is string => !!value);

    for (const filePath of candidates) {
      if (fs.existsSync(filePath)) {
        return {
          filePath,
          downloadName: path.basename(filePath),
        };
      }
    }

    throw new NotFoundException(
      'Windows agent installer is not available yet. Build it with: cd remoteagent && pnpm dist, then copy the file to remotehick/public/agents/.',
    );
  }
}
