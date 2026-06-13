import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SessionStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { DeviceService } from '../device/device.service';
import { SignalingService } from '../signaling/signaling.service';
import { CreateSessionDto } from './dto/session.dto';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly deviceService: DeviceService,
    private readonly signaling: SignalingService,
  ) {}

  async createSession(adminId: string, dto: CreateSessionDto) {
    const device = await this.prisma.device.findFirst({
      where: { id: dto.deviceId, revokedAt: null },
    });
    if (!device) throw new NotFoundException('Device not found');

    const isOnline = await this.deviceService.isDeviceOnline(device.id);
    if (!isOnline) {
      throw new BadRequestException('Device is offline');
    }

    if (!this.signaling.isDeviceSignalingConnected(device.id)) {
      this.logger.warn(
        `Create session blocked — device ${device.id} online via heartbeat but signaling socket missing`,
      );
      throw new BadRequestException(
        device.deviceType === 'BROWSER'
          ? 'Device is online but not ready — ask the user to keep the connect browser tab open and sharing their screen.'
          : 'Device is online but not ready for remote control. Ask the user to keep Remote Agent running in the system tray, then reopen the enrollment link if needed.',
      );
    }

    const session = await this.prisma.remoteSession.create({
      data: {
        deviceId: device.id,
        adminId,
        status: SessionStatus.PENDING,
      },
    });

    const accepted = await this.signaling.requestSession(
      device.id,
      session.id,
      adminId,
    );

    if (!accepted) {
      this.logger.warn(
        `Create session failed — device ${device.id} did not emit session_accept in time`,
      );
      await this.prisma.remoteSession.update({
        where: { id: session.id },
        data: { status: SessionStatus.ENDED, endedAt: new Date() },
      });
      throw new BadRequestException(
        'Device did not accept session. Ensure the agent is running and try again in a few seconds.',
      );
    }

    const updated = await this.prisma.remoteSession.update({
      where: { id: session.id },
      data: { status: SessionStatus.ACTIVE, startedAt: new Date() },
    });

    return updated;
  }

  async listSessions(adminId: string) {
    return this.prisma.remoteSession.findMany({
      where: { adminId },
      orderBy: { createdAt: 'desc' },
      include: {
        device: { select: { id: true, name: true, hostname: true, os: true } },
      },
    });
  }

  async getSession(id: string, adminId: string) {
    const session = await this.prisma.remoteSession.findFirst({
      where: { id, adminId },
      include: {
        device: true,
      },
    });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  async endSession(id: string, adminId: string) {
    const session = await this.prisma.remoteSession.findFirst({
      where: { id, adminId },
    });
    if (!session) throw new NotFoundException('Session not found');

    await this.signaling.endSession(session.id, session.deviceId);

    return this.prisma.remoteSession.update({
      where: { id },
      data: { status: SessionStatus.ENDED, endedAt: new Date() },
    });
  }
}
