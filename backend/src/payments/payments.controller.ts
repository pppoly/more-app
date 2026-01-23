/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-floating-promises, @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents */
import { BadRequestException, Body, Controller, ForbiddenException, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService } from './payments.service';
import type { Request } from 'express';

interface MockPaymentDto {
  registrationId: string;
}

interface StripeCheckoutDto {
  registrationId: string;
}

interface StripeConfirmDto {
  sessionId: string;
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
    const signatureFromGet = req.get('stripe-signature') ?? undefined;
    const signatureHeader = req.headers['stripe-signature'] as string | string[] | undefined;
    const signatureFromHeader = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    const signature = signatureFromGet ?? signatureFromHeader;
    const stripeWebhookDebug = process.env.STRIPE_WEBHOOK_DEBUG === '1';
    if (stripeWebhookDebug) {
      const contentType = req.get('content-type');
      const sigLength = signatureFromGet ? signatureFromGet.length : 0;
      const isBuffer = Buffer.isBuffer(req.body);
      const bodyLen = isBuffer ? req.body.length : 0;
      console.log(
        `[stripe webhook debug] method=${req.method} url=${req.originalUrl} content-type=${contentType ?? ''}`,
      );
      console.log('[stripe webhook debug] headers keys:', Object.keys(req.headers));
      console.log(`[stripe webhook debug] stripe-signature length=${sigLength}`);
      console.log(`[stripe webhook debug] isBuffer=${isBuffer} bodyLen=${bodyLen}`);
    }
    if (!Buffer.isBuffer(req.body)) {
      console.warn('[stripe webhook] raw body is not a Buffer', { bodyType: typeof req.body });
      throw new BadRequestException('Invalid Stripe webhook payload');
    }
    if (!signature) {
      const hasSigKeyInHeaders = Object.prototype.hasOwnProperty.call(req.headers, 'stripe-signature');
      console.warn('[stripe webhook] signature missing', {
        sig: 'missing',
        bodyLen: req.body.length,
        hasSigKeyInHeaders,
      });
      throw new BadRequestException('Missing Stripe signature');
    }
    await this.paymentsService.handleStripeWebhook(req.body, signature);
    return { received: true };
  }

  @Post('mock')
  @UseGuards(JwtAuthGuard)
  createMockPayment(@Req() req: any, @Body() body: MockPaymentDto) {
    const envLabel = (process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
    const isProdLike = envLabel === 'production' || envLabel === 'prod';
    const allowMockPayment = process.env.MOCK_PAYMENT_ENABLED === 'true' || !isProdLike;
    if (!allowMockPayment) {
      throw new ForbiddenException('Mock payments are disabled in this environment');
    }
    return this.paymentsService.createMockPayment(req.user.id, body.registrationId);
  }

  @Post('stripe/checkout')
  @UseGuards(JwtAuthGuard)
  createStripeCheckout(@Req() req: any, @Body() body: StripeCheckoutDto) {
    return this.paymentsService.createStripeCheckout(req.user.id, body.registrationId);
  }

  @Post('stripe/confirm')
  @UseGuards(JwtAuthGuard)
  confirmStripeCheckout(@Req() req: any, @Body() body: StripeConfirmDto) {
    return this.paymentsService.confirmStripeCheckoutSession(req.user.id, body.sessionId);
  }

  @Post(':paymentId/refund')
  @UseGuards(JwtAuthGuard)
  refundStripePayment(@Req() req: any, @Param('paymentId') paymentId: string, @Body() body: StripeRefundDto) {
    return this.paymentsService.refundStripePayment(req.user.id, paymentId, body.reason);
  }
}
