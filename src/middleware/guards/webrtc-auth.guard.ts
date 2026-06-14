import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { hashToken } from '../helpers/tokens';
import type { AdminPayload } from '../decorators/remote.decorator';

@Injectable()
export class WebrtcAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const payload = this.jwtService.verify<AdminPayload>(
          authHeader.slice(7),
        );
        (request as Request & { admin?: AdminPayload }).admin = payload;
        return true;
      } catch {
        /* try device token */
      }
    }

    const deviceToken = request.headers['x-device-token'];
    if (deviceToken && typeof deviceToken === 'string') {
      const device = await this.prisma.device.findFirst({
        where: { deviceTokenHash: hashToken(deviceToken), revokedAt: null },
      });
      if (device) {
        (request as Request & { device?: { deviceId: string } }).device = {
          deviceId: device.id,
        };
        return true;
      }
    }

    throw new UnauthorizedException(
      'Admin JWT or device token required for ICE servers',
    );
  }
}
