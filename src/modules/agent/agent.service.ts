import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { CloudinaryService } from '../../lib/cloudinary/cloudinary.service';

export type AgentDownloadTarget =
  | { kind: 'file'; filePath: string; downloadName: string }
  | { kind: 'redirect'; url: string }
  | { kind: 'stream'; stream: Readable; downloadName: string };

@Injectable()
export class AgentService {
  constructor(
    private readonly config: ConfigService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  resolveDownloadTarget(): Promise<AgentDownloadTarget> | AgentDownloadTarget {
    const externalUrl = this.config.get<string>('AGENT_DOWNLOAD_URL')?.trim();
    if (externalUrl) {
      return { kind: 'redirect', url: externalUrl };
    }

    const cloudinaryUrl = this.cloudinary.getAgentDownloadUrl();
    if (cloudinaryUrl) {
      return { kind: 'redirect', url: cloudinaryUrl };
    }

    const partUrls = this.cloudinary.getAgentPartUrls();
    if (partUrls.length > 0) {
      return this.streamCloudinaryParts(partUrls);
    }

    return {
      kind: 'file',
      ...this.resolveInstallerPath(),
    };
  }

  private async streamCloudinaryParts(
    partUrls: string[],
  ): Promise<AgentDownloadTarget> {
    async function* mergeParts() {
      for (const url of partUrls) {
        const response = await fetch(url);
        if (!response.ok || !response.body) {
          throw new NotFoundException(
            `Failed to fetch agent part from Cloudinary (${response.status})`,
          );
        }

        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          yield value;
        }
      }
    }

    return {
      kind: 'stream',
      stream: Readable.from(mergeParts()),
      downloadName: 'Remote-Agent-win.zip',
    };
  }

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
      'Windows agent installer is not available. Run pnpm upload:agent after building the agent, or copy a local build with pnpm copy:agent',
    );
  }
}
