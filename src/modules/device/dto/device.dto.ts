import { IsOptional, IsString } from 'class-validator';

export class EnrollDeviceDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsString()
  os: string;

  @IsString()
  hostname: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;
}

export class HeartbeatDto {
  @IsOptional()
  @IsString()
  ipAddress?: string;
}

export class EnrollBrowserDto {
  @IsString()
  code: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  os?: string;

  @IsOptional()
  @IsString()
  hostname?: string;
}
