import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

  async createLink(adminId: string) {
    const ttlHours = Number(
      this.config.get<string>('ENROLLMENT_LINK_TTL_HOURS') || 24,
    );
    const baseUrl =
      this.config.get<string>('ENROLLMENT_LINK_BASE_URL') ||
      'http://localhost:3000/enroll';
    const code = generateEnrollmentCode();
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    const link = await this.prisma.enrollmentLink.create({
      data: {
        code,
        expiresAt,
        createdByAdminId: adminId,
      },
    });

    const url = `${baseUrl.replace(/\/$/, '')}/${code}`;
    return { ...link, url };
  }

  async listLinks(adminId: string) {
    const links = await this.prisma.enrollmentLink.findMany({
      where: { createdByAdminId: adminId },
      orderBy: { createdAt: 'desc' },
      include: {
        device: {
          select: { id: true, name: true, hostname: true, status: true },
        },
      },
    });

    const stats = await this.tracking.getStatsForLinks(
      links.map((link) => link.id),
    );

    return links.map((link) => ({
      ...link,
      status: resolveLinkStatus(link),
      stats: stats.get(link.id) ?? {
        openCount: 0,
        uniqueOpenCount: 0,
        downloadCount: 0,
        uniqueDownloadCount: 0,
        lastOpenedAt: null,
        lastDownloadAt: null,
      },
    }));
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
        device: { select: { id: true, name: true, hostname: true } },
      },
    });
    if (!link) return { valid: false, reason: 'not_found' };
    if (link.usedAt)
      return { valid: false, reason: 'used', usedAt: link.usedAt };
    if (link.expiresAt < new Date()) {
      return { valid: false, reason: 'expired', expiresAt: link.expiresAt };
    }
    return {
      valid: true,
      code: link.code,
      expiresAt: link.expiresAt,
      device: link.device,
    };
  }
}
