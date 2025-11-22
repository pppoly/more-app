import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { AiAdminController } from './ai-admin.controller';
import { PromptStoreService } from './prompt-store.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  providers: [AiService, PromptStoreService, PrismaService],
  controllers: [AiController, AiAdminController],
  exports: [AiService, PromptStoreService],
})
export class AiModule {}
