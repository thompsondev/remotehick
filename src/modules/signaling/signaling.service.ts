import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../lib/redis/redis.service';

export interface SignalingMessage {
  type: string;
  sessionId?: string;
  deviceId?: string;
  adminId?: string;
  payload?: unknown;
}

const DEVICE_WS_TTL = 120;
const SESSION_ACCEPT_TIMEOUT_MS = 30_000;

@Injectable()
export class SignalingService {
  private readonly logger = new Logger(SignalingService.name);
  private readonly adminSockets = new Map<string, string>();
  private readonly deviceSockets = new Map<string, string>();
  private readonly sessionWaiters = new Map<
    string,
    { resolve: (v: boolean) => void; timer: NodeJS.Timeout }
  >();
  private gateway: {
    emitToSocket: (socketId: string, event: string, data: unknown) => void;
    emitToRoom: (room: string, event: string, data: unknown) => void;
  } | null = null;

  constructor(private readonly redis: RedisService) {}

  setGateway(gateway: SignalingService['gateway']) {
    this.gateway = gateway;
  }

  registerAdminSocket(adminId: string, socketId: string) {
    this.adminSockets.set(adminId, socketId);
  }

  registerDeviceSocket(deviceId: string, socketId: string) {
    this.deviceSockets.set(deviceId, socketId);
    void this.redis.set(`device:ws:${deviceId}`, socketId, DEVICE_WS_TTL);
  }

  touchDeviceSocket(deviceId: string, socketId: string) {
    if (this.deviceSockets.get(deviceId) !== socketId) {
      this.registerDeviceSocket(deviceId, socketId);
      return;
    }
    void this.redis.set(`device:ws:${deviceId}`, socketId, DEVICE_WS_TTL);
  }

  unregisterSocket(socketId: string, role: 'admin' | 'device', id: string) {
    if (role === 'admin') {
      if (this.adminSockets.get(id) === socketId) {
        this.adminSockets.delete(id);
      }
    } else {
      if (this.deviceSockets.get(id) === socketId) {
        this.deviceSockets.delete(id);
      }
      void this.redis.delete(`device:ws:${id}`);
    }
  }

  async isDeviceSignalingConnected(deviceId: string): Promise<boolean> {
    if (this.deviceSockets.has(deviceId)) {
      return true;
    }
    const socketId = await this.redis.get(`device:ws:${deviceId}`);
    return !!socketId;
  }

  getSignalingStats() {
    return {
      connectedDevices: this.deviceSockets.size,
      connectedAdmins: this.adminSockets.size,
    };
  }

  getAdminSocket(adminId: string) {
    return this.adminSockets.get(adminId);
  }

  getDeviceSocket(deviceId: string) {
    return this.deviceSockets.get(deviceId);
  }

  relayToDevice(deviceId: string, event: string, data: unknown) {
    if (!this.gateway) return;

    const socketId = this.deviceSockets.get(deviceId);
    if (socketId) {
      this.gateway.emitToSocket(socketId, event, data);
    }
    this.gateway.emitToRoom(`device:${deviceId}`, event, data);
  }

  private readonly viewerReadyCooldown = new Map<string, number>();
  private static readonly VIEWER_READY_COOLDOWN_MS = 2_500;

  private pruneViewerReadyCooldown(now: number) {
    const maxAge = SignalingService.VIEWER_READY_COOLDOWN_MS * 2;
    for (const [key, timestamp] of this.viewerReadyCooldown) {
      if (now - timestamp > maxAge) {
        this.viewerReadyCooldown.delete(key);
      }
    }
  }

  notifyViewerReady(deviceId: string, sessionId: string) {
    const key = `${deviceId}:${sessionId}`;
    const now = Date.now();
    this.pruneViewerReadyCooldown(now);

    const last = this.viewerReadyCooldown.get(key) ?? 0;
    if (now - last < SignalingService.VIEWER_READY_COOLDOWN_MS) {
      return;
    }
    this.viewerReadyCooldown.set(key, now);
    this.relayToDevice(deviceId, 'viewer_ready', { sessionId });
  }

  relayToAdmin(adminId: string, event: string, data: unknown) {
    const socketId = this.adminSockets.get(adminId);
    if (socketId && this.gateway) {
      this.gateway.emitToSocket(socketId, event, data);
    }
  }

  relayToSession(sessionId: string, event: string, data: unknown) {
    if (this.gateway) {
      this.gateway.emitToRoom(`session:${sessionId}`, event, data);
    }
  }

  async requestSession(
    deviceId: string,
    sessionId: string,
    adminId: string,
  ): Promise<boolean> {
    if (!(await this.isDeviceSignalingConnected(deviceId))) {
      this.logger.warn(
        `session_request skipped — device ${deviceId} has no active signaling socket`,
      );
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.sessionWaiters.delete(sessionId);
        this.logger.warn(
          `session ${sessionId} timed out waiting for accept from device ${deviceId}`,
        );
        resolve(false);
      }, SESSION_ACCEPT_TIMEOUT_MS);

      this.sessionWaiters.set(sessionId, { resolve, timer });

      this.logger.log(
        `session_request → device ${deviceId} (session ${sessionId})`,
      );
      this.relayToDevice(deviceId, 'session_request', {
        sessionId,
        adminId,
      });
    });
  }

  acceptSession(sessionId: string) {
    const waiter = this.sessionWaiters.get(sessionId);
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.resolve(true);
      this.sessionWaiters.delete(sessionId);
      this.logger.log(`session ${sessionId} accepted by device`);
    }
  }

  endSession(sessionId: string, deviceId: string) {
    this.viewerReadyCooldown.delete(`${deviceId}:${sessionId}`);
    this.relayToSession(sessionId, 'session_end', { sessionId });
    this.relayToDevice(deviceId, 'session_end', { sessionId });
  }
}
