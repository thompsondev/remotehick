import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeviceStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { RedisService } from '../../lib/redis/redis.service';
import {
  generateDeviceToken,
  hashToken,
} from '../../middleware/helpers/tokens';
import { EnrollDeviceDto, HeartbeatDto } from './dto/device.dto';

const ONLINE_TTL = 60;

@Injectable()
export class DeviceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async listDevices() {
    const devices = await this.prisma.device.findMany({
      where: { revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        name: true,
        os: true,
        hostname: true,
        ipAddress: true,
        status: true,
        enrolledAt: true,
        lastSeenAt: true,
        revokedAt: true,
        enrollmentLink: { select: { code: true, createdAt: true } },
        sessions: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            startedAt: true,
            endedAt: true,
            createdAt: true,
          },
        },
      },
    });

    return Promise.all(
      devices.map(async (device) => ({
        ...device,
        isOnline: await this.isDeviceOnline(device.id),
      })),
    );
  }

  async getDevice(id: string) {
    const device = await this.prisma.device.findFirst({
      where: { id, revokedAt: null },
      select: {
        id: true,
        name: true,
        os: true,
        hostname: true,
        ipAddress: true,
        status: true,
        enrolledAt: true,
        lastSeenAt: true,
        revokedAt: true,
        sessions: { orderBy: { createdAt: 'desc' }, take: 20 },
        enrollmentLink: true,
      },
    });
    if (!device) throw new NotFoundException('Device not found');
    return {
      ...device,
      isOnline: await this.isDeviceOnline(device.id),
    };
  }

  async enroll(dto: EnrollDeviceDto) {
    const link = await this.prisma.enrollmentLink.findUnique({
      where: { code: dto.code },
    });
    if (!link) throw new BadRequestException('Invalid enrollment code');
    if (link.usedAt)
      throw new BadRequestException('Enrollment link already used');
    if (link.expiresAt < new Date()) {
      throw new BadRequestException('Enrollment link expired');
    }

    const deviceToken = generateDeviceToken();
    const deviceTokenHash = hashToken(deviceToken);

    const device = await this.prisma.$transaction(async (tx) => {
      const created = await tx.device.create({
        data: {
          name: dto.name,
          os: dto.os,
          hostname: dto.hostname,
          ipAddress: dto.ipAddress,
          deviceTokenHash,
          status: DeviceStatus.ONLINE,
          lastSeenAt: new Date(),
        },
      });
      await tx.enrollmentLink.update({
        where: { id: link.id },
        data: { usedAt: new Date(), deviceId: created.id },
      });
      return created;
    });

    await this.redis.set(`device:online:${device.id}`, true, ONLINE_TTL);

    return {
      deviceId: device.id,
      deviceToken,
      device: {
        id: device.id,
        name: device.name,
        hostname: device.hostname,
        os: device.os,
      },
    };
  }

  async heartbeat(deviceId: string, dto: HeartbeatDto) {
    const device = await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        status: DeviceStatus.ONLINE,
        lastSeenAt: new Date(),
        ...(dto.ipAddress ? { ipAddress: dto.ipAddress } : {}),
      },
    });
    await this.redis.set(`device:online:${deviceId}`, true, ONLINE_TTL);
    return { success: true, lastSeenAt: device.lastSeenAt };
  }

  async revoke(deviceId: string) {
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { revokedAt: new Date(), status: DeviceStatus.OFFLINE },
    });
    await this.redis.delete(`device:online:${deviceId}`);
    return { success: true };
  }

  async markOffline(deviceId: string) {
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { status: DeviceStatus.OFFLINE },
    });
    await this.redis.delete(`device:online:${deviceId}`);
  }

  async isDeviceOnline(deviceId: string): Promise<boolean> {
    const online = await this.redis.get(`device:online:${deviceId}`);
    return !!online;
  }
}
