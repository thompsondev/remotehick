import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeviceType,
  EnrollmentLinkKind,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { generateEnrollmentCode } from '../../middleware/helpers/tokens';
import { EnrollmentTrackingService } from './enrollment-tracking.service';

export type EnrollmentLinkStatus = 'active' | 'expired' | 'used';

function resolveLinkStatus(link: {
  usedAt: Date | null;
  expiresAt: Date;
}): EnrollmentLinkStatus {
  if (link.usedAt) return 'used';
  if (link.expiresAt < new Date()) return 'expired';
  return 'active';
}

@Injectable()
export class EnrollmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tracking: EnrollmentTrackingService,
  ) {}

  private buildLinkUrls(code: string) {
    const agentBase =
      this.config.get<string>('ENROLLMENT_LINK_BASE_URL') ||
      'http://localhost:3001/enroll';
    const instantBase =
      this.config.get<string>('ENROLLMENT_INSTANT_BASE_URL') ||
      agentBase.replace(/\/enroll\/?$/, '/connect');

    const agentUrl = `${agentBase.replace(/\/$/, '')}/${code}`;
    const instantUrl = `${instantBase.replace(/\/$/, '')}/${code}`;
    return { agentUrl, instantUrl };
  }

  async createLink(
    adminId: string,
    kind: EnrollmentLinkKind = EnrollmentLinkKind.INSTANT,
  ) {
    const ttlHours = Number(
      this.config.get<string>('ENROLLMENT_LINK_TTL_HOURS') || 24,
    );
    const code = generateEnrollmentCode();
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    const link = await this.prisma.enrollmentLink.create({
      data: {
        code,
        kind,
        expiresAt,
        createdByAdminId: adminId,
      },
    });

    const { agentUrl, instantUrl } = this.buildLinkUrls(code);
    const url =
      kind === EnrollmentLinkKind.AGENT
        ? agentUrl
        : kind === EnrollmentLinkKind.INSTANT
          ? instantUrl
          : instantUrl;

    return { ...link, url, agentUrl, instantUrl };
  }

  async listLinks(adminId: string) {
    const links = await this.prisma.enrollmentLink.findMany({
      where: { createdByAdminId: adminId },
      orderBy: { createdAt: 'desc' },
      include: {
        device: {
          select: {
            id: true,
            name: true,
            hostname: true,
            status: true,
            deviceType: true,
          },
        },
      },
    });

    const stats = await this.tracking.getStatsForLinks(
      links.map((link) => link.id),
    );

    return links.map((link) => {
      const { agentUrl, instantUrl } = this.buildLinkUrls(link.code);
      return {
        ...link,
        agentUrl,
        instantUrl,
        url:
          link.kind === EnrollmentLinkKind.AGENT
            ? agentUrl
            : link.kind === EnrollmentLinkKind.INSTANT
              ? instantUrl
              : instantUrl,
        status: resolveLinkStatus(link),
        stats: stats.get(link.id) ?? {
          openCount: 0,
          uniqueOpenCount: 0,
          connectCount: 0,
          uniqueConnectCount: 0,
          downloadCount: 0,
          uniqueDownloadCount: 0,
          lastOpenedAt: null,
          lastConnectedAt: null,
          lastDownloadAt: null,
        },
      };
    });
  }

  async deleteLink(adminId: string, linkId: string) {
    const link = await this.prisma.enrollmentLink.findFirst({
      where: { id: linkId, createdByAdminId: adminId },
      select: { id: true },
    });
    if (!link) {
      throw new NotFoundException('Enrollment link not found');
    }

    await this.prisma.enrollmentLink.delete({ where: { id: linkId } });
    return { success: true, deletedId: linkId };
  }

  async deleteLinks(adminId: string, ids: string[]) {
    const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (!uniqueIds.length) {
      throw new BadRequestException('No link ids provided');
    }

    const result = await this.prisma.enrollmentLink.deleteMany({
      where: {
        id: { in: uniqueIds },
        createdByAdminId: adminId,
      },
    });

    return { success: true, deletedCount: result.count };
  }

  async deleteExpiredLinks(adminId: string) {
    const result = await this.prisma.enrollmentLink.deleteMany({
      where: {
        createdByAdminId: adminId,
        usedAt: null,
        expiresAt: { lt: new Date() },
      },
    });

    return { success: true, deletedCount: result.count };
  }

  async validateCode(code: string) {
    const link = await this.prisma.enrollmentLink.findUnique({
      where: { code },
      include: {
        device: {
          select: {
            id: true,
            name: true,
            hostname: true,
            deviceType: true,
            revokedAt: true,
          },
        },
      },
    });
    if (!link) return { valid: false, reason: 'not_found' };
    if (link.expiresAt < new Date()) {
      return { valid: false, reason: 'expired', expiresAt: link.expiresAt };
    }
    if (link.usedAt) {
      return {
        valid: false,
        reason: 'used',
        usedAt: link.usedAt,
        kind: link.kind,
        device: link.device,
      };
    }
    const { agentUrl, instantUrl } = this.buildLinkUrls(code);
    return {
      valid: true,
      code: link.code,
      kind: link.kind,
      expiresAt: link.expiresAt,
      agentUrl,
      instantUrl,
      device: link.device,
    };
  }

  async validateConnectCode(code: string) {
    const link = await this.prisma.enrollmentLink.findUnique({
      where: { code },
      include: {
        device: {
          select: {
            id: true,
            name: true,
            hostname: true,
            deviceType: true,
            revokedAt: true,
          },
        },
      },
    });
    if (!link) return { valid: false, reason: 'not_found' };
    if (link.expiresAt < new Date()) {
      return { valid: false, reason: 'expired', expiresAt: link.expiresAt };
    }
    if (link.kind === EnrollmentLinkKind.AGENT) {
      return { valid: false, reason: 'agent_only', kind: link.kind };
    }

    const { instantUrl } = this.buildLinkUrls(code);

    if (!link.usedAt) {
      return {
        valid: true,
        ready: false,
        kind: link.kind,
        expiresAt: link.expiresAt,
        instantUrl,
      };
    }

    const device = link.device;
    if (
      device &&
      device.deviceType === DeviceType.BROWSER &&
      !device.revokedAt
    ) {
      return {
        valid: true,
        ready: true,
        reconnect: true,
        kind: link.kind,
        expiresAt: link.expiresAt,
        instantUrl,
        device: {
          id: device.id,
          name: device.name,
          hostname: device.hostname,
        },
      };
    }

    return {
      valid: false,
      reason: 'used',
      usedAt: link.usedAt,
      kind: link.kind,
    };
  }
}
