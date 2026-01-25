import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../stripe/stripe.service';
import { getPaymentsConfig } from './payments.config';
import { computeSettlementAmount } from './settlement.utils';
import Stripe from 'stripe';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type SettlementHostStats = {
  hostId: string;
  accruedNet: number;
  paidOut: number;
  hostBalance: number;
  settleAmount: number;
  carryReceivable: number;
  status: 'pending' | 'blocked' | 'skipped';
  blockedReasons: string[];
  counts: {
    payments: number;
    refundedPayments: number;
    unreconciledPayments: number;
    totalGross: number;
    totalRefundedGross: number;
    blocked?: {
      notMaturedPayments: number;
      notMaturedNet: number;
      disputedPayments: number;
      disputedNet: number;
      missingEligibilityPayments: number;
      missingEligibilityNet: number;
      frozenPayments: number;
      frozenNet: number;
    };
    rules?: {
      settlementDelayDays: number;
      settlementMinTransferAmount: number;
      settlementWindowDays: number;
    };
  };
};

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
  ) {}

  private async writeReport(batchId: string, reportDir: string, summary: unknown, csv: string) {
    await mkdir(reportDir, { recursive: true });
    const summaryPath = join(reportDir, 'summary.json');
    const itemsPath = join(reportDir, 'items.csv');
    const timestampedSummaryPath = join(reportDir, `summary.${batchId}.json`);
    const timestampedItemsPath = join(reportDir, `items.${batchId}.csv`);
    await writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
    await writeFile(itemsPath, csv, 'utf8');
    await writeFile(timestampedSummaryPath, JSON.stringify(summary, null, 2), 'utf8');
    await writeFile(timestampedItemsPath, csv, 'utf8');
  }

  private buildItemsCsv(stats: SettlementHostStats[]) {
    const header = [
      'hostId',
      'accruedNet',
      'paidOut',
      'hostBalance',
      'settleAmount',
      'carryReceivable',
      'payments',
      'refundedPayments',
      'unreconciledPayments',
      'totalGross',
      'totalRefundedGross',
    ].join(',');
    const lines = stats.map((s) =>
      [
        s.hostId,
        s.accruedNet,
        s.paidOut,
        s.hostBalance,
        s.settleAmount,
        s.carryReceivable,
        s.counts.payments,
        s.counts.refundedPayments,
        s.counts.unreconciledPayments,
        s.counts.totalGross,
        s.counts.totalRefundedGross,
      ].join(','),
    );
    return [header, ...lines].join('\n') + '\n';
  }

  async hasRealtimeEligiblePayments(cutoff: Date) {
    const count = await this.prisma.payment.count({
      where: {
        payoutMode: 'REALTIME',
        status: { in: ['paid', 'partial_refunded', 'refunded', 'disputed'] },
        eligibleAt: { lte: cutoff },
        communityId: { not: null },
      },
    });
    return count > 0;
  }

  private buildBatchItemsCsv(items: Array<{
    hostId: string;
    hostBalance: number;
    settleAmount: number;
    carryReceivable: number;
    status: string;
    stripeTransferId: string | null;
    counts: unknown;
  }>) {
    const header = [
      'hostId',
      'hostBalance',
      'settleAmount',
      'carryReceivable',
      'status',
      'stripeTransferId',
      'payments',
      'refundedPayments',
      'unreconciledPayments',
      'totalGross',
      'totalRefundedGross',
    ].join(',');
    const lines = items.map((item) => {
      const counts = this.coerceCounts(item.counts);
      return [
        item.hostId,
        item.hostBalance,
        item.settleAmount,
        item.carryReceivable,
        item.status,
        item.stripeTransferId ?? '',
        counts.payments ?? '',
        counts.refundedPayments ?? '',
        counts.unreconciledPayments ?? '',
        counts.totalGross ?? '',
        counts.totalRefundedGross ?? '',
      ].join(',');
    });
    return [header, ...lines].join('\n') + '\n';
  }

  private coerceCounts(value: unknown): Partial<{
    payments: number;
    refundedPayments: number;
    unreconciledPayments: number;
    totalGross: number;
    totalRefundedGross: number;
  }> {
    if (!value || typeof value !== 'object') return {};
    const record = value as Record<string, unknown>;
    const pickNumber = (key: string) => {
      const current = record[key];
      return typeof current === 'number' ? current : undefined;
    };
    return {
      payments: pickNumber('payments'),
      refundedPayments: pickNumber('refundedPayments'),
      unreconciledPayments: pickNumber('unreconciledPayments'),
      totalGross: pickNumber('totalGross'),
      totalRefundedGross: pickNumber('totalRefundedGross'),
    };
  }

  private async groupLedgerByHost(params: {
    paymentIds: string[];
    periodTo: Date;
    entryType: 'host_payable' | 'host_payable_reversal';
  }) {
    if (!params.paymentIds.length) return new Map<string, number>();
    const rows = await this.prisma.ledgerEntry.groupBy({
      by: ['businessCommunityId'],
      where: {
        businessCommunityId: { not: null },
        businessPaymentId: { in: params.paymentIds },
        entryType: params.entryType,
        provider: 'internal',
        occurredAt: { lt: params.periodTo },
      },
      orderBy: { businessCommunityId: 'asc' },
      _sum: { amount: true },
    });
    const map = new Map<string, number>();
    for (const row of rows) {
      if (!row.businessCommunityId) continue;
      map.set(row.businessCommunityId, row._sum?.amount ?? 0);
    }
    return map;
  }

  private async computeHostStats(params: { periodFrom: Date; periodTo: Date; payoutMode?: 'BATCH' | 'REALTIME' }): Promise<SettlementHostStats[]> {
    const config = getPaymentsConfig();

    const payments = (await this.prisma.payment.findMany({
      where: {
        method: 'stripe',
        chargeModel: 'platform_charge',
        communityId: { not: null },
        status: { in: ['paid', 'partial_refunded', 'refunded', 'disputed'] },
        createdAt: { lt: params.periodTo },
        ...(params.payoutMode
          ? { payoutMode: params.payoutMode }
          : { OR: [{ payoutMode: null }, { payoutMode: 'BATCH' }] }),
      },
      select: {
        id: true,
        communityId: true,
        amount: true,
        refundedGrossTotal: true,
        status: true,
        createdAt: true,
        eligibleAt: true,
        settlementFrozen: true,
        settlementStatus: true,
      },
    })) as Array<{
      id: string;
      communityId: string | null;
      amount: number;
      refundedGrossTotal: number;
      status: string;
      createdAt: Date;
      eligibleAt: Date | null;
      settlementFrozen: boolean;
      settlementStatus?: string | null;
    }>;

    const hostIdsFromPayments = Array.from(
      new Set(payments.map((p) => p.communityId).filter((v): v is string => Boolean(v))),
    );

    const communities = hostIdsFromPayments.length
      ? await this.prisma.community.findMany({
          where: { id: { in: hostIdsFromPayments } },
          select: {
            id: true,
            stripeAccountId: true,
            stripeAccountOnboarded: true,
            settlementDelayDaysOverride: true,
            settlementMinTransferAmountOverride: true,
          },
        })
      : [];
    const communityById = new Map(communities.map((c) => [c.id, c]));

    const getEffectiveDelayDays = (hostId: string) => {
      const override = communityById.get(hostId)?.settlementDelayDaysOverride ?? null;
      const configured = Number.isFinite(config.settlementDelayDays) ? config.settlementDelayDays : 0;
      const effective = override === null ? configured : Math.max(configured, override);
      return Math.max(0, effective);
    };

    const getEffectiveMinTransferAmount = (hostId: string) => {
      const override = communityById.get(hostId)?.settlementMinTransferAmountOverride ?? null;
      const configured = Number.isFinite(config.settlementMinTransferAmount) ? config.settlementMinTransferAmount : 0;
      const effective = override === null ? configured : Math.max(configured, override);
      return Math.max(0, effective);
    };

    const settleablePaymentIds: string[] = [];
    const blockedNotMaturedPaymentIds: string[] = [];
    const blockedDisputePaymentIds: string[] = [];
    const blockedMissingEligibilityPaymentIds: string[] = [];
    const blockedFrozenPaymentIds: string[] = [];

    const categoryByPaymentId = new Map<
      string,
      'settleable' | 'not_matured' | 'disputed' | 'missing_eligibility' | 'frozen'
    >();

    for (const payment of payments) {
      const hostId = payment.communityId;
      if (!hostId) continue;
      const eligibleAt = payment.eligibleAt ?? null;
      if (!eligibleAt) {
        blockedMissingEligibilityPaymentIds.push(payment.id);
        categoryByPaymentId.set(payment.id, 'missing_eligibility');
        continue;
      }

      if (payment.settlementFrozen) {
        blockedFrozenPaymentIds.push(payment.id);
        categoryByPaymentId.set(payment.id, 'frozen');
        continue;
      }
      if (payment.status === 'disputed') {
        blockedDisputePaymentIds.push(payment.id);
        categoryByPaymentId.set(payment.id, 'disputed');
        continue;
      }

      if (eligibleAt > params.periodTo) {
        blockedNotMaturedPaymentIds.push(payment.id);
        categoryByPaymentId.set(payment.id, 'not_matured');
        continue;
      }

      settleablePaymentIds.push(payment.id);
      categoryByPaymentId.set(payment.id, 'settleable');
    }

    const [
      paidOutAgg,
      eligiblePayableByHost,
      eligibleReversalByHost,
      blockedNotMaturedPayableByHost,
      blockedNotMaturedReversalByHost,
      blockedDisputePayableByHost,
      blockedDisputeReversalByHost,
      blockedMissingPayableByHost,
      blockedMissingReversalByHost,
      blockedFrozenPayableByHost,
      blockedFrozenReversalByHost,
    ] = await Promise.all([
      this.prisma.settlementItem.groupBy({
        by: ['hostId'],
        where: { status: { in: ['completed', 'transferred'] } },
        orderBy: { hostId: 'asc' },
        _sum: { settleAmount: true },
      }),
      this.groupLedgerByHost({
        paymentIds: settleablePaymentIds,
        periodTo: params.periodTo,
        entryType: 'host_payable',
      }),
      this.groupLedgerByHost({
        paymentIds: settleablePaymentIds,
        periodTo: params.periodTo,
        entryType: 'host_payable_reversal',
      }),
      this.groupLedgerByHost({
        paymentIds: blockedNotMaturedPaymentIds,
        periodTo: params.periodTo,
        entryType: 'host_payable',
      }),
      this.groupLedgerByHost({
        paymentIds: blockedNotMaturedPaymentIds,
        periodTo: params.periodTo,
        entryType: 'host_payable_reversal',
      }),
      this.groupLedgerByHost({
        paymentIds: blockedDisputePaymentIds,
        periodTo: params.periodTo,
        entryType: 'host_payable',
      }),
      this.groupLedgerByHost({
        paymentIds: blockedDisputePaymentIds,
        periodTo: params.periodTo,
        entryType: 'host_payable_reversal',
      }),
      this.groupLedgerByHost({
        paymentIds: blockedMissingEligibilityPaymentIds,
        periodTo: params.periodTo,
        entryType: 'host_payable',
      }),
      this.groupLedgerByHost({
        paymentIds: blockedMissingEligibilityPaymentIds,
        periodTo: params.periodTo,
        entryType: 'host_payable_reversal',
      }),
      this.groupLedgerByHost({
        paymentIds: blockedFrozenPaymentIds,
        periodTo: params.periodTo,
        entryType: 'host_payable',
      }),
      this.groupLedgerByHost({
        paymentIds: blockedFrozenPaymentIds,
        periodTo: params.periodTo,
        entryType: 'host_payable_reversal',
      }),
    ]);

    const paidOutByHost = new Map<string, number>();
    for (const row of paidOutAgg) {
      paidOutByHost.set(row.hostId, row._sum?.settleAmount ?? 0);
    }

    const windowPaymentIds = payments
      .filter((p) => p.createdAt >= params.periodFrom && p.createdAt < params.periodTo)
      .map((p) => p.id);
    const payableRows = windowPaymentIds.length
      ? await this.prisma.ledgerEntry.findMany({
          where: {
            businessPaymentId: { in: windowPaymentIds },
            entryType: 'host_payable',
            provider: 'internal',
          },
          select: { businessPaymentId: true },
        })
      : [];
    const paymentIdsWithHostPayable = new Set<string>(payableRows.map((r) => r.businessPaymentId));

    const allHostIds = new Set<string>();
    for (const payment of payments) {
      if (payment.communityId) allHostIds.add(payment.communityId);
    }
    for (const hostId of paidOutByHost.keys()) allHostIds.add(hostId);
    for (const hostId of eligiblePayableByHost.keys()) allHostIds.add(hostId);
    for (const hostId of eligibleReversalByHost.keys()) allHostIds.add(hostId);
    for (const hostId of blockedNotMaturedPayableByHost.keys()) allHostIds.add(hostId);
    for (const hostId of blockedDisputePayableByHost.keys()) allHostIds.add(hostId);
    for (const hostId of blockedMissingPayableByHost.keys()) allHostIds.add(hostId);
    for (const hostId of blockedFrozenPayableByHost.keys()) allHostIds.add(hostId);

    const statsByHost = new Map<string, SettlementHostStats>();
    for (const hostId of allHostIds) {
      const delayDays = getEffectiveDelayDays(hostId);
      const minTransfer = getEffectiveMinTransferAmount(hostId);
      const eligibleNet = (eligiblePayableByHost.get(hostId) ?? 0) - (eligibleReversalByHost.get(hostId) ?? 0);
      const paidOut = paidOutByHost.get(hostId) ?? 0;
      const hostBalance = eligibleNet - paidOut;
      const carryReceivable = hostBalance < 0 ? Math.abs(hostBalance) : 0;

      const blockedNotMaturedNet =
        (blockedNotMaturedPayableByHost.get(hostId) ?? 0) - (blockedNotMaturedReversalByHost.get(hostId) ?? 0);
      const blockedDisputeNet =
        (blockedDisputePayableByHost.get(hostId) ?? 0) - (blockedDisputeReversalByHost.get(hostId) ?? 0);
      const blockedMissingEligibilityNet =
        (blockedMissingPayableByHost.get(hostId) ?? 0) - (blockedMissingReversalByHost.get(hostId) ?? 0);
      const blockedFrozenNet =
        (blockedFrozenPayableByHost.get(hostId) ?? 0) - (blockedFrozenReversalByHost.get(hostId) ?? 0);

      const blockedReasons: string[] = [];
      const candidate = hostBalance > 0 ? hostBalance : 0;
      const onboarded = communityById.get(hostId)?.stripeAccountOnboarded ?? false;
      if (candidate > 0 && !onboarded) blockedReasons.push('account_not_onboarded');
      if (candidate > 0 && minTransfer > 0 && candidate < minTransfer) blockedReasons.push('below_min_transfer_amount');
      if (blockedFrozenNet > 0) blockedReasons.push('frozen_by_ops');
      if (candidate <= 0 && blockedNotMaturedNet > 0) blockedReasons.push('not_matured');
      if (candidate <= 0 && blockedDisputeNet > 0) blockedReasons.push('dispute_open');
      if (candidate <= 0 && blockedMissingEligibilityNet > 0) blockedReasons.push('missing_eligibility_source');

      const status: SettlementHostStats['status'] =
        candidate > 0
          ? blockedReasons.length
            ? 'blocked'
            : 'pending'
          : blockedReasons.length
            ? 'blocked'
            : 'skipped';

      const settleAmount = status === 'pending' ? candidate : 0;

      statsByHost.set(hostId, {
        hostId,
        accruedNet: eligibleNet,
        paidOut,
        hostBalance,
        settleAmount,
        carryReceivable,
        status,
        blockedReasons,
        counts: {
          payments: 0,
          refundedPayments: 0,
          unreconciledPayments: 0,
          totalGross: 0,
          totalRefundedGross: 0,
          blocked: {
            notMaturedPayments: 0,
            notMaturedNet: blockedNotMaturedNet,
            disputedPayments: 0,
            disputedNet: blockedDisputeNet,
            missingEligibilityPayments: 0,
            missingEligibilityNet: blockedMissingEligibilityNet,
            frozenPayments: 0,
            frozenNet: blockedFrozenNet,
          },
          rules: {
            settlementDelayDays: delayDays,
            settlementMinTransferAmount: minTransfer,
            settlementWindowDays: config.settlementWindowDays,
          },
        },
      });
    }

    for (const payment of payments) {
      const hostId = payment.communityId;
      if (!hostId) continue;
      const entry = statsByHost.get(hostId);
      if (!entry) continue;

      const inWindow = payment.createdAt >= params.periodFrom && payment.createdAt < params.periodTo;
      if (inWindow) {
        entry.counts.payments += 1;
        entry.counts.totalGross += payment.amount ?? 0;
        entry.counts.totalRefundedGross += payment.refundedGrossTotal ?? 0;
        if ((payment.refundedGrossTotal ?? 0) > 0) entry.counts.refundedPayments += 1;
        if (!paymentIdsWithHostPayable.has(payment.id)) entry.counts.unreconciledPayments += 1;
      }

      const category = categoryByPaymentId.get(payment.id);
      if (!category || !inWindow || !entry.counts.blocked) continue;
      if (category === 'not_matured') entry.counts.blocked.notMaturedPayments += 1;
      if (category === 'disputed') entry.counts.blocked.disputedPayments += 1;
      if (category === 'missing_eligibility') entry.counts.blocked.missingEligibilityPayments += 1;
      if (category === 'frozen') entry.counts.blocked.frozenPayments += 1;
    }

    const stats = Array.from(statsByHost.values());
    stats.sort((a, b) => b.settleAmount - a.settleAmount);
    return stats;
  }

  private async createTransferForItem(params: {
    itemId: string;
    hostId: string;
    destinationAccountId: string;
    amount: number;
    currency: string;
    batchId: string;
    periodFrom: Date;
    periodTo: Date;
  }) {
    const transferParams: Stripe.TransferCreateParams = {
      amount: params.amount,
      currency: params.currency,
      destination: params.destinationAccountId,
      metadata: {
        settlementBatchId: params.batchId,
        settlementItemId: params.itemId,
        hostId: params.hostId,
        periodFrom: params.periodFrom.toISOString(),
        periodTo: params.periodTo.toISOString(),
      },
    };
    return this.stripeService.client.transfers.create(transferParams, {
      idempotencyKey: `settlement_item_${params.itemId}`,
    });
  }

  async runSettlementBatch(params: {
    periodFrom: Date;
    periodTo: Date;
    trigger?: { type: 'auto' | 'manual' | 'realtime'; userId?: string };
    payoutMode?: 'BATCH' | 'REALTIME';
  }) {
    const config = getPaymentsConfig();
    const settlementEnabled = config.settlementEnabled && this.stripeService.enabled;

    await this.prisma.payment.updateMany({
      where: {
        eligibleAt: { lte: params.periodTo },
        eligibilityStatus: 'PENDING',
        settlementStatus: { not: 'settled' },
        ...(params.payoutMode
          ? { payoutMode: params.payoutMode }
          : { OR: [{ payoutMode: null }, { payoutMode: 'BATCH' }] }),
      },
      data: { eligibilityStatus: 'ELIGIBLE' },
    });

    const existingBatch = await this.prisma.settlementBatch.findFirst({
      where: {
        periodFrom: params.periodFrom,
        periodTo: params.periodTo,
        currency: 'jpy',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existingBatch) {
      return { batchId: existingBatch.id, status: existingBatch.status };
    }

    const stats = await this.computeHostStats({
      periodFrom: params.periodFrom,
      periodTo: params.periodTo,
      payoutMode: params.payoutMode,
    });
    const hostIds = stats.map((s) => s.hostId);
    const communities = hostIds.length
      ? await this.prisma.community.findMany({
          where: { id: { in: hostIds } },
          select: { id: true, stripeAccountId: true, stripeAccountOnboarded: true },
        })
      : [];
    const communityById = new Map(communities.map((c) => [c.id, c]));

    const totalAmount = stats.reduce((sum, s) => sum + (s.settleAmount ?? 0), 0);
    const blockedCount = stats.filter((s) => s.status === 'blocked').length;
    const reasonCodeSummary = stats.reduce<Record<string, number>>((acc, s) => {
      for (const reason of s.blockedReasons ?? []) {
        acc[reason] = (acc[reason] ?? 0) + 1;
      }
      return acc;
    }, {});
    const batch = await this.prisma.settlementBatch.create({
      data: {
        periodFrom: params.periodFrom,
        periodTo: params.periodTo,
        currency: 'jpy',
        status: settlementEnabled ? 'pending' : 'dry_run',
        runAt: new Date(),
        triggerType: params.trigger?.type ?? 'unknown',
        cutoffAt: params.periodTo,
        scheduledAt: new Date(),
        totalAmount,
        successCount: 0,
        failedCount: 0,
        blockedCount,
        reasonCodeSummary,
        meta: {
          settlementEnabled,
          settlementReportDir: config.settlementReportDir,
          triggeredByUserId: params.trigger?.userId ?? null,
          payoutMode: params.payoutMode ?? null,
          settlementDelayDays: config.settlementDelayDays,
          settlementWindowDays: config.settlementWindowDays,
          settlementMinTransferAmount: config.settlementMinTransferAmount,
        },
      },
    });

    const items = await this.prisma.$transaction(async (tx) => {
      const created = [];
      for (const s of stats) {
        const item = await tx.settlementItem.create({
          data: {
            batchId: batch.id,
            hostId: s.hostId,
            currency: 'jpy',
            hostBalance: s.hostBalance,
            settleAmount: s.settleAmount,
            carryReceivable: s.carryReceivable,
            counts: s.counts,
            status: settlementEnabled ? s.status : 'dry_run',
            attempts: 0,
            nextAttemptAt: null,
          },
        });
        created.push(item);
      }
      return created;
    });

    let transferSucceeded = 0;
    let transferFailed = 0;
    const settledHostIds = new Set<string>();
    if (settlementEnabled) {
      for (const item of items) {
        if (item.settleAmount <= 0) continue;
        const host = communityById.get(item.hostId);
        const stripeAccountId = host?.stripeAccountId ?? null;
        if (!stripeAccountId || !host?.stripeAccountOnboarded) {
          await this.prisma.settlementItem.updateMany({
            where: { id: item.id, status: 'pending', stripeTransferId: null },
            data: {
              status: 'blocked',
              settleAmount: 0,
              errorMessage: 'connected_account_missing_or_not_onboarded',
              nextAttemptAt: null,
            },
          });
          continue;
        }
        const claimed = await this.prisma.settlementItem.updateMany({
          where: {
            id: item.id,
            status: 'pending',
            stripeTransferId: null,
            attempts: { lt: config.settlementItemMaxAttempts },
          },
          data: { status: 'processing', errorMessage: null, nextAttemptAt: null, attempts: { increment: 1 } },
        });
        if (claimed.count !== 1) continue;
        try {
          const transfer = await this.createTransferForItem({
            itemId: item.id,
            hostId: item.hostId,
            destinationAccountId: stripeAccountId,
            amount: item.settleAmount,
            currency: item.currency ?? 'jpy',
            batchId: batch.id,
            periodFrom: params.periodFrom,
            periodTo: params.periodTo,
          });
          transferSucceeded += 1;
          settledHostIds.add(item.hostId);
          await this.prisma.settlementItem.update({
            where: { id: item.id },
            data: { status: 'completed', stripeTransferId: transfer.id, errorMessage: null, nextAttemptAt: null },
          });
        } catch (err) {
          transferFailed += 1;
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(`[settlement] transfer failed batch=${batch.id} item=${item.id} host=${item.hostId} ${message}`);
          const nextAttemptAt = new Date(Date.now() + config.settlementItemRetryDelayMs);
          await this.prisma.settlementItem.update({
            where: { id: item.id },
            data: {
              status: 'failed',
              errorMessage: message,
              nextAttemptAt,
            },
          });
        }
      }
    }

    const allItemsBlocked = items.length > 0 && items.every((i) => i.status === 'blocked');
    const finalStatus = !settlementEnabled
      ? 'dry_run'
      : transferFailed > 0
        ? transferSucceeded > 0
          ? 'partial_failed'
          : 'failed'
        : transferSucceeded === 0 && allItemsBlocked
          ? 'blocked'
          : 'completed';
    await this.prisma.settlementBatch.update({
      where: { id: batch.id },
      data: {
        status: finalStatus,
        successCount: transferSucceeded,
        failedCount: transferFailed,
        blockedCount: items.filter((i) => i.status === 'blocked').length,
      },
    });

    const csv = this.buildItemsCsv(stats);
    const summary = {
      batchId: batch.id,
      periodFrom: params.periodFrom.toISOString(),
      periodTo: params.periodTo.toISOString(),
      currency: 'jpy',
      settlementEnabled,
      status: finalStatus,
      hosts: stats.length,
      transfers: {
        attempted: settlementEnabled ? stats.filter((s) => s.settleAmount > 0).length : 0,
        succeeded: transferSucceeded,
        failed: transferFailed,
      },
      generatedAt: new Date().toISOString(),
    };

    await this.writeReport(batch.id, config.settlementReportDir, summary, csv);
    if (settlementEnabled) {
      await this.markPaymentsSettled({
        hostIds: Array.from(settledHostIds),
        periodTo: params.periodTo,
        payoutMode: params.payoutMode,
        settledAt: new Date(),
      });
    }
    return { batchId: batch.id, status: finalStatus };
  }

  private async markPaymentsSettled(params: {
    hostIds?: string[];
    periodTo: Date;
    payoutMode?: 'BATCH' | 'REALTIME';
    settledAt: Date;
  }) {
    const hostIds = (params.hostIds ?? []).filter((id) => typeof id === 'string' && id.trim().length > 0);
    if (params.hostIds && hostIds.length === 0) return;
    const payments = await this.prisma.payment.findMany({
      where: {
        method: 'stripe',
        chargeModel: 'platform_charge',
        communityId: hostIds.length ? { in: hostIds } : { not: null },
        status: { in: ['paid', 'partial_refunded', 'refunded'] },
        eligibleAt: { lte: params.periodTo },
        settlementStatus: { not: 'settled' },
        settlementFrozen: false,
        ...(params.payoutMode
          ? { payoutMode: params.payoutMode }
          : { OR: [{ payoutMode: null }, { payoutMode: 'BATCH' }] }),
      },
      select: {
        id: true,
        amount: true,
        platformFee: true,
        stripeFeeAmountActual: true,
        stripeFeeAmountEstimated: true,
        refundedGrossTotal: true,
        refundedPlatformFeeTotal: true,
      },
    });
    if (!payments.length) return;
    await this.prisma.$transaction(
      payments.map((payment) => {
        const stripeFee = payment.stripeFeeAmountActual ?? payment.stripeFeeAmountEstimated ?? 0;
        const settlementAmount = computeSettlementAmount({
          gross: payment.amount ?? 0,
          platformFee: payment.platformFee ?? 0,
          stripeFee,
          refundedGross: payment.refundedGrossTotal ?? 0,
          refundedPlatformFee: payment.refundedPlatformFeeTotal ?? 0,
        });
        return this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            settlementStatus: 'settled',
            settlementAmount,
            settledAt: params.settledAt,
          },
        });
      }),
    );
  }

  async retrySettlementBatch(batchId: string) {
    const config = getPaymentsConfig();
    const settlementEnabled = config.settlementEnabled && this.stripeService.enabled;
    if (!settlementEnabled) {
      return { batchId, status: 'disabled' };
    }

    const batch = await this.prisma.settlementBatch.findUnique({
      where: { id: batchId },
      include: { items: true },
    });
    if (!batch) {
      throw new Error(`SettlementBatch not found: ${batchId}`);
    }

    const items = batch.items ?? [];
    const hostIds = Array.from(new Set(items.map((i) => i.hostId)));
    const communities = await this.prisma.community.findMany({
      where: { id: { in: hostIds } },
      select: { id: true, stripeAccountId: true, stripeAccountOnboarded: true },
    });
    const communityById = new Map(communities.map((c) => [c.id, c]));

    let transferSucceeded = 0;
    let transferFailed = 0;
    const settledHostIds = new Set<string>();
    const now = new Date();
    const processingStaleBefore = new Date(now.getTime() - config.settlementItemProcessingTimeoutMs);

    for (const item of items) {
      if (item.settleAmount <= 0) continue;
      if (item.status === 'completed' || item.status === 'transferred') continue;
      if (item.stripeTransferId) continue;
      if (item.attempts !== null && item.attempts >= config.settlementItemMaxAttempts) continue;
      if (item.nextAttemptAt && item.nextAttemptAt > now) continue;

      const claimed = await this.prisma.settlementItem.updateMany({
        where: {
          id: item.id,
          stripeTransferId: null,
          attempts: { lt: config.settlementItemMaxAttempts },
          OR: [
            {
              status: { in: ['pending', 'failed'] },
              OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
            },
            { status: 'processing', updatedAt: { lt: processingStaleBefore } },
          ],
        },
        data: { status: 'processing', errorMessage: null, nextAttemptAt: null, attempts: { increment: 1 } },
      });
      if (claimed.count !== 1) continue;

      const host = communityById.get(item.hostId);
      const stripeAccountId = host?.stripeAccountId ?? null;
      if (!stripeAccountId || !host?.stripeAccountOnboarded) {
        await this.prisma.settlementItem.update({
          where: { id: item.id },
          data: {
            status: 'blocked',
            settleAmount: 0,
            errorMessage: 'connected_account_missing_or_not_onboarded',
            nextAttemptAt: null,
          },
        });
        continue;
      }

      try {
        const transfer = await this.createTransferForItem({
          itemId: item.id,
          hostId: item.hostId,
          destinationAccountId: stripeAccountId,
          amount: item.settleAmount,
          currency: item.currency ?? 'jpy',
          batchId: batch.id,
          periodFrom: batch.periodFrom,
          periodTo: batch.periodTo,
        });
        transferSucceeded += 1;
        settledHostIds.add(item.hostId);
        await this.prisma.settlementItem.update({
          where: { id: item.id },
          data: { status: 'completed', stripeTransferId: transfer.id, errorMessage: null, nextAttemptAt: null },
        });
      } catch (err) {
        transferFailed += 1;
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`[settlement] retry transfer failed batch=${batch.id} item=${item.id} host=${item.hostId} ${message}`);
        const nextAttemptAt = new Date(now.getTime() + config.settlementItemRetryDelayMs);
        await this.prisma.settlementItem.update({
          where: { id: item.id },
          data: { status: 'failed', errorMessage: message, nextAttemptAt },
        });
      }
    }

    const refreshedItems = await this.prisma.settlementItem.findMany({
      where: { batchId: batch.id },
      orderBy: { settleAmount: 'desc' },
    });
    const completedCount = refreshedItems.filter((i) => ['completed', 'transferred'].includes(i.status)).length;
    const failedCount = refreshedItems.filter((i) => i.status === 'failed').length;
    const pendingCount = refreshedItems.filter((i) => i.status === 'pending').length;
    const allItemsBlocked = refreshedItems.length > 0 && refreshedItems.every((i) => i.status === 'blocked');
    const finalStatus =
      failedCount > 0
        ? completedCount > 0
          ? 'partial_failed'
          : 'failed'
        : pendingCount > 0
          ? 'pending'
          : completedCount === 0 && allItemsBlocked
            ? 'blocked'
            : 'completed';

    await this.prisma.settlementBatch.update({
      where: { id: batch.id },
      data: {
        status: finalStatus,
        successCount: completedCount,
        failedCount,
        blockedCount: refreshedItems.filter((i) => i.status === 'blocked').length,
      },
    });

    const csv = this.buildBatchItemsCsv(
      refreshedItems.map((i) => ({
        hostId: i.hostId,
        hostBalance: i.hostBalance,
        settleAmount: i.settleAmount,
        carryReceivable: i.carryReceivable,
        status: i.status,
        stripeTransferId: i.stripeTransferId ?? null,
        counts: i.counts,
      })),
    );
    const summary = {
      batchId: batch.id,
      periodFrom: batch.periodFrom.toISOString(),
      periodTo: batch.periodTo.toISOString(),
      currency: batch.currency ?? 'jpy',
      settlementEnabled,
      status: finalStatus,
      hosts: refreshedItems.length,
      transfers: {
        attempted: refreshedItems.filter((i) => i.settleAmount > 0).length,
        succeeded: transferSucceeded,
        failed: transferFailed,
      },
      retriedAt: new Date().toISOString(),
    };

    await this.writeReport(batch.id, config.settlementReportDir, summary, csv);
    if (settlementEnabled) {
      const payoutMode =
        batch.meta && typeof batch.meta === 'object' && 'payoutMode' in batch.meta
          ? ((batch.meta as any).payoutMode as 'BATCH' | 'REALTIME' | null)
          : null;
      const fallbackMode = batch.triggerType === 'realtime' ? 'REALTIME' : null;
      await this.markPaymentsSettled({
        hostIds: Array.from(settledHostIds),
        periodTo: batch.periodTo,
        payoutMode:
          payoutMode === 'REALTIME' || payoutMode === 'BATCH'
            ? payoutMode
            : fallbackMode === 'REALTIME'
              ? 'REALTIME'
              : undefined,
        settledAt: new Date(),
      });
    }
    return { batchId: batch.id, status: finalStatus };
  }

  async listAdminSettlementBatches(params?: { page?: number; pageSize?: number; status?: string }) {
    const page = Math.max(1, Number(params?.page ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(params?.pageSize ?? 20) || 20));
    const skip = (page - 1) * pageSize;
    const where = params?.status ? { status: params.status } : {};

    const [total, batches] = await this.prisma.$transaction([
      this.prisma.settlementBatch.count({ where }),
      this.prisma.settlementBatch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: { items: { select: { status: true } } },
      }),
    ]);

    return {
      total,
      page,
      pageSize,
      items: batches.map((batch) => {
        const items = batch.items ?? [];
        const succeeded = items.filter((i) => ['completed', 'transferred'].includes(i.status)).length;
        const failed = items.filter((i) => i.status === 'failed').length;
        const blocked = items.filter((i) => i.status === 'blocked').length;
	        const pending = items.filter((i) => ['pending', 'processing'].includes(i.status)).length;
	        const meta = batch.meta && typeof batch.meta === 'object' ? (batch.meta as Record<string, unknown>) : {};
	        const settlementEnabled = Boolean(meta?.settlementEnabled);
	        const triggerType =
	          batch.triggerType ?? (typeof meta?.triggerType === 'string' ? meta.triggerType : null);
	        return {
	          batchId: batch.id,
	          periodFrom: batch.periodFrom.toISOString(),
	          periodTo: batch.periodTo.toISOString(),
	          currency: batch.currency ?? 'jpy',
          status: batch.status,
          settlementEnabled,
          createdAt: batch.createdAt.toISOString(),
          runAt: batch.runAt.toISOString(),
          triggerType,
          cutoffAt: batch.cutoffAt?.toISOString() ?? null,
          scheduledAt: batch.scheduledAt?.toISOString() ?? null,
          totalAmount: batch.totalAmount ?? null,
          successCount: batch.successCount ?? null,
          failedCount: batch.failedCount ?? null,
          blockedCount: batch.blockedCount ?? null,
          reasonCodeSummary: batch.reasonCodeSummary ?? null,
          hosts: items.length,
          counts: {
            succeeded,
            failed,
            blocked,
            pending,
          },
        };
      }),
    };
  }

  async getAdminSettlementBatch(batchId: string) {
    const batch = await this.prisma.settlementBatch.findUnique({
      where: { id: batchId },
      include: { items: true },
    });
    if (!batch) {
      throw new Error(`SettlementBatch not found: ${batchId}`);
    }

    const hostIds = Array.from(new Set((batch.items ?? []).map((i) => i.hostId)));
    const communities = hostIds.length
      ? await this.prisma.community.findMany({
          where: { id: { in: hostIds } },
          select: {
            id: true,
            name: true,
            stripeAccountId: true,
            stripeAccountOnboarded: true,
            settlementDelayDaysOverride: true,
            settlementMinTransferAmountOverride: true,
          },
        })
      : [];
    const communityById = new Map(communities.map((c) => [c.id, c]));

    const disputedPayments = hostIds.length
      ? await this.prisma.payment.findMany({
          where: {
            communityId: { in: hostIds },
            method: 'stripe',
            chargeModel: 'platform_charge',
            status: 'disputed',
          },
          select: {
            id: true,
            communityId: true,
            stripeChargeId: true,
            stripeDisputeId: true,
            stripeDisputeStatus: true,
          },
        })
      : [];
    const disputedByHost = new Map<
      string,
      Array<{
        paymentId: string;
        stripeChargeId: string | null;
        stripeDisputeId: string | null;
        stripeDisputeStatus: string | null;
      }>
    >();
    for (const payment of disputedPayments) {
      if (!payment.communityId) continue;
      const current = disputedByHost.get(payment.communityId) ?? [];
      current.push({
        paymentId: payment.id,
        stripeChargeId: payment.stripeChargeId ?? null,
        stripeDisputeId: payment.stripeDisputeId ?? null,
        stripeDisputeStatus: payment.stripeDisputeStatus ?? null,
      });
      disputedByHost.set(payment.communityId, current);
    }

    const meta = batch.meta && typeof batch.meta === 'object' ? (batch.meta as Record<string, unknown>) : {};
    const triggerType =
      batch.triggerType ?? (typeof meta?.triggerType === 'string' ? meta.triggerType : null);

    const parseRules = (counts: unknown) => {
      if (!counts || typeof counts !== 'object') return {};
      const record = counts as Record<string, unknown>;
      const rules = record.rules;
      return rules && typeof rules === 'object' ? (rules as Record<string, unknown>) : {};
    };

    const parseBlocked = (counts: unknown) => {
      if (!counts || typeof counts !== 'object') return {};
      const record = counts as Record<string, unknown>;
      const blocked = record.blocked;
      return blocked && typeof blocked === 'object' ? (blocked as Record<string, unknown>) : {};
    };

    const pickNumber = (record: Record<string, unknown>, key: string) => {
      const value = record[key];
      return typeof value === 'number' ? value : null;
    };

    const items = (batch.items ?? []).map((item) => {
      const host = communityById.get(item.hostId);
      const rules = parseRules(item.counts);
      const blocked = parseBlocked(item.counts);
      const blockedReasonCodes: string[] = [];
      const skipReasonCodes: string[] = [];

      if (item.status === 'blocked') {
        if ((item.hostBalance ?? 0) > 0) {
          if (!host?.stripeAccountId || !host?.stripeAccountOnboarded) {
            blockedReasonCodes.push('account_not_onboarded');
          }
          const minTransfer = pickNumber(rules, 'settlementMinTransferAmount');
          if (minTransfer !== null && minTransfer > 0 && (item.hostBalance ?? 0) < minTransfer) {
            blockedReasonCodes.push('below_min_transfer_amount');
          }
          const frozenNet = pickNumber(blocked, 'frozenNet');
          if (frozenNet !== null && frozenNet > 0) blockedReasonCodes.push('frozen_by_ops');
        } else {
          const notMaturedNet = pickNumber(blocked, 'notMaturedNet');
          const disputedNet = pickNumber(blocked, 'disputedNet');
          const missingEligibilityNet = pickNumber(blocked, 'missingEligibilityNet');
          const frozenNet = pickNumber(blocked, 'frozenNet');
          if (notMaturedNet !== null && notMaturedNet > 0) blockedReasonCodes.push('not_matured');
          if (disputedNet !== null && disputedNet > 0) blockedReasonCodes.push('dispute_open');
          if (missingEligibilityNet !== null && missingEligibilityNet > 0) blockedReasonCodes.push('missing_eligibility_source');
          if (frozenNet !== null && frozenNet > 0) blockedReasonCodes.push('frozen_by_ops');
        }
        if (!blockedReasonCodes.length) blockedReasonCodes.push('blocked');
      }
      if (item.status === 'skipped') {
        if ((item.hostBalance ?? 0) <= 0) skipReasonCodes.push('balance_non_positive');
        if (!skipReasonCodes.length) skipReasonCodes.push('skipped');
      }

      return {
        itemId: item.id,
        hostId: item.hostId,
        communityName: host?.name ?? '',
        hostBalance: item.hostBalance,
        settleAmount: item.settleAmount,
        carryReceivable: item.carryReceivable,
        currency: item.currency ?? 'jpy',
        status: item.status,
        stripeTransferId: item.stripeTransferId ?? null,
        errorMessage: item.errorMessage ?? null,
        attempts: item.attempts ?? 0,
        nextAttemptAt: item.nextAttemptAt ? item.nextAttemptAt.toISOString() : null,
        counts: item.counts ?? {},
        blockedReasonCodes,
        skipReasonCodes,
        disputedPayments: disputedByHost.get(item.hostId) ?? [],
        hostStripe: host
          ? {
              stripeAccountId: host.stripeAccountId ?? null,
              stripeAccountOnboarded: host.stripeAccountOnboarded ?? false,
            }
          : null,
        ruleOverrides: host
          ? {
              settlementDelayDaysOverride: host.settlementDelayDaysOverride ?? null,
              settlementMinTransferAmountOverride: host.settlementMinTransferAmountOverride ?? null,
            }
          : null,
      };
    });

    return {
      batchId: batch.id,
      periodFrom: batch.periodFrom.toISOString(),
      periodTo: batch.periodTo.toISOString(),
      currency: batch.currency ?? 'jpy',
      status: batch.status,
      settlementEnabled: Boolean(meta?.settlementEnabled),
      triggerType,
      cutoffAt: batch.cutoffAt ? batch.cutoffAt.toISOString() : null,
      scheduledAt: batch.scheduledAt ? batch.scheduledAt.toISOString() : null,
      totalAmount: batch.totalAmount ?? null,
      successCount: batch.successCount ?? null,
      failedCount: batch.failedCount ?? null,
      blockedCount: batch.blockedCount ?? null,
      reasonCodeSummary: batch.reasonCodeSummary ?? null,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
      runAt: batch.runAt.toISOString(),
      items,
    };
  }

  async exportAdminSettlementBatchCsv(batchId: string) {
    const batch = await this.prisma.settlementBatch.findUnique({
      where: { id: batchId },
      include: { items: true },
    });
    if (!batch) {
      throw new Error(`SettlementBatch not found: ${batchId}`);
    }
    const csv = this.buildBatchItemsCsv(
      (batch.items ?? []).map((i) => ({
        hostId: i.hostId,
        hostBalance: i.hostBalance,
        settleAmount: i.settleAmount,
        carryReceivable: i.carryReceivable,
        status: i.status,
        stripeTransferId: i.stripeTransferId ?? null,
        counts: i.counts,
      })),
    );
    const filename = `settlement.${batch.id}.csv`;
    return { filename, csv };
  }

  getAdminSettlementConfig() {
    const config = getPaymentsConfig();
    return {
      timezone: config.settlementTimeZone,
      settlementEnabled: config.settlementEnabled && this.stripeService.enabled,
      settlementDelayDays: config.settlementDelayDays,
      settlementWindowDays: config.settlementWindowDays,
      settlementMinTransferAmount: config.settlementMinTransferAmount,
      settlementItemRetryDelayMs: config.settlementItemRetryDelayMs,
      settlementItemMaxAttempts: config.settlementItemMaxAttempts,
      settlementAutoRunEnabled: config.settlementAutoRunEnabled,
      settlementAutoRunHour: config.settlementAutoRunHour,
      settlementAutoRunMinute: config.settlementAutoRunMinute,
      asOf: new Date().toISOString(),
    };
  }
}
