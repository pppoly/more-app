import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { StripeModule } from '../stripe/stripe.module';
import { PermissionsService } from '../auth/permissions.service';

@Module({
  imports: [StripeModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PermissionsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
