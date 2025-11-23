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
  ],
  controllers: [HealthController, HelloController],
  providers: [],
})
export class AppModule {}
