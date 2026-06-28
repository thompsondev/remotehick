import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnrollmentLinkKind } from '../../../generated/prisma/client';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { generateEnrollmentCode } from '../../middleware/helpers/tokens';
import { EnrollmentTrackingService } from './enrollment-tracking.service';

export type EnrollmentLinkStatus = 'active' | 'expired';

function resolveLinkStatus(link: {
  expiresAt: Date | null;
}): EnrollmentLinkStatus {
  if (link.expiresAt && link.expiresAt < new Date()) return 'expired';
  return 'active';
}

const LINK_DEVICE_SELECT = {
  id: true,
  name: true,
  hostname: true,
  os: true,
  browser: true,
  ipAddress: true,
  country: true,
  city: true,
  timezone: true,
  language: true,
  screenResolution: true,
  userAgent: true,
  status: true,
  deviceType: true,
  enrolledAt: true,
  lastSeenAt: true,
  revokedAt: true,
} as const;

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
    kind: EnrollmentLinkKind = EnrollmentLinkKind.BOTH,
  ) {
    // Default TTL is 72 hours (3 days) to prevent enrollment links from
    // living forever. Set ENROLLMENT_LINK_TTL_HOURS=0 only if you explicitly
    // want non-expiring links (not recommended for production).
    const configuredTtl = Number(
      this.config.get<string>('ENROLLMENT_LINK_TTL_HOURS'),
    );
    const ttlHours = Number.isFinite(configuredTtl) && configuredTtl > 0
      ? configuredTtl
      : 72;
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
        devices: {
          where: { revokedAt: null },
          orderBy: { enrolledAt: 'desc' },
          select: LINK_DEVICE_SELECT,
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
        deviceCount: link.devices.length,
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
        expiresAt: { lt: new Date() },
      },
    });

    return { success: true, deletedCount: result.count };
  }

  async validateCode(code: string) {
    // This endpoint is public — only return the minimum fields needed to
    // confirm a link is valid. Never expose device metadata (hostname, IP,
    // OS, etc.) to unauthenticated callers.
    const link = await this.prisma.enrollmentLink.findUnique({
      where: { code },
    });
    if (!link) return { valid: false, reason: 'not_found' };
    if (link.expiresAt && link.expiresAt < new Date()) {
      return { valid: false, reason: 'expired', expiresAt: link.expiresAt };
    }

    return {
      valid: true,
      kind: link.kind,
      expiresAt: link.expiresAt,
    };
  }

  getAgentBootstrap(
    code: string,
    link: {
      code: string;
      kind: EnrollmentLinkKind;
      expiresAt: Date | null;
    },
  ) {
    // Only return server topology (apiUrl, wsUrl) for AGENT or BOTH links.
    // INSTANT-only links do not need agent bootstrap data and exposing
    // the internal API/WS URLs to unauthenticated instant-connect clients
    // is unnecessary information disclosure.
    if (link.kind === EnrollmentLinkKind.INSTANT) {
      const { instantUrl } = this.buildLinkUrls(code);
      return {
        valid: true as const,
        code: link.code,
        kind: link.kind,
        expiresAt: link.expiresAt,
        instantUrl,
      };
    }

    const apiBase =
      this.config.get<string>('PLATFORM_URL')?.replace(/\/$/, '') ||
      'http://localhost:3000';
    const apiUrl =
      this.config.get<string>('PUBLIC_API_URL')?.replace(/\/$/, '') ||
      `${apiBase}/v1`;
    const wsUrl =
      this.config.get<string>('PUBLIC_WS_URL')?.replace(/\/$/, '') || apiBase;

    const { agentUrl, instantUrl } = this.buildLinkUrls(code);
    const downloadUrl = `${apiUrl}/agent/download?code=${encodeURIComponent(code)}`;
    const deepLink =
      `remoteagent://enroll?code=${encodeURIComponent(code)}` +
      `&api=${encodeURIComponent(apiUrl)}`;

    return {
      valid: true as const,
      code: link.code,
      kind: link.kind,
      expiresAt: link.expiresAt,
      apiUrl,
      wsUrl,
      agentUrl,
      instantUrl,
      downloadUrl,
      deepLink,
    };
  }

  async validateAgentCode(code: string) {
    const link = await this.prisma.enrollmentLink.findUnique({
      where: { code },
    });
    if (!link) return { valid: false as const, reason: 'not_found' };
    if (link.expiresAt && link.expiresAt < new Date()) {
      return {
        valid: false as const,
        reason: 'expired',
        expiresAt: link.expiresAt,
      };
    }
    if (link.kind === EnrollmentLinkKind.INSTANT) {
      const { instantUrl } = this.buildLinkUrls(code);
      return {
        valid: false as const,
        reason: 'instant_only',
        kind: link.kind,
        instantUrl,
      };
    }

    return this.getAgentBootstrap(code, link);
  }

  async validateConnectCode(code: string) {
    const link = await this.prisma.enrollmentLink.findUnique({
      where: { code },
    });
    if (!link) return { valid: false, reason: 'not_found' };
    if (link.expiresAt && link.expiresAt < new Date()) {
      return { valid: false, reason: 'expired', expiresAt: link.expiresAt };
    }
    if (link.kind === EnrollmentLinkKind.AGENT) {
      return { valid: false, reason: 'agent_only', kind: link.kind };
    }

    const { instantUrl } = this.buildLinkUrls(code);

    return {
      valid: true,
      ready: true,
      reusable: true,
      kind: link.kind,
      expiresAt: link.expiresAt,
      instantUrl,
    };
  }
}
