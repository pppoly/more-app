import { BillingPolicy } from './billing.types';

type PolicyMap = Record<string, BillingPolicy>;

const parseNumber = (value: string | undefined, fallback?: number) => {
  if (!value) return fallback;
  const n = Number(value);
  return isNaN(n) ? fallback : n;
};

const envFlag = (key: string, fallback: boolean) => {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
};

const buildPolicyFromEnv = (serviceId: string, defaults: BillingPolicy): BillingPolicy => {
  const envKeyBase = serviceId.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  const enabled = envFlag(`BILLING_${envKeyBase}_ENABLED`, defaults.enabled);
  const dailyLimit = parseNumber(process.env[`BILLING_${envKeyBase}_DAILY_LIMIT`], defaults.dailyLimit);
  const monthlyLimit = parseNumber(process.env[`BILLING_${envKeyBase}_MONTHLY_LIMIT`], defaults.monthlyLimit);
  const unitCost = parseNumber(process.env[`BILLING_${envKeyBase}_UNIT_COST`], defaults.unitCost);
  return { enabled, dailyLimit, monthlyLimit, unitCost };
};

export const buildDefaultPolicies = (): PolicyMap => {
  const defaults: PolicyMap = {
    'content.textModeration': { enabled: true, dailyLimit: 5000, monthlyLimit: 150000, unitCost: 0.0004 },
    'content.imageModeration': { enabled: true, dailyLimit: 2000, monthlyLimit: 60000, unitCost: 0.001 },
    'vision.safeSearch': { enabled: true, dailyLimit: 2000, monthlyLimit: 60000, unitCost: 0.0 },
    'llm.default': { enabled: true, dailyLimit: 3000, monthlyLimit: 90000, unitCost: 0.002 },
  };

  const map: PolicyMap = {};
  const disableAll = envFlag('BILLING_DISABLE_ALL', false);

  for (const [id, policy] of Object.entries(defaults)) {
    const merged = buildPolicyFromEnv(id, policy);
    map[id] = {
      ...merged,
      enabled: disableAll ? false : merged.enabled,
    };
  }

  return map;
};
