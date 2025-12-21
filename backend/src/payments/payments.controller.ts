import { BadRequestException, Body, Controller, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
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
  @HttpCode(200)
  async handleStripeWebhook(@Req() req: Request) {
    const signatureHeader =
      (req.headers['stripe-signature'] as string | string[] | undefined) ??
      (req.headers['Stripe-Signature'] as string | string[] | undefined);
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    // debug headers
    console.log('[stripe webhook] headers keys:', Object.keys(req.headers));
    console.log('[stripe webhook] stripe-signature:', signature);
    if (!Buffer.isBuffer(req.body)) {
      console.warn('[stripe webhook] raw body is not a Buffer', { bodyType: typeof req.body });
      throw new BadRequestException('Invalid Stripe webhook payload');
    }
    await this.paymentsService.handleStripeWebhook(req.body, signature);
    return { received: true };
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
