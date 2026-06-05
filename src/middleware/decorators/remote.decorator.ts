import { SetMetadata } from '@nestjs/common';

export const IS_ADMIN_ROUTE_KEY = 'isAdminRoute';
export const IS_DEVICE_ROUTE_KEY = 'isDeviceRoute';

/** Route uses admin JWT instead of API key. */
export const AdminRoute = () => SetMetadata(IS_ADMIN_ROUTE_KEY, true);

/** Route uses device token instead of API key. */
export const DeviceRoute = () => SetMetadata(IS_DEVICE_ROUTE_KEY, true);

export interface AdminPayload {
  sub: string;
  email: string;
}

export interface DevicePayload {
  deviceId: string;
}
