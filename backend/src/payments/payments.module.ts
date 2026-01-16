import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentExpirationService } from './payment-expiration.service';
import { WebhookRetryService } from './webhook-retry.service';
import { SettlementService } from './settlement.service';
import { PaymentsController } from './payments.controller';
import { StripeModule } from '../stripe/stripe.module';
import { PermissionsService } from '../auth/permissions.service';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [StripeModule, NotificationModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentExpirationService, WebhookRetryService, SettlementService, PermissionsService],
  exports: [PaymentsService, SettlementService],
})
export class PaymentsModule {}
