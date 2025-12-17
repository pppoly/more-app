import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { OgController } from '../og/og.controller';

@Module({
  controllers: [EventsController, OgController],
  providers: [EventsService],
})
export class EventsModule {}
