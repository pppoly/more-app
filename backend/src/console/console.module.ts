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
import { ConsoleAiController } from './console-ai.controller';
import { ConsoleCommunityTagsController } from './console-community-tags.controller';
import { AdminEventsController } from './admin-events.controller';
import { ContentModerationService } from '../common/moderation/content-moderation.service';
import { AssetModule } from '../asset/asset.module';
import { ConsoleRefundRequestsController } from './console-refund-requests.controller';

@Module({
  imports: [StripeModule, PaymentsModule, NotificationModule, AiModule, AssetModule],
  controllers: [
    ConsoleEventsController,
    ConsoleCommunitiesController,
    ConsoleEventAssistantController,
    ConsolePaymentsController,
    ConsoleRefundRequestsController,
    ConsoleEventDraftController,
    ConsoleAiController,
    AdminEventsController,
    ConsoleCommunityTagsController,
  ],
  providers: [
    ConsoleEventsService,
    ConsoleCommunitiesService,
    ConsoleEventAssistantService,
    PermissionsService,
    ConsoleEventDraftService,
    ContentModerationService,
  ],
  exports: [ConsoleEventsService, ContentModerationService],
})
export class ConsoleModule {}
