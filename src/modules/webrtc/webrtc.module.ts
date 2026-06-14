import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LibModule } from '../../lib/lib.module';
import { WebrtcController } from './webrtc.controller';
import { WebrtcService } from './webrtc.service';
import { WebrtcAuthGuard } from '../../middleware/guards/webrtc-auth.guard';

@Module({
  imports: [
    LibModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [WebrtcController],
  providers: [WebrtcService, WebrtcAuthGuard],
  exports: [WebrtcService],
})
export class WebrtcModule {}
