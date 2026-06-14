import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type CloudflareIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

@Injectable()
export class WebrtcService {
  private readonly logger = new Logger(WebrtcService.name);

  constructor(private readonly config: ConfigService) {}

  private defaultStunServers(): CloudflareIceServer[] {
    return [
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:stun.l.google.com:19302' },
    ];
  }

  private filterBrowserSafeUrls(urls: string | string[]): string | string[] {
    const list = Array.isArray(urls) ? urls : [urls];
    const filtered = list.filter((url) => !url.includes(':53'));
    return filtered.length === 1 ? filtered[0] : filtered;
  }

  private normalizeIceServers(iceServers: CloudflareIceServer[]) {
    return iceServers.map((server) => ({
      urls: this.filterBrowserSafeUrls(server.urls),
      ...(server.username ? { username: server.username } : {}),
      ...(server.credential ? { credential: server.credential } : {}),
    }));
  }

  async getIceServers() {
    const turnKeyId = this.config.get<string>('CLOUDFLARE_TURN_KEY_ID')?.trim();
    const turnApiToken = this.config
      .get<string>('CLOUDFLARE_TURN_API_TOKEN')
      ?.trim();

    if (!turnKeyId || !turnApiToken) {
      return { iceServers: this.defaultStunServers(), provider: 'stun-only' };
    }

    const ttl = Number(
      this.config.get<string>('CLOUDFLARE_TURN_TTL_SECONDS') ?? 86_400,
    );
    const safeTtl = Number.isFinite(ttl)
      ? Math.min(Math.max(Math.floor(ttl), 300), 172_800)
      : 86_400;

    try {
      const res = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${turnKeyId}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${turnApiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ttl: safeTtl }),
        },
      );

      if (!res.ok) {
        const body = await res.text();
        this.logger.error(
          `Cloudflare TURN credential request failed (${res.status}): ${body}`,
        );
        throw new ServiceUnavailableException(
          'Could not generate Cloudflare TURN credentials',
        );
      }

      const data = (await res.json()) as { iceServers?: CloudflareIceServer[] };
      if (!data.iceServers?.length) {
        throw new ServiceUnavailableException('Empty ICE server response');
      }

      return {
        iceServers: this.normalizeIceServers(data.iceServers),
        provider: 'cloudflare',
        ttl: safeTtl,
      };
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.error(`Cloudflare TURN error: ${err}`);
      throw new ServiceUnavailableException(
        'Could not generate Cloudflare TURN credentials',
      );
    }
  }
}
