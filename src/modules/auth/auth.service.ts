import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.seedDefaultAdmin();
  }

  private async seedDefaultAdmin() {
    const email = (
      this.config.get<string>('ADMIN_EMAIL') || 'admin@example.com'
    ).toLowerCase();
    const password = this.config.get<string>('ADMIN_PASSWORD') || 'admin123';

    // Warn loudly in production if default/weak credentials are detected.
    // We do NOT crash because the admin may already have been set up via a
    // proper migration — we just ensure the operator sees the warning.
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    if (isProduction) {
      if (password === 'admin123') {
        console.error(
          '[SECURITY] CRITICAL: ADMIN_PASSWORD is set to the default value "admin123". ' +
            'Change it immediately before exposing this server to the internet.',
        );
      }
      if (email === 'admin@example.com') {
        console.error(
          '[SECURITY] CRITICAL: ADMIN_EMAIL is set to the default value "admin@example.com". ' +
            'Set a real admin email address via the ADMIN_EMAIL environment variable.',
        );
      }
    }

    // Only create the admin account if none exists — never overwrite an
    // existing account's password on restart.
    const existing = await this.prisma.admin.findUnique({ where: { email } });
    if (existing) {
      // Admin already exists — do not reset the password.
      return;
    }

    const legacy = await this.prisma.admin.findUnique({
      where: { email: 'admin@localhost' },
    });
    if (legacy) {
      // Migrate the legacy placeholder email to the configured address, but
      // preserve the existing password hash.
      await this.prisma.admin.update({
        where: { id: legacy.id },
        data: { email },
      });
      console.log(`Default admin email migrated to ${email}`);
      return;
    }

    const count = await this.prisma.admin.count();
    if (count === 0) {
      const passwordHash = await bcrypt.hash(password, 10);
      await this.prisma.admin.create({ data: { email, passwordHash } });
      console.log(`Default admin created: ${email}`);
    }
  }

  async login(dto: LoginDto) {
    const admin = await this.prisma.admin.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.jwtService.sign({
      sub: admin.id,
      email: admin.email,
    });

    return {
      token,
      admin: { id: admin.id, email: admin.email, role: admin.role },
    };
  }

  async getMe(adminId: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
      select: { id: true, email: true, role: true, createdAt: true },
    });
    if (!admin) {
      throw new UnauthorizedException('Admin not found');
    }
    return admin;
  }
}
