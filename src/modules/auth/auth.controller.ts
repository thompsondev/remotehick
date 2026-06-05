import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import {
  AdminProfileDto,
  AuthErrorResponseDto,
  LoginResponseDto,
  LogoutResponseDto,
} from './dto/auth-response.dto';
import { Public } from '../../middleware/decorators/public.decorator';
import { AdminRoute } from '../../middleware/decorators/remote.decorator';
import { AdminJwtGuard } from '../../middleware/guards/admin-jwt.guard';
import type { AdminPayload } from '../../middleware/decorators/remote.decorator';

@ApiTags('Auth')
@Controller('auth')
@AdminRoute()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({
    summary: 'Admin login',
    description:
      'Authenticate an admin and return a JWT. The frontend should store `token` (e.g. localStorage) and send `Authorization: Bearer <token>` on protected requests.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: LoginResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    type: AuthErrorResponseDto,
    schema: {
      example: {
        statusCode: 400,
        message: ['email must be an email'],
        error: 'Bad Request',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials',
    schema: {
      example: {
        statusCode: 401,
        message: 'Invalid credentials',
        error: 'Unauthorized',
      },
    },
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const result = await this.authService.login(dto);
    res.cookie('admin_token', result.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return result;
  }

  @UseGuards(AdminJwtGuard)
  @Get('me')
  @ApiBearerAuth('Authorization')
  @ApiOperation({
    summary: 'Get current admin profile',
    description: 'Returns the authenticated admin. Requires Bearer JWT.',
  })
  @ApiResponse({
    status: 200,
    description: 'Current admin profile',
    type: AdminProfileDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid token',
    schema: {
      example: {
        statusCode: 401,
        message: 'Admin authentication required',
        error: 'Unauthorized',
      },
    },
  })
  getMe(@Req() req: Request & { admin: AdminPayload }): Promise<AdminProfileDto> {
    return this.authService.getMe(req.admin.sub);
  }

  @UseGuards(AdminJwtGuard)
  @Post('logout')
  @ApiBearerAuth('Authorization')
  @ApiOperation({
    summary: 'Admin logout',
    description: 'Clears the httpOnly session cookie. Frontend should also clear stored token.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logged out',
    type: LogoutResponseDto,
  })
  logout(@Res({ passthrough: true }) res: Response): LogoutResponseDto {
    res.clearCookie('admin_token');
    return { success: true };
  }
}
