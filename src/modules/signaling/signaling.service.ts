import { Injectable } from '@nestjs/common';
import { RedisService } from '../../lib/redis/redis.service';

export interface SignalingMessage {
  type: string;
  sessionId?: string;
  deviceId?: string;
  adminId?: string;
  payload?: unknown;
}

@Injectable()
export class SignalingService {
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
    void this.redis.set(`device:ws:${deviceId}`, socketId, 120);
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

  getAdminSocket(adminId: string) {
    return this.adminSockets.get(adminId);
  }

  getDeviceSocket(deviceId: string) {
    return this.deviceSockets.get(deviceId);
  }

  relayToDevice(deviceId: string, event: string, data: unknown) {
    const socketId = this.deviceSockets.get(deviceId);
    if (socketId && this.gateway) {
      this.gateway.emitToSocket(socketId, event, data);
    }
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

  requestSession(
    deviceId: string,
    sessionId: string,
    adminId: string,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.sessionWaiters.delete(sessionId);
        resolve(false);
      }, 15000);

      this.sessionWaiters.set(sessionId, { resolve, timer });

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
    }
  }

  endSession(sessionId: string, deviceId: string) {
    this.relayToSession(sessionId, 'session_end', { sessionId });
    this.relayToDevice(deviceId, 'session_end', { sessionId });
  }
}
