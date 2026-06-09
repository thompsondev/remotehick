import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { EnrollmentLinkEventType } from '../../../generated/prisma/client';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { NotificationService } from '../../lib/notification/notification.service';
import { visitorKeyFromRequest } from '../../middleware/helpers/tracking';

export type EnrollmentLinkStats = {
  openCount: number;
  uniqueOpenCount: number;
  connectCount: number;
  uniqueConnectCount: number;
  downloadCount: number;
  uniqueDownloadCount: number;
  lastOpenedAt: Date | null;
  lastConnectedAt: Date | null;
  lastDownloadAt: Date | null;
};

@Injectable()
export class EnrollmentTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  private async findActiveLink(code: string) {
    const link = await this.prisma.enrollmentLink.findUnique({
      where: { code },
    });
    if (!link) return null;
    if (link.usedAt || link.expiresAt < new Date()) return null;
    return link;
  }

  async trackOpen(code: string, req: Request) {
    const link = await this.findActiveLink(code);
    if (!link) return { tracked: false };

    await this.prisma.enrollmentLinkEvent.create({
      data: {
        linkId: link.id,
        type: EnrollmentLinkEventType.OPEN,
        visitorKey: visitorKeyFromRequest(req),
      },
    });

    this.notifications.notifyEnrollmentLinkOpened(link.id, code);

    return { tracked: true };
  }

  async trackConnect(code: string, req: Request) {
    const link = await this.findActiveLink(code);
    if (!link) {
      const usedLink = await this.prisma.enrollmentLink.findUnique({
        where: { code },
      });
      if (!usedLink?.usedAt) return { tracked: false };

      await this.prisma.enrollmentLinkEvent.create({
        data: {
          linkId: usedLink.id,
          type: EnrollmentLinkEventType.CONNECT,
          visitorKey: visitorKeyFromRequest(req),
        },
      });
      return { tracked: true };
    }

    await this.prisma.enrollmentLinkEvent.create({
      data: {
        linkId: link.id,
        type: EnrollmentLinkEventType.CONNECT,
        visitorKey: visitorKeyFromRequest(req),
      },
    });

    this.notifications.notifyInstantConnectOpened(link.id, code);

    return { tracked: true };
  }

  async trackDownload(code: string | undefined, req: Request) {
    if (!code?.trim()) return { tracked: false };

    const link = await this.findActiveLink(code.trim());
    if (!link) return { tracked: false };

    await this.prisma.enrollmentLinkEvent.create({
      data: {
        linkId: link.id,
        type: EnrollmentLinkEventType.DOWNLOAD,
        visitorKey: visitorKeyFromRequest(req),
      },
    });

    this.notifications.notifyAgentDownloaded(link.id, code.trim());

    return { tracked: true };
  }

  async getStatsForLinks(
    linkIds: string[],
  ): Promise<Map<string, EnrollmentLinkStats>> {
    const stats = new Map<string, EnrollmentLinkStats>();
    if (!linkIds.length) return stats;

    for (const linkId of linkIds) {
      stats.set(linkId, {
        openCount: 0,
        uniqueOpenCount: 0,
        connectCount: 0,
        uniqueConnectCount: 0,
        downloadCount: 0,
        uniqueDownloadCount: 0,
        lastOpenedAt: null,
        lastConnectedAt: null,
        lastDownloadAt: null,
      });
    }

    const events = await this.prisma.enrollmentLinkEvent.findMany({
      where: { linkId: { in: linkIds } },
      select: {
        linkId: true,
        type: true,
        visitorKey: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const openVisitors = new Map<string, Set<string>>();
    const connectVisitors = new Map<string, Set<string>>();
    const downloadVisitors = new Map<string, Set<string>>();

    for (const event of events) {
      const current = stats.get(event.linkId);
      if (!current) continue;

      if (event.type === EnrollmentLinkEventType.OPEN) {
        current.openCount += 1;
        if (!current.lastOpenedAt) current.lastOpenedAt = event.createdAt;
        if (event.visitorKey) {
          if (!openVisitors.has(event.linkId)) {
            openVisitors.set(event.linkId, new Set());
          }
          openVisitors.get(event.linkId)!.add(event.visitorKey);
        }
      }

      if (event.type === EnrollmentLinkEventType.CONNECT) {
        current.connectCount += 1;
        if (!current.lastConnectedAt) current.lastConnectedAt = event.createdAt;
        if (event.visitorKey) {
          if (!connectVisitors.has(event.linkId)) {
            connectVisitors.set(event.linkId, new Set());
          }
          connectVisitors.get(event.linkId)!.add(event.visitorKey);
        }
      }

      if (event.type === EnrollmentLinkEventType.DOWNLOAD) {
        current.downloadCount += 1;
        if (!current.lastDownloadAt) current.lastDownloadAt = event.createdAt;
        if (event.visitorKey) {
          if (!downloadVisitors.has(event.linkId)) {
            downloadVisitors.set(event.linkId, new Set());
          }
          downloadVisitors.get(event.linkId)!.add(event.visitorKey);
        }
      }
    }

    for (const [linkId, entry] of stats) {
      entry.uniqueOpenCount = openVisitors.get(linkId)?.size ?? entry.openCount;
      entry.uniqueConnectCount =
        connectVisitors.get(linkId)?.size ?? entry.connectCount;
      entry.uniqueDownloadCount =
        downloadVisitors.get(linkId)?.size ?? entry.downloadCount;
    }

    return stats;
  }

  async assertAdminOwnsLink(adminId: string, linkId: string) {
    const link = await this.prisma.enrollmentLink.findFirst({
      where: { id: linkId, createdByAdminId: adminId },
      select: { id: true },
    });
    if (!link) {
      throw new UnauthorizedException('Enrollment link not found');
    }
  }

  async listEventsForLink(linkId: string, adminId: string) {
    await this.assertAdminOwnsLink(adminId, linkId);

    return this.prisma.enrollmentLinkEvent.findMany({
      where: { linkId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        type: true,
        createdAt: true,
      },
    });
  }
}
