import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  agentDownloadedEmail,
  deviceEnrolledEmail,
  deviceOfflineEmail,
  deviceOnlineEmail,
  enrollmentLinkOpenedEmail,
} from './email-templates';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly email: EmailService,
    private readonly prisma: PrismaService,
  ) {}

  private parseRecipients(raw: string | undefined): string[] {
    if (!raw?.trim()) return [];
    return [
      ...new Set(
        raw
          .split(',')
          .map((email) => email.trim())
          .filter(Boolean),
      ),
    ];
  }

  private defaultRecipients(): string[] {
    const configured = this.parseRecipients(process.env.NOTIFICATION_EMAIL);
    if (configured.length) return configured;
    return this.parseRecipients(process.env.ADMIN_EMAIL);
  }

  private async resolveRecipients(adminId?: string): Promise<string[]> {
    const configured = this.defaultRecipients();
    if (configured.length) return configured;

    if (!adminId) return [];

    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
      select: { email: true },
    });
    return admin?.email ? [admin.email] : [];
  }

  private fireAndForget(promise: Promise<void>, context: string): void {
    void promise.catch((err) => {
      this.logger.error(
        `Notification failed (${context}): ${err?.message ?? err}`,
      );
    });
  }

  private async sendTo(
    to: string[],
    content: { subject: string; html: string; text: string },
  ): Promise<void> {
    if (!to.length) {
      this.logger.warn(
        'No notification recipients configured — skipping email',
      );
      return;
    }
    await this.email.send({ to, ...content });
  }

  notifyEnrollmentLinkOpened(linkId: string, code: string): void {
    this.fireAndForget(
      this.sendEnrollmentLinkOpened(linkId, code),
      'link-opened',
    );
  }

  private async sendEnrollmentLinkOpened(
    linkId: string,
    code: string,
  ): Promise<void> {
    const link = await this.prisma.enrollmentLink.findUnique({
      where: { id: linkId },
      select: { createdByAdminId: true },
    });
    if (!link) return;

    const to = await this.resolveRecipients(link.createdByAdminId);
    const baseUrl =
      process.env.ENROLLMENT_LINK_BASE_URL?.trim() ||
      'http://localhost:3001/enroll';
    const content = enrollmentLinkOpenedEmail({
      code,
      linkUrl: `${baseUrl.replace(/\/$/, '')}/${code}`,
      openedAt: new Date(),
    });

    await this.sendTo(to, content);
  }

  notifyAgentDownloaded(linkId: string, code: string): void {
    this.fireAndForget(
      this.sendAgentDownloaded(linkId, code),
      'agent-downloaded',
    );
  }

  private async sendAgentDownloaded(
    linkId: string,
    code: string,
  ): Promise<void> {
    const link = await this.prisma.enrollmentLink.findUnique({
      where: { id: linkId },
      select: { createdByAdminId: true },
    });
    if (!link) return;

    const to = await this.resolveRecipients(link.createdByAdminId);
    const content = agentDownloadedEmail({
      code,
      downloadedAt: new Date(),
    });

    await this.sendTo(to, content);
  }

  notifyDeviceEnrolled(params: {
    adminId: string;
    code: string;
    deviceName: string;
    hostname: string;
    os: string;
  }): void {
    this.fireAndForget(this.sendDeviceEnrolled(params), 'device-enrolled');
  }

  private async sendDeviceEnrolled(params: {
    adminId: string;
    code: string;
    deviceName: string;
    hostname: string;
    os: string;
  }): Promise<void> {
    const to = await this.resolveRecipients(params.adminId);
    const content = deviceEnrolledEmail({
      code: params.code,
      deviceName: params.deviceName,
      hostname: params.hostname,
      os: params.os,
      enrolledAt: new Date(),
    });

    await this.sendTo(to, content);
  }

  notifyDeviceOnline(device: {
    name: string;
    hostname: string;
    os?: string;
    enrollmentLink?: { createdByAdminId: string } | null;
  }): void {
    this.fireAndForget(this.sendDeviceOnline(device), 'device-online');
  }

  private async sendDeviceOnline(device: {
    name: string;
    hostname: string;
    os?: string;
    enrollmentLink?: { createdByAdminId: string } | null;
  }): Promise<void> {
    const to = await this.resolveRecipients(
      device.enrollmentLink?.createdByAdminId,
    );

    const content = deviceOnlineEmail({
      deviceName: device.name,
      hostname: device.hostname,
      os: device.os,
      changedAt: new Date(),
    });

    await this.sendTo(to, content);
  }

  notifyDeviceOffline(device: {
    name: string;
    hostname: string;
    os?: string;
    enrollmentLink?: { createdByAdminId: string } | null;
  }): void {
    this.fireAndForget(this.sendDeviceOffline(device), 'device-offline');
  }

  private async sendDeviceOffline(device: {
    name: string;
    hostname: string;
    os?: string;
    enrollmentLink?: { createdByAdminId: string } | null;
  }): Promise<void> {
    const to = await this.resolveRecipients(
      device.enrollmentLink?.createdByAdminId,
    );

    const content = deviceOfflineEmail({
      deviceName: device.name,
      hostname: device.hostname,
      os: device.os,
      changedAt: new Date(),
    });

    await this.sendTo(to, content);
  }
}
