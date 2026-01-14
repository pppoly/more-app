import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PaymentsService } from './payments.service';

const PAYMENT_EXPIRY_SWEEP_INTERVAL_MS = Number(process.env.PAYMENT_EXPIRY_SWEEP_INTERVAL_MS ?? 60_000);

@Injectable()
export class PaymentExpirationService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly paymentsService: PaymentsService) {}

  onModuleInit() {
    if (!Number.isFinite(PAYMENT_EXPIRY_SWEEP_INTERVAL_MS) || PAYMENT_EXPIRY_SWEEP_INTERVAL_MS <= 0) return;
    this.timer = setInterval(() => {
      void this.paymentsService.expireOverduePendingPayments();
    }, PAYMENT_EXPIRY_SWEEP_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
