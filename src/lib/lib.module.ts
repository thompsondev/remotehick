import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AiModule } from './ai/ai.module';
import { WhatsappModule } from './whatsapp/wa.module';
import { RedisModule } from './redis/redis.module';
import { SlackModule } from './slack/slack.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { EmailModule } from './email/email.module';
import { NotificationModule } from './notification/notification.module';

@Module({
  imports: [
    PrismaModule,
    AiModule,
    WhatsappModule,
    RedisModule,
    SlackModule,
    CloudinaryModule,
    EmailModule,
    NotificationModule,
  ],
})
export class LibModule {}
