export interface BillingPolicy {
  enabled: boolean;
  dailyLimit?: number;
  monthlyLimit?: number;
  unitCost?: number; // estimated cost per call/unit
}

export interface BillingDecision {
  allowed: boolean;
  reason?: string;
  remainingDaily?: number | null;
  remainingMonthly?: number | null;
  estimatedCost?: number | null;
}

export interface BillingUsageSnapshot {
  serviceId: string;
  date: string;
  month: string;
  dailyCount: number;
  monthlyCount: number;
}
