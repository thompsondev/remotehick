import { createHash } from 'crypto';
import type { Request } from 'express';

export function clientIpFromRequest(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    req.ip ||
    (typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : undefined) ||
    req.socket.remoteAddress;
  if (!ip) return undefined;
  return ip.replace(/^::ffff:/, '');
}

export function visitorKeyFromRequest(req: Request): string | undefined {
  const ip = clientIpFromRequest(req);
  const userAgent = req.headers['user-agent'] || '';

  if (!ip) return undefined;

  return createHash('sha256')
    .update(`${ip}:${userAgent}`)
    .digest('hex')
    .slice(0, 24);
}
