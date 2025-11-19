import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { AiAdminController } from './ai-admin.controller';

@Module({
  providers: [AiService],
  controllers: [AiController, AiAdminController],
  exports: [AiService],
})
export class AiModule {}
