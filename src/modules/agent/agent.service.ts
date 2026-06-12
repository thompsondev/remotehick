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

  resolveDownloadTarget(
    variant: 'setup' | 'portable' | 'zip' = 'setup',
  ): Promise<AgentDownloadTarget> | AgentDownloadTarget {
    const externalUrl = this.config.get<string>('AGENT_DOWNLOAD_URL')?.trim();
    if (externalUrl) {
      return { kind: 'redirect', url: externalUrl };
    }

    const driveFileId = this.config
      .get<string>('GOOGLE_DRIVE_AGENT_FILE_ID')
      ?.trim();
    if (driveFileId) {
      return {
        kind: 'redirect',
        url: `https://drive.google.com/uc?export=download&id=${driveFileId}`,
      };
    }

    const cloudinaryUrl = this.cloudinary.getAgentDownloadUrl();
    if (cloudinaryUrl) {
      return { kind: 'redirect', url: cloudinaryUrl };
    }

    const partUrls = this.getCloudinaryPartUrls(variant);
    if (partUrls.length > 0) {
      return this.streamCloudinaryParts(partUrls, variant);
    }

    return {
      kind: 'file',
      ...this.resolveInstallerPath(variant),
    };
  }

  private normalizeVariant(value?: string): 'setup' | 'portable' | 'zip' {
    const normalized = value?.trim().toLowerCase();
    if (normalized === 'portable' || normalized === 'zip') return normalized;
    return 'setup';
  }

  resolveDownloadTargetFromQuery(
    variant?: string,
  ): Promise<AgentDownloadTarget> | AgentDownloadTarget {
    return this.resolveDownloadTarget(this.normalizeVariant(variant));
  }

  private getCloudinaryPartUrls(
    variant: 'setup' | 'portable' | 'zip',
  ): string[] {
    if (variant === 'portable') {
      return this.cloudinary.getAgentPortablePartUrls();
    }
    if (variant === 'zip') {
      return this.cloudinary.getAgentZipPartUrls();
    }
    return this.cloudinary.getAgentPartUrls();
  }

  private resolveStreamDownloadName(
    variant: 'setup' | 'portable' | 'zip',
  ): string {
    const envKey = {
      setup: 'AGENT_DOWNLOAD_FILENAME',
      portable: 'AGENT_PORTABLE_DOWNLOAD_FILENAME',
      zip: 'AGENT_ZIP_DOWNLOAD_FILENAME',
    }[variant];
    const fallback = {
      setup: 'Remote-Agent-Setup.exe',
      portable: 'Remote-Agent-Portable.exe',
      zip: 'Remote-Agent-win.zip',
    }[variant];

    return this.config.get<string>(envKey)?.trim() || fallback;
  }

  private async streamCloudinaryParts(
    partUrls: string[],
    variant: 'setup' | 'portable' | 'zip' = 'setup',
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

    const downloadName = this.resolveStreamDownloadName(variant);

    return {
      kind: 'stream',
      stream: Readable.from(mergeParts()),
      downloadName,
    };
  }

  resolveInstallerPath(variant: 'setup' | 'portable' | 'zip' = 'setup'): {
    filePath: string;
    downloadName: string;
  } {
    const configured = this.config.get<string>('AGENT_INSTALLER_PATH')?.trim();
    const byVariant = {
      setup: path.join(
        process.cwd(),
        'public',
        'agents',
        'Remote-Agent-Setup.exe',
      ),
      portable: path.join(
        process.cwd(),
        'public',
        'agents',
        'Remote-Agent-Portable.exe',
      ),
      zip: path.join(process.cwd(), 'public', 'agents', 'Remote-Agent-win.zip'),
    };

    const candidates = [
      configured,
      byVariant[variant],
      byVariant.setup,
      byVariant.portable,
      byVariant.zip,
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
      'Windows agent installer is not available. Run pnpm upload:agent after building the agent, configure Google Drive credentials, or copy a local build with pnpm copy:agent',
    );
  }
}
