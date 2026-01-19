/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-floating-promises, @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents */
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
import { ChargeModel, Prisma, Payment } from '@prisma/client';
import Stripe from 'stripe';
import { buildIdempotencyKey } from './idempotency.util';
import { computeMerchantNet, computeProportionalAmount } from './settlement.utils';
import { getPaymentsConfig } from './payments.config';
import { createHash } from 'node:crypto';
import { resolveStripeEnv } from '../stripe/stripe-config';
import { SettlementService } from './settlement.service';

const MAX_PAYMENT_AMOUNT_JPY = Number(process.env.MAX_PAYMENT_AMOUNT_JPY ?? 100000);
const PAYMENT_PENDING_TIMEOUT_MINUTES = Number(process.env.PAYMENT_PENDING_TIMEOUT_MINUTES ?? 15);
const PAYMENT_PENDING_TIMEOUT_MS =
  Number.isFinite(PAYMENT_PENDING_TIMEOUT_MINUTES) && PAYMENT_PENDING_TIMEOUT_MINUTES > 0
    ? PAYMENT_PENDING_TIMEOUT_MINUTES * 60 * 1000
    : 30 * 60 * 1000;
const PLATFORM_FEE_WAIVED = !['0', 'false', 'off'].includes(
  (process.env.BETA_PLATFORM_FEE_WAIVED ?? '1').toLowerCase(),
);
const WEBHOOK_RETRY_DELAY_MS = Number(process.env.STRIPE_WEBHOOK_RETRY_DELAY_MS ?? 60_000);
const WEBHOOK_PROCESSING_TIMEOUT_MS = Number(process.env.STRIPE_WEBHOOK_PROCESSING_TIMEOUT_MS ?? 5 * 60_000);
const WEBHOOK_ERROR_MESSAGE_MAX_LENGTH = 1000;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly permissions: PermissionsService,
    private readonly notifications: NotificationService,
    private readonly settlementService: SettlementService,
  ) {}

  private async getActiveRuleVersionId(tx: Prisma.TransactionClient = this.prisma) {
    const existing = await tx.settlementRuleVersion.findFirst({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (existing?.id) return existing.id;
    const created = await tx.settlementRuleVersion.create({
      data: { name: 'default', status: 'active' },
      select: { id: true },
    });
    return created.id;
  }

  private async buildSettlementFields(params: {
    event?: { refundDeadlineAt?: Date | null; endTime?: Date | null; eventEndAt?: Date | null; category?: string | null } | null;
    lesson?: { refundDeadlineAt?: Date | null; endAt?: Date | null; eventEndAt?: Date | null } | null;
    eventId?: string | null;
    communityId?: string | null;
    tx?: Prisma.TransactionClient;
  }) {
    const tx = params.tx ?? this.prisma;
    const ruleVersionId = await this.getActiveRuleVersionId(tx);
    const now = new Date();
    const config = getPaymentsConfig();
    const refundDeadlineAt = params.event?.refundDeadlineAt ?? params.lesson?.refundDeadlineAt ?? null;
    const eventEndAt =
      params.event?.eventEndAt ??
      params.event?.endTime ??
      params.lesson?.eventEndAt ??
      params.lesson?.endAt ??
      null;
    const payoutMode = config.settlementPayoutMode;

    if (!refundDeadlineAt && !eventEndAt) {
      return {
        eligibleAt: null,
        payoutMode,
        eligibilityStatus: 'EXCEPTION',
        payoutStatus: 'NOT_SCHEDULED',
        reasonCode: 'missing_event_end',
        ruleVersionId,
      };
    }

    if (refundDeadlineAt) {
      const eligibilityStatus = refundDeadlineAt <= now ? 'ELIGIBLE' : 'PENDING';
      const reasonCode = refundDeadlineAt <= now ? 'refund_deadline_reached' : 'pending_refund_window';
      return {
        eligibleAt: refundDeadlineAt,
        payoutMode,
        eligibilityStatus,
        payoutStatus: 'NOT_SCHEDULED',
        reasonCode,
        ruleVersionId,
      };
    }

    const isR3Allowed =
      config.settlementR3Enabled &&
      ((params.communityId && config.settlementR3WhitelistCommunityIds.includes(params.communityId)) ||
        (params.eventId && config.settlementR3WhitelistEventIds.includes(params.eventId)) ||
        (params.event?.category && config.settlementR3WhitelistEventCategories.includes(params.event.category)));

    if (isR3Allowed && eventEndAt) {
      const eligibilityStatus = eventEndAt <= now ? 'ELIGIBLE' : 'PENDING';
      const reasonCode = eventEndAt <= now ? 'event_end_reached' : 'pending_refund_window';
      return {
        eligibleAt: eventEndAt,
        payoutMode,
        eligibilityStatus,
        payoutStatus: 'NOT_SCHEDULED',
        reasonCode,
        ruleVersionId,
      };
    }

    const delayDays = Math.max(0, config.settlementDelayDays ?? 0);
    const eligibleAt = new Date((eventEndAt as Date).getTime() + delayDays * 24 * 60 * 60 * 1000);
    const eligibilityStatus = eligibleAt <= now ? 'ELIGIBLE' : 'PENDING';
    const reasonCode = eligibleAt <= now ? 'fallback_end_plus_n' : 'pending_refund_window';
    return {
      eligibleAt,
      payoutMode,
      eligibilityStatus,
      payoutStatus: 'NOT_SCHEDULED',
      reasonCode,
      ruleVersionId,
    };
  }

  private async maybeTriggerRealtimePayout(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        payoutMode: true,
        payoutStatus: true,
        eligibilityStatus: true,
        eligibleAt: true,
      },
    });
    if (!payment) return;
    if (payment.payoutMode !== 'REALTIME') return;
    if (payment.payoutStatus === 'PAID_OUT') return;
    if (!payment.eligibleAt || payment.eligibleAt > new Date()) return;
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { eligibilityStatus: 'ELIGIBLE' },
    });
    await this.settlementService.runSettlementBatch({
      periodFrom: new Date(payment.eligibleAt.getTime() - 24 * 60 * 60 * 1000),
      periodTo: new Date(),
      trigger: { type: 'realtime' },
      payoutMode: 'REALTIME',
    });
  }

  private async recordSettlementAudit(params: {
    tx?: Prisma.TransactionClient;
    entityType: string;
    entityId: string;
    operator: string;
    reasonCode?: string | null;
    note?: string | null;
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
    ruleVersionId?: string | null;
  }) {
    const tx = params.tx ?? this.prisma;
    await tx.settlementAuditEvent.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        operator: params.operator,
        reasonCode: params.reasonCode ?? null,
        note: params.note ?? null,
        before: params.before,
        after: params.after,
        ruleVersionId: params.ruleVersionId ?? null,
      },
    });
  }

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

  async expireOverduePendingPayments() {
    if (!PAYMENT_PENDING_TIMEOUT_MS) return;
    const cutoff = new Date(Date.now() - PAYMENT_PENDING_TIMEOUT_MS);
    const candidates = await this.prisma.payment.findMany({
      where: {
        status: 'pending',
        method: 'stripe',
        createdAt: { lt: cutoff },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    if (!candidates.length) return;
    for (const payment of candidates) {
      await this.expirePendingPayment(payment);
    }
    this.logger.log(`Expired ${candidates.length} pending payments`);
  }

  private async expirePendingPayment(payment: Payment) {
    try {
      if (payment.stripeCheckoutSessionId && this.stripeService.enabled) {
        try {
          await this.stripeService.client.checkout.sessions.expire(
            payment.stripeCheckoutSessionId,
            undefined,
            { idempotencyKey: `expire:checkout_session:${payment.stripeCheckoutSessionId}` },
          );
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
          data: { paymentStatus: 'cancelled', status: 'cancelled' },
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
          lesson: {
            select: {
              id: true,
              class: {
                select: {
                  id: true,
                  title: true,
                  locationName: true,
                },
              },
            },
          },
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
        lesson: item.lesson
          ? {
              id: item.lesson.id,
              class: item.lesson.class
                ? {
                    id: item.lesson.class.id,
                    title:
                      typeof item.lesson.class.title === 'string'
                        ? { original: item.lesson.class.title }
                        : item.lesson.class.title,
                    locationName: item.lesson.class.locationName ?? null,
                  }
                : null,
            }
          : null,
        registrationId: item.registrationId ?? null,
        amount: item.amount,
        platformFee: item.platformFee ?? 0,
        feePercent: item.feePercent ?? null,
        status: item.status,
        method: item.method,
        createdAt: item.createdAt,
        eligibleAt: item.eligibleAt ?? null,
        payoutMode: item.payoutMode ?? null,
        eligibilityStatus: item.eligibilityStatus ?? null,
        payoutStatus: item.payoutStatus ?? null,
        reasonCode: item.reasonCode ?? null,
        ruleVersionId: item.ruleVersionId ?? null,
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
        eligibleAt: item.eligibleAt ?? null,
        payoutMode: item.payoutMode ?? null,
        eligibilityStatus: item.eligibilityStatus ?? null,
        payoutStatus: item.payoutStatus ?? null,
        reasonCode: item.reasonCode ?? null,
        ruleVersionId: item.ruleVersionId ?? null,
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

    const now = new Date();
    const paymentsConfig = getPaymentsConfig();
    const chargeModel = paymentsConfig.chargeModel === 'destination_charge' ? 'destination_charge' : 'platform_charge';

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
      status: { in: ['paid', 'partial_refunded'] },
      ...(monthStart ? { createdAt: { gte: monthStart } } : {}),
    };
    const refundedWhere: Prisma.PaymentWhereInput = {
      communityId,
      status: { in: ['refunded', 'partial_refunded'] },
      ...(monthStart ? { createdAt: { gte: monthStart } } : {}),
    };
    const allWhere: Prisma.PaymentWhereInput = {
      communityId,
      status: { in: ['paid', 'partial_refunded', 'refunded'] },
      ...(monthStart ? { createdAt: { gte: monthStart } } : {}),
    };
    const [paidAgg, refundedAgg, allAgg] = await Promise.all([
      this.prisma.payment.aggregate({
        where: paidWhere,
        _sum: { amount: true, platformFee: true },
      }),
      this.prisma.payment.aggregate({
        where: refundedWhere,
        _sum: { refundedGrossTotal: true },
      }),
      this.prisma.payment.aggregate({ where: allWhere, _sum: { amount: true } }),
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

    const [
      hostPayableAllAgg,
      hostPayableReversalAllAgg,
      paidOutAllAgg,
      hostPayablePeriodAgg,
      hostPayableReversalPeriodAgg,
      stripeFeeAgg,
    ] =
      await this.prisma.$transaction([
        this.prisma.ledgerEntry.aggregate({
          where: {
            businessCommunityId: communityId,
            entryType: 'host_payable',
            provider: 'internal',
            occurredAt: { lt: now },
          },
          _sum: { amount: true },
        }),
        this.prisma.ledgerEntry.aggregate({
          where: {
            businessCommunityId: communityId,
            entryType: 'host_payable_reversal',
            provider: 'internal',
            occurredAt: { lt: now },
          },
          _sum: { amount: true },
        }),
        this.prisma.settlementItem.aggregate({
          where: {
            hostId: communityId,
            status: { in: ['completed', 'transferred'] },
          },
          _sum: { settleAmount: true },
        }),
        monthStart
          ? this.prisma.ledgerEntry.aggregate({
              where: {
                businessCommunityId: communityId,
                entryType: 'host_payable',
                provider: 'internal',
                occurredAt: { gte: monthStart, lt: now },
              },
              _sum: { amount: true },
            })
          : this.prisma.ledgerEntry.aggregate({
              where: { id: '__skip__' },
              _sum: { amount: true },
            }),
        monthStart
          ? this.prisma.ledgerEntry.aggregate({
              where: {
                businessCommunityId: communityId,
                entryType: 'host_payable_reversal',
                provider: 'internal',
                occurredAt: { gte: monthStart, lt: now },
              },
              _sum: { amount: true },
            })
          : this.prisma.ledgerEntry.aggregate({
              where: { id: '__skip__' },
              _sum: { amount: true },
            }),
        this.prisma.ledgerEntry.aggregate({
          where: {
            businessCommunityId: communityId,
            entryType: 'stripe_fee_actual',
            provider: 'stripe',
            direction: 'out',
            occurredAt: monthStart ? { gte: monthStart, lt: now } : { lt: now },
          },
          _sum: { amount: true },
        }),
      ]);

    const accruedNetAll =
      (hostPayableAllAgg._sum.amount ?? 0) - (hostPayableReversalAllAgg._sum.amount ?? 0);
    const paidOutAll = paidOutAllAgg._sum.settleAmount ?? 0;
    const hostBalance = accruedNetAll - paidOutAll;
    const settleAmount =
      paymentsConfig.settlementEnabled && this.stripeService.enabled && chargeModel === 'destination_charge'
        ? (hostBalance > 0 ? hostBalance : 0)
        : 0;
    const carryReceivable =
      paymentsConfig.settlementEnabled && this.stripeService.enabled && chargeModel === 'destination_charge'
        ? hostBalance < 0
          ? Math.abs(hostBalance)
          : 0
        : 0;
    const accruedNetPeriod = monthStart
      ? (hostPayablePeriodAgg._sum.amount ?? 0) - (hostPayableReversalPeriodAgg._sum.amount ?? 0)
      : undefined;

    const transactionTotal = allAgg._sum.amount ?? 0;
    const grossPaid = paidAgg._sum.amount ?? 0;
    const platformFee = paidAgg._sum.platformFee ?? 0;
    const refunded = refundedAgg._sum.refundedGrossTotal ?? 0;
    const stripeFee = stripeFeeAgg._sum.amount ?? 0;
    const net = Math.max(0, grossPaid - platformFee - refunded - stripeFee);

    return {
      communityId,
      currency: 'jpy',
      chargeModel,
      transactionTotal,
      grossPaid,
      platformFee,
      stripeFee,
      refunded,
      net,
      stripeBalance,
      settlement: {
        enabled: paymentsConfig.settlementEnabled && this.stripeService.enabled,
        asOf: now.toISOString(),
        accruedNetAll,
        paidOutAll,
        hostBalance,
        settleAmount,
        carryReceivable,
        ...(accruedNetPeriod !== undefined ? { accruedNetPeriod } : {}),
      },
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
                  endTime: true,
                  eventEndAt: true,
                  refundDeadlineAt: true,
                  category: true,
                },
              },
          lesson: {
            select: {
              endAt: true,
              eventEndAt: true,
              refundDeadlineAt: true,
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
      const settlementFields = await this.buildSettlementFields({
        event: registration.event ?? null,
        lesson: registration.lesson ?? null,
        eventId: registration.eventId ?? null,
        communityId: registration.event?.communityId ?? registration.lesson?.class.communityId ?? null,
        tx,
      });

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
          chargeModel: 'platform_charge',
          idempotencyKey: buildIdempotencyKey('mock', 'charge', 'registration', registrationId, amount, 'jpy'),
          eligibleAt: settlementFields.eligibleAt,
          payoutMode: settlementFields.payoutMode,
          eligibilityStatus: settlementFields.eligibilityStatus,
          payoutStatus: settlementFields.payoutStatus,
          reasonCode: settlementFields.reasonCode,
          ruleVersionId: settlementFields.ruleVersionId,
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
      await this.recordSettlementAudit({
        tx,
        entityType: 'payment',
        entityId: payment.id,
        operator: 'system',
        reasonCode: settlementFields.reasonCode,
        note: 'settlement_fields_initialized',
        after: {
          eligibleAt: settlementFields.eligibleAt?.toISOString() ?? null,
          payoutMode: settlementFields.payoutMode,
          eligibilityStatus: settlementFields.eligibilityStatus,
          payoutStatus: settlementFields.payoutStatus,
          reasonCode: settlementFields.reasonCode,
        },
        ruleVersionId: settlementFields.ruleVersionId,
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

    await this.maybeTriggerRealtimePayout(result.payment.id);

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
    if (registration.status === 'cancelled' && registration.paymentStatus !== 'paid') {
      throw new BadRequestException('支払い期限が切れました。再度申込してください。');
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

    const activePending = existingPending;
    if (activePending && this.isPendingPaymentExpired(activePending)) {
      await this.expirePendingPayment(activePending);
      throw new BadRequestException('支払い期限が切れました。再度申込してください。');
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
          await this.maybeTriggerRealtimePayout(activePending.id);
          return { checkoutUrl: this.stripeService.successUrlBase, resume: false };
        }
      } catch (error) {
        this.logger.warn(
          `Failed to resume existing Stripe session ${activePending.stripeCheckoutSessionId} for payment ${activePending.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const config = getPaymentsConfig();
    const chargeModel: ChargeModel = config.chargeModel === 'destination_charge' ? 'destination_charge' : 'platform_charge';

    const planFee = this.resolvePlanFee(community.pricingPlanId);
    const percent = planFee.percent;
    const fixed = planFee.fixed;
    const platformFee = Math.min(amount, Math.round((amount * percent) / 100) + fixed);
    const titleSource = event ? event.title : lesson?.class.title;
    const eventTitle = this.getLocalizedText(titleSource) || 'MORE Class';

    // Stripe requires expires_at >= 30 minutes; honor pending window but clamp to Stripe minimum.
    const expiresInMinutes = PAYMENT_PENDING_TIMEOUT_MINUTES > 0 ? PAYMENT_PENDING_TIMEOUT_MINUTES : 15;
    const expiresAt = Math.floor(Date.now() / 1000) + Math.max(expiresInMinutes, 30) * 60;
    // Prepare local payment first to bind metadata
    const idempotencyKey = buildIdempotencyKey('stripe', 'charge', 'registration', registrationId, amount, 'jpy');
    const settlementFields = await this.buildSettlementFields({
      event,
      lesson,
      eventId: event?.id ?? null,
      communityId: community.id,
    });
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
        chargeModel,
        idempotencyKey,
        providerAccountId: community.stripeAccountId ?? undefined,
        ...settlementFields,
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
        chargeModel,
        idempotencyKey,
        providerAccountId: community.stripeAccountId ?? undefined,
        ...settlementFields,
      },
    });
    await this.recordSettlementAudit({
      entityType: 'payment',
      entityId: payment.id,
      operator: 'system',
      reasonCode: settlementFields.reasonCode,
      note: 'settlement_fields_initialized',
      after: {
        eligibleAt: settlementFields.eligibleAt?.toISOString() ?? null,
        payoutMode: settlementFields.payoutMode,
        eligibilityStatus: settlementFields.eligibilityStatus,
        payoutStatus: settlementFields.payoutStatus,
        reasonCode: settlementFields.reasonCode,
      },
      ruleVersionId: settlementFields.ruleVersionId,
    });
    if (settlementFields.payoutMode === 'REALTIME' && settlementFields.eligibleAt && settlementFields.eligibleAt <= new Date()) {
      await this.maybeTriggerRealtimePayout(payment.id);
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
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
        chargeModel,
      },
      success_url: `${this.stripeService.successUrlBase}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: this.stripeService.cancelUrlBase,
      payment_intent_data: {
        metadata: {
          paymentId: payment.id,
          registrationId,
          communityId: community.id,
          chargeModel,
      },
    },
  };

    const sessionFingerprint = this.buildCheckoutSessionFingerprint(sessionParams);
    const sessionIdempotencyKey = buildIdempotencyKey(
      'stripe',
      'checkout_session',
      'payment',
      payment.id,
      amount,
      'jpy',
      sessionFingerprint,
    );

    if (chargeModel === 'destination_charge') {
      sessionParams.payment_intent_data = {
        ...(sessionParams.payment_intent_data ?? {}),
        application_fee_amount: platformFee,
        transfer_data: {
          destination: community.stripeAccountId,
        },
      };
    }

    const session = await this.stripeService.client.checkout.sessions.create(sessionParams, {
      idempotencyKey: sessionIdempotencyKey,
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
    const webhookSecret = resolveStripeEnv().webhookSecret;
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

    if (typeof event.livemode === 'boolean' && event.livemode !== this.stripeService.isLive) {
      const mode = this.stripeService.isLive ? 'live' : 'test';
      this.logger.warn(
        `Stripe webhook livemode mismatch: expected=${mode} event.livemode=${event.livemode} event=${event.type} id=${event.id}`,
      );
      await this.logGatewayEvent({
        gateway: 'stripe',
        eventType: event.type,
        status: 'ignored',
        message: `livemode_mismatch expected=${mode} event.livemode=${event.livemode}`,
        payload: { eventId: event.id },
      });
      return { received: true, ignored: true };
    }

    const gatewayEvent = await this.upsertGatewayEvent(event);
    try {
      await this.claimAndProcessGatewayEvent(gatewayEvent.id);
    } catch (error) {
      // Durable ACK is already satisfied (gateway event persisted). Never return 500 after this point.
      const errorMessage = this.truncateErrorMessage(error, WEBHOOK_ERROR_MESSAGE_MAX_LENGTH);
      this.logger.error(
        `Stripe webhook processing crashed but acknowledged: gatewayEventId=${gatewayEvent.id} event=${event.type} id=${event.id} error=${errorMessage}`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.writeCrashFallbackForGatewayEvent(gatewayEvent.id, event, errorMessage);
    }

    return { received: true };
  }

  private async claimAndProcessGatewayEvent(gatewayEventId: string) {
    const now = new Date();
    const timeoutAt = new Date(now.getTime() - (Number.isFinite(WEBHOOK_PROCESSING_TIMEOUT_MS) ? WEBHOOK_PROCESSING_TIMEOUT_MS : 300_000));
    const retryDelayMs = Number.isFinite(WEBHOOK_RETRY_DELAY_MS) ? WEBHOOK_RETRY_DELAY_MS : 60_000;
    const claimed = await this.prisma.paymentGatewayEvent.updateMany({
      where: {
        id: gatewayEventId,
        processedAt: null,
        AND: [
          { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
          {
            OR: [
              { status: { in: ['received', 'failed'] } },
              { status: 'processing', updatedAt: { lt: timeoutAt } },
            ],
          },
        ],
      } as any,
      data: {
        status: 'processing',
        attempts: { increment: 1 } as any,
      },
    });

    if (claimed.count !== 1) return { received: true };

    try {
      const { event, ignored, postProcessTasks } = await this.prisma.$transaction(async (tx) => {
        const result = await this.processGatewayEventById(gatewayEventId, tx);
        const status = result.ignored ? 'ignored' : 'processed';
        await tx.paymentGatewayEvent.update({
          where: { id: gatewayEventId },
          data: { status, processedAt: new Date(), errorMessage: null, nextAttemptAt: null },
        });
        return {
          event: result.event,
          ignored: result.ignored,
          postProcessTasks: result.postProcessTasks ?? [],
        };
      });

      if (postProcessTasks.length) {
        await Promise.all(postProcessTasks.map((task) => task()));
      }

      this.notifyStripeWebhookSideEffects(event);
      return { received: true };
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.prisma.paymentGatewayEvent.update({
        where: { id: gatewayEventId },
        data: {
          status: 'failed',
          errorMessage,
          nextAttemptAt: new Date(Date.now() + retryDelayMs),
        },
      });
      this.logger.error(
        `Stripe webhook processing failed but acknowledged: gatewayEventId=${gatewayEventId} error=${errorMessage}`,
      );
      return { received: true };
    }
  }

  private async processGatewayEventById(
    gatewayEventId: string,
    tx: Prisma.TransactionClient,
  ): Promise<{ event: Stripe.Event; ignored: boolean; postProcessTasks: Array<() => Promise<void>> }> {
    const gatewayEvent = await tx.paymentGatewayEvent.findUnique({
      where: { id: gatewayEventId },
      select: { payload: true },
    });
    if (!gatewayEvent?.payload) {
      throw new Error('gateway_event_payload_missing');
    }
    const event = gatewayEvent.payload as any;
    if (!event || typeof event.type !== 'string' || typeof event.id !== 'string') {
      throw new Error('gateway_event_payload_invalid');
    }
    const stripeEvent = event as Stripe.Event;

    const postProcessTasks: Array<() => Promise<void>> = [];
    switch (stripeEvent.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const handlerResult = await this.handleCheckoutSessionCompleted(
          stripeEvent.data.object,
          tx,
          stripeEvent.id,
        );
        postProcessTasks.push(...handlerResult.postProcessTasks);
        break;
      }
      case 'checkout.session.async_payment_failed':
        await this.handleCheckoutSessionAsyncPaymentFailed(stripeEvent.data.object, tx);
        break;
      case 'payment_intent.succeeded': {
        const intent = stripeEvent.data.object as Stripe.PaymentIntent;
        const paymentId = (intent.metadata && (intent.metadata as any).paymentId) as string | undefined;
        const payment =
          (paymentId ? await tx.payment.findUnique({ where: { id: paymentId } }) : null) ??
          (await tx.payment.findFirst({ where: { stripePaymentIntentId: intent.id } }));
        if (!payment) {
          const message = `Stripe PI succeeded but no payment matched: paymentId=${paymentId ?? 'n/a'}, intent=${intent.id}`;
          if (!paymentId) {
            this.logger.warn(message);
            break;
          }
          throw new Error(message);
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
        postProcessTasks.push(() => this.reconcilePaymentSettlement(payment.id, intent.id));
        postProcessTasks.push(() => this.maybeTriggerRealtimePayout(payment.id));
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
        await this.handleCheckoutSessionExpired(stripeEvent.data.object, tx);
        break;
      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(stripeEvent.data.object);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(stripeEvent.data.object);
        break;
      case 'charge.dispute.created':
      case 'charge.dispute.closed':
        await this.handleChargeDispute(stripeEvent.type, stripeEvent.data.object);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentIntentFailed(stripeEvent.data.object, tx);
        break;
      case 'customer.subscription.deleted':
      case 'customer.subscription.updated':
        await this.handleSubscriptionLifecycle(stripeEvent.data.object);
        break;
      case 'charge.refunded':
        await this.handleChargeRefunded(stripeEvent.data.object, tx);
        break;
      default:
        this.logger.debug(`Unhandled Stripe event: ${stripeEvent.type}`);
        return { event: stripeEvent, ignored: true, postProcessTasks: [] };
    }

    return { event: stripeEvent, ignored: false, postProcessTasks };
  }

  private notifyStripeWebhookSideEffects(event: Stripe.Event) {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session;
      const registrationId = session.metadata?.registrationId;
      if (registrationId) {
        void this.notifications.notifyRegistrationSuccess(registrationId).catch((error) => {
          this.logger.warn(
            `Failed to notify Stripe payment success: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      }
      return;
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
  }

  async retryOverdueStripeWebhookEvents(limit: number = 10) {
    const now = new Date();
    const take = Math.min(50, Math.max(1, Number(limit) || 10));
    const due = await this.prisma.paymentGatewayEvent.findMany({
      where: {
        provider: 'stripe',
        providerEventId: { not: null },
        processedAt: null,
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      } as any,
      orderBy: { nextAttemptAt: 'asc' },
      take,
      select: { id: true },
    });

    if (!due.length) return { retried: 0 };

    let retried = 0;
    for (const gatewayEvent of due) {
      await this.claimAndProcessGatewayEvent(gatewayEvent.id);
      retried += 1;
    }

    return { retried };
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

    await this.reconcilePaymentSettlement(payment.id, paymentIntentId, { suppressErrors: true });
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

    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: paymentIntentId,
      amount: refundAmount,
      metadata: {
        paymentId: payment.id,
        eventId: payment.eventId,
        lessonId: payment.lessonId,
        requestedBy: userId,
        reason: reason ?? '',
      },
    };

    // Legacy rollback path only: destination charge needs reverse/fee refund behavior.
    if (refreshed.chargeModel === 'destination_charge') {
      (refundParams as any).refund_application_fee = true;
      (refundParams as any).reverse_transfer = reverseMerchant > 0;
    }

    const refund = await this.stripeService.client.refunds.create(refundParams, {
      idempotencyKey: `refund:${payment.id}:${refundAmount}:${refreshed.refundedGrossTotal ?? 0}`,
    });

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

    // v1 baseline: platform charge refunds do not touch connected account balance.
    // Record internal journal entries for reconciliation and settlement reporting.
    if (refreshed.chargeModel === 'platform_charge') {
      if (refundPlatformFee > 0) {
        await this.createLedgerEntryIfMissing({
          tx: this.prisma,
          businessPaymentId: payment.id,
          businessRegistrationId: payment.registrationId ?? undefined,
          businessLessonId: payment.lessonId ?? undefined,
          businessCommunityId: payment.communityId ?? undefined,
          entryType: 'platform_fee_reversal',
          direction: 'out',
          amount: refundPlatformFee,
          currency: payment.currency ?? 'jpy',
          provider: 'internal',
          providerObjectType: 'refund',
          providerObjectId: refund.id,
          idempotencyKey: `ledger:platform_fee_reversal:${refund.id}`,
          occurredAt: new Date(),
          metadata: { paymentId: payment.id, refundId: refund.id },
        });
      }

      if (reverseMerchant > 0) {
        await this.createLedgerEntryIfMissing({
          tx: this.prisma,
          businessPaymentId: payment.id,
          businessRegistrationId: payment.registrationId ?? undefined,
          businessLessonId: payment.lessonId ?? undefined,
          businessCommunityId: payment.communityId ?? undefined,
          entryType: 'host_payable_reversal',
          direction: 'in',
          amount: reverseMerchant,
          currency: payment.currency ?? 'jpy',
          provider: 'internal',
          providerObjectType: 'refund',
          providerObjectId: refund.id,
          idempotencyKey: `ledger:host_payable_reversal:${refund.id}`,
          occurredAt: new Date(),
          metadata: { paymentId: payment.id, refundId: refund.id },
        });
      }

      const refundFeeLoss = computeProportionalAmount(stripeFee, refundAmount, gross);
      if (refundFeeLoss > 0) {
        await this.createLedgerEntryIfMissing({
          tx: this.prisma,
          businessPaymentId: payment.id,
          businessRegistrationId: payment.registrationId ?? undefined,
          businessLessonId: payment.lessonId ?? undefined,
          businessCommunityId: payment.communityId ?? undefined,
          entryType: 'refund_fee_loss_platform',
          direction: 'out',
          amount: refundFeeLoss,
          currency: payment.currency ?? 'jpy',
          provider: 'internal',
          providerObjectType: 'refund',
          providerObjectId: refund.id,
          idempotencyKey: `ledger:refund_fee_loss_platform:${refund.id}`,
          occurredAt: new Date(),
          metadata: { paymentId: payment.id, refundId: refund.id, stripeFee, refundAmount, gross },
        });
      }
    }

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
  ): Promise<{ postProcessTasks: Array<() => Promise<void>> }> {
    const registrationId = session.metadata?.registrationId;
    const paymentId = session.metadata?.paymentId;
    const whereClauses: Prisma.PaymentWhereInput[] = [{ stripeCheckoutSessionId: session.id }];
    if (paymentId) {
      whereClauses.push({ id: paymentId });
    }
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
        return { postProcessTasks: [] };
      }
      const message = `No payment found for checkout session ${session.id} paymentId=${paymentId ?? 'n/a'}`;
      if (paymentId) {
        throw new Error(message);
      }
      this.logger.warn(message);
      await this.logGatewayEvent({
        gateway: 'stripe',
        eventType: 'checkout.session.completed',
        status: 'ignored',
        registrationId,
        communityId: session.metadata?.communityId,
        message,
        payload: { sessionId: session.id },
      });
      return { postProcessTasks: [] };
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id ?? null;
    const paymentStatus = session.payment_status;
    if (
      session.mode === 'payment' &&
      paymentStatus &&
      !['paid', 'no_payment_required'].includes(paymentStatus)
    ) {
      let intentStatus: Stripe.PaymentIntent.Status | null = null;
      if (paymentIntentId) {
        try {
          const intent = await this.withStripeRetry(() =>
            this.stripeService.client.paymentIntents.retrieve(paymentIntentId),
          );
          intentStatus = intent.status ?? null;
        } catch (error) {
          this.logger.warn(
            `Failed to retrieve payment intent ${paymentIntentId} for session ${session.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      if (intentStatus === 'succeeded') {
        this.logger.log(
          `Checkout session completed with unpaid status but intent succeeded: session=${session.id} intent=${paymentIntentId}`,
        );
      } else if (intentStatus === 'canceled' || intentStatus === 'requires_payment_method') {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'failed', stripePaymentIntentId: paymentIntentId ?? payment.stripePaymentIntentId },
        });
        if (payment.registrationId) {
          await tx.eventRegistration.update({
            where: { id: payment.registrationId },
            data: { paymentStatus: 'failed', status: 'pending' },
          });
        }
        const message = `Checkout session unpaid and intent failed: session=${session.id} intent=${paymentIntentId ?? 'n/a'} intent_status=${intentStatus ?? 'unknown'}`;
        this.logger.warn(message);
        await this.logGatewayEvent({
          gateway: 'stripe',
          eventType: 'checkout.session.completed',
          status: 'failure',
          paymentId: payment.id,
          registrationId: payment.registrationId ?? undefined,
          communityId: payment.communityId ?? undefined,
          userId: payment.userId ?? undefined,
          message,
          payload: { sessionId: session.id, paymentStatus, intentStatus },
        });
        return { postProcessTasks: [] };
      } else if (intentStatus) {
        const message = `Checkout session not paid: session=${session.id} payment_status=${paymentStatus} intent_status=${intentStatus}`;
        this.logger.warn(message);
        await this.logGatewayEvent({
          gateway: 'stripe',
          eventType: 'checkout.session.completed',
          status: 'ignored',
          paymentId: payment.id,
          registrationId: payment.registrationId ?? undefined,
          communityId: payment.communityId ?? undefined,
          userId: payment.userId ?? undefined,
          message,
          payload: { sessionId: session.id, paymentStatus, intentStatus },
        });
        return { postProcessTasks: [] };
      } else if (!intentStatus) {
        const message = `Checkout session not paid: session=${session.id} payment_status=${paymentStatus} intent_status=unknown`;
        this.logger.warn(message);
        await this.logGatewayEvent({
          gateway: 'stripe',
          eventType: 'checkout.session.completed',
          status: 'ignored',
          paymentId: payment.id,
          registrationId: payment.registrationId ?? undefined,
          communityId: payment.communityId ?? undefined,
          userId: payment.userId ?? undefined,
          message,
          payload: { sessionId: session.id, paymentStatus },
        });
        return { postProcessTasks: [] };
      }
    }

    if (['refunded', 'partial_refunded', 'disputed'].includes(payment.status)) {
      this.logger.warn(
        `Skip setting paid because payment ${payment.id} already in terminal status ${payment.status}`,
      );
      return { postProcessTasks: [] };
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'paid',
        stripePaymentIntentId: paymentIntentId ?? payment.stripePaymentIntentId,
        stripeCheckoutSessionId: session.id,
        lessonId: payment.lessonId ?? session.metadata?.lessonId,
      },
    });

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

    const postProcessTasks: Array<() => Promise<void>> = [];
    if (paymentIntentId) {
      postProcessTasks.push(() => this.reconcilePaymentSettlement(payment.id, paymentIntentId));
    }

    postProcessTasks.push(async () => {
      try {
        await this.createLedgerEntryIfMissing({
          tx: this.prisma,
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
    });

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

    postProcessTasks.push(() => this.maybeTriggerRealtimePayout(payment.id));

    return { postProcessTasks };
  }

  private async handleCheckoutSessionAsyncPaymentFailed(
    session: Stripe.Checkout.Session,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const registrationId = session.metadata?.registrationId;
    const paymentId = session.metadata?.paymentId;
    const whereClauses: Prisma.PaymentWhereInput[] = [{ stripeCheckoutSessionId: session.id }];
    if (paymentId) {
      whereClauses.push({ id: paymentId });
    }
    if (registrationId) {
      whereClauses.push({ registrationId });
    }
    const payment = await tx.payment.findFirst({
      where: { OR: whereClauses },
    });
    if (!payment) {
      const message = `No payment found for async payment failed session ${session.id}`;
      this.logger.warn(message);
      await this.logGatewayEvent({
        gateway: 'stripe',
        eventType: 'checkout.session.async_payment_failed',
        status: 'ignored',
        registrationId,
        communityId: session.metadata?.communityId,
        message,
        payload: { sessionId: session.id },
      });
      return;
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'failed', stripeCheckoutSessionId: session.id },
    });
    if (payment.registrationId) {
      await tx.eventRegistration.update({
        where: { id: payment.registrationId },
        data: { paymentStatus: 'failed', status: 'pending' },
      });
    }
    this.logger.warn(`Checkout session async payment failed: ${session.id}, payment=${payment.id}`);
    await this.logGatewayEvent({
      gateway: 'stripe',
      eventType: 'checkout.session.async_payment_failed',
      status: 'failure',
      paymentId: payment.id,
      registrationId: payment.registrationId ?? undefined,
      eventId: payment.eventId ?? undefined,
      lessonId: payment.lessonId ?? undefined,
      communityId: payment.communityId ?? undefined,
      userId: payment.userId,
      payload: { sessionId: session.id },
    });
  }

  private async reconcilePaymentSettlement(
    paymentId: string,
    paymentIntentId: string,
    options?: { suppressErrors?: boolean },
  ) {
    try {
      const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
      if (!payment || payment.method !== 'stripe') return;

      const chargeModel: ChargeModel =
        payment.chargeModel === 'destination_charge' ? 'destination_charge' : 'platform_charge';
      const maxBalanceAttempts = 3;
      let intent: Stripe.PaymentIntent | null = null;
      let latestCharge: Stripe.Charge | null = null;
      let chargeId: string | null = null;
      let balanceTx: Stripe.BalanceTransaction | null = null;
      for (let attempt = 1; attempt <= maxBalanceAttempts; attempt += 1) {
        intent = await this.withStripeRetry(() =>
          this.stripeService.client.paymentIntents.retrieve(paymentIntentId, {
            expand:
              chargeModel === 'destination_charge'
                ? ['latest_charge.balance_transaction', 'latest_charge.transfer']
                : ['latest_charge.balance_transaction'],
          }),
        );
        latestCharge =
          typeof intent.latest_charge === 'string' ? null : intent.latest_charge ?? null;
        chargeId =
          typeof intent.latest_charge === 'string'
            ? intent.latest_charge
            : intent.latest_charge?.id ?? null;
        if (!chargeId) break;
        balanceTx = await this.resolveBalanceTransaction(latestCharge, chargeId);
        if (balanceTx) {
          break;
        }
        if (attempt < maxBalanceAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        }
      }
      if (!chargeId) return;
      if (!balanceTx) {
        throw new Error(`stripe_balance_tx_missing payment=${paymentId} charge=${chargeId}`);
      }
      const stripeFee = balanceTx ? this.computeStripeFeeFromBalanceTx(balanceTx) : 0;
      const gross = payment.amount ?? 0;
      const platformFee = payment.platformFee ?? 0;
      const merchantNet = computeMerchantNet(gross, platformFee, stripeFee);

      const updateData: Prisma.PaymentUpdateInput = {
        stripePaymentIntentId: paymentIntentId,
        stripeChargeId: chargeId,
        stripeFeeAmountActual: stripeFee,
        merchantTransferAmount: merchantNet,
        providerBalanceTxId: balanceTx?.id ?? payment.providerBalanceTxId ?? undefined,
      };

      let transferId: string | null = null;
      if (chargeModel === 'destination_charge') {
        transferId =
          typeof latestCharge?.transfer === 'string'
            ? latestCharge.transfer
            : (latestCharge?.transfer as Stripe.Transfer | null)?.id ?? null;
        updateData.stripeTransferId = transferId ?? undefined;
      }

      await this.prisma.payment.update({
        where: { id: paymentId },
        data: updateData,
      });

      if (chargeModel === 'platform_charge') {
        if (balanceTx && stripeFee > 0) {
          await this.createLedgerEntryIfMissing({
            tx: this.prisma,
            businessPaymentId: paymentId,
            businessRegistrationId: payment.registrationId ?? undefined,
            businessLessonId: payment.lessonId ?? undefined,
            businessCommunityId: payment.communityId ?? undefined,
            entryType: 'stripe_fee_actual',
            direction: 'out',
            amount: stripeFee,
            currency: payment.currency ?? 'jpy',
            provider: 'stripe',
            providerObjectType: 'balance_transaction',
            providerObjectId: balanceTx.id,
            providerBalanceTxId: balanceTx.id,
            idempotencyKey: `stripe:balance_tx.fee:${balanceTx.id}`,
            occurredAt: new Date(),
            metadata: { paymentIntentId, chargeId },
          });
        }

        if (platformFee > 0) {
          await this.createLedgerEntryIfMissing({
            tx: this.prisma,
            businessPaymentId: paymentId,
            businessRegistrationId: payment.registrationId ?? undefined,
            businessLessonId: payment.lessonId ?? undefined,
            businessCommunityId: payment.communityId ?? undefined,
            entryType: 'platform_fee',
            direction: 'in',
            amount: platformFee,
            currency: payment.currency ?? 'jpy',
            provider: 'internal',
            providerObjectType: 'payment',
            providerObjectId: paymentId,
            idempotencyKey: `ledger:platform_fee:${paymentId}`,
            occurredAt: new Date(),
            metadata: { paymentIntentId, chargeId, chargeModel },
          });
        }

        if (merchantNet > 0) {
          await this.createLedgerEntryIfMissing({
            tx: this.prisma,
            businessPaymentId: paymentId,
            businessRegistrationId: payment.registrationId ?? undefined,
            businessLessonId: payment.lessonId ?? undefined,
            businessCommunityId: payment.communityId ?? undefined,
            entryType: 'host_payable',
            direction: 'out',
            amount: merchantNet,
            currency: payment.currency ?? 'jpy',
            provider: 'internal',
            providerObjectType: 'payment',
            providerObjectId: paymentId,
            idempotencyKey: `ledger:host_payable:${paymentId}`,
            occurredAt: new Date(),
            metadata: { paymentIntentId, chargeId, gross, platformFee, stripeFee },
          });
        }

        return;
      }

      // Legacy destination-charge accounting (rollback only)
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
      if (!options?.suppressErrors) {
        throw err;
      }
    }
  }

  private async withStripeRetry<T>(fn: () => Promise<T>, maxAttempts: number = 3) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (!this.shouldRetryStripeError(error) || attempt === maxAttempts) break;
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
    throw lastError;
  }

  private shouldRetryStripeError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : '';
    const retrySignals = [
      'StripeConnectionError',
      'APIConnectionError',
      'rate limit',
      '429',
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'EPIPE',
      'timeout',
      'timed out',
    ];
    if (retrySignals.some((signal) => message.includes(signal))) return true;
    if (/timeout|connection/i.test(name)) return true;
    return false;
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
      const message = `No payment matched refunded charge ${charge.id} payment_intent=${paymentIntentId ?? 'n/a'}`;
      if (!paymentIntentId) {
        this.logger.warn(message);
        await this.logGatewayEvent({
          gateway: 'stripe',
          eventType: 'charge.refunded',
          status: 'ignored',
          message,
          payload: { chargeId: charge.id },
        });
        return;
      }
      throw new Error(message);
    }

    const refundedAmount = typeof charge.amount_refunded === 'number' ? charge.amount_refunded : payment.amount;
    const refunds = charge.refunds?.data ?? [];
    const latestRefundId = refunds[0]?.id ?? null;
    await this.syncRefundTotalsFromStripe(payment, refundedAmount, latestRefundId, tx);

    for (const refund of refunds) {
      if (!refund?.id) continue;
      await this.createLedgerEntryIfMissing({
        tx,
        businessPaymentId: payment.id,
        businessRegistrationId: payment.registrationId ?? undefined,
        businessLessonId: payment.lessonId ?? undefined,
        businessCommunityId: payment.communityId ?? undefined,
        entryType: 'refund',
        direction: 'refund',
        amount: refund.amount ?? 0,
        currency: refund.currency ?? charge.currency ?? 'jpy',
        provider: 'stripe',
        providerObjectType: 'refund',
        providerObjectId: refund.id,
        providerBalanceTxId:
          typeof refund.balance_transaction === 'string' ? refund.balance_transaction : undefined,
        providerAccountId: undefined,
        idempotencyKey: `stripe:refund:${refund.id}`,
        occurredAt: new Date(),
        metadata: { paymentIntentId, chargeId: charge.id },
      });
    }
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
        data: {
          status: 'disputed',
          stripeDisputeId: dispute.id,
          stripeDisputeStatus: dispute.status,
          stripeDisputedAt: new Date(),
          stripeDisputeResolvedAt: null,
        },
      });
      this.logger.warn(`Payment ${payment.id} marked disputed (charge=${chargeId})`);
    } else if (eventType === 'charge.dispute.closed') {
      const won = dispute.status === 'won';
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: won ? 'paid' : 'refunded',
          stripeDisputeStatus: dispute.status,
          stripeDisputeResolvedAt: new Date(),
        },
      });
      if (!won) {
        try {
          const [payableAgg, reversalAgg] = await this.prisma.$transaction([
            this.prisma.ledgerEntry.aggregate({
              where: {
                businessPaymentId: payment.id,
                entryType: 'host_payable',
                provider: 'internal',
              },
              _sum: { amount: true },
            }),
            this.prisma.ledgerEntry.aggregate({
              where: {
                businessPaymentId: payment.id,
                entryType: 'host_payable_reversal',
                provider: 'internal',
              },
              _sum: { amount: true },
            }),
          ]);
          const remainingPayable = Math.max(0, (payableAgg._sum.amount ?? 0) - (reversalAgg._sum.amount ?? 0));
          if (remainingPayable > 0) {
            await this.createLedgerEntryIfMissing({
              tx: this.prisma,
              businessPaymentId: payment.id,
              businessRegistrationId: payment.registrationId ?? undefined,
              businessLessonId: payment.lessonId ?? undefined,
              businessCommunityId: payment.communityId ?? undefined,
              entryType: 'host_payable_reversal',
              direction: 'in',
              amount: remainingPayable,
              currency: payment.currency ?? 'jpy',
              provider: 'internal',
              providerObjectType: 'dispute',
              providerObjectId: dispute.id,
              idempotencyKey: `ledger:host_payable_reversal:dispute:${dispute.id}`,
              occurredAt: new Date(),
              metadata: { paymentId: payment.id, disputeId: dispute.id, chargeId },
            });
          }
        } catch (error) {
          this.logger.warn(
            `Failed to record host_payable_reversal for dispute loss (payment=${payment.id} dispute=${dispute.id}): ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
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
        reasonCode: payment.payoutStatus === 'PAID_OUT' ? 'post_payout_refund' : payment.reasonCode,
      },
    });
    await this.recordSettlementAudit({
      entityType: 'payment',
      entityId: paymentId,
      operator: 'system',
      reasonCode: payment.payoutStatus === 'PAID_OUT' ? 'post_payout_refund' : payment.reasonCode ?? undefined,
      note: 'payment_refund_recorded',
      after: {
        status,
        refundedGrossTotal: nextRefundedGross,
        refundedPlatformFeeTotal: nextRefundedPlatformFee,
        reversedMerchantTotal: nextReversedMerchant,
        reasonCode: payment.payoutStatus === 'PAID_OUT' ? 'post_payout_refund' : payment.reasonCode ?? null,
      },
      ruleVersionId: payment.ruleVersionId ?? null,
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

  private normalizeLedgerStatus(status: string) {
    switch (status) {
      case 'paid':
      case 'refunded':
      case 'partial_refunded':
      case 'pending':
        return status;
      default:
        return status || 'pending';
    }
  }

  private normalizePaymentStatus(status: string) {
    if (['refunded', 'partial_refunded', 'paid', 'pending', 'failed', 'cancelled', 'disputed'].includes(status)) {
      return status;
    }
    return status || 'pending';
  }

  private mapRegistrationStatus(paymentStatus: string) {
    if (paymentStatus === 'paid') return { paymentStatus: 'paid', status: 'paid' };
    if (paymentStatus === 'refunded' || paymentStatus === 'partial_refunded') {
      return { paymentStatus: 'refunded', status: 'refunded' };
    }
    if (paymentStatus === 'failed') return { paymentStatus: 'failed', status: 'pending' };
    if (paymentStatus === 'cancelled') return { paymentStatus: 'cancelled', status: 'cancelled' };
    return { paymentStatus: 'unpaid', status: 'pending' };
  }

  private getConsistencyIssues(
    payment: Payment & { registration?: { id: string; paymentStatus: string | null; status: string | null } | null },
    ledger: Awaited<ReturnType<PaymentsService['getPaymentSummaryFromLedger']>>,
  ) {
    const issues: Array<{ code: string; message: string }> = [];
    const normalizedPaymentStatus = this.normalizePaymentStatus(payment.status);
    const normalizedLedgerStatus = this.normalizeLedgerStatus(ledger.status);
    const graceMs = 10 * 60 * 1000;
    const isOldEnough = Date.now() - payment.updatedAt.getTime() > graceMs;

    if (ledger.entryCount === 0 && normalizedPaymentStatus !== 'pending') {
      issues.push({
        code: 'ledger_missing',
        message: '支払いは進行しているが台帳記録がありません',
      });
    }

    if (normalizedLedgerStatus !== 'pending' && normalizedLedgerStatus !== normalizedPaymentStatus) {
      issues.push({
        code: 'status_mismatch',
        message: `台帳(${normalizedLedgerStatus})と支払い状態(${normalizedPaymentStatus})が不一致です`,
      });
    }

    if (normalizedPaymentStatus === 'paid' && !payment.stripeChargeId && payment.method === 'stripe') {
      issues.push({
        code: 'missing_charge',
        message: 'Stripe 決済に対して charge ID が未保存です',
      });
    }

    if (
      normalizedPaymentStatus === 'paid' &&
      payment.method === 'stripe' &&
      payment.chargeModel === 'destination_charge' &&
      payment.providerAccountId &&
      !payment.stripeTransferId &&
      isOldEnough
    ) {
      issues.push({
        code: 'missing_transfer',
        message: 'Stripe transfer が未作成または未保存です',
      });
    }

    if (normalizedPaymentStatus === 'refunded' && payment.refundedGrossTotal < (payment.amount ?? 0)) {
      issues.push({
        code: 'refund_amount_short',
        message: '返金済みなのに返金合計が不足しています',
      });
    }

    if (normalizedPaymentStatus === 'paid' && payment.refundedGrossTotal > 0) {
      issues.push({
        code: 'refund_status_mismatch',
        message: '返金合計があるのに支払い状態が paid のままです',
      });
    }

    if (payment.registration && payment.registrationId) {
      const expected = this.mapRegistrationStatus(normalizedPaymentStatus);
      const regPaymentStatus = payment.registration.paymentStatus ?? '';
      if (expected.paymentStatus !== regPaymentStatus) {
        issues.push({
          code: 'registration_status_mismatch',
          message: `参加状態(${regPaymentStatus})が支払い状態(${normalizedPaymentStatus})と不一致です`,
        });
      }
    }

    if (payment.refundedGrossTotal > (payment.amount ?? 0)) {
      issues.push({
        code: 'refund_exceeds_amount',
        message: '返金合計が決済金額を超えています',
      });
    }

    return { issues, normalizedPaymentStatus, normalizedLedgerStatus };
  }

  async scanPaymentInconsistencies(params?: { sinceDays?: number; limit?: number }) {
    const sinceDays = Math.max(1, Math.min(90, Number(params?.sinceDays ?? 30)));
    const limit = Math.max(1, Math.min(200, Number(params?.limit ?? 50)));
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    const payments = await this.prisma.payment.findMany({
      where: { updatedAt: { gte: since } },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: {
        registration: { select: { id: true, paymentStatus: true, status: true } },
      },
    });
    const results: Array<{
      paymentId: string;
      registrationId?: string | null;
      status: string;
      ledgerStatus: string;
      issues: Array<{ code: string; message: string }>;
    }> = [];
    for (const payment of payments) {
      const ledger = await this.getPaymentSummaryFromLedger(payment.id);
      const { issues, normalizedPaymentStatus, normalizedLedgerStatus } = this.getConsistencyIssues(payment, ledger);
      if (!issues.length) continue;
      results.push({
        paymentId: payment.id,
        registrationId: payment.registrationId,
        status: normalizedPaymentStatus,
        ledgerStatus: normalizedLedgerStatus,
        issues,
      });
    }
    return {
      checked: payments.length,
      issues: results.length,
      items: results,
    };
  }

  async reconcilePaymentInconsistencies(params?: { sinceDays?: number; limit?: number; dryRun?: boolean }) {
    const dryRun = params?.dryRun !== false;
    const scan = await this.scanPaymentInconsistencies(params);
    if (dryRun || scan.items.length === 0) {
      return { ...scan, reconciled: 0, dryRun };
    }
    let reconciled = 0;
    for (const item of scan.items) {
      const payment = await this.prisma.payment.findUnique({
        where: { id: item.paymentId },
        include: { registration: { select: { id: true } } },
      });
      if (!payment) continue;
      const ledger = await this.getPaymentSummaryFromLedger(payment.id);
      if (ledger.entryCount === 0) {
        continue;
      }
      const expectedStatus = this.normalizeLedgerStatus(ledger.status);
      const updateData: Prisma.PaymentUpdateInput = {};
      if (expectedStatus && expectedStatus !== payment.status) {
        updateData.status = expectedStatus;
      }
      if (ledger.refundedAmount > (payment.refundedGrossTotal ?? 0)) {
        updateData.refundedGrossTotal = ledger.refundedAmount;
      }
      if (Object.keys(updateData).length === 0) continue;
      await this.prisma.payment.update({ where: { id: payment.id }, data: updateData });
      if (payment.registrationId) {
        const mapped = this.mapRegistrationStatus(expectedStatus);
        await this.prisma.eventRegistration.update({
          where: { id: payment.registrationId },
          data: { paymentStatus: mapped.paymentStatus, status: mapped.status },
        });
      }
      await this.logGatewayEvent({
        gateway: payment.method ?? 'unknown',
        eventType: 'consistency.reconciled',
        status: 'success',
        paymentId: payment.id,
        registrationId: payment.registrationId ?? undefined,
        eventId: payment.eventId ?? undefined,
        lessonId: payment.lessonId ?? undefined,
        communityId: payment.communityId ?? undefined,
        userId: payment.userId,
        payload: { expectedStatus, ledgerStatus: ledger.status, refundedAmount: ledger.refundedAmount },
      });
      reconciled += 1;
    }
    return { ...scan, reconciled, dryRun };
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

    const settlementFields = await this.buildSettlementFields({ event: null, lesson: null, communityId });
    const payment = await this.prisma.payment.create({
      data: {
        userId: ownerId,
        communityId,
        amount,
        platformFee: 0,
        currency,
        status: 'paid',
        method: 'stripe',
        chargeModel: 'platform_charge',
        stripeChargeId: chargeId,
        metadata: { planId, invoiceId: invoice.id },
        eligibleAt: settlementFields.eligibleAt,
        payoutMode: settlementFields.payoutMode,
        eligibilityStatus: settlementFields.eligibilityStatus,
        payoutStatus: settlementFields.payoutStatus,
        reasonCode: settlementFields.reasonCode,
        ruleVersionId: settlementFields.ruleVersionId,
      } as any,
    });
    await this.recordSettlementAudit({
      entityType: 'payment',
      entityId: payment.id,
      operator: 'system',
      reasonCode: settlementFields.reasonCode,
      note: 'settlement_fields_initialized',
      after: {
        eligibleAt: settlementFields.eligibleAt?.toISOString() ?? null,
        payoutMode: settlementFields.payoutMode,
        eligibilityStatus: settlementFields.eligibilityStatus,
        payoutStatus: settlementFields.payoutStatus,
        reasonCode: settlementFields.reasonCode,
      },
      ruleVersionId: settlementFields.ruleVersionId,
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
      await this.maybeTriggerRealtimePayout(payment.id);
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
    const gatewayEvent = await this.prisma.paymentGatewayEvent.upsert({
      where: { provider_providerEventId: { provider: 'stripe', providerEventId } } as any,
      update: { payload: event as any, payloadHash, eventType: event.type },
      create: {
        gateway: 'stripe',
        provider: 'stripe',
        providerEventId,
        eventType: event.type,
        status: 'received',
        payload: event as any,
        payloadHash,
        receivedAt: now,
        nextAttemptAt: now,
      },
    });
    // Ensure unprocessed events are eligible for immediate processing/sweep even if nextAttemptAt is null/future.
    await this.prisma.paymentGatewayEvent.updateMany({
      where: {
        id: gatewayEvent.id,
        processedAt: null,
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { gt: now } }],
      } as any,
      data: { nextAttemptAt: now },
    });
    return gatewayEvent;
  }

  private truncateErrorMessage(error: unknown, maxLength: number) {
    const raw = error instanceof Error ? error.message : String(error);
    if (!raw) return 'unknown_error';
    if (raw.length <= maxLength) return raw;
    return raw.slice(0, maxLength);
  }

  private async writeCrashFallbackForGatewayEvent(gatewayEventId: string, event: Stripe.Event, errorMessage: string) {
    const retryDelayMs = Number.isFinite(WEBHOOK_RETRY_DELAY_MS) ? WEBHOOK_RETRY_DELAY_MS : 60_000;
    const nextAttemptAt = new Date(Date.now() + retryDelayMs);
    try {
      const updated = await this.prisma.paymentGatewayEvent.updateMany({
        where: { id: gatewayEventId, processedAt: null } as any,
        data: {
          status: 'failed',
          errorMessage,
          nextAttemptAt,
        },
      });
      if (updated.count === 1) {
        this.logger.error(
          `Stripe webhook crash fallback scheduled: gatewayEventId=${gatewayEventId} event=${event.type} id=${event.id} nextAttemptAt=${nextAttemptAt.toISOString()}`,
        );
      }
    } catch (fallbackError) {
      this.logger.error(
        `Stripe webhook crash fallback failed: gatewayEventId=${gatewayEventId} event=${event.type} id=${event.id}`,
        fallbackError instanceof Error ? fallbackError.stack : String(fallbackError),
      );
    }
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


  private buildCheckoutSessionFingerprint(params: Stripe.Checkout.SessionCreateParams): string {
    const payload = this.stableSerialize(params);
    return createHash('sha256').update(payload).digest('hex');
  }

  private stableSerialize(value: unknown): string {
    if (value === null) return 'null';
    if (typeof value === 'undefined') return 'undefined';
    if (typeof value === 'string') return `s:${value}`;
    if (typeof value === 'number' || typeof value === 'boolean') return `p:${value}`;
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableSerialize(item)).join(',')}]`;
    }
    if (typeof value === 'object') {
      const entry = value as Record<string, unknown>;
      const keys = Object.keys(entry).sort();
      return `{${keys
        .map((key) => `${key}:${this.stableSerialize(entry[key])}`)
        .join(',')}}`;
    }
    return String(value);
  }

  private async resolveBalanceTransaction(
    latestCharge: Stripe.Charge | null,
    chargeId: string | null,
  ): Promise<Stripe.BalanceTransaction | null> {
    const latestBalanceTx = latestCharge?.balance_transaction ?? null;
    if (latestBalanceTx && typeof latestBalanceTx !== 'string') {
      return latestBalanceTx;
    }
    if (typeof latestBalanceTx === 'string') {
      return this.withStripeRetry(() =>
        this.stripeService.client.balanceTransactions.retrieve(latestBalanceTx),
      );
    }
    if (!chargeId) return null;
    const charge = await this.withStripeRetry(() => this.stripeService.client.charges.retrieve(chargeId));
    const chargeBalanceTx = charge.balance_transaction ?? null;
    if (chargeBalanceTx && typeof chargeBalanceTx !== 'string') {
      return chargeBalanceTx;
    }
    if (typeof chargeBalanceTx === 'string') {
      return this.withStripeRetry(() =>
        this.stripeService.client.balanceTransactions.retrieve(chargeBalanceTx),
      );
    }
    return null;
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
