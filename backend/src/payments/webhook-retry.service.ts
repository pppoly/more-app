import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PaymentsService } from './payments.service';

const STRIPE_WEBHOOK_RETRY_SWEEP_INTERVAL_MS = Number(process.env.STRIPE_WEBHOOK_RETRY_SWEEP_INTERVAL_MS ?? 0);
const STRIPE_WEBHOOK_RETRY_SWEEP_LIMIT = Number(process.env.STRIPE_WEBHOOK_RETRY_SWEEP_LIMIT ?? 10);

@Injectable()
export class WebhookRetryService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly paymentsService: PaymentsService) {}

  onModuleInit() {
    if (!Number.isFinite(STRIPE_WEBHOOK_RETRY_SWEEP_INTERVAL_MS) || STRIPE_WEBHOOK_RETRY_SWEEP_INTERVAL_MS <= 0) return;
    const limit = Math.min(50, Math.max(1, Number(STRIPE_WEBHOOK_RETRY_SWEEP_LIMIT) || 10));
    this.timer = setInterval(() => {
      void this.paymentsService.retryOverdueStripeWebhookEvents(limit);
    }, STRIPE_WEBHOOK_RETRY_SWEEP_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}

