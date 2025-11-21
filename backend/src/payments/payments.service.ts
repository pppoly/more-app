import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../stripe/stripe.service';
import { PermissionsService } from '../auth/permissions.service';
import { Prisma, Payment } from '@prisma/client';
import Stripe from 'stripe';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly permissions: PermissionsService,
  ) {}

  async createMockPayment(userId: string, registrationId: string) {
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: {
        id: true,
        userId: true,
        eventId: true,
        amount: true,
        paymentStatus: true,
        event: {
          select: {
            communityId: true,
          },
        },
      },
    });

    if (!registration) {
      throw new NotFoundException('Registration not found');
    }

    if (registration.userId !== userId) {
      throw new ForbiddenException('You cannot pay for this registration');
    }

    if (registration.paymentStatus === 'paid') {
      throw new BadRequestException('Registration already paid');
    }

    const amount = registration.amount ?? 0;

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        communityId: registration.event?.communityId,
        eventId: registration.eventId,
        registrationId,
        amount,
        platformFee: 0,
        currency: 'jpy',
        status: 'paid',
        method: 'mock',
      },
      select: {
        id: true,
        status: true,
        amount: true,
      },
    });

    await this.prisma.eventRegistration.update({
      where: { id: registrationId },
      data: {
        status: 'paid',
        paidAmount: amount,
        paymentStatus: 'paid',
        payment: { connect: { id: payment.id } },
      },
    });

    return {
      paymentId: payment.id,
      status: payment.status,
      amount: payment.amount,
      registrationId,
    };
  }

  async createStripeCheckout(userId: string, registrationId: string) {
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: {
        event: {
          include: {
            community: true,
          },
        },
      },
    });

    if (!registration) {
      throw new NotFoundException('Registration not found');
    }

    if (registration.userId !== userId) {
      throw new ForbiddenException('You cannot pay for this registration');
    }

    if (registration.paymentStatus === 'paid') {
      throw new BadRequestException('Registration already paid');
    }

    const amount = registration.amount ?? 0;
    if (amount <= 0) {
      throw new BadRequestException('有料イベントではありません');
    }

    const event = registration.event;
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const community = event.community;
    if (!community) {
      throw new NotFoundException('Community not found');
    }

    if (!community.stripeAccountId || !community.stripeAccountOnboarded) {
      throw new BadRequestException('コミュニティがStripeアカウントと連携していません');
    }

    if (!this.stripeService.enabled) {
      throw new BadRequestException('Stripe決済が現在利用できません');
    }

    const platformPercent = Number(process.env.PLATFORM_FEE_PERCENT ?? '1');
    const platformFixed = Number(process.env.PLATFORM_FEE_FIXED ?? '0');
    const percent = isNaN(platformPercent) ? 1 : platformPercent;
    const fixed = isNaN(platformFixed) ? 0 : platformFixed;
    const platformFee = Math.min(amount, Math.round((amount * percent) / 100) + fixed);
    const eventTitle = this.getLocalizedText(event.title) || 'MORE Event';

    const session = await this.stripeService.client.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'jpy',
            product_data: { name: eventTitle },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        registrationId,
        eventId: event.id,
        communityId: community.id,
        userId,
      },
      success_url: `${this.stripeService.successUrlBase}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: this.stripeService.cancelUrlBase,
      payment_intent_data: {
        application_fee_amount: platformFee,
        transfer_data: {
          destination: community.stripeAccountId,
        },
      },
    });

    if (!session.url) {
      throw new InternalServerErrorException('Stripe Checkout URLを生成できませんでした');
    }

    await this.prisma.payment.upsert({
      where: { registrationId },
      update: {
        userId,
        communityId: community.id,
        eventId: event.id,
        amount,
        platformFee,
        currency: 'jpy',
        status: 'pending',
        method: 'stripe',
        stripeCheckoutSessionId: session.id,
      },
      create: {
        userId,
        communityId: community.id,
        eventId: event.id,
        registrationId,
        amount,
        platformFee,
        currency: 'jpy',
        status: 'pending',
        method: 'stripe',
        stripeCheckoutSessionId: session.id,
      },
    });

    return {
      checkoutUrl: session.url,
    };
  }

  async handleStripeWebhook(signature: string | undefined, payload: Buffer) {
    if (!this.stripeService.enabled) {
      this.logger.warn('Stripe webhook received but Stripe is not enabled');
      return { received: true };
    }
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET is not configured');
      throw new InternalServerErrorException('Stripe webhook secret is not configured');
    }
    if (!signature) {
      throw new BadRequestException('Missing Stripe signature');
    }

    let event: Stripe.Event;
    try {
      event = this.stripeService.client.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (error) {
      this.logger.error('Failed to verify Stripe webhook signature', error instanceof Error ? error.stack : String(error));
      throw new BadRequestException('Invalid Stripe signature');
    }

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await this.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case 'charge.refunded':
        await this.handleChargeRefunded(event.data.object as Stripe.Charge);
        break;
      default:
        this.logger.debug(`Unhandled Stripe event: ${event.type}`);
    }

    return { received: true };
  }

  async refundStripePayment(userId: string, paymentId: string, reason?: string) {
    if (!this.stripeService.enabled) {
      throw new BadRequestException('Stripe決済が現在利用できません');
    }
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    if (!payment.eventId) {
      throw new BadRequestException('イベント情報が不足しています');
    }
    await this.permissions.assertEventManager(userId, payment.eventId);
    if (payment.status !== 'paid') {
      throw new BadRequestException('この支払いは返金できません');
    }
    if (payment.method !== 'stripe') {
      throw new BadRequestException('Stripe以外の支払いは返金できません');
    }

    const paymentIntentId = await this.resolvePaymentIntentId(payment);
    if (!paymentIntentId) {
      throw new BadRequestException('Stripe支払い情報を取得できませんでした');
    }

    const refund = await this.stripeService.client.refunds.create({
      payment_intent: paymentIntentId,
      reverse_transfer: true,
      refund_application_fee: true,
      metadata: {
        paymentId,
        eventId: payment.eventId,
        requestedBy: userId,
        reason: reason ?? '',
      },
    });

    await this.markPaymentRefunded(payment, refund.id);

    return {
      refundId: refund.id,
      status: 'refunded',
    };
  }

  private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
    const registrationId = session.metadata?.registrationId;
    const whereClauses: Prisma.PaymentWhereInput[] = [{ stripeCheckoutSessionId: session.id }];
    if (registrationId) {
      whereClauses.push({ registrationId });
    }
    const payment = await this.prisma.payment.findFirst({
      where: { OR: whereClauses },
    });
    if (!payment) {
      const communityId = session.metadata?.communityId;
      const planId = session.metadata?.planId;
      const subscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id ?? null;
      if (communityId && planId && session.mode === 'subscription' && subscriptionId) {
        const customerId =
          typeof session.customer === 'string'
            ? session.customer
            : session.customer?.id ?? null;
        await this.prisma.community.update({
          where: { id: communityId },
          data: {
            pricingPlanId: planId,
            stripeSubscriptionId: subscriptionId,
            stripeCustomerId: customerId ?? undefined,
          },
        });
        this.logger.log(
          `Community ${communityId} subscribed to plan ${planId} via checkout session ${session.id}`,
        );
        return;
      }
      this.logger.warn(`No payment found for checkout session ${session.id}`);
      return;
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'paid',
        stripePaymentIntentId: paymentIntentId ?? payment.stripePaymentIntentId,
        stripeCheckoutSessionId: session.id,
      },
    });

    if (payment.registrationId) {
      await this.prisma.eventRegistration.update({
        where: { id: payment.registrationId },
        data: {
          status: 'paid',
          paymentStatus: 'paid',
          paidAmount: payment.amount,
        },
      });
    }
  }

  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
    const subscriptionId =
      typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription?.id ?? null;
    const customerId =
      typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null;
    let communityId = invoice.metadata?.communityId;
    let planId = invoice.metadata?.planId;

    if ((!communityId || !planId) && subscriptionId) {
      try {
        const subscription = await this.stripeService.client.subscriptions.retrieve(subscriptionId);
        communityId = (subscription.metadata as any)?.communityId ?? communityId;
        planId = (subscription.metadata as any)?.planId ?? planId;
      } catch (err) {
        this.logger.warn(`Failed to retrieve subscription ${subscriptionId} for invoice metadata: ${err}`);
      }
    }

    if (!communityId || !planId || !subscriptionId) {
      this.logger.warn(
        `invoice.payment_succeeded missing metadata: communityId=${communityId}, planId=${planId}, subscriptionId=${subscriptionId}`,
      );
      return;
    }

    await this.prisma.community.update({
      where: { id: communityId },
      data: {
        pricingPlanId: planId,
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: customerId ?? undefined,
      },
    });

    this.logger.log(
      `Community ${communityId} subscribed to plan ${planId} via invoice ${invoice.id} (subscription ${subscriptionId})`,
    );
  }

  private async handleChargeRefunded(charge: Stripe.Charge) {
    const paymentIntentId =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id ?? null;
    const whereClauses: Prisma.PaymentWhereInput[] = [{ stripeChargeId: charge.id }];
    if (paymentIntentId) {
      whereClauses.push({ stripePaymentIntentId: paymentIntentId });
    }

    const payment = await this.prisma.payment.findFirst({
      where: { OR: whereClauses },
    });
    if (!payment) {
      this.logger.warn(`No payment matched refunded charge ${charge.id}`);
      return;
    }

    await this.markPaymentRefunded(payment, charge.refunds?.data?.[0]?.id);
  }

  private async markPaymentRefunded(payment: Payment, refundId?: string | null) {
    if (payment.status === 'refunded') {
      return;
    }
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'refunded',
        stripeRefundId: refundId ?? payment.stripeRefundId,
      },
    });

    if (payment.registrationId) {
      await this.prisma.eventRegistration.update({
        where: { id: payment.registrationId },
        data: {
          paymentStatus: 'refunded',
          status: 'cancelled',
          paidAmount: 0,
        },
      });
    }
  }

  private async resolvePaymentIntentId(payment: Payment): Promise<string | null> {
    if (payment.stripePaymentIntentId) {
      return payment.stripePaymentIntentId;
    }
    if (!payment.stripeCheckoutSessionId) {
      return null;
    }
    try {
      const session = await this.stripeService.client.checkout.sessions.retrieve(payment.stripeCheckoutSessionId);
      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id ?? null;
      if (paymentIntentId) {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { stripePaymentIntentId: paymentIntentId },
        });
      }
      return paymentIntentId;
    } catch (error) {
      this.logger.error(
        `Failed to retrieve checkout session ${payment.stripeCheckoutSessionId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  private getLocalizedText(content: Prisma.JsonValue | string | null | undefined) {
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (typeof content === 'object') {
      const record = content as Record<string, any>;
      if (typeof record.original === 'string') {
        return record.original;
      }
    }
    return '';
  }
}
