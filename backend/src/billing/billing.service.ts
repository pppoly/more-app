/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars */
import { Injectable, Logger } from '@nestjs/common';
import { BillingDecision, BillingPolicy, BillingUsageSnapshot } from './billing.types';
import { buildDefaultPolicies } from './billing.config';

type UsageKey = { serviceId: string; date: string; month: string };

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly policies = buildDefaultPolicies();
  private readonly usageDaily = new Map<string, number>();
  private readonly usageMonthly = new Map<string, number>();

  getPolicy(serviceId: string): BillingPolicy {
    return this.policies[serviceId] ?? { enabled: true };
  }

  /**
   * Check limits and (optionally) record usage.
   */
  enforce(
    serviceId: string,
    amount = 1,
    opts?: { estimateUnits?: number; dryRun?: boolean },
  ): BillingDecision {
    const policy = this.getPolicy(serviceId);
    if (!policy.enabled) {
      return { allowed: false, reason: 'disabled', remainingDaily: null, remainingMonthly: null, estimatedCost: null };
    }

    const { date, month, keyDay, keyMonth } = this.buildKeys(serviceId);
    const dailyCount = this.usageDaily.get(keyDay) ?? 0;
    const monthlyCount = this.usageMonthly.get(keyMonth) ?? 0;

    const exceedsDaily = policy.dailyLimit !== undefined && dailyCount + amount > policy.dailyLimit;
    const exceedsMonthly = policy.monthlyLimit !== undefined && monthlyCount + amount > policy.monthlyLimit;

    if (exceedsDaily || exceedsMonthly) {
      return {
        allowed: false,
        reason: exceedsDaily ? 'daily_limit' : 'monthly_limit',
        remainingDaily: policy.dailyLimit !== undefined ? Math.max(0, policy.dailyLimit - dailyCount) : null,
        remainingMonthly: policy.monthlyLimit !== undefined ? Math.max(0, policy.monthlyLimit - monthlyCount) : null,
        estimatedCost: this.estimateCost(policy, opts?.estimateUnits ?? amount),
      };
    }

    if (!opts?.dryRun) {
      this.usageDaily.set(keyDay, dailyCount + amount);
      this.usageMonthly.set(keyMonth, monthlyCount + amount);
    }

    return {
      allowed: true,
      remainingDaily: policy.dailyLimit !== undefined ? policy.dailyLimit - (dailyCount + amount) : null,
      remainingMonthly: policy.monthlyLimit !== undefined ? policy.monthlyLimit - (monthlyCount + amount) : null,
      estimatedCost: this.estimateCost(policy, opts?.estimateUnits ?? amount),
    };
  }

  snapshot(serviceId: string): BillingUsageSnapshot {
    const { date, month, keyDay, keyMonth } = this.buildKeys(serviceId);
    return {
      serviceId,
      date,
      month,
      dailyCount: this.usageDaily.get(keyDay) ?? 0,
      monthlyCount: this.usageMonthly.get(keyMonth) ?? 0,
    };
  }

  private buildKeys(serviceId: string) {
    const now = new Date();
    const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    return {
      date,
      month,
      keyDay: `${serviceId}:${date}`,
      keyMonth: `${serviceId}:${month}`,
    };
  }

  private estimateCost(policy: BillingPolicy, units: number): number | null {
    if (policy.unitCost === undefined) return null;
    return Math.round(policy.unitCost * units * 100000) / 100000;
  }
}
