import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AiModule } from './ai/ai.module';
import { WhatsappModule } from './whatsapp/wa.module';
import { RedisModule } from './redis/redis.module';
import { SlackModule } from './slack/slack.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';

@Module({
  imports: [
    PrismaModule,
    AiModule,
    WhatsappModule,
    RedisModule,
    SlackModule,
    CloudinaryModule,
  ],
})
export class LibModule {}
