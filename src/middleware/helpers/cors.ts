import { ConfigService } from '@nestjs/config';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

const LOCALHOST_PATTERNS = [
  /^https?:\/\/localhost(?::\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/,
];

/** Headers used by browser instant connect, admin API, and device agents. */
const ALLOWED_REQUEST_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'Accept',
  'Origin',
  'x-device-token',
  'x-api-key',
];

const URL_ORIGIN_ENV_KEYS = [
  'ENROLLMENT_LINK_BASE_URL',
  'ENROLLMENT_INSTANT_BASE_URL',
  'PLATFORM_URL',
] as const;

function normalizeHost(value?: string | null): string | null {
  if (!value) return null;

  const trimmed = value
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\/$/, '');
  if (!trimmed) return null;

  if (trimmed.includes('://')) {
    try {
      return new URL(trimmed).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  return trimmed.split('/')[0].toLowerCase();
}

function addOrigin(target: Set<string>, value?: string | null) {
  const host = normalizeHost(value);
  if (!host) return;

  if (value?.includes('://')) {
    try {
      target.add(new URL(value.trim().replace(/\/$/, '')).origin);
      return;
    } catch {
      /* fall through */
    }
  }

  target.add(`https://${host}`);
  target.add(`http://${host}`);
}

function parentDomain(hostname: string): string | null {
  const parts = hostname.split('.').filter(Boolean);
  if (parts.length < 3) return null;
  return parts.slice(-2).join('.');
}

function collectSubdomainRoots(configService: ConfigService): string[] {
  const roots = new Set<string>();

  const explicit = configService.get<string>('CORS_ALLOW_SUBDOMAINS_OF');
  if (explicit) {
    for (const part of explicit.split(',')) {
      const host = normalizeHost(part);
      if (host) roots.add(host);
    }
  }

  for (const key of ['PRODUCTION_URL', 'DEVELOPMENT_URL'] as const) {
    const host = normalizeHost(configService.get<string>(key));
    if (!host) continue;
    const parent = parentDomain(host);
    if (parent) roots.add(parent);
  }

  for (const key of URL_ORIGIN_ENV_KEYS) {
    const host = normalizeHost(configService.get<string>(key));
    if (!host) continue;
    const parent = parentDomain(host);
    if (parent) roots.add(parent);
  }

  return [...roots];
}

function hostnameMatchesSubdomainRoot(
  hostname: string,
  subdomainRoots: string[],
): boolean {
  const normalized = hostname.toLowerCase();
  return subdomainRoots.some((root) => {
    const base = root.toLowerCase();
    return normalized === base || normalized.endsWith(`.${base}`);
  });
}

export function buildCorsOptions(configService: ConfigService): {
  options: CorsOptions;
  allowedOrigins: string[];
  subdomainRoots: string[];
} {
  const exactOrigins = new Set<string>();

  const corsOriginsRaw = configService.get<string>('CORS_ORIGINS');
  if (corsOriginsRaw) {
    for (const part of corsOriginsRaw.split(',')) {
      addOrigin(exactOrigins, part);
    }
  }

  for (const key of URL_ORIGIN_ENV_KEYS) {
    addOrigin(exactOrigins, configService.get<string>(key));
  }

  const subdomainRoots = collectSubdomainRoots(configService);
  const allowedOrigins = [...exactOrigins];

  return {
    allowedOrigins,
    subdomainRoots,
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

        try {
          const { hostname } = new URL(origin);
          if (hostnameMatchesSubdomainRoot(hostname, subdomainRoots)) {
            callback(null, origin);
            return;
          }
        } catch {
          /* ignore invalid origin */
        }

        callback(null, false);
      },
      credentials: true,
      allowedHeaders: ALLOWED_REQUEST_HEADERS,
      methods: ['GET', 'PATCH', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      optionsSuccessStatus: 204,
      maxAge: 86_400,
    },
  };
}
