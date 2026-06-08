import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { generateEnrollmentCode } from '../../middleware/helpers/tokens';
import { EnrollmentTrackingService } from './enrollment-tracking.service';

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
