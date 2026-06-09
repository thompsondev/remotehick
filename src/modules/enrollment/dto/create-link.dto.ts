import { IsEnum, IsOptional } from 'class-validator';
import { EnrollmentLinkKind } from '../../../../generated/prisma/client';

export class CreateEnrollmentLinkDto {
  @IsOptional()
  @IsEnum(EnrollmentLinkKind)
  kind?: EnrollmentLinkKind;
}
