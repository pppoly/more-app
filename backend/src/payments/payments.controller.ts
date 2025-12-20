import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService } from './payments.service';
import type { Request } from 'express';

interface MockPaymentDto {
  registrationId: string;
}

interface StripeCheckoutDto {
  registrationId: string;
}

interface StripeRefundDto {
  reason?: string;
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('stripe/webhook')
  handleStripeWebhook(@Req() req: Request) {
    const signature = req.headers['stripe-signature'] as string | undefined;
    // debug headers
    console.log('[stripe webhook] headers keys:', Object.keys(req.headers));
    console.log('[stripe webhook] stripe-signature:', signature);
    return this.paymentsService.handleStripeWebhook(signature, req.body as Buffer);
  }

  @Post('mock')
  @UseGuards(JwtAuthGuard)
  createMockPayment(@Req() req: any, @Body() body: MockPaymentDto) {
    return this.paymentsService.createMockPayment(req.user.id, body.registrationId);
  }

  @Post('stripe/checkout')
  @UseGuards(JwtAuthGuard)
  createStripeCheckout(@Req() req: any, @Body() body: StripeCheckoutDto) {
    return this.paymentsService.createStripeCheckout(req.user.id, body.registrationId);
  }

  @Post(':paymentId/refund')
  @UseGuards(JwtAuthGuard)
  refundStripePayment(@Req() req: any, @Param('paymentId') paymentId: string, @Body() body: StripeRefundDto) {
    return this.paymentsService.refundStripePayment(req.user.id, paymentId, body.reason);
  }
}
