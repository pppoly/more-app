import { Module } from '@nestjs/common';
import { ConsoleEventsService } from './console-events.service';
import { ConsoleEventsController } from './console-events.controller';
import { ConsoleCommunitiesService } from './console-communities.service';
import { ConsoleCommunitiesController } from './console-communities.controller';

@Module({
  controllers: [ConsoleEventsController, ConsoleCommunitiesController],
  providers: [ConsoleEventsService, ConsoleCommunitiesService],
})
export class ConsoleModule {}
