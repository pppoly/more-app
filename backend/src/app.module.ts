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

@Module({
  imports: [
    BillingModule,
    StripeModule,
    PrismaModule,
    EventsModule,
    CommunitiesModule,
    AuthModule,
    MeModule,
    PaymentsModule,
    ConsoleModule,
    AiModule,
    OrganizersModule,
    I18nModule,
  ],
  controllers: [HealthController, HelloController, AdminPaymentsController, AdminPaymentsOpsController, AdminUsersController, AdminCommunitiesController, AdminEventsListController],
  providers: [],
})
export class AppModule {}
