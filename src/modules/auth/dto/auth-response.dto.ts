import { ApiProperty } from '@nestjs/swagger';

export class AdminSummaryDto {
  @ApiProperty({ example: 'clx123abc456' })
  id: string;

  @ApiProperty({ example: 'admin@example.com' })
  email: string;

  @ApiProperty({ example: 'admin' })
  role: string;
}

export class LoginResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description:
      'JWT access token. Send as `Authorization: Bearer <token>` or store from this field for frontend API calls.',
  })
  token: string;

  @ApiProperty({ type: AdminSummaryDto })
  admin: AdminSummaryDto;
}

export class AdminProfileDto {
  @ApiProperty({ example: 'clx123abc456' })
  id: string;

  @ApiProperty({ example: 'admin@example.com' })
  email: string;

  @ApiProperty({ example: 'admin' })
  role: string;

  @ApiProperty({ example: '2026-06-05T01:37:50.000Z' })
  createdAt: Date;
}

export class LogoutResponseDto {
  @ApiProperty({ example: true })
  success: boolean;
}

export class AuthErrorResponseDto {
  @ApiProperty({
    example: ['email must be an email'],
    description: 'Validation errors (400) or a single message string (401)',
    oneOf: [
      { type: 'array', items: { type: 'string' } },
      { type: 'string' },
    ],
  })
  message: string | string[];

  @ApiProperty({ example: 'Bad Request', required: false })
  error?: string;

  @ApiProperty({ example: 400, required: false })
  statusCode?: number;
}
