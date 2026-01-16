import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../stripe/stripe.service';
import { getPaymentsConfig } from './payments.config';
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
  counts: {
    payments: number;
    refundedPayments: number;
    unreconciledPayments: number;
    totalGross: number;
    totalRefundedGross: number;
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

  private async computeHostStats(periodTo: Date): Promise<SettlementHostStats[]> {
    const payments = await this.prisma.payment.findMany({
      where: {
        method: 'stripe',
        chargeModel: 'platform_charge',
        communityId: { not: null },
        status: { in: ['paid', 'partial_refunded', 'refunded'] },
        createdAt: { lt: periodTo },
      },
      select: {
        id: true,
        communityId: true,
        amount: true,
        refundedGrossTotal: true,
      },
    });

    const paymentIds = payments.map((p) => p.id);

    const [paidOutAgg, hostPayableAgg, hostPayableReversalAgg, payableRows] = await this.prisma.$transaction([
      this.prisma.settlementItem.groupBy({
        by: ['hostId'],
        where: { status: { in: ['completed', 'transferred'] } },
        orderBy: { hostId: 'asc' },
        _sum: { settleAmount: true },
      }),
      this.prisma.ledgerEntry.groupBy({
        by: ['businessCommunityId'],
        where: {
          businessCommunityId: { not: null },
          entryType: 'host_payable',
          provider: 'internal',
          occurredAt: { lt: periodTo },
        },
        orderBy: { businessCommunityId: 'asc' },
        _sum: { amount: true },
      }),
      this.prisma.ledgerEntry.groupBy({
        by: ['businessCommunityId'],
        where: {
          businessCommunityId: { not: null },
          entryType: 'host_payable_reversal',
          provider: 'internal',
          occurredAt: { lt: periodTo },
        },
        orderBy: { businessCommunityId: 'asc' },
        _sum: { amount: true },
      }),
      this.prisma.ledgerEntry.findMany({
        where: {
          businessPaymentId: { in: paymentIds },
          entryType: 'host_payable',
          provider: 'internal',
        },
        select: { businessPaymentId: true },
      }),
    ]);

    const paidOutByHost = new Map<string, number>();
    for (const row of paidOutAgg) {
      paidOutByHost.set(row.hostId, row._sum?.settleAmount ?? 0);
    }

    const hostPayableByHost = new Map<string, number>();
    for (const row of hostPayableAgg) {
      if (!row.businessCommunityId) continue;
      hostPayableByHost.set(row.businessCommunityId, row._sum?.amount ?? 0);
    }

    const hostPayableReversalByHost = new Map<string, number>();
    for (const row of hostPayableReversalAgg) {
      if (!row.businessCommunityId) continue;
      hostPayableReversalByHost.set(row.businessCommunityId, row._sum?.amount ?? 0);
    }

    const paymentIdsWithHostPayable = new Set<string>(payableRows.map((r) => r.businessPaymentId));

    const allHostIds = new Set<string>();
    for (const payment of payments) {
      if (payment.communityId) allHostIds.add(payment.communityId);
    }
    for (const hostId of paidOutByHost.keys()) allHostIds.add(hostId);
    for (const hostId of hostPayableByHost.keys()) allHostIds.add(hostId);
    for (const hostId of hostPayableReversalByHost.keys()) allHostIds.add(hostId);

    const statsByHost = new Map<string, SettlementHostStats>();
    for (const hostId of allHostIds) {
      const accrued =
        (hostPayableByHost.get(hostId) ?? 0) - (hostPayableReversalByHost.get(hostId) ?? 0);
      statsByHost.set(hostId, {
        hostId,
        accruedNet: accrued,
        paidOut: paidOutByHost.get(hostId) ?? 0,
        hostBalance: 0,
        settleAmount: 0,
        carryReceivable: 0,
        counts: {
          payments: 0,
          refundedPayments: 0,
          unreconciledPayments: 0,
          totalGross: 0,
          totalRefundedGross: 0,
        },
      });
    }

    for (const payment of payments) {
      const hostId = payment.communityId;
      if (!hostId) continue;
      const entry = statsByHost.get(hostId);
      if (!entry) continue;
      entry.counts.payments += 1;
      entry.counts.totalGross += payment.amount ?? 0;
      entry.counts.totalRefundedGross += payment.refundedGrossTotal ?? 0;
      if ((payment.refundedGrossTotal ?? 0) > 0) entry.counts.refundedPayments += 1;
      if (!paymentIdsWithHostPayable.has(payment.id)) entry.counts.unreconciledPayments += 1;
    }

    const stats = Array.from(statsByHost.values()).map((s) => {
      const hostBalance = s.accruedNet - s.paidOut;
      const settleAmount = hostBalance > 0 ? hostBalance : 0;
      const carryReceivable = hostBalance < 0 ? Math.abs(hostBalance) : 0;
      return { ...s, hostBalance, settleAmount, carryReceivable };
    });

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

  async runSettlementBatch(params: { periodFrom: Date; periodTo: Date }) {
    const config = getPaymentsConfig();
    const settlementEnabled = config.settlementEnabled && this.stripeService.enabled;

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

    const stats = await this.computeHostStats(params.periodTo);
    const hostIds = stats.map((s) => s.hostId);
    const communities = await this.prisma.community.findMany({
      where: { id: { in: hostIds } },
      select: { id: true, stripeAccountId: true, stripeAccountOnboarded: true },
    });
    const communityById = new Map(communities.map((c) => [c.id, c]));

    const batch = await this.prisma.settlementBatch.create({
      data: {
        periodFrom: params.periodFrom,
        periodTo: params.periodTo,
        currency: 'jpy',
        status: settlementEnabled ? 'pending' : 'dry_run',
        runAt: new Date(),
        meta: {
          settlementEnabled,
          settlementReportDir: config.settlementReportDir,
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
            status: settlementEnabled ? (s.settleAmount > 0 ? 'pending' : 'skipped') : 'dry_run',
          },
        });
        created.push(item);
      }
      return created;
    });

    let transferSucceeded = 0;
    let transferFailed = 0;
    if (settlementEnabled) {
      for (const item of items) {
        if (item.settleAmount <= 0) continue;
        const claimed = await this.prisma.settlementItem.updateMany({
          where: { id: item.id, status: 'pending', stripeTransferId: null },
          data: { status: 'processing', errorMessage: null },
        });
        if (claimed.count !== 1) continue;
        const host = communityById.get(item.hostId);
        const stripeAccountId = host?.stripeAccountId ?? null;
        if (!stripeAccountId || !host?.stripeAccountOnboarded) {
          transferFailed += 1;
          await this.prisma.settlementItem.update({
            where: { id: item.id },
            data: { status: 'failed', errorMessage: 'connected_account_missing_or_not_onboarded' },
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
            periodFrom: params.periodFrom,
            periodTo: params.periodTo,
          });
          transferSucceeded += 1;
          await this.prisma.settlementItem.update({
            where: { id: item.id },
            data: { status: 'completed', stripeTransferId: transfer.id },
          });
        } catch (err) {
          transferFailed += 1;
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(`[settlement] transfer failed batch=${batch.id} item=${item.id} host=${item.hostId} ${message}`);
          await this.prisma.settlementItem.update({
            where: { id: item.id },
            data: { status: 'failed', errorMessage: message },
          });
        }
      }
    }

    const finalStatus =
      !settlementEnabled
        ? 'dry_run'
        : transferFailed > 0
          ? transferSucceeded > 0
            ? 'partial_failed'
            : 'failed'
          : 'completed';
    await this.prisma.settlementBatch.update({
      where: { id: batch.id },
      data: { status: finalStatus },
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
    return { batchId: batch.id, status: finalStatus };
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

    for (const item of items) {
      if (item.settleAmount <= 0) continue;
      if (item.status === 'completed' || item.status === 'transferred') continue;
      if (item.stripeTransferId) continue;

      const claimed = await this.prisma.settlementItem.updateMany({
        where: {
          id: item.id,
          stripeTransferId: null,
          status: { in: ['pending', 'failed', 'dry_run'] },
        },
        data: { status: 'processing', errorMessage: null },
      });
      if (claimed.count !== 1) continue;

      const host = communityById.get(item.hostId);
      const stripeAccountId = host?.stripeAccountId ?? null;
      if (!stripeAccountId || !host?.stripeAccountOnboarded) {
        transferFailed += 1;
        await this.prisma.settlementItem.update({
          where: { id: item.id },
          data: { status: 'failed', errorMessage: 'connected_account_missing_or_not_onboarded' },
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
        await this.prisma.settlementItem.update({
          where: { id: item.id },
          data: { status: 'completed', stripeTransferId: transfer.id, errorMessage: null },
        });
      } catch (err) {
        transferFailed += 1;
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`[settlement] retry transfer failed batch=${batch.id} item=${item.id} host=${item.hostId} ${message}`);
        await this.prisma.settlementItem.update({
          where: { id: item.id },
          data: { status: 'failed', errorMessage: message },
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
    const finalStatus =
      failedCount > 0 ? (completedCount > 0 ? 'partial_failed' : 'failed') : pendingCount > 0 ? 'pending' : 'completed';

    await this.prisma.settlementBatch.update({
      where: { id: batch.id },
      data: { status: finalStatus },
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
    return { batchId: batch.id, status: finalStatus };
  }
}
