import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { HelloController } from './hello/hello.controller';
import { EventsModule } from './events/events.module';
import { CommunitiesModule } from './communities/communities.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MeModule } from './me/me.module';
import { PaymentsModule } from './payments/payments.module';
import { ConsoleModule } from './console/console.module';
import { AiModule } from './ai/ai.module';
import { OrganizersModule } from './organizers/organizers.module';
import { StripeModule } from './stripe/stripe.module';
import { BillingModule } from './billing/billing.module';
import { I18nModule } from './i18n/i18n.module';
import { AdminPaymentsController } from './admin/admin-payments.controller';
import { AdminPaymentsOpsController } from './admin/admin-payments-ops.controller';
import { AdminUsersController } from './admin/admin-users.controller';
import { AdminCommunitiesController } from './admin/admin-communities.controller';
import { AdminEventsListController } from './admin/admin-events-list.controller';
import { AdminCommunityTagsController } from './admin/admin-community-tags.controller';
import { AdminStatsController } from './admin/admin-stats.controller';
import { AssetModule } from './asset/asset.module';
import { BullModule } from '@nestjs/bullmq';
import { AnalyticsModule } from './analytics/analytics.module';
import { ClassesModule } from './classes/classes.module';
import { NotificationModule } from './notifications/notification.module';
import { AdminNotificationsController } from './admin/admin-notifications.controller';
import { AdminSettlementsController } from './admin/admin-settlements.controller';

@Module({
  imports: [
    ...(process.env.REDIS_HOST && process.env.REDIS_PORT
      ? [
          BullModule.forRoot({
            connection: {
              host: process.env.REDIS_HOST,
              port: Number(process.env.REDIS_PORT),
              enableReadyCheck: false,
            },
          }),
        ]
      : []),
    BillingModule,
    StripeModule,
    PrismaModule,
    EventsModule,
    CommunitiesModule,
    AuthModule,
    MeModule,
    PaymentsModule,
    ConsoleModule,
    NotificationModule,
    AiModule,
    OrganizersModule,
    I18nModule,
    AssetModule,
    AnalyticsModule,
    ClassesModule,
  ],
  controllers: [
    HealthController,
    HelloController,
    AdminPaymentsController,
    AdminPaymentsOpsController,
    AdminSettlementsController,
    AdminUsersController,
    AdminCommunitiesController,
    AdminEventsListController,
    AdminCommunityTagsController,
    AdminNotificationsController,
    AdminStatsController,
  ],
  providers: [],
})
export class AppModule {}
