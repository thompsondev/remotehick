import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { hashToken } from '../helpers/tokens';
import { DevicePayload } from '../decorators/remote.decorator';

@Injectable()
export class DeviceTokenGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.headers['x-device-token'];

    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('Device token required');
    }

    const deviceTokenHash = hashToken(token);
    const device = await this.prisma.device.findFirst({
      where: { deviceTokenHash, revokedAt: null },
    });

    if (!device) {
      throw new UnauthorizedException('Invalid device token');
    }

    const deviceIdParam = request.params.id;
    if (deviceIdParam && deviceIdParam !== device.id) {
      throw new UnauthorizedException('Device token mismatch');
    }

    (request as Request & { device: DevicePayload }).device = {
      deviceId: device.id,
    };
    return true;
  }
}
