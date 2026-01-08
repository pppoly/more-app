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
import { NotificationService } from '../notifications/notification.service';
import { Prisma, Payment } from '@prisma/client';
import Stripe from 'stripe';
import { buildIdempotencyKey } from './idempotency.util';
import { computeMerchantNet, computeProportionalAmount } from './settlement.utils';

const MAX_PAYMENT_AMOUNT_JPY = Number(process.env.MAX_PAYMENT_AMOUNT_JPY ?? 100000);
const PAYMENT_PENDING_TIMEOUT_MINUTES = Number(process.env.PAYMENT_PENDING_TIMEOUT_MINUTES ?? 30);
const PAYMENT_PENDING_TIMEOUT_MS =
  Number.isFinite(PAYMENT_PENDING_TIMEOUT_MINUTES) && PAYMENT_PENDING_TIMEOUT_MINUTES > 0
    ? PAYMENT_PENDING_TIMEOUT_MINUTES * 60 * 1000
    : 30 * 60 * 1000;
const PLATFORM_FEE_WAIVED = !['0', 'false', 'off'].includes(
  (process.env.BETA_PLATFORM_FEE_WAIVED ?? '1').toLowerCase(),
);

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly permissions: PermissionsService,
    private readonly notifications: NotificationService,
  ) {}

  private resolvePlanFee(planId?: string | null) {
    if (PLATFORM_FEE_WAIVED) return { percent: 0, fixed: 0, planId };
    const key = (planId || '').toLowerCase();
    if (key.includes('pro')) return { percent: 0, fixed: 0, planId };
    if (key.includes('starter')) return { percent: 2, fixed: 0, planId };
    if (key.includes('free')) return { percent: 5, fixed: 0, planId };
    return { percent: 5, fixed: 0, planId: planId || 'free' };
  }

  private assertAmount(amount: number, currency: string) {
    if (currency.toLowerCase() !== 'jpy') {
      throw new BadRequestException('JPY以外の通貨はサポートしていません');
    }
    if (amount <= 0) {
      throw new BadRequestException('支払い金額が不正です');
    }
    if (amount > MAX_PAYMENT_AMOUNT_JPY) {
      throw new BadRequestException('支払い金額が上限を超えています');
    }
  }

  private isPendingPaymentExpired(payment: Payment) {
    if (!PAYMENT_PENDING_TIMEOUT_MS) return false;
    return Date.now() - payment.createdAt.getTime() > PAYMENT_PENDING_TIMEOUT_MS;
  }

  private async expirePendingPayment(payment: Payment) {
    try {
      if (payment.stripeCheckoutSessionId && this.stripeService.enabled) {
        try {
          await this.stripeService.client.checkout.sessions.expire(payment.stripeCheckoutSessionId);
        } catch (error) {
          this.logger.warn(
            `Failed to expire Stripe session ${payment.stripeCheckoutSessionId} for payment ${payment.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'cancelled' },
      });
      if (payment.registrationId) {
        await this.prisma.eventRegistration.updateMany({
          where: { id: payment.registrationId, paymentStatus: { not: 'paid' } },
          data: { paymentStatus: 'unpaid' },
        });
      }
      this.logger.log(`Expired pending payment: payment=${payment.id}, registration=${payment.registrationId ?? 'n/a'}`);
    } catch (error) {
      this.logger.warn(
        `Failed to expire pending payment ${payment.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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
          registration: {
            select: {
              id: true,
              ticketTypeId: true,
              refundRequest: {
                select: {
                  id: true,
                  status: true,
                  decision: true,
                  requestedAmount: true,
                  approvedAmount: true,
                  refundedAmount: true,
                  reason: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
          },
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
        refundRequest: item.registration?.refundRequest
          ? {
              id: item.registration.refundRequest.id,
              status: item.registration.refundRequest.status,
              decision: item.registration.refundRequest.decision ?? null,
              requestedAmount: item.registration.refundRequest.requestedAmount,
              approvedAmount: item.registration.refundRequest.approvedAmount ?? null,
              refundedAmount: item.registration.refundRequest.refundedAmount ?? null,
              reason: item.registration.refundRequest.reason ?? null,
              createdAt: item.registration.refundRequest.createdAt,
              updatedAt: item.registration.refundRequest.updatedAt,
            }
          : null,
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
    const allWhere: Prisma.PaymentWhereInput = {
      communityId,
      ...(monthStart ? { createdAt: { gte: monthStart } } : {}),
    };
    const [paidAgg, refundedAgg, allAgg] = await Promise.all([
      this.prisma.payment.aggregate({
        where: paidWhere,
        _sum: { amount: true, platformFee: true },
      }),
      this.prisma.payment.aggregate({
        where: refundedWhere,
        _sum: { amount: true, platformFee: true },
      }),
      this.prisma.payment.aggregate({ where: allWhere, _sum: { amount: true } }),
    ]);

    let stripeBalance: { available: number; pending: number } | null = null;
    let stripeFee = 0;
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

    if (this.stripeService.enabled) {
      try {
        stripeFee = await this.getCommunityStripeFeeFromPlatform(communityId, monthStart ?? undefined);
      } catch (err) {
        this.logger.warn(`Failed to fetch Stripe fee from platform for community ${communityId}: ${err}`);
      }
    }

    const transactionTotal = allAgg._sum.amount ?? 0;
    const grossPaid = paidAgg._sum.amount ?? 0;
    const platformFee = paidAgg._sum.platformFee ?? 0;
    const refunded = refundedAgg._sum.amount ?? 0;
    const net = Math.max(0, grossPaid - platformFee - refunded - stripeFee);

    return {
      communityId,
      currency: 'jpy',
      transactionTotal,
      grossPaid,
      platformFee,
      stripeFee,
      refunded,
      net,
      stripeBalance,
      period: period === 'month' ? 'month' : 'all',
    };
  }

  private async getCommunityStripeFeeFromPlatform(communityId: string, monthStart?: Date) {
    const paidPayments = await this.prisma.payment.findMany({
      where: {
        communityId,
        method: 'stripe',
        status: 'paid',
        stripePaymentIntentId: { not: null },
        ...(monthStart ? { createdAt: { gte: monthStart } } : {}),
      },
      select: { stripePaymentIntentId: true, stripeChargeId: true },
    });

    const paymentIntentSet = new Set(
      paidPayments.map((p) => p.stripePaymentIntentId).filter((v): v is string => Boolean(v)),
    );
    const chargeMap = new Map<string, string | null>();
    for (const payment of paidPayments) {
      if (payment.stripeChargeId) {
        chargeMap.set(payment.stripeChargeId, payment.stripePaymentIntentId ?? null);
      }
    }

    const createdFilter = monthStart ? { gte: Math.floor(monthStart.getTime() / 1000) } : undefined;
    const feeParams: Stripe.BalanceTransactionListParams = {
      limit: 100,
      currency: 'jpy',
      ...(createdFilter ? { created: createdFilter } : {}),
    };

    let totalFee = 0;
    const txList = this.stripeService.client.balanceTransactions.list(feeParams);
    for await (const tx of txList) {
      if (tx.currency !== 'jpy') continue;
      if (tx.type !== 'charge') continue;
      if (!tx.source || typeof tx.source !== 'string') continue;

      const cachedIntent = chargeMap.get(tx.source);
      if (cachedIntent) {
        if (paymentIntentSet.has(cachedIntent)) {
          totalFee += Math.max(0, tx.fee ?? 0);
        }
        continue;
      }

      try {
        const charge = await this.stripeService.client.charges.retrieve(tx.source);
        const intentId =
          typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : charge.payment_intent?.id ?? null;
        chargeMap.set(tx.source, intentId);
        if (intentId && paymentIntentSet.has(intentId)) {
          totalFee += Math.max(0, tx.fee ?? 0);
        }
      } catch (err) {
        this.logger.warn(`Failed to retrieve charge ${tx.source} for fee calc: ${err}`);
      }
    }

    return totalFee;
  }

  async createMockPayment(userId: string, registrationId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const registration = (await tx.eventRegistration.findUnique({
        where: { id: registrationId },
        select: {
          id: true,
          userId: true,
          eventId: true,
          lessonId: true,
          amount: true,
          paymentStatus: true,
          event: {
            select: {
              communityId: true,
            },
          },
          lesson: {
            select: {
              class: { select: { communityId: true } },
            },
          },
        },
      })) as any;

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
      this.assertAmount(amount, 'jpy');

      const payment = await tx.payment.create({
        data: {
          userId,
          communityId: registration.event?.communityId ?? registration.lesson?.class.communityId,
          eventId: registration.eventId ?? null,
          lessonId: registration.lessonId ?? undefined,
          registrationId,
          amount,
          platformFee: 0,
          currency: 'jpy',
          status: 'paid',
          method: 'mock',
          idempotencyKey: buildIdempotencyKey('mock', 'charge', 'registration', registrationId, amount, 'jpy'),
        },
        select: {
          id: true,
          status: true,
          amount: true,
          eventId: true,
          lessonId: true,
          communityId: true,
        },
      });

      await tx.eventRegistration.update({
        where: { id: registrationId },
        data: {
          status: 'paid',
          paidAmount: amount,
          paymentStatus: 'paid',
          payment: { connect: { id: payment.id } },
        },
      });

      await this.createLedgerEntryIfMissing({
        tx,
        businessPaymentId: payment.id,
        businessRegistrationId: registrationId,
        businessCommunityId: registration.event?.communityId ?? registration.lesson?.class.communityId,
        businessLessonId: registration.lessonId ?? undefined,
        entryType: 'charge',
        direction: 'in',
        amount,
        currency: 'jpy',
        provider: 'mock',
        providerObjectType: 'mock',
        providerObjectId: payment.id,
        idempotencyKey: `mock:payment:${payment.id}`,
        occurredAt: new Date(),
        metadata: { registrationId },
      });

      return {
        payment,
        amount,
        registration,
      };
    });

    await this.logGatewayEvent({
      gateway: 'mock',
      eventType: 'payment.completed',
      status: 'success',
      paymentId: result.payment.id,
      registrationId,
      eventId: result.payment.eventId ?? undefined,
      lessonId: result.payment.lessonId ?? undefined,
      communityId: result.payment.communityId ?? undefined,
      userId,
      payload: { amount: result.amount },
    });

    void this.notifications.notifyRegistrationSuccess(registrationId).catch((error) => {
      this.logger.warn(`Failed to notify mock payment registration: ${error instanceof Error ? error.message : String(error)}`);
    });

    return {
      paymentId: result.payment.id,
      status: result.payment.status,
      amount: result.payment.amount,
      registrationId,
    };
  }

  async createStripeCheckout(userId: string, registrationId: string) {
    const registration = (await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: {
        event: {
          include: {
            community: true,
          },
        },
        lesson: {
          include: {
            class: { select: { community: true, title: true } },
          },
        },
      },
    })) as any;

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

    const event = (registration as any).event;
    const lesson = (registration as any).lesson;
    const community = event?.community ?? lesson?.class?.community;
    if (!community) {
      throw new NotFoundException('Community not found');
    }
    if (!event && !lesson) {
      throw new NotFoundException('Event or lesson not found');
    }
    if (event?.requireApproval && registration.status !== 'approved') {
      throw new BadRequestException('Registration is pending approval');
    }

    if (!community.stripeAccountId || !community.stripeAccountOnboarded) {
      throw new BadRequestException('コミュニティがStripeアカウントと連携していません');
    }

    if (!this.stripeService.enabled) {
      throw new BadRequestException('Stripe決済が現在利用できません');
    }

    const existingPending = await this.prisma.payment.findFirst({
      where: { registrationId, status: 'pending', method: 'stripe' },
      orderBy: { createdAt: 'desc' },
    });

    let activePending = existingPending;
    if (activePending && this.isPendingPaymentExpired(activePending)) {
      await this.expirePendingPayment(activePending);
      activePending = null;
    }

    if (activePending?.stripeCheckoutSessionId) {
      try {
        const existingSession = await this.stripeService.client.checkout.sessions.retrieve(
          activePending.stripeCheckoutSessionId,
        );
        const existingPaymentIntentId =
          typeof existingSession.payment_intent === 'string'
            ? existingSession.payment_intent
            : existingSession.payment_intent?.id ?? null;

        if (existingSession.status === 'open' && existingSession.url) {
          this.logger.log(
            `Resume Stripe checkout: session=${existingSession.id}, paymentId=${activePending.id}, payment_intent=${existingPaymentIntentId ?? 'null'}`,
          );
          return { checkoutUrl: existingSession.url, resume: true };
        }

        if (existingSession.status === 'complete' && existingSession.payment_status === 'paid') {
          await this.prisma.payment.update({
            where: { id: activePending.id },
            data: {
              status: 'paid',
              stripePaymentIntentId: existingPaymentIntentId ?? activePending.stripePaymentIntentId,
              stripeCheckoutSessionId: existingSession.id,
            },
          });
          if (registrationId) {
            await this.prisma.eventRegistration.update({
              where: { id: registrationId },
              data: { paymentStatus: 'paid', status: 'paid', paidAmount: activePending.amount },
            });
          }
          this.logger.log(
            `Existing Stripe session already paid: session=${existingSession.id}, paymentId=${activePending.id}, payment_intent=${existingPaymentIntentId ?? 'null'}`,
          );
          if (registrationId) {
            void this.notifications.notifyRegistrationSuccess(registrationId).catch((error) => {
              this.logger.warn(
                `Failed to notify resumed Stripe payment: ${error instanceof Error ? error.message : String(error)}`,
              );
            });
          }
          return { checkoutUrl: this.stripeService.successUrlBase, resume: false };
        }
      } catch (error) {
        this.logger.warn(
          `Failed to resume existing Stripe session ${activePending.stripeCheckoutSessionId} for payment ${activePending.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const planFee = this.resolvePlanFee(community.pricingPlanId);
    const percent = planFee.percent;
    const fixed = planFee.fixed;
    const platformFee = Math.min(amount, Math.round((amount * percent) / 100) + fixed);
    const titleSource = event ? event.title : lesson?.class.title;
    const eventTitle = this.getLocalizedText(titleSource) || 'MORE Class';

    // Expire Checkout after 30 minutes to avoid long-held pending locks.
    const expiresAt = Math.floor(Date.now() / 1000) + 30 * 60;
    // Prepare local payment first to bind metadata
    const idempotencyKey = buildIdempotencyKey('stripe', 'charge', 'registration', registrationId, amount, 'jpy');
    const payment = await this.prisma.payment.upsert({
      where: { registrationId },
      update: {
        userId,
        communityId: community.id,
        eventId: event?.id,
        lessonId: lesson?.id,
        amount,
        platformFee,
        feePercent: percent,
        currency: 'jpy',
        status: 'pending',
        method: 'stripe',
        idempotencyKey,
        providerAccountId: community.stripeAccountId ?? undefined,
      },
      create: {
        userId,
        communityId: community.id,
        eventId: event?.id,
        lessonId: lesson?.id,
        registrationId,
        amount,
        platformFee,
        feePercent: percent,
        currency: 'jpy',
        status: 'pending',
        method: 'stripe',
        idempotencyKey,
        providerAccountId: community.stripeAccountId ?? undefined,
      },
    });

    const session = await this.stripeService.client.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      expires_at: expiresAt,
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
        paymentId: payment.id,
        registrationId,
        eventId: event?.id,
        lessonId: lesson?.id,
        classId: lesson?.classId,
        communityId: community.id,
        userId,
        planId: community.pricingPlanId ?? 'free',
        feePercent: percent,
        feeFixed: fixed,
      },
      success_url: `${this.stripeService.successUrlBase}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: this.stripeService.cancelUrlBase,
      payment_intent_data: {
        metadata: {
          paymentId: payment.id,
          registrationId,
        },
        application_fee_amount: platformFee,
        transfer_data: {
          destination: community.stripeAccountId,
        },
      },
    });

    if (!session.url) {
      throw new InternalServerErrorException('Stripe Checkout URLを生成できませんでした');
    }

    try {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          stripeCheckoutSessionId: session.id,
        },
      });
      this.logger.log(
        `Stripe checkout session created: session=${session.id}, payment_intent=null, paymentId=${payment.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to store checkout session id for payment ${payment.id}: session ${session.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    try {
      const refreshedSession = await this.stripeService.client.checkout.sessions.retrieve(session.id);
      const refreshedPaymentIntentId =
        typeof refreshedSession.payment_intent === 'string'
          ? refreshedSession.payment_intent
          : refreshedSession.payment_intent?.id ?? null;
      this.logger.log(
        `Retrieved session payment_intent=${refreshedPaymentIntentId ?? 'null'} for session=${session.id} paymentId=${payment.id}`,
      );
      if (refreshedPaymentIntentId) {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { stripePaymentIntentId: refreshedPaymentIntentId },
        });
        this.logger.log(
          `Stored stripePaymentIntentId for payment ${payment.id}: ${refreshedPaymentIntentId} (session ${session.id})`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to retrieve/update payment_intent for session ${session.id}, payment ${payment.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    await this.logGatewayEvent({
      gateway: 'stripe',
      eventType: 'checkout.session.created',
      status: 'success',
      registrationId,
      eventId: event?.id ?? undefined,
      lessonId: lesson?.id ?? undefined,
      communityId: community.id,
      userId,
      payload: { sessionId: session.id, amount, platformFee },
    });

    return {
      checkoutUrl: session.url,
    };
  }

  async handleStripeWebhook(rawBody: Buffer, signature?: string) {
    if (!this.stripeService.enabled) {
      this.logger.warn('Stripe webhook received but Stripe is not enabled');
      return { received: true };
    }
    const envLabel = (process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
    const webhookSecret =
      process.env.STRIPE_WEBHOOK_SECRET ??
      (['production', 'prod', 'live'].includes(envLabel)
        ? process.env.STRIPE_WEBHOOK_SECRET_LIVE
        : process.env.STRIPE_WEBHOOK_SECRET_TEST);
    if (!webhookSecret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET is not configured');
      throw new InternalServerErrorException('Stripe webhook secret is not configured');
    }
    const payloadInfo = this.describeStripeWebhookPayload(rawBody);
    const signaturePresent = Boolean(signature);
    if (!signature) {
      this.logger.warn(
        `Stripe webhook signature is missing (eventId=${payloadInfo.eventId}, sig=missing, rawBody=${payloadInfo.length} bytes)`,
      );
      throw new BadRequestException('Missing Stripe signature');
    }

    let event: Stripe.Event;
    try {
      event = this.stripeService.client.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to verify Stripe webhook signature (eventId=${payloadInfo.eventId}, sig=${
          signaturePresent ? 'present' : 'missing'
        }, rawBody=${payloadInfo.length} bytes): ${errorMessage}`,
      );
      await this.logGatewayEvent({
        gateway: 'stripe',
        eventType: 'webhook.verification_failed',
        status: 'failure',
        message: errorMessage,
      });
      throw new BadRequestException('Invalid Stripe signature');
    }

    const gatewayEvent = await this.upsertGatewayEvent(event);
    if (gatewayEvent.processedAt) {
      return { received: true };
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // 再読防止のロック：同一 event が並行到達しても processedAt を二重に書かない
        const locked = await tx.paymentGatewayEvent.findUnique({ where: { id: gatewayEvent.id }, select: { processedAt: true } });
        if (locked?.processedAt) return;

        await tx.paymentGatewayEvent.update({
          where: { id: gatewayEvent.id },
          data: { attempts: { increment: 1 } as any, status: 'received' },
        });

        switch (event.type) {
          case 'checkout.session.completed':
          case 'checkout.session.async_payment_succeeded':
            await this.handleCheckoutSessionCompleted(event.data.object, tx, event.id);
            break;
          case 'payment_intent.succeeded': {
            const intent = event.data.object as Stripe.PaymentIntent;
            const paymentId = (intent.metadata && (intent.metadata as any).paymentId) as string | undefined;
            const payment =
              (paymentId ? await tx.payment.findUnique({ where: { id: paymentId } }) : null) ??
              (await tx.payment.findFirst({ where: { stripePaymentIntentId: intent.id } }));
            if (!payment) {
              this.logger.warn(`Stripe PI succeeded but no payment matched: paymentId=${paymentId ?? 'n/a'}, intent=${intent.id}`);
              break;
            }
            await tx.payment.update({
              where: { id: payment.id },
              data: {
                status: 'paid',
                stripePaymentIntentId: intent.id,
                stripeChargeId:
                  typeof intent.latest_charge === 'string'
                    ? intent.latest_charge
                    : intent.latest_charge?.id ?? payment.stripeChargeId ?? null,
                provider: 'stripe',
                providerObjectType: 'payment_intent',
                providerObjectId: intent.id,
              },
            });
            void this.reconcilePaymentSettlement(payment.id, intent.id);
            if (payment.registrationId) {
              await tx.eventRegistration.update({
                where: { id: payment.registrationId },
                data: {
                  status: 'paid',
                  paymentStatus: 'paid',
                  paidAmount: payment.amount,
                },
              });
            }
            break;
          }
          case 'checkout.session.expired':
            await this.handleCheckoutSessionExpired(event.data.object, tx);
            break;
          case 'invoice.payment_succeeded':
            await this.handleInvoicePaymentSucceeded(event.data.object);
            break;
          case 'invoice.payment_failed':
            await this.handleInvoicePaymentFailed(event.data.object);
            break;
          case 'charge.dispute.created':
          case 'charge.dispute.closed':
            await this.handleChargeDispute(event.type, event.data.object);
            break;
          case 'payment_intent.payment_failed':
            await this.handlePaymentIntentFailed(event.data.object, tx);
            break;
          case 'customer.subscription.deleted':
          case 'customer.subscription.updated':
            await this.handleSubscriptionLifecycle(event.data.object);
            break;
          case 'charge.refunded':
            await this.handleChargeRefunded(event.data.object, tx);
            break;
          default:
            this.logger.debug(`Unhandled Stripe event: ${event.type}`);
            await tx.paymentGatewayEvent.update({
              where: { id: gatewayEvent.id },
              data: { status: 'ignored', processedAt: new Date() },
            });
            return;
        }

        await tx.paymentGatewayEvent.update({
          where: { id: gatewayEvent.id },
          data: { processedAt: new Date(), status: 'processed' } as any,
        });
      });
    } catch (err: any) {
      await this.prisma.paymentGatewayEvent.update({
        where: { id: gatewayEvent.id },
        data: {
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : String(err),
          attempts: { increment: 1 } as any,
        },
      });
      throw err;
    }

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session;
      const registrationId = session.metadata?.registrationId;
      if (registrationId) {
        void this.notifications.notifyRegistrationSuccess(registrationId).catch((error) => {
          this.logger.warn(`Failed to notify Stripe payment success: ${error instanceof Error ? error.message : String(error)}`);
        });
      }
    }

    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId =
        typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null;
      const refundId = charge.refunds?.data?.[0]?.id ?? null;
      const refundAmount = charge.amount_refunded ?? null;
      void this.notifications
        .notifyRefundByStripeCharge(charge.id, paymentIntentId, refundId, refundAmount)
        .catch((error) => {
          this.logger.warn(`Failed to notify Stripe refund: ${error instanceof Error ? error.message : String(error)}`);
        });
    }

    return { received: true };
  }

  async refundStripePayment(userId: string, paymentId: string, reason?: string) {
    return this.refundStripePaymentInternal(userId, paymentId, undefined, reason);
  }

  private describeStripeWebhookPayload(rawBody: Buffer) {
    const length = Buffer.isBuffer(rawBody) ? rawBody.length : 0;
    let eventId = 'n/a';
    if (Buffer.isBuffer(rawBody) && rawBody.length > 0) {
      try {
        const parsed = JSON.parse(rawBody.toString('utf8')) as { id?: string };
        if (parsed && typeof parsed.id === 'string') {
          eventId = parsed.id;
        }
      } catch {
        // ignore parse errors for logging
      }
    }
    return { eventId, length };
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
    if (payment.eventId) {
      await this.permissions.assertEventManager(userId, payment.eventId);
    } else if (payment.lessonId) {
      const lesson = await this.prisma.lesson.findUnique({
        where: { id: payment.lessonId },
        include: { class: true },
      });
      if (!lesson) throw new NotFoundException('Lesson not found');
      await this.permissions.assertCommunityManager(userId, lesson.class.communityId);
    } else {
      throw new BadRequestException('決済の紐付け情報が不足しています');
    }
    if (!['paid', 'partial_refunded'].includes(payment.status)) {
      throw new BadRequestException('この支払いは返金できません');
    }
    if (amount !== undefined && amount > payment.amount) {
      throw new BadRequestException('返金額が支払い額を超えています');
    }

    return this.refundStripePaymentWithMerchantFee(userId, payment, amount, reason);
  }

  async refundStripePaymentForRegistration(
    userId: string,
    registrationId: string,
    amount?: number,
    reason?: string,
  ) {
    if (!this.stripeService.enabled) {
      throw new BadRequestException('Stripe決済が現在利用できません');
    }
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: { payment: true },
    });
    if (!registration || registration.userId !== userId) {
      throw new NotFoundException('Registration not found');
    }
    const payment =
      registration.payment ??
      (await this.prisma.payment.findFirst({ where: { registrationId } }));
    if (!payment) {
      throw new BadRequestException('Payment not found');
    }
    if (!['paid', 'partial_refunded'].includes(payment.status)) {
      throw new BadRequestException('この支払いは返金できません');
    }
    if (amount !== undefined && amount > payment.amount) {
      throw new BadRequestException('返金額が支払い額を超えています');
    }
    return this.refundStripePaymentWithMerchantFee(userId, payment, amount, reason);
  }

  private async refundStripePaymentWithMerchantFee(
    userId: string,
    payment: Payment,
    amount?: number,
    reason?: string,
  ) {
    const gross = payment.amount ?? 0;
    const refundedGrossTotal = payment.refundedGrossTotal ?? 0;
    const remainingGross = Math.max(0, gross - refundedGrossTotal);
    const refundAmount = amount ?? remainingGross;
    if (refundAmount <= 0) {
      throw new BadRequestException('返金可能な金額がありません');
    }
    if (refundAmount > remainingGross) {
      throw new BadRequestException('返金額が残高を超えています');
    }

    if (payment.method !== 'stripe') {
      const status = await this.recordRefundTotals(payment.id, {
        refundAmount,
        refundPlatformFee: 0,
        reverseMerchant: 0,
        refundId: null,
      });
      void this.notifications.notifyRefundByPayment(payment.id, payment.stripeRefundId ?? null, refundAmount).catch((error) => {
        this.logger.warn(`Failed to notify refund (manual): ${error instanceof Error ? error.message : String(error)}`);
      });
      return { refundId: null, status };
    }

    const paymentIntentId = await this.resolvePaymentIntentId(payment);
    if (!paymentIntentId) {
      throw new BadRequestException('Stripe支払い情報を取得できませんでした');
    }

    await this.reconcilePaymentSettlement(payment.id, paymentIntentId);
    const refreshed = await this.prisma.payment.findUnique({ where: { id: payment.id } });
    if (!refreshed) {
      throw new NotFoundException('Payment not found');
    }

    const platformFee = refreshed.platformFee ?? 0;
    const stripeFee = refreshed.stripeFeeAmountActual ?? 0;
    const merchantNet =
      refreshed.merchantTransferAmount ?? computeMerchantNet(gross, platformFee, stripeFee);
    const remainingPlatformFee = Math.max(0, platformFee - (refreshed.refundedPlatformFeeTotal ?? 0));
    const remainingMerchant = Math.max(0, merchantNet - (refreshed.reversedMerchantTotal ?? 0));

    let refundPlatformFee = computeProportionalAmount(platformFee, refundAmount, gross);
    let reverseMerchant = computeProportionalAmount(merchantNet, refundAmount, gross);
    refundPlatformFee = Math.min(refundPlatformFee, remainingPlatformFee);
    reverseMerchant = Math.min(reverseMerchant, remainingMerchant);

    const reverseTransfer = reverseMerchant > 0;
    const refund = await this.stripeService.client.refunds.create(
      {
        payment_intent: paymentIntentId,
        amount: refundAmount,
        refund_application_fee: true,
        reverse_transfer: reverseTransfer,
        metadata: {
          paymentId: payment.id,
          eventId: payment.eventId,
          lessonId: payment.lessonId,
          requestedBy: userId,
          reason: reason ?? '',
        },
      },
      { idempotencyKey: `refund:${payment.id}:${refundAmount}:${refreshed.refundedGrossTotal ?? 0}` },
    );

    if (reverseMerchant > 0 && !reverseTransfer) {
      if (!refreshed.stripeTransferId) {
        throw new BadRequestException('Transfer not found for refund reversal');
      }
      const reversal = await this.stripeService.client.transfers.createReversal(
        refreshed.stripeTransferId,
        {
          amount: reverseMerchant,
          metadata: {
            paymentId: payment.id,
            refundId: refund.id,
            reason: 'refund_reversal',
          },
        },
        { idempotencyKey: `transfer:refund:${refund.id}` },
      );

      await this.createLedgerEntryIfMissing({
        tx: this.prisma,
        businessPaymentId: payment.id,
        businessRegistrationId: payment.registrationId ?? undefined,
        businessLessonId: payment.lessonId ?? undefined,
        businessCommunityId: payment.communityId ?? undefined,
        entryType: 'transfer_reversal',
        direction: 'in',
        amount: reverseMerchant,
        currency: payment.currency ?? 'jpy',
        provider: 'stripe',
        providerObjectType: 'transfer_reversal',
        providerObjectId: reversal.id,
        providerBalanceTxId: reversal.balance_transaction as string | undefined,
        providerAccountId: payment.communityId ?? undefined,
        idempotencyKey: `stripe:transfer.reversal:refund:${reversal.id}`,
        occurredAt: new Date(),
        metadata: { refundId: refund.id, transferId: refreshed.stripeTransferId },
      });
    }

    const status = await this.recordRefundTotals(payment.id, {
      refundAmount,
      refundPlatformFee,
      reverseMerchant,
      refundId: refund.id,
    });

    void this.notifications.notifyRefundByPayment(payment.id, refund.id, refundAmount).catch((error) => {
      this.logger.warn(`Failed to notify refund (stripe): ${error instanceof Error ? error.message : String(error)}`);
    });

    await this.createLedgerEntryIfMissing({
      tx: this.prisma,
      businessPaymentId: payment.id,
      businessRegistrationId: payment.registrationId ?? undefined,
      businessLessonId: payment.lessonId ?? undefined,
      businessCommunityId: payment.communityId ?? undefined,
      entryType: 'refund',
      direction: 'refund',
      amount: refundAmount,
      currency: payment.currency ?? 'jpy',
      provider: 'stripe',
      providerObjectType: 'refund',
      providerObjectId: refund.id,
      providerBalanceTxId: undefined,
      providerAccountId: payment.communityId ?? undefined,
      idempotencyKey: `stripe:refund:${refund.id}`,
      occurredAt: new Date(),
      metadata: { reason, refundPlatformFee, reverseMerchant },
    });

    await this.logGatewayEvent({
      gateway: 'stripe',
      eventType: 'refund.requested',
      status: 'success',
      paymentId: payment.id,
      registrationId: payment.registrationId ?? undefined,
      eventId: payment.eventId ?? undefined,
      lessonId: payment.lessonId ?? undefined,
      communityId: payment.communityId ?? undefined,
      userId,
      payload: { refundId: refund.id, amount: refundAmount },
    });

    return { refundId: refund.id, status };
  }

  private async handleCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
    tx: Prisma.TransactionClient = this.prisma,
    eventId?: string,
  ) {
    const registrationId = session.metadata?.registrationId;
    const whereClauses: Prisma.PaymentWhereInput[] = [{ stripeCheckoutSessionId: session.id }];
    if (registrationId) {
      whereClauses.push({ registrationId });
    }
    const payment = await tx.payment.findFirst({
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
      await this.logGatewayEvent({
        gateway: 'stripe',
        eventType: 'checkout.session.completed',
        status: 'ignored',
        registrationId,
        communityId: session.metadata?.communityId,
        message: `Payment not found for checkout session ${session.id}`,
        payload: { sessionId: session.id },
      });
      return;
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    if (['refunded', 'partial_refunded', 'disputed'].includes(payment.status)) {
      this.logger.warn(`Skip setting paid because payment ${payment.id} already in terminal status ${payment.status}`);
      return;
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'paid',
        stripePaymentIntentId: paymentIntentId ?? payment.stripePaymentIntentId,
        stripeCheckoutSessionId: session.id,
        lessonId: payment.lessonId ?? (session.metadata?.lessonId),
      },
    });

    if (paymentIntentId) {
      void this.reconcilePaymentSettlement(payment.id, paymentIntentId);
    }

    if (payment.registrationId) {
      await tx.eventRegistration.update({
        where: { id: payment.registrationId },
        data: {
          status: 'paid',
          paymentStatus: 'paid',
          paidAmount: payment.amount,
        },
      });
    }

    try {
      await this.createLedgerEntryIfMissing({
        tx,
        businessPaymentId: payment.id,
        businessRegistrationId: payment.registrationId ?? undefined,
        businessLessonId: payment.lessonId ?? undefined,
        businessCommunityId: payment.communityId ?? undefined,
        entryType: 'charge',
        direction: 'in',
        amount: payment.amount,
        currency: payment.currency ?? 'jpy',
        provider: 'stripe',
        providerObjectType: 'checkout.session',
        providerObjectId: session.id,
        providerAccountId: session.metadata?.communityId,
        idempotencyKey: `stripe:checkout.completed:${session.id}`,
        occurredAt: new Date(),
        metadata: { paymentIntentId },
        logContext: {
          eventId,
          sessionId: session.id,
        },
      });
    } catch (err) {
      const errorName = err instanceof Error ? err.name : 'UnknownError';
      const errorMessage = err instanceof Error ? err.message : String(err);
      const shouldRetry = this.shouldRetryLedgerError(err);
      this.logger.error(
        `[ledger] failed event=${eventId ?? 'n/a'} session=${session.id} paymentId=${
          session.metadata?.paymentId ?? payment.id ?? 'n/a'
        } registrationId=${
          session.metadata?.registrationId ?? payment.registrationId ?? 'n/a'
        } paymentIntent=${paymentIntentId ?? 'n/a'} error=${errorName}: ${errorMessage} retry=${shouldRetry}`,
      );
      if (shouldRetry) {
        throw err;
      }
    }

    await this.logGatewayEvent({
      gateway: 'stripe',
      eventType: 'checkout.session.completed',
      status: 'success',
      paymentId: payment.id,
      registrationId: payment.registrationId ?? undefined,
      eventId: payment.eventId ?? undefined,
      lessonId: payment.lessonId ?? undefined,
      communityId: payment.communityId ?? undefined,
      userId: payment.userId,
      payload: { sessionId: session.id, paymentIntentId },
    });
  }

  private async reconcilePaymentSettlement(paymentId: string, paymentIntentId: string) {
    try {
      const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
      if (!payment || payment.method !== 'stripe') return;

      const intent = await this.stripeService.client.paymentIntents.retrieve(paymentIntentId, {
        expand: ['latest_charge.balance_transaction', 'latest_charge.transfer'],
      });
      const latestCharge =
        typeof intent.latest_charge === 'string' ? null : intent.latest_charge ?? null;
      const chargeId =
        typeof intent.latest_charge === 'string'
          ? intent.latest_charge
          : intent.latest_charge?.id ?? null;
      if (!chargeId) return;

      const balanceTx =
        latestCharge?.balance_transaction &&
        typeof latestCharge.balance_transaction !== 'string'
          ? latestCharge.balance_transaction
          : null;
      const stripeFee = balanceTx ? this.computeStripeFeeFromBalanceTx(balanceTx) : 0;
      const gross = payment.amount ?? 0;
      const platformFee = payment.platformFee ?? 0;
      const merchantNet = computeMerchantNet(gross, platformFee, stripeFee);
      const transferId =
        typeof latestCharge?.transfer === 'string'
          ? latestCharge.transfer
          : (latestCharge?.transfer as Stripe.Transfer | null)?.id ?? null;

      await this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          stripePaymentIntentId: paymentIntentId,
          stripeChargeId: chargeId,
          stripeTransferId: transferId ?? undefined,
          stripeFeeAmountActual: stripeFee,
          merchantTransferAmount: merchantNet,
        },
      });

      if (!transferId || stripeFee <= 0) return;
      if (payment.stripeFeeReversalId) return;

      const transfer = await this.stripeService.client.transfers.retrieve(transferId);
      const transferAmount = transfer.amount ?? 0;

      await this.createLedgerEntryIfMissing({
        tx: this.prisma,
        businessPaymentId: paymentId,
        businessRegistrationId: payment.registrationId ?? undefined,
        businessLessonId: payment.lessonId ?? undefined,
        businessCommunityId: payment.communityId ?? undefined,
        entryType: 'transfer',
        direction: 'out',
        amount: transferAmount,
        currency: payment.currency ?? 'jpy',
        provider: 'stripe',
        providerObjectType: 'transfer',
        providerObjectId: transferId,
        providerBalanceTxId: transfer.balance_transaction as string | undefined,
        providerAccountId: payment.communityId ?? undefined,
        idempotencyKey: `stripe:transfer:${transferId}`,
        occurredAt: new Date(),
        metadata: { reason: 'destination_charge' },
      });

      const adjustment = Math.max(0, transferAmount - merchantNet);
      if (adjustment <= 0) return;

      const reversal = await this.stripeService.client.transfers.createReversal(
        transferId,
        {
          amount: adjustment,
          metadata: {
            paymentId,
            reason: 'stripe_fee_allocation',
          },
        },
        { idempotencyKey: `transfer:fee:${paymentId}:${transferId}` },
      );

      await this.prisma.payment.update({
        where: { id: paymentId },
        data: { stripeFeeReversalId: reversal.id },
      });

      await this.createLedgerEntryIfMissing({
        tx: this.prisma,
        businessPaymentId: paymentId,
        businessRegistrationId: payment.registrationId ?? undefined,
        businessLessonId: payment.lessonId ?? undefined,
        businessCommunityId: payment.communityId ?? undefined,
        entryType: 'transfer_reversal',
        direction: 'in',
        amount: adjustment,
        currency: payment.currency ?? 'jpy',
        provider: 'stripe',
        providerObjectType: 'transfer_reversal',
        providerObjectId: reversal.id,
        providerBalanceTxId: reversal.balance_transaction as string | undefined,
        providerAccountId: payment.communityId ?? undefined,
        idempotencyKey: `stripe:transfer.reversal:fee:${reversal.id}`,
        occurredAt: new Date(),
        metadata: { transferId, reason: 'stripe_fee_allocation' },
      });
    } catch (err) {
      this.logger.warn(`Failed to reconcile settlement for payment ${paymentId}: ${err}`);
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

  private async handleCheckoutSessionExpired(session: Stripe.Checkout.Session, tx: Prisma.TransactionClient = this.prisma) {
    const registrationId = session.metadata?.registrationId;
    const payment = await tx.payment.findFirst({
      where: { stripeCheckoutSessionId: session.id },
    });
    if (payment) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'cancelled' },
      });
    }
    if (registrationId) {
      await tx.eventRegistration.updateMany({
        where: { id: registrationId, paymentStatus: 'unpaid' },
        data: { paymentStatus: 'unpaid' },
      });
    }
    this.logger.log(`Checkout session expired: ${session.id}, registration=${registrationId ?? 'n/a'}`);
    await this.logGatewayEvent({
      gateway: 'stripe',
      eventType: 'checkout.session.expired',
      status: 'success',
      paymentId: payment?.id ?? undefined,
      registrationId,
      eventId: payment?.eventId ?? undefined,
      lessonId: payment?.lessonId ?? undefined,
      communityId: payment?.communityId ?? session.metadata?.communityId,
      userId: payment?.userId ?? undefined,
      payload: { sessionId: session.id },
    });
  }

  private async handleChargeRefunded(charge: Stripe.Charge, tx: Prisma.TransactionClient = this.prisma) {
    const paymentIntentId =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id ?? null;
    const whereClauses: Prisma.PaymentWhereInput[] = [{ stripeChargeId: charge.id }];
    if (paymentIntentId) {
      whereClauses.push({ stripePaymentIntentId: paymentIntentId });
    }

    const payment = await tx.payment.findFirst({
      where: { OR: whereClauses },
    });
    if (!payment) {
      this.logger.warn(`No payment matched refunded charge ${charge.id}`);
      await this.logGatewayEvent({
        gateway: 'stripe',
        eventType: 'charge.refunded',
        status: 'ignored',
        message: `No payment matched charge ${charge.id}`,
        payload: { chargeId: charge.id },
      });
      return;
    }

    const refundedAmount = typeof charge.amount_refunded === 'number' ? charge.amount_refunded : payment.amount;
    await this.syncRefundTotalsFromStripe(payment, refundedAmount, charge.refunds?.data?.[0]?.id, tx);

    await this.createLedgerEntryIfMissing({
      tx,
      businessPaymentId: payment.id,
      businessRegistrationId: payment.registrationId ?? undefined,
      businessLessonId: payment.lessonId ?? undefined,
      businessCommunityId: payment.communityId ?? undefined,
      entryType: 'refund',
      direction: 'refund',
      amount: charge.amount_refunded ?? payment.amount,
      currency: charge.currency ?? 'jpy',
      provider: 'stripe',
      providerObjectType: 'charge',
      providerObjectId: charge.id,
      providerBalanceTxId: (charge.balance_transaction as string) ?? undefined,
      providerAccountId: undefined,
      idempotencyKey: `stripe:charge.refunded:${charge.id}`,
      occurredAt: new Date(),
      metadata: { paymentIntentId },
    });
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
      await this.logGatewayEvent({
        gateway: 'stripe',
        eventType: eventType,
        status: 'ignored',
        message: `No payment matched disputed charge ${chargeId}`,
        payload: { disputeId: dispute.id },
      });
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

  private async handlePaymentIntentFailed(intent: Stripe.PaymentIntent, tx: Prisma.TransactionClient = this.prisma) {
    const paymentIntentId = intent.id;
    const payment = await tx.payment.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
    });
    if (!payment) return;

    await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'failed' },
    });

    if (payment.registrationId) {
      await tx.eventRegistration.update({
        where: { id: payment.registrationId },
        data: { paymentStatus: 'failed', status: 'pending' },
      });
    }
    this.logger.warn(`Payment intent failed: ${paymentIntentId}, payment=${payment.id}`);
    await this.logGatewayEvent({
      gateway: 'stripe',
      eventType: 'payment_intent.payment_failed',
      status: 'failure',
      paymentId: payment.id,
      registrationId: payment.registrationId ?? undefined,
      eventId: payment.eventId ?? undefined,
      lessonId: payment.lessonId ?? undefined,
      communityId: payment.communityId ?? undefined,
      userId: payment.userId,
      payload: { paymentIntentId },
    });
  }

  private async recordRefundTotals(
    paymentId: string,
    params: { refundAmount: number; refundPlatformFee: number; reverseMerchant: number; refundId: string | null },
  ): Promise<string> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    const gross = payment.amount ?? 0;
    const nextRefundedGross = Math.min(gross, (payment.refundedGrossTotal ?? 0) + params.refundAmount);
    const nextRefundedPlatformFee = Math.min(
      payment.platformFee ?? 0,
      (payment.refundedPlatformFeeTotal ?? 0) + params.refundPlatformFee,
    );
    const merchantNet =
      payment.merchantTransferAmount ??
      computeMerchantNet(gross, payment.platformFee ?? 0, payment.stripeFeeAmountActual ?? 0);
    const nextReversedMerchant = Math.min(
      merchantNet,
      (payment.reversedMerchantTotal ?? 0) + params.reverseMerchant,
    );
    const status = nextRefundedGross >= gross ? 'refunded' : 'partial_refunded';

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        refundedGrossTotal: nextRefundedGross,
        refundedPlatformFeeTotal: nextRefundedPlatformFee,
        reversedMerchantTotal: nextReversedMerchant,
        status,
        stripeRefundId: params.refundId ?? payment.stripeRefundId,
      },
    });

    if (payment.registrationId) {
      const remaining = Math.max(gross - nextRefundedGross, 0);
      await this.prisma.eventRegistration.update({
        where: { id: payment.registrationId },
        data: {
          paymentStatus: 'refunded',
          status: 'refunded',
          paidAmount: remaining,
        },
      });
    }

    await this.logGatewayEvent({
      gateway: payment.method ?? 'unknown',
      eventType: 'payment.refunded',
      status: 'success',
      paymentId: payment.id,
      registrationId: payment.registrationId ?? undefined,
      eventId: payment.eventId ?? undefined,
      lessonId: payment.lessonId ?? undefined,
      communityId: payment.communityId ?? undefined,
      userId: payment.userId,
      payload: { refundId: params.refundId, refundAmount: params.refundAmount },
    });
    return status;
  }

  private async syncRefundTotalsFromStripe(
    payment: Payment,
    refundedAmount: number,
    refundId: string | null | undefined,
    tx: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const gross = payment.amount ?? 0;
    const nextRefundedGross = Math.min(gross, Math.max(payment.refundedGrossTotal ?? 0, refundedAmount));
    const status = nextRefundedGross >= gross ? 'refunded' : 'partial_refunded';
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        refundedGrossTotal: nextRefundedGross,
        status,
        stripeRefundId: refundId ?? payment.stripeRefundId,
      },
    });

    if (payment.registrationId) {
      const remaining = Math.max(gross - nextRefundedGross, 0);
      await tx.eventRegistration.update({
        where: { id: payment.registrationId },
        data: {
          paymentStatus: 'refunded',
          status: 'refunded',
          paidAmount: remaining,
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

  private async logGatewayEvent({
    gateway,
    providerEventId,
    providerObjectId,
    providerAccountId,
    eventType,
    status,
    paymentId,
    registrationId,
    eventId,
    lessonId,
    communityId,
    userId,
    message,
    payload,
  }: {
    gateway: string;
    providerEventId?: string | null;
    providerObjectId?: string | null;
    providerAccountId?: string | null;
    eventType: string;
    status: string;
    paymentId?: string | null;
    registrationId?: string | null;
    eventId?: string | null;
    lessonId?: string | null;
    communityId?: string | null;
    userId?: string | null;
    message?: string;
    payload?: any;
  }) {
    try {
      await this.prisma.paymentGatewayEvent.create({
        data: {
          gateway,
          provider: gateway,
          providerEventId: providerEventId ?? undefined,
          providerObjectId: providerObjectId ?? undefined,
          providerAccountId: providerAccountId ?? undefined,
          eventType,
          status,
          paymentId: paymentId ?? undefined,
          registrationId: registrationId ?? undefined,
          eventId: eventId ?? undefined,
          lessonId: lessonId ?? undefined,
          communityId: communityId ?? undefined,
          userId: userId ?? undefined,
          message: message ?? undefined,
          payload: payload ?? undefined,
          payloadHash: payload ? this.hashPayload(payload) : undefined,
          receivedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to log gateway event ${eventType}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async upsertGatewayEvent(event: Stripe.Event) {
    const providerEventId = event.id;
    const payloadHash = this.hashPayload(event);
    const now = new Date();
    return this.prisma.paymentGatewayEvent.upsert({
      where: { provider_providerEventId: { provider: 'stripe', providerEventId } } as any,
      update: { payload: event as any, payloadHash, attempts: { increment: 1 } as any },
      create: {
        gateway: 'stripe',
        provider: 'stripe',
        providerEventId,
        eventType: `webhook.${event.type}`,
        status: 'pending',
        payload: event as any,
        payloadHash,
        receivedAt: now,
      },
    });
  }

  private async createLedgerEntryIfMissing({
    tx,
    businessPaymentId,
    businessRegistrationId,
    businessLessonId,
    businessCommunityId,
    entryType,
    direction,
    amount,
    currency,
    provider,
    providerObjectType,
    providerObjectId,
    providerBalanceTxId,
    providerAccountId,
    idempotencyKey,
    occurredAt,
    metadata,
    logContext,
  }: {
    tx: PrismaService | Prisma.TransactionClient;
    businessPaymentId: string;
    businessRegistrationId?: string;
    businessLessonId?: string;
    businessCommunityId?: string;
    entryType: string;
    direction: string;
    amount: number;
    currency: string;
    provider: string;
    providerObjectType?: string | null;
    providerObjectId?: string | null;
    providerBalanceTxId?: string | null;
    providerAccountId?: string | null;
    idempotencyKey: string;
    occurredAt?: Date;
    metadata?: any;
    logContext?: {
      eventId?: string;
      sessionId?: string;
    };
  }) {
    const missing: string[] = [];
    if (!businessPaymentId) missing.push('businessPaymentId');
    if (!businessCommunityId) missing.push('businessCommunityId');
    if (!entryType) missing.push('entryType');
    if (!direction) missing.push('direction');
    if (!provider) missing.push('provider');
    if (!idempotencyKey) missing.push('idempotencyKey');
    if (amount === null || amount === undefined || Number.isNaN(amount)) missing.push('amount');
    if (!currency) missing.push('currency');
    if (missing.length) {
      this.logger.warn(
        `[ledger] missing fields: ${missing.join(', ')} payment=${businessPaymentId || 'n/a'}`,
      );
      throw new BadRequestException(`ledger missing fields: ${missing.join(', ')}`);
    }
    if (currency.toLowerCase() !== 'jpy') {
      throw new BadRequestException('ledger currency mismatch');
    }
    const existing = await tx.ledgerEntry.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      if (logContext) {
        this.logger.log(
          `[ledger] exists payment=${businessPaymentId} session=${logContext.sessionId ?? 'n/a'} event=${
            logContext.eventId ?? 'n/a'
          }`,
        );
      }
      return existing;
    }
    const created = await tx.ledgerEntry.create({
      data: {
        businessPaymentId,
        businessRegistrationId: businessRegistrationId ?? undefined,
        businessLessonId: businessLessonId ?? undefined,
        businessCommunityId: businessCommunityId ?? undefined,
        entryType,
        direction,
        amount,
        currency,
        provider,
        providerObjectType: providerObjectType ?? undefined,
        providerObjectId: providerObjectId ?? undefined,
        providerBalanceTxId: providerBalanceTxId ?? undefined,
        providerAccountId: providerAccountId ?? undefined,
        idempotencyKey,
        occurredAt: occurredAt ?? new Date(),
        metadata: metadata ?? undefined,
      },
    });
    if (logContext) {
      this.logger.log(
        `[ledger] created payment=${businessPaymentId} session=${logContext.sessionId ?? 'n/a'} event=${
          logContext.eventId ?? 'n/a'
        }`,
      );
    }
    return created;
  }

  private shouldRetryLedgerError(error: unknown) {
    if (error instanceof BadRequestException || error instanceof NotFoundException) return false;
    if (error instanceof Prisma.PrismaClientKnownRequestError) return false;
    if (error instanceof Prisma.PrismaClientValidationError) return false;
    if (error instanceof Prisma.PrismaClientInitializationError) return true;
    if (error instanceof Prisma.PrismaClientRustPanicError) return true;
    const message = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : '';
    const retrySignals = [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'EPIPE',
      'Connection terminated',
      'Connection refused',
      'timeout',
      'timed out',
      'could not connect',
    ];
    if (retrySignals.some((signal) => message.includes(signal))) return true;
    if (/timeout|connection/i.test(name)) return true;
    return false;
  }

  private computeStripeFeeFromBalanceTx(balanceTx: Stripe.BalanceTransaction) {
    const feeDetails = balanceTx.fee_details ?? [];
    if (feeDetails.length) {
      return feeDetails.reduce((sum, detail) => sum + (detail.amount ?? 0), 0);
    }
    return balanceTx.fee ?? 0;
  }


  private hashPayload(payload: any): string {
    try {
      const json = typeof payload === 'string' ? payload : JSON.stringify(payload);
      let hash = 0;
      for (let i = 0; i < json.length; i++) {
        const chr = json.charCodeAt(i);
        hash = (hash << 5) - hash + chr;
        hash |= 0;
      }
      return `${hash}`;
    } catch {
      return '';
    }
  }

  /**
   * Ledger 集計から支払いの事実を算出する（Payment はビジネスビューであり真実ではない）
   */
  async getPaymentSummaryFromLedger(paymentId: string) {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { businessPaymentId: paymentId, status: 'booked' },
    });
    if (!entries.length) {
      return {
        paymentId,
        paidAmount: 0,
        refundedAmount: 0,
        disputedAmount: 0,
        netAmount: 0,
        currency: 'jpy',
        status: 'pending',
        entryCount: 0,
        lastOccurredAt: null,
      };
    }
    const currency = entries[0].currency ?? 'jpy';
    const paidAmount = entries
      .filter((e) => e.entryType === 'charge' && e.direction === 'in')
      .reduce((s, e) => s + e.amount, 0);
    const refundedAmount = entries.filter((e) => e.entryType === 'refund').reduce((s, e) => s + e.amount, 0);
    const disputedAmount = entries.filter((e) => e.entryType === 'dispute').reduce((s, e) => s + e.amount, 0);
    const netAmount = paidAmount - refundedAmount - disputedAmount;
    let status: string = 'paid';
    if (paidAmount === 0 && refundedAmount === 0 && disputedAmount === 0) status = 'pending';
    else if (refundedAmount + disputedAmount >= paidAmount) status = 'refunded';
    else if (refundedAmount + disputedAmount > 0) status = 'partial_refunded';
    const lastOccurredAt = entries.reduce((d, e) => (d > e.occurredAt ? d : e.occurredAt), entries[0].occurredAt);
    return {
      paymentId,
      paidAmount,
      refundedAmount,
      disputedAmount,
      netAmount,
      currency,
      status,
      entryCount: entries.length,
      lastOccurredAt,
    };
  }
}
