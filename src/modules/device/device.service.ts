import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  DeviceStatus,
  DeviceType,
  EnrollmentLinkKind,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { NotificationService } from '../../lib/notification/notification.service';
import { RedisService } from '../../lib/redis/redis.service';
import { clientIpFromRequest } from '../../middleware/helpers/tracking';
import {
  generateDeviceToken,
  hashToken,
} from '../../middleware/helpers/tokens';
import {
  EnrollBrowserDto,
  EnrollDeviceDto,
  HeartbeatDto,
} from './dto/device.dto';
import { SignalingService } from '../signaling/signaling.service';

/** Must exceed 2× browser heartbeat interval (15s) for reliable presence. */
const ONLINE_TTL = 90;

const DEVICE_SELECT = {
  id: true,
  name: true,
  os: true,
  hostname: true,
  ipAddress: true,
  browser: true,
  userAgent: true,
  timezone: true,
  language: true,
  country: true,
  city: true,
  screenResolution: true,
  deviceType: true,
  status: true,
  enrolledAt: true,
  lastSeenAt: true,
  revokedAt: true,
  enrollmentLinkId: true,
  enrollmentLink: { select: { id: true, code: true, createdAt: true } },
} as const;

@Injectable()
export class DeviceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationService,
    @Inject(forwardRef(() => SignalingService))
    private readonly signaling: SignalingService,
  ) {}

  private isLinkExpired(expiresAt: Date | null): boolean {
    return !!expiresAt && expiresAt < new Date();
  }

  private assertLinkSupportsAgent(link: {
    kind: EnrollmentLinkKind;
    expiresAt: Date | null;
  }) {
    if (this.isLinkExpired(link.expiresAt)) {
      throw new BadRequestException('Enrollment link expired');
    }
    if (link.kind === EnrollmentLinkKind.INSTANT) {
      throw new BadRequestException(
        'This link is for instant browser connect only',
      );
    }
  }

  private assertLinkSupportsInstant(link: {
    kind: EnrollmentLinkKind;
    expiresAt: Date | null;
  }) {
    if (this.isLinkExpired(link.expiresAt)) {
      throw new BadRequestException('Enrollment link expired');
    }
    if (link.kind === EnrollmentLinkKind.AGENT) {
      throw new BadRequestException(
        'This link requires the Windows agent installer',
      );
    }
  }

  private formatSessionName(browser: string, enrolledAt = new Date()) {
    return `${browser} · ${enrolledAt.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })}`;
  }

  private isPrivateIp(ip: string): boolean {
    if (ip === '::1') return true;

    const normalized = ip.replace(/^::ffff:/i, '');
    const parts = normalized.split('.');
    if (parts.length !== 4) return false;

    const octets = parts.map((part) => Number(part));
    if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return false;
    }

    const [a, b] = octets;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;

    return false;
  }

  private resolveDeviceIp(
    dtoIp: string | undefined,
    req?: Request,
  ): string | undefined {
    const trimmed = dtoIp?.trim();
    const requestIp = req ? clientIpFromRequest(req) : undefined;

    if (trimmed && !this.isPrivateIp(trimmed)) return trimmed;
    if (requestIp && !this.isPrivateIp(requestIp)) return requestIp;
    return requestIp || trimmed;
  }

  private async resolveGeoFromIp(
    ip: string | undefined,
  ): Promise<{ country?: string; city?: string }> {
    if (!ip || this.isPrivateIp(ip)) return {};

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(
        `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,city`,
        { signal: controller.signal },
      );
      clearTimeout(timeout);
      const data = (await res.json()) as {
        status?: string;
        country?: string;
        city?: string;
      };
      if (data.status === 'success') {
        return { country: data.country, city: data.city };
      }
    } catch {
      /* geo lookup is best-effort */
    }
    return {};
  }

  private async buildDeviceMetadata(
    dto: {
      name?: string;
      os?: string;
      hostname?: string;
      browser?: string;
      userAgent?: string;
      timezone?: string;
      language?: string;
      screenResolution?: string;
      ipAddress?: string;
    },
    req?: Request,
    defaults?: { name: string; hostname: string; os: string; browser: string },
  ) {
    const ip = this.resolveDeviceIp(dto.ipAddress, req);
    const browser = dto.browser?.trim() || defaults?.browser || 'Web Browser';
    const geo = await this.resolveGeoFromIp(ip);
    const enrolledAt = new Date();

    return {
      name: dto.name?.trim() || this.formatSessionName(browser, enrolledAt),
      os: dto.os?.trim() || defaults?.os || 'Web Browser',
      hostname: dto.hostname?.trim() || defaults?.hostname || 'browser',
      ipAddress: ip,
      browser,
      userAgent: dto.userAgent?.trim() || req?.headers['user-agent'] || null,
      timezone: dto.timezone?.trim() || null,
      language: dto.language?.trim() || null,
      screenResolution: dto.screenResolution?.trim() || null,
      country: geo.country || null,
      city: geo.city || null,
    };
  }

  async listDevices() {
    const devices = await this.prisma.device.findMany({
      where: { revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        ...DEVICE_SELECT,
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
        signalingReady: await this.signaling.isDeviceSignalingConnected(
          device.id,
        ),
      })),
    );
  }

  async getDevice(id: string) {
    const device = await this.prisma.device.findFirst({
      where: { id, revokedAt: null },
      select: {
        ...DEVICE_SELECT,
        sessions: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!device) throw new NotFoundException('Device not found');
    return {
      ...device,
      isOnline: await this.isDeviceOnline(device.id),
      signalingReady: await this.signaling.isDeviceSignalingConnected(
        device.id,
      ),
    };
  }

  async enroll(dto: EnrollDeviceDto, req?: Request) {
    const link = await this.prisma.enrollmentLink.findUnique({
      where: { code: dto.code },
    });
    if (!link) throw new BadRequestException('Invalid enrollment code');
    this.assertLinkSupportsAgent(link);

    const deviceToken = generateDeviceToken();
    const deviceTokenHash = hashToken(deviceToken);
    const meta = await this.buildDeviceMetadata(dto, req, {
      name: dto.name,
      hostname: dto.hostname,
      os: dto.os,
      browser: 'Remote Agent',
    });

    const device = await this.prisma.device.create({
      data: {
        ...meta,
        deviceType: DeviceType.NATIVE,
        deviceTokenHash,
        status: DeviceStatus.ONLINE,
        lastSeenAt: new Date(),
        enrollmentLinkId: link.id,
      },
    });

    await this.redis.set(`device:online:${device.id}`, true, ONLINE_TTL);

    this.notifications.notifyDeviceEnrolled({
      adminId: link.createdByAdminId,
      code: link.code,
      deviceName: device.name,
      hostname: device.hostname,
      os: device.os,
    });

    return {
      deviceId: device.id,
      deviceToken,
      device: {
        id: device.id,
        name: device.name,
        hostname: device.hostname,
        os: device.os,
        deviceType: DeviceType.NATIVE,
      },
    };
  }

  async enrollBrowser(dto: EnrollBrowserDto, req?: Request) {
    const link = await this.prisma.enrollmentLink.findUnique({
      where: { code: dto.code },
    });
    if (!link) throw new BadRequestException('Invalid enrollment code');
    this.assertLinkSupportsInstant(link);

    const deviceToken = generateDeviceToken();
    const deviceTokenHash = hashToken(deviceToken);
    const meta = await this.buildDeviceMetadata(dto, req, {
      name: 'Browser Session',
      hostname: 'browser',
      os: 'Web Browser',
      browser: 'Web Browser',
    });

    const device = await this.prisma.device.create({
      data: {
        ...meta,
        deviceType: DeviceType.BROWSER,
        deviceTokenHash,
        status: DeviceStatus.ONLINE,
        lastSeenAt: new Date(),
        enrollmentLinkId: link.id,
      },
    });

    await this.redis.set(`device:online:${device.id}`, true, ONLINE_TTL);

    this.notifications.notifyDeviceEnrolled({
      adminId: link.createdByAdminId,
      code: link.code,
      deviceName: device.name,
      hostname: device.hostname,
      os: device.os,
    });

    return {
      deviceId: device.id,
      deviceToken,
      device: {
        id: device.id,
        name: device.name,
        hostname: device.hostname,
        os: device.os,
        deviceType: DeviceType.BROWSER,
      },
    };
  }

  private backfillField<T extends string>(
    current: T | null | undefined,
    incoming: T | undefined,
  ): T | undefined {
    if (current?.trim()) return undefined;
    const value = incoming?.trim();
    return value || undefined;
  }

  async heartbeat(deviceId: string, dto: HeartbeatDto, req?: Request) {
    const wasOnline = await this.isDeviceOnline(deviceId);
    const existing = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: {
        country: true,
        city: true,
        os: true,
        browser: true,
        userAgent: true,
        timezone: true,
        language: true,
        screenResolution: true,
      },
    });

    const publicIp = this.resolveDeviceIp(dto.ipAddress, req);
    const geo =
      publicIp && existing && (!existing.country || !existing.city)
        ? await this.resolveGeoFromIp(publicIp)
        : {};

    const metadataPatch = {
      os: this.backfillField(existing?.os, dto.os),
      browser: this.backfillField(existing?.browser, dto.browser),
      userAgent: this.backfillField(existing?.userAgent, dto.userAgent),
      timezone: this.backfillField(existing?.timezone, dto.timezone),
      language: this.backfillField(existing?.language, dto.language),
      screenResolution: this.backfillField(
        existing?.screenResolution,
        dto.screenResolution,
      ),
    };

    const device = await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        status: DeviceStatus.ONLINE,
        lastSeenAt: new Date(),
        ...(publicIp ? { ipAddress: publicIp } : {}),
        ...(geo.country ? { country: geo.country } : {}),
        ...(geo.city ? { city: geo.city } : {}),
        ...Object.fromEntries(
          Object.entries(metadataPatch).filter(([, value]) => !!value),
        ),
      },
      include: {
        enrollmentLink: { select: { createdByAdminId: true } },
      },
    });
    await this.redis.set(`device:online:${deviceId}`, true, ONLINE_TTL);

    if (!wasOnline) {
      this.notifications.notifyDeviceOnline(device);
    }

    return { success: true, lastSeenAt: device.lastSeenAt };
  }

  async markOnline(deviceId: string) {
    const wasOnline = await this.isDeviceOnline(deviceId);
    const device = await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        status: DeviceStatus.ONLINE,
        lastSeenAt: new Date(),
      },
      include: {
        enrollmentLink: { select: { createdByAdminId: true } },
      },
    });
    await this.redis.set(`device:online:${deviceId}`, true, ONLINE_TTL);

    if (!wasOnline) {
      this.notifications.notifyDeviceOnline(device);
    }

    return device;
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
    const wasOnline = await this.isDeviceOnline(deviceId);
    const device = await this.prisma.device.update({
      where: { id: deviceId },
      data: { status: DeviceStatus.OFFLINE },
      include: {
        enrollmentLink: { select: { createdByAdminId: true } },
      },
    });
    await this.redis.delete(`device:online:${deviceId}`);

    if (wasOnline) {
      this.notifications.notifyDeviceOffline(device);
    }
  }

  async isDeviceOnline(deviceId: string): Promise<boolean> {
    const online = await this.redis.get(`device:online:${deviceId}`);
    if (online) return true;

    void this.prisma.device.updateMany({
      where: { id: deviceId, status: DeviceStatus.ONLINE },
      data: { status: DeviceStatus.OFFLINE },
    });

    return false;
  }
}
