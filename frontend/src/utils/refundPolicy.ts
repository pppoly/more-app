export type RefundPolicyMode = 'none' | 'single' | 'tiered';

export type RefundPolicyTier = {
  daysBefore: number;
  percent: number;
};

export type RefundPolicyRules = {
  mode: RefundPolicyMode;
  tiers?: RefundPolicyTier[];
  single?: RefundPolicyTier;
};

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const normalizeTier = (tier: RefundPolicyTier | undefined, fallback: RefundPolicyTier): RefundPolicyTier => {
  if (!tier || typeof tier !== 'object') return { ...fallback };
  const daysBefore = Number.isFinite(Number(tier.daysBefore)) ? Math.max(0, Number(tier.daysBefore)) : fallback.daysBefore;
  const percent = Number.isFinite(Number(tier.percent)) ? clampPercent(Number(tier.percent)) : fallback.percent;
  return { daysBefore, percent };
};

export const normalizeRefundPolicyRules = (rules?: RefundPolicyRules | null): RefundPolicyRules => {
  if (!rules || typeof rules !== 'object') {
    return {
      mode: 'tiered',
      tiers: [
        { daysBefore: 7, percent: 100 },
        { daysBefore: 3, percent: 50 },
      ],
    };
  }
  if (rules.mode === 'none') return { mode: 'none' };
  if (rules.mode === 'single') {
    return {
      mode: 'single',
      single: normalizeTier(rules.single, { daysBefore: 3, percent: 50 }),
    };
  }
  const tiers = Array.isArray(rules.tiers) ? rules.tiers : [];
  return {
    mode: 'tiered',
    tiers: [
      normalizeTier(tiers[0], { daysBefore: 7, percent: 100 }),
      normalizeTier(tiers[1], { daysBefore: 3, percent: 50 }),
    ],
  };
};

export const buildRefundPolicyText = (rules?: RefundPolicyRules | null): string => {
  const normalized = normalizeRefundPolicyRules(rules);
  if (normalized.mode === 'none') {
    return '本イベントは返金不可です。決済後のキャンセルは返金できません。';
  }
  if (normalized.mode === 'single') {
    const single = normalizeTier(normalized.single, { daysBefore: 3, percent: 50 });
    return `本イベントは開始${single.daysBefore}日前（含む）まで${single.percent}%返金し、それ以降は返金不可です。`;
  }
  const tiers = normalized.tiers ?? [];
  const tier1 = normalizeTier(tiers[0], { daysBefore: 7, percent: 100 });
  const tier2 = normalizeTier(tiers[1], { daysBefore: 3, percent: 50 });
  return `本イベントは開始${tier1.daysBefore}日前（含む）まで${tier1.percent}%、開始${tier2.daysBefore}日前（含む）まで${tier2.percent}%返金し、当日以降は返金不可です。`;
};

export const resolveRefundPolicyText = (config?: Record<string, any> | null): string => {
  const text = config?.refundPolicy;
  if (typeof text === 'string' && text.trim()) return text.trim();
  const rules = config?.refundPolicyRules as RefundPolicyRules | undefined;
  if (!rules) return '';
  return buildRefundPolicyText(rules);
};

export const calculateRefundPercent = (
  rules: RefundPolicyRules | null | undefined,
  startTime: Date | string | null | undefined,
  now: Date = new Date(),
): number | null => {
  if (!rules || !startTime) return null;
  const normalized = normalizeRefundPolicyRules(rules);
  if (normalized.mode === 'none') return 0;
  const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  if (normalized.mode === 'single' && normalized.single) {
    const cutoff = new Date(start.getTime() - normalized.single.daysBefore * dayMs);
    return now <= cutoff ? normalized.single.percent : 0;
  }
  if (normalized.mode === 'tiered' && normalized.tiers?.length) {
    const tiers = [...normalized.tiers].sort((a, b) => b.daysBefore - a.daysBefore);
    for (const tier of tiers) {
      const cutoff = new Date(start.getTime() - tier.daysBefore * dayMs);
      if (now <= cutoff) return tier.percent;
    }
    return 0;
  }
  return null;
};

export const calculateRefundAmount = (amount: number, percent: number) => {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return Math.round((amount * percent) / 100);
};
