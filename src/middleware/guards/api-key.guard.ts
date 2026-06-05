import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  IS_ADMIN_ROUTE_KEY,
  IS_DEVICE_ROUTE_KEY,
} from '../decorators/remote.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly apiKey: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {
    this.apiKey = this.configService.get<string>('API_KEY');
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const isAdminRoute = this.reflector.getAllAndOverride<boolean>(
      IS_ADMIN_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );
    const isDeviceRoute = this.reflector.getAllAndOverride<boolean>(
      IS_DEVICE_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isAdminRoute || isDeviceRoute) return true;

    if (!this.apiKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers['x-api-key'];

    if (!providedKey || providedKey !== this.apiKey) {
      throw new UnauthorizedException('Invalid or missing API key');
    }

    return true;
  }
}
