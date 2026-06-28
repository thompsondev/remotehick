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
    example: 'MyStr0ngP@ssword!',
    minLength: 12,
    description: 'Admin account password',
  })
  @IsString()
  @MinLength(12, { message: 'password must be at least 12 characters' })
  password: string;
}
