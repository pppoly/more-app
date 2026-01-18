export type PaymentsChargeModel = 'platform_charge' | 'destination_charge';

export type PaymentsConfig = {
  chargeModel: PaymentsChargeModel;
  settlementEnabled: boolean;
  settlementReportDir: string;
  settlementRetryIntervalMs: number;
  settlementDelayDays: number;
  settlementWindowDays: number;
  settlementMinTransferAmount: number;
  settlementItemRetryDelayMs: number;
  settlementItemMaxAttempts: number;
  settlementItemProcessingTimeoutMs: number;
  settlementAutoRunEnabled: boolean;
  settlementAutoRunHour: number;
  settlementAutoRunMinute: number;
  settlementTimeZone: string;
  settlementPayoutMode: 'BATCH' | 'REALTIME';
  settlementR3Enabled: boolean;
  settlementR3WhitelistCommunityIds: string[];
  settlementR3WhitelistEventIds: string[];
  settlementR3WhitelistEventCategories: string[];
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

const parsePayoutMode = (value: string | undefined): 'BATCH' | 'REALTIME' => {
  const normalized = (value ?? '').trim().toUpperCase();
  if (normalized === 'REALTIME') return 'REALTIME';
  return 'BATCH';
};

const parseCsv = (value: string | undefined) => {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const parseInteger = (
  value: string | undefined,
  defaultValue: number,
  params: { min: number; max: number },
) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultValue;
  const rounded = Math.trunc(parsed);
  if (rounded < params.min) return params.min;
  if (rounded > params.max) return params.max;
  return rounded;
};

export const getPaymentsConfig = (): PaymentsConfig => {
  if (cachedConfig) return cachedConfig;
  cachedConfig = {
    chargeModel: parseChargeModel(process.env.PAYMENT_CHARGE_MODEL),
    settlementEnabled: parseBoolean(process.env.SETTLEMENT_ENABLED, false),
    settlementReportDir: (process.env.SETTLEMENT_REPORT_DIR || '.logs/settlement').trim() || '.logs/settlement',
    settlementRetryIntervalMs: Number(process.env.SETTLEMENT_RETRY_INTERVAL_MS ?? 30_000),
    settlementDelayDays: parseInteger(process.env.SETTLEMENT_DELAY_DAYS, 7, { min: 0, max: 365 }),
    settlementWindowDays: parseInteger(process.env.SETTLEMENT_WINDOW_DAYS, 30, { min: 1, max: 3650 }),
    settlementMinTransferAmount: parseInteger(process.env.SETTLEMENT_MIN_TRANSFER_AMOUNT, 0, {
      min: 0,
      max: 1_000_000_000,
    }),
    settlementItemRetryDelayMs: parseInteger(process.env.SETTLEMENT_ITEM_RETRY_DELAY_MS, 60_000, {
      min: 1_000,
      max: 86_400_000,
    }),
    settlementItemMaxAttempts: parseInteger(process.env.SETTLEMENT_ITEM_MAX_ATTEMPTS, 5, { min: 1, max: 50 }),
    settlementItemProcessingTimeoutMs: parseInteger(process.env.SETTLEMENT_ITEM_PROCESSING_TIMEOUT_MS, 600_000, {
      min: 1_000,
      max: 86_400_000,
    }),
    settlementAutoRunEnabled: parseBoolean(process.env.SETTLEMENT_AUTORUN_ENABLED, false),
    settlementAutoRunHour: parseInteger(process.env.SETTLEMENT_AUTORUN_HOUR, 3, { min: 0, max: 23 }),
    settlementAutoRunMinute: parseInteger(process.env.SETTLEMENT_AUTORUN_MINUTE, 0, { min: 0, max: 59 }),
    settlementTimeZone: (process.env.APP_TIMEZONE || 'Asia/Tokyo').trim() || 'Asia/Tokyo',
    settlementPayoutMode: parsePayoutMode(process.env.SETTLEMENT_PAYOUT_MODE),
    settlementR3Enabled: parseBoolean(process.env.SETTLEMENT_R3_ENABLED, false),
    settlementR3WhitelistCommunityIds: parseCsv(process.env.SETTLEMENT_R3_WHITELIST_COMMUNITY_IDS),
    settlementR3WhitelistEventIds: parseCsv(process.env.SETTLEMENT_R3_WHITELIST_EVENT_IDS),
    settlementR3WhitelistEventCategories: parseCsv(process.env.SETTLEMENT_R3_WHITELIST_EVENT_CATEGORIES),
  };
  return cachedConfig;
};

export const resetPaymentsConfigForTest = () => {
  cachedConfig = null;
};
