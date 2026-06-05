import { createHash, randomBytes } from 'crypto';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateDeviceToken(): string {
  return randomBytes(32).toString('hex');
}

export function generateEnrollmentCode(): string {
  return randomBytes(6).toString('hex');
}
