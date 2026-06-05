import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'admin@example.com',
    description: 'Admin account email address',
  })
  @IsEmail(
    { require_tld: false },
    { message: 'email must be an email' },
  )
  email: string;

  @ApiProperty({
    example: 'admin123',
    minLength: 6,
    description: 'Admin account password',
  })
  @IsString()
  @MinLength(6, { message: 'password must be at least 6 characters' })
  password: string;
}
