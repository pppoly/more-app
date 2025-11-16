import { Module } from '@nestjs/common';
import { ConsoleEventsService } from './console-events.service';
import { ConsoleEventsController } from './console-events.controller';
import { ConsoleCommunitiesService } from './console-communities.service';
import { ConsoleCommunitiesController } from './console-communities.controller';
import { PermissionsService } from '../auth/permissions.service';
import { StripeModule } from '../stripe/stripe.module';

@Module({
  imports: [StripeModule],
  controllers: [ConsoleEventsController, ConsoleCommunitiesController],
  providers: [ConsoleEventsService, ConsoleCommunitiesService, PermissionsService],
})
export class ConsoleModule {}
