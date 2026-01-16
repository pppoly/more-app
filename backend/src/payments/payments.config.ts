export type PaymentsChargeModel = 'platform_charge' | 'destination_charge';

export type PaymentsConfig = {
  chargeModel: PaymentsChargeModel;
  settlementEnabled: boolean;
  settlementReportDir: string;
  settlementRetryIntervalMs: number;
};

let cachedConfig: PaymentsConfig | null = null;

const parseBoolean = (value: string | undefined, defaultValue: boolean) => {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'on', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'off', 'no'].includes(normalized)) return false;
  return defaultValue;
};

const parseChargeModel = (value: string | undefined): PaymentsChargeModel => {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'destination_charge') return 'destination_charge';
  return 'platform_charge';
};

export const getPaymentsConfig = (): PaymentsConfig => {
  if (cachedConfig) return cachedConfig;
  cachedConfig = {
    chargeModel: parseChargeModel(process.env.PAYMENT_CHARGE_MODEL),
    settlementEnabled: parseBoolean(process.env.SETTLEMENT_ENABLED, false),
    settlementReportDir: (process.env.SETTLEMENT_REPORT_DIR || '.logs/settlement').trim() || '.logs/settlement',
    settlementRetryIntervalMs: Number(process.env.SETTLEMENT_RETRY_INTERVAL_MS ?? 30_000),
  };
  return cachedConfig;
};

export const resetPaymentsConfigForTest = () => {
  cachedConfig = null;
};
