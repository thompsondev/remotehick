import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { SignalingService } from './signaling.service';
import { DeviceService } from '../device/device.service';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { hashToken } from '../../middleware/helpers/tokens';
import type { AdminPayload } from '../../middleware/decorators/remote.decorator';

interface AuthPayload {
  role: 'admin' | 'device';
  adminId?: string;
  deviceId?: string;
  token?: string;
}

@WebSocketGateway({
  namespace: '/signaling',
  cors: { origin: true, credentials: true },
})
export class SignalingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SignalingGateway.name);

  constructor(
    private readonly signaling: SignalingService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly deviceService: DeviceService,
  ) {
    this.signaling.setGateway({
      emitToSocket: (socketId, event, data) => {
        this.server.to(socketId).emit(event, data);
      },
      emitToRoom: (room, event, data) => {
        this.server.to(room).emit(event, data);
      },
    });
  }

  async handleConnection(client: Socket) {
    try {
      const auth = client.handshake.auth as AuthPayload;
      if (auth?.role === 'admin' && auth.token) {
        const payload = this.jwtService.verify<AdminPayload>(auth.token);
        client.data.role = 'admin';
        client.data.adminId = payload.sub;
        this.signaling.registerAdminSocket(payload.sub, client.id);
        this.logger.log(`Admin signaling connected: ${payload.sub}`);
        return;
      }

      if (auth?.role === 'device' && auth.token && auth.deviceId) {
        const device = await this.prisma.device.findFirst({
          where: {
            id: auth.deviceId,
            deviceTokenHash: hashToken(auth.token),
            revokedAt: null,
          },
        });
        if (!device) {
          this.logger.warn(
            `Device signaling auth rejected for ${auth.deviceId} (invalid token or revoked)`,
          );
          throw new UnauthorizedException();
        }
        client.data.role = 'device';
        client.data.deviceId = device.id;
        this.signaling.registerDeviceSocket(device.id, client.id);
        await client.join(`device:${device.id}`);
        await this.deviceService.markOnline(device.id);
        this.logger.log(
          `Device signaling connected: ${device.id} (${device.name})`,
        );
        return;
      }

      this.logger.warn(
        `Signaling connection rejected — missing or invalid auth (role=${auth?.role ?? 'none'})`,
      );
      client.disconnect();
    } catch (err) {
      this.logger.warn(`WS auth failed: ${err}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const role = client.data.role as 'admin' | 'device' | undefined;
    const id = (client.data.adminId || client.data.deviceId) as
      | string
      | undefined;
    if (role && id) {
      this.signaling.unregisterSocket(client.id, role, id);
      // Device presence is driven by heartbeats, not socket disconnects.
      // A user can stay online while sharing even if the socket reconnects
      // or the admin leaves a session view.
    }
  }

  @SubscribeMessage('join_session')
  async handleJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    await client.join(`session:${data.sessionId}`);

    if (client.data.role === 'admin') {
      const session = await this.prisma.remoteSession.findUnique({
        where: { id: data.sessionId },
        select: { deviceId: true, status: true },
      });
      if (
        session &&
        (session.status === 'ACTIVE' || session.status === 'PENDING')
      ) {
        this.signaling.notifyViewerReady(session.deviceId, data.sessionId);
      }
    }

    return { joined: data.sessionId };
  }

  @SubscribeMessage('viewer_ready')
  handleViewerReady(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    if (client.data.role !== 'admin') return;
    void this.prisma.remoteSession
      .findUnique({
        where: { id: data.sessionId },
        select: { deviceId: true, status: true },
      })
      .then((session) => {
        if (
          session &&
          (session.status === 'ACTIVE' || session.status === 'PENDING')
        ) {
          this.signaling.notifyViewerReady(session.deviceId, data.sessionId);
        }
      });
  }

  @SubscribeMessage('device_ping')
  handleDevicePing(@ConnectedSocket() client: Socket) {
    if (client.data.role !== 'device' || !client.data.deviceId) return;
    this.signaling.touchDeviceSocket(client.data.deviceId as string, client.id);
    return { ok: true };
  }

  @SubscribeMessage('session_accept')
  handleSessionAccept(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    if (client.data.role !== 'device') return;
    this.signaling.acceptSession(data.sessionId);
    void client.join(`session:${data.sessionId}`);
    return { accepted: true };
  }

  @SubscribeMessage('webrtc_offer')
  handleOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { sessionId: string; offer: unknown },
  ) {
    this.signaling.relayToSession(data.sessionId, 'webrtc_offer', {
      sessionId: data.sessionId,
      from: client.data.role,
      offer: data.offer,
    });
  }

  @SubscribeMessage('webrtc_answer')
  handleAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { sessionId: string; answer: unknown },
  ) {
    this.signaling.relayToSession(data.sessionId, 'webrtc_answer', {
      sessionId: data.sessionId,
      from: client.data.role,
      answer: data.answer,
    });
  }

  @SubscribeMessage('webrtc_ice')
  handleIce(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { sessionId: string; candidate: unknown },
  ) {
    this.signaling.relayToSession(data.sessionId, 'webrtc_ice', {
      sessionId: data.sessionId,
      from: client.data.role,
      candidate: data.candidate,
    });
  }

  @SubscribeMessage('data_channel_message')
  handleDataChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; message: unknown },
  ) {
    this.signaling.relayToSession(data.sessionId, 'data_channel_message', {
      from: client.data.role,
      message: data.message,
    });
  }
}
