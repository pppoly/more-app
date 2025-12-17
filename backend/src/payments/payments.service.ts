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

  private resolvePlanFee(planId?: string | null) {
    const key = (planId || '').toLowerCase();
    if (key.includes('pro')) return { percent: 0, fixed: 0, planId };
    if (key.includes('starter')) return { percent: 2, fixed: 0, planId };
    if (key.includes('free')) return { percent: 5, fixed: 0, planId };
    return { percent: 5, fixed: 0, planId: planId || 'free' };
  }

  async listCommunityPayments(
    userId: string,
    communityId: string,
    opts?: { page?: number; pageSize?: number; eventId?: string | null; status?: string | null },
  ) {
    await this.permissions.assertCommunityManager(userId, communityId);
    const page = Math.max(1, Number(opts?.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(opts?.pageSize) || 20));
    const where: Prisma.PaymentWhereInput = {
      communityId,
    };
    if (opts?.eventId) {
      where.eventId = opts.eventId;
    }
    if (opts?.status) {
      where.status = opts.status;
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
          event: { select: { id: true, title: true } },
          registration: { select: { id: true, ticketTypeId: true } },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: items.map((item) => ({
        id: item.id,
        user: {
          id: item.userId,
          name: item.user?.name ?? 'ゲスト',
          avatarUrl: item.user?.avatarUrl ?? null,
        },
        event: item.event
          ? {
              id: item.event.id,
              title: this.getLocalizedText(item.event.title),
            }
          : null,
        registrationId: item.registrationId ?? null,
        amount: item.amount,
        platformFee: item.platformFee ?? 0,
        feePercent: item.feePercent ?? null,
        status: item.status,
        method: item.method,
        createdAt: item.createdAt,
        stripePaymentIntentId: item.stripePaymentIntentId ?? null,
        stripeRefundId: item.stripeRefundId ?? null,
      })),
    };
  }

  async listAdminPayments(opts?: { page?: number; pageSize?: number; communityId?: string | null; status?: string | null }) {
    const page = Math.max(1, Number(opts?.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(opts?.pageSize) || 20));
    const where: Prisma.PaymentWhereInput = {};
    if (opts?.communityId) where.communityId = opts.communityId;
    if (opts?.status) where.status = opts.status;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, name: true, email: true } },
          event: { select: { id: true, title: true, communityId: true, community: { select: { name: true } } } },
          registration: { select: { id: true, ticketTypeId: true } },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);
    return {
      page,
      pageSize,
      total,
      items: items.map((item) => ({
        id: item.id,
        user: {
          id: item.userId,
          name: item.user?.name ?? 'ゲスト',
          email: item.user?.email ?? null,
        },
        community: item.event?.community
          ? { id: item.event.communityId, name: item.event.community.name }
          : item.communityId
            ? { id: item.communityId, name: null }
            : null,
        event: item.event
          ? {
              id: item.event.id,
              title: this.getLocalizedText(item.event.title),
            }
          : null,
        registrationId: item.registrationId ?? null,
        amount: item.amount,
        platformFee: item.platformFee ?? 0,
        feePercent: item.feePercent ?? null,
        status: item.status,
        method: item.method,
        createdAt: item.createdAt,
        stripePaymentIntentId: item.stripePaymentIntentId ?? null,
        stripeChargeId: item.stripeChargeId ?? null,
        stripeRefundId: item.stripeRefundId ?? null,
      })),
    };
  }

  async getCommunityBalance(userId: string, communityId: string, period?: string) {
    await this.permissions.assertCommunityManager(userId, communityId);
    const community = await this.prisma.community.findUnique({
      where: { id: communityId },
      select: { stripeAccountId: true },
    });
    if (!community) {
      throw new NotFoundException('Community not found');
    }

    const monthStart =
      period === 'month'
        ? (() => {
            const d = new Date();
            d.setDate(1);
            d.setHours(0, 0, 0, 0);
            return d;
          })()
        : null;

    const paidWhere: Prisma.PaymentWhereInput = {
      communityId,
      status: 'paid',
      ...(monthStart ? { createdAt: { gte: monthStart } } : {}),
    };
    const refundedWhere: Prisma.PaymentWhereInput = {
      communityId,
      status: 'refunded',
      ...(monthStart ? { createdAt: { gte: monthStart } } : {}),
    };
    const [paidAgg, refundedAgg] = await Promise.all([
      this.prisma.payment.aggregate({
        where: paidWhere,
        _sum: { amount: true, platformFee: true },
      }),
      this.prisma.payment.aggregate({
        where: refundedWhere,
        _sum: { amount: true, platformFee: true },
      }),
    ]);

    let stripeBalance: { available: number; pending: number } | null = null;
    if (this.stripeService.enabled && community.stripeAccountId) {
      try {
        const balance = await this.stripeService.client.balance.retrieve({
          stripeAccount: community.stripeAccountId,
        });
        const pick = (entries?: Array<{ amount: number; currency: string }>) =>
          entries?.find((e) => e.currency === 'jpy')?.amount ?? 0;
        stripeBalance = {
          available: pick(balance.available),
          pending: pick(balance.pending),
        };
      } catch (err) {
        this.logger.warn(`Failed to fetch Stripe balance for community ${communityId}: ${err}`);
      }
    }

    const grossPaid = paidAgg._sum.amount ?? 0;
    const platformFee = paidAgg._sum.platformFee ?? 0;
    const refunded = refundedAgg._sum.amount ?? 0;
    const net = Math.max(0, grossPaid - platformFee - refunded);

    return {
      communityId,
      currency: 'jpy',
      grossPaid,
      platformFee,
      refunded,
      net,
      stripeBalance,
      period: period === 'month' ? 'month' : 'all',
    };
  }

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

    const planFee = this.resolvePlanFee(community.pricingPlanId);
    const percent = planFee.percent;
    const fixed = planFee.fixed;
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
        planId: community.pricingPlanId ?? 'free',
        feePercent: percent,
        feeFixed: fixed,
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
        feePercent: percent,
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
        feePercent: percent,
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
      case 'checkout.session.expired':
        await this.handleCheckoutSessionExpired(event.data.object as Stripe.Checkout.Session);
        break;
      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case 'charge.dispute.created':
      case 'charge.dispute.closed':
        await this.handleChargeDispute(event.type, event.data.object as Stripe.Dispute);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      case 'customer.subscription.deleted':
      case 'customer.subscription.updated':
        await this.handleSubscriptionLifecycle(event.data.object as Stripe.Subscription);
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
    return this.refundStripePaymentInternal(userId, paymentId, undefined, reason);
  }

  async refundStripePaymentInternal(userId: string, paymentId: string, amount?: number, reason?: string) {
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
    if (amount !== undefined && amount > payment.amount) {
      throw new BadRequestException('返金額が支払い額を超えています');
    }

    if (payment.method !== 'stripe') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'refunded' },
      });
      if (payment.registrationId) {
        await this.prisma.eventRegistration.update({
          where: { id: payment.registrationId },
          data: { paymentStatus: 'refunded', status: 'cancelled' },
        });
      }
      return { refundId: null, status: 'refunded' };
    }

    const paymentIntentId = await this.resolvePaymentIntentId(payment);
    if (!paymentIntentId) {
      throw new BadRequestException('Stripe支払い情報を取得できませんでした');
    }

    const refund = await this.stripeService.client.refunds.create({
      payment_intent: paymentIntentId,
      amount: amount ?? undefined,
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

    await this.recordSubscriptionPayment(invoice, communityId, planId);

    this.logger.log(
      `Community ${communityId} subscribed to plan ${planId} via invoice ${invoice.id} (subscription ${subscriptionId})`,
    );
  }

  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
    const subscriptionId =
      typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription?.id ?? null;
    const communityId = invoice.metadata?.communityId;
    const planId = invoice.metadata?.planId;
    this.logger.warn(
      `Subscription invoice failed: subscription=${subscriptionId}, community=${communityId}, plan=${planId}, invoice=${invoice.id}`,
    );
    if (communityId && subscriptionId) {
      await this.prisma.community.update({
        where: { id: communityId },
        data: { stripeSubscriptionId: subscriptionId },
      });
    }
  }

  private async handleSubscriptionLifecycle(subscription: Stripe.Subscription) {
    const communityId = (subscription.metadata as any)?.communityId ?? null;
    const planId = (subscription.metadata as any)?.planId ?? null;
    if (!communityId && !planId) {
      this.logger.debug(`Subscription lifecycle event missing metadata: ${subscription.id}`);
      return;
    }

    if (!communityId) {
      this.logger.warn(`Subscription lifecycle event missing communityId: ${subscription.id}`);
      return;
    }

    if (subscription.status === 'canceled' || subscription.canceled_at) {
      await this.prisma.community.update({
        where: { id: communityId },
        data: { stripeSubscriptionId: null },
      });
      this.logger.log(`Subscription cancelled: ${subscription.id}, community=${communityId}`);
      return;
    }

    await this.prisma.community.update({
      where: { id: communityId },
      data: {
        pricingPlanId: planId ?? undefined,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id,
      },
    });
    this.logger.log(`Subscription updated: ${subscription.id}, community=${communityId}, plan=${planId}`);
  }

  private async handleCheckoutSessionExpired(session: Stripe.Checkout.Session) {
    const registrationId = session.metadata?.registrationId;
    const payment = await this.prisma.payment.findFirst({
      where: { stripeCheckoutSessionId: session.id },
    });
    if (payment) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'pending' },
      });
    }
    if (registrationId) {
      await this.prisma.eventRegistration.updateMany({
        where: { id: registrationId, paymentStatus: 'pending' },
        data: { paymentStatus: 'pending', status: 'cancelled' },
      });
    }
    this.logger.log(`Checkout session expired: ${session.id}, registration=${registrationId ?? 'n/a'}`);
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

  private async handleChargeDispute(eventType: string, dispute: Stripe.Dispute) {
    const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id ?? null;
    if (!chargeId) {
      this.logger.warn(`Dispute event missing charge id: ${dispute.id}`);
      return;
    }
    const payment = await this.prisma.payment.findFirst({
      where: { stripeChargeId: chargeId },
    });
    if (!payment) {
      this.logger.warn(`No payment matched disputed charge ${chargeId}`);
      return;
    }

    if (eventType === 'charge.dispute.created') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'disputed', metadata: { ...(payment as any).metadata, disputeId: dispute.id } } as any,
      });
      this.logger.warn(`Payment ${payment.id} marked disputed (charge=${chargeId})`);
    } else if (eventType === 'charge.dispute.closed') {
      const won = dispute.status === 'won';
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: won ? 'paid' : 'refunded', stripeRefundId: won ? payment.stripeRefundId : payment.stripeRefundId },
      });
      this.logger.log(`Payment ${payment.id} dispute closed (${won ? 'won' : 'lost'})`);
    }
  }

  private async handlePaymentIntentFailed(intent: Stripe.PaymentIntent) {
    const paymentIntentId = intent.id;
    const payment = await this.prisma.payment.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
    });
    if (!payment) return;

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'failed' },
    });

    if (payment.registrationId) {
      await this.prisma.eventRegistration.update({
        where: { id: payment.registrationId },
        data: { paymentStatus: 'failed', status: 'pending' },
      });
    }
    this.logger.warn(`Payment intent failed: ${paymentIntentId}, payment=${payment.id}`);
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

  private async recordSubscriptionPayment(invoice: Stripe.Invoice, communityId: string, planId: string) {
    const subscriptionId =
      typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription?.id ?? null;
    const chargeId =
      typeof invoice.charge === 'string'
        ? invoice.charge
        : invoice.charge?.id ?? null;
    const amount = invoice.amount_paid ?? 0;
    const currency = invoice.currency ?? 'jpy';

    if (!subscriptionId) {
      this.logger.warn(`Cannot record subscription payment without subscriptionId for invoice ${invoice.id}`);
      return;
    }

    const existing = await this.prisma.payment.findFirst({
      where: { stripeChargeId: chargeId ?? undefined },
    });
    if (existing) {
      return;
    }

    const community = await this.prisma.community.findUnique({
      where: { id: communityId },
      select: { ownerId: true },
    });
    const ownerId = community?.ownerId;
    if (!ownerId) {
      this.logger.warn(`Cannot record subscription payment; missing owner for community ${communityId}`);
      return;
    }

    if (!chargeId) {
      this.logger.warn(`Cannot record subscription payment without chargeId for invoice ${invoice.id}`);
      return;
    }

    await this.prisma.payment.create({
      data: {
        userId: ownerId,
        communityId,
        amount,
        platformFee: 0,
        currency,
        status: 'paid',
        method: 'stripe',
        stripeChargeId: chargeId,
        metadata: { planId, invoiceId: invoice.id },
      } as any,
    });
  }

  private async resolvePaymentIntentId(payment: Payment): Promise<string | null> {
    if (payment.stripePaymentIntentId) {
      return payment.stripePaymentIntentId;
    }
    if (!payment.stripeCheckoutSessionId) {
      return null;
    }
    try {
      const session = await this.stripeService.client.checkout.sessions.retrieve(payment.stripeCheckoutSessionId, {
        expand: ['payment_intent'],
      });
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

  async diagnoseStripePayment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    const intentId = await this.resolvePaymentIntentId(payment);
    if (!intentId) {
      throw new NotFoundException('Stripe payment intent not found');
    }
    const intent = await this.stripeService.client.paymentIntents.retrieve(intentId);
    const status = intent.status;
    // Sync status if succeeded
    if (status === 'succeeded' && payment.status !== 'paid') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'paid', stripePaymentIntentId: intentId },
      });
      if (payment.registrationId) {
        await this.prisma.eventRegistration.update({
          where: { id: payment.registrationId },
          data: { status: 'paid', paymentStatus: 'paid', paidAmount: payment.amount },
        });
      }
    }
    return { paymentId, intentId, intentStatus: status, localStatus: payment.status };
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
