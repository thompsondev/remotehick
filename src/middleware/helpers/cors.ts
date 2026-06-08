import { ConfigService } from '@nestjs/config';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

const LOCALHOST_PATTERNS = [
  /^https?:\/\/localhost(?::\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/,
];

function addOrigin(target: Set<string>, value?: string | null) {
  if (!value) return;

  const trimmed = value
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\/$/, '');
  if (!trimmed) return;

  if (trimmed.includes('://')) {
    try {
      target.add(new URL(trimmed).origin);
      return;
    } catch {
      /* fall through */
    }
  }

  target.add(`https://${trimmed}`);
  target.add(`http://${trimmed}`);
}

export function buildCorsOptions(configService: ConfigService): {
  options: CorsOptions;
  allowedOrigins: string[];
} {
  const exactOrigins = new Set<string>();

  const corsOriginsRaw = configService.get<string>('CORS_ORIGINS');
  if (corsOriginsRaw) {
    for (const part of corsOriginsRaw.split(',')) {
      addOrigin(exactOrigins, part);
    }
  }

  addOrigin(
    exactOrigins,
    configService.get<string>('ENROLLMENT_LINK_BASE_URL'),
  );
  addOrigin(exactOrigins, configService.get<string>('PLATFORM_URL'));

  const allowedOrigins = [...exactOrigins];

  return {
    allowedOrigins,
    options: {
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }

        if (
          exactOrigins.has(origin) ||
          LOCALHOST_PATTERNS.some((pattern) => pattern.test(origin))
        ) {
          callback(null, origin);
          return;
        }

        callback(null, false);
      },
      credentials: true,
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
      ],
      methods: ['GET', 'PATCH', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      optionsSuccessStatus: 200,
    },
  };
}
