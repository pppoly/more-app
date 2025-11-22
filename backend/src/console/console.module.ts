import { Module } from '@nestjs/common';
import { ConsoleEventsService } from './console-events.service';
import { ConsoleEventsController } from './console-events.controller';
import { ConsoleCommunitiesService } from './console-communities.service';
import { ConsoleCommunitiesController } from './console-communities.controller';
import { PermissionsService } from '../auth/permissions.service';
import { StripeModule } from '../stripe/stripe.module';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationModule } from '../notifications/notification.module';
import { ConsoleEventAssistantController } from './console-event-assistant.controller';
import { ConsoleEventAssistantService } from './console-event-assistant.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [StripeModule, PaymentsModule, NotificationModule, AiModule],
  controllers: [ConsoleEventsController, ConsoleCommunitiesController, ConsoleEventAssistantController],
  providers: [ConsoleEventsService, ConsoleCommunitiesService, ConsoleEventAssistantService, PermissionsService],
})
export class ConsoleModule {}
