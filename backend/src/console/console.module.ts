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
import { ConsolePaymentsController } from './console-payments.controller';
import { ConsoleEventDraftController } from './console-event-draft.controller';
import { ConsoleEventDraftService } from './console-event-draft.service';

@Module({
  imports: [StripeModule, PaymentsModule, NotificationModule, AiModule],
  controllers: [ConsoleEventsController, ConsoleCommunitiesController, ConsoleEventAssistantController, ConsolePaymentsController, ConsoleEventDraftController],
  providers: [ConsoleEventsService, ConsoleCommunitiesService, ConsoleEventAssistantService, PermissionsService, ConsoleEventDraftService],
})
export class ConsoleModule {}
