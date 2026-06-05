import { IsString } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  deviceId: string;
}
