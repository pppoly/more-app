/* eslint-disable @typescript-eslint/no-explicit-any */
import Stripe from 'stripe';

type IdRecord = { id: string };

const pickSelect = <T extends Record<string, any>>(record: T, select?: Record<string, boolean>) => {
  if (!select) return record;
  const result: Record<string, any> = {};
  Object.keys(select).forEach((key) => {
    if (select[key]) result[key] = (record as any)[key];
  });
  return result as Partial<T>;
};

const matchesWhere = (record: any, where: any): boolean => {
  if (!where) return true;
  if (where.AND && Array.isArray(where.AND)) {
    if (!where.AND.every((clause: any) => matchesWhere(record, clause))) return false;
  }
  if (where.OR && Array.isArray(where.OR)) {
    if (!where.OR.some((clause: any) => matchesWhere(record, clause))) return false;
  }
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'OR' || key === 'AND') continue;
    const value = (record as any)[key];
    if (cond === null) {
      if (value !== null && value !== undefined) return false;
      continue;
    }
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      let handled = false;
      if ('in' in cond) {
        handled = true;
        if (!Array.isArray((cond as any).in) || !(cond as any).in.includes(value)) return false;
      }
      if ('not' in cond) {
        handled = true;
        const notVal = (cond as any).not;
        if (notVal === null) {
          if (value === null || value === undefined) return false;
        } else if (value === notVal) return false;
      }
      if ('lt' in cond) {
        handled = true;
        const lt = (cond as any).lt;
        if (value instanceof Date && lt instanceof Date) {
          if (value >= lt) return false;
        } else if (typeof value === 'number' && typeof lt === 'number') {
          if (value >= lt) return false;
        } else {
          return false;
        }
      }
      if ('lte' in cond) {
        handled = true;
        const lte = (cond as any).lte;
        if (value instanceof Date && lte instanceof Date) {
          if (value > lte) return false;
        } else if (typeof value === 'number' && typeof lte === 'number') {
          if (value > lte) return false;
        } else {
          return false;
        }
      }
      if ('gt' in cond) {
        handled = true;
        const gt = (cond as any).gt;
        if (value instanceof Date && gt instanceof Date) {
          if (value <= gt) return false;
        } else if (typeof value === 'number' && typeof gt === 'number') {
          if (value <= gt) return false;
        } else {
          return false;
        }
      }
      if ('gte' in cond) {
        handled = true;
        const gte = (cond as any).gte;
        if (value instanceof Date && gte instanceof Date) {
          if (value < gte) return false;
        } else if (typeof value === 'number' && typeof gte === 'number') {
          if (value < gte) return false;
        } else {
          return false;
        }
      }
      if (!handled && value && typeof value === 'object' && !Array.isArray(value)) {
        handled = true;
        if (!matchesWhere(value, cond)) return false;
      }
      if (handled) continue;
    }
    if (value !== cond) return false;
  }
  return true;
};

const applyUpdate = (record: any, data: any) => {
  for (const [key, value] of Object.entries(data ?? {})) {
    if (value === undefined) continue;
    if (value && typeof value === 'object' && !Array.isArray(value) && 'increment' in value) {
      record[key] = (record[key] ?? 0) + Number((value as any).increment ?? 0);
      continue;
    }
    record[key] = value;
  }
  record.updatedAt = new Date();
  return record;
};

export class InMemoryPrisma {
  private seq = 0;

  shouldFailPaymentGatewayEventUpsert: boolean = false;
  shouldFailEventInboxUpsert: boolean = false;

  payments: any[] = [];
  registrations: any[] = [];
  ledgerEntries: any[] = [];
  paymentGatewayEvents: any[] = [];
  eventInboxes: any[] = [];
  communities: any[] = [];
  settlementBatches: any[] = [];
  settlementItems: any[] = [];
  settlementAuditEvents: any[] = [];

  private nextId(prefix: string) {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  $transaction = async (arg: any) => {
    if (typeof arg === 'function') {
      return arg(this);
    }
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    throw new Error('Unsupported $transaction call');
  };

  payment = {
    findUnique: async (args: any) => {
      const id = args?.where?.id;
      const found = this.payments.find((p) => p.id === id) ?? null;
      return found ? pickSelect(found, args?.select) : null;
    },
    findFirst: async (args: any) => {
      const where = args?.where;
      const found = this.payments.find((p) => matchesWhere(p, where)) ?? null;
      return found ? pickSelect(found, args?.select) : null;
    },
    findMany: async (args: any) => {
      const where = args?.where;
      let items = this.payments.filter((p) => matchesWhere(p, where));
      if (args?.orderBy?.createdAt === 'asc') {
        items = items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      } else if (args?.orderBy?.createdAt === 'desc') {
        items = items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      if (typeof args?.take === 'number') items = items.slice(0, args.take);
      return items.map((p) => pickSelect(p, args?.select));
    },
    update: async (args: any) => {
      const id = args?.where?.id;
      const found = this.payments.find((p) => p.id === id);
      if (!found) throw new Error('Payment not found');
      applyUpdate(found, args?.data);
      return pickSelect(found, args?.select);
    },
    updateMany: async (args: any) => {
      const where = args?.where;
      const data = args?.data;
      let count = 0;
      for (const p of this.payments) {
        if (!matchesWhere(p, where)) continue;
        applyUpdate(p, data);
        count += 1;
      }
      return { count };
    },
    upsert: async (args: any) => {
      const where = args?.where ?? {};
      const registrationId = where.registrationId;
      const existing = this.payments.find((p) => p.registrationId === registrationId) ?? null;
      if (existing) {
        applyUpdate(existing, args.update);
        return existing;
      }
      const created = {
        id: this.nextId('pay'),
        createdAt: new Date(),
        updatedAt: new Date(),
        refundedGrossTotal: 0,
        refundedPlatformFeeTotal: 0,
        reversedMerchantTotal: 0,
        ...args.create,
      };
      this.payments.push(created);
      return created;
    },
    create: async (args: any) => {
      const created = {
        id: this.nextId('pay'),
        createdAt: new Date(),
        updatedAt: new Date(),
        refundedGrossTotal: 0,
        refundedPlatformFeeTotal: 0,
        reversedMerchantTotal: 0,
        ...args.data,
      };
      this.payments.push(created);
      return created;
    },
    aggregate: async (args: any) => {
      const where = args?.where;
      const rows = this.payments.filter((p) => matchesWhere(p, where));
      const sumSpec = args?._sum ?? {};
      const result: any = { _sum: {} };
      for (const key of Object.keys(sumSpec)) {
        result._sum[key] = rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
      }
      return result;
    },
    count: async (args: any) => {
      const where = args?.where;
      return this.payments.filter((p) => matchesWhere(p, where)).length;
    },
    groupBy: async () => {
      throw new Error('groupBy not implemented for payment');
    },
  };

  eventRegistration = {
    findUnique: async (args: any) => {
      const id = args?.where?.id;
      const found = this.registrations.find((r) => r.id === id) ?? null;
      return found ? pickSelect(found, args?.select) : null;
    },
    update: async (args: any) => {
      const id = args?.where?.id;
      const found = this.registrations.find((r) => r.id === id);
      if (!found) throw new Error('Registration not found');
      applyUpdate(found, args?.data);
      return pickSelect(found, args?.select);
    },
    updateMany: async (args: any) => {
      const where = args?.where;
      const data = args?.data;
      let count = 0;
      for (const r of this.registrations) {
        if (!matchesWhere(r, where)) continue;
        applyUpdate(r, data);
        count += 1;
      }
      return { count };
    },
  };

  ledgerEntry = {
    findUnique: async (args: any) => {
      const idempotencyKey = args?.where?.idempotencyKey;
      const found = this.ledgerEntries.find((e) => e.idempotencyKey === idempotencyKey) ?? null;
      return found ? pickSelect(found, args?.select) : null;
    },
    findMany: async (args: any) => {
      const where = args?.where;
      const rows = this.ledgerEntries.filter((e) => matchesWhere(e, where));
      return rows.map((e) => pickSelect(e, args?.select));
    },
    create: async (args: any) => {
      const created = { id: this.nextId('led'), createdAt: new Date(), ...args.data };
      if (!created.occurredAt) created.occurredAt = new Date();
      this.ledgerEntries.push(created);
      return created;
    },
    aggregate: async (args: any) => {
      const where = args?.where;
      const rows = this.ledgerEntries.filter((e) => matchesWhere(e, where));
      const sumSpec = args?._sum ?? {};
      const result: any = { _sum: {} };
      for (const key of Object.keys(sumSpec)) {
        result._sum[key] = rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
      }
      return result;
    },
    groupBy: async (args: any) => {
      const where = args?.where;
      const rows = this.ledgerEntries.filter((e) => matchesWhere(e, where));
      const groups = new Map<string, any>();
      for (const row of rows) {
        const key = row.businessCommunityId;
        const current = groups.get(key) ?? { businessCommunityId: key, _sum: { amount: 0 } };
        current._sum.amount += row.amount ?? 0;
        groups.set(key, current);
      }
      return Array.from(groups.values());
    },
  };

  paymentGatewayEvent = {
    create: async (args: any) => {
      const created = {
        id: this.nextId('pge'),
        attempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...args.data,
      };
      this.paymentGatewayEvents.push(created);
      return created;
    },
    findUnique: async (args: any) => {
      if (args?.where?.id) {
        const found = this.paymentGatewayEvents.find((e) => e.id === args.where.id) ?? null;
        return found ? pickSelect(found, args?.select) : null;
      }
      const composite = args?.where?.provider_providerEventId;
      if (composite?.provider && composite?.providerEventId) {
        const found =
          this.paymentGatewayEvents.find(
            (e) => e.provider === composite.provider && e.providerEventId === composite.providerEventId,
          ) ?? null;
        return found ? pickSelect(found, args?.select) : null;
      }
      return null;
    },
    upsert: async (args: any) => {
      if (this.shouldFailPaymentGatewayEventUpsert) {
        throw new Error('db_write_failed:paymentGatewayEvent');
      }
      const composite = args?.where?.provider_providerEventId;
      const existing =
        composite?.provider && composite?.providerEventId
          ? this.paymentGatewayEvents.find(
              (e) => e.provider === composite.provider && e.providerEventId === composite.providerEventId,
            ) ?? null
          : null;
      if (existing) {
        applyUpdate(existing, args.update);
        return existing;
      }
      const created = {
        id: this.nextId('pge'),
        attempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...args.create,
      };
      this.paymentGatewayEvents.push(created);
      return created;
    },
    update: async (args: any) => {
      const id = args?.where?.id;
      const found = this.paymentGatewayEvents.find((e) => e.id === id);
      if (!found) throw new Error('PaymentGatewayEvent not found');
      applyUpdate(found, args?.data);
      return found;
    },
    updateMany: async (args: any) => {
      const where = args?.where;
      const data = args?.data;
      let count = 0;
      for (const e of this.paymentGatewayEvents) {
        if (!matchesWhere(e, where)) continue;
        applyUpdate(e, data);
        count += 1;
      }
      return { count };
    },
    findMany: async (args: any) => {
      const where = args?.where;
      let rows = this.paymentGatewayEvents.filter((e) => matchesWhere(e, where));
      if (args?.orderBy?.nextAttemptAt === 'asc') {
        rows = rows.sort((a, b) => (a.nextAttemptAt?.getTime?.() ?? 0) - (b.nextAttemptAt?.getTime?.() ?? 0));
      } else if (args?.orderBy?.nextAttemptAt === 'desc') {
        rows = rows.sort((a, b) => (b.nextAttemptAt?.getTime?.() ?? 0) - (a.nextAttemptAt?.getTime?.() ?? 0));
      }
      if (typeof args?.take === 'number') rows = rows.slice(0, args.take);
      return rows.map((e) => pickSelect(e, args?.select));
    },
  };

  eventInbox = {
    upsert: async (args: any) => {
      if (this.shouldFailEventInboxUpsert) {
        throw new Error('db_write_failed:eventInbox');
      }
      const composite = args?.where?.type_eventId;
      const existing =
        composite?.type && composite?.eventId
          ? this.eventInboxes.find((e) => e.type === composite.type && e.eventId === composite.eventId) ?? null
          : null;
      if (existing) {
        applyUpdate(existing, args.update);
        return existing;
      }
      const created = {
        id: this.nextId('inbox'),
        attempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...args.create,
      };
      this.eventInboxes.push(created);
      return created;
    },
    update: async (args: any) => {
      const composite = args?.where?.type_eventId;
      const found = this.eventInboxes.find((e) => e.type === composite.type && e.eventId === composite.eventId);
      if (!found) throw new Error('EventInbox not found');
      applyUpdate(found, args.data);
      return found;
    },
    findMany: async (args: any) => {
      const where = args?.where;
      let rows = this.eventInboxes.filter((e) => matchesWhere(e, where));
      if (args?.orderBy?.nextAttemptAt === 'asc') {
        rows = rows.sort((a, b) => (a.nextAttemptAt?.getTime?.() ?? 0) - (b.nextAttemptAt?.getTime?.() ?? 0));
      }
      if (typeof args?.take === 'number') rows = rows.slice(0, args.take);
      return rows;
    },
  };

  community = {
    findMany: async (args: any) => {
      const where = args?.where;
      const items = this.communities.filter((c) => matchesWhere(c, where));
      return items.map((c) => pickSelect(c, args?.select));
    },
    findUnique: async (args: any) => {
      const id = args?.where?.id;
      const found = this.communities.find((c) => c.id === id) ?? null;
      return found ? pickSelect(found, args?.select) : null;
    },
    update: async (args: any) => {
      const id = args?.where?.id;
      const found = this.communities.find((c) => c.id === id);
      if (!found) throw new Error('Community not found');
      applyUpdate(found, args?.data);
      return pickSelect(found, args?.select);
    },
    count: async () => 0,
  };

  settlementBatch = {
    create: async (args: any) => {
      const created = { id: this.nextId('sb'), createdAt: new Date(), updatedAt: new Date(), ...args.data, items: [] };
      this.settlementBatches.push(created);
      return created;
    },
    findFirst: async (args: any) => {
      const where = args?.where;
      let rows = this.settlementBatches.filter((b) => matchesWhere(b, where));
      if (args?.orderBy?.createdAt === 'desc') {
        rows = rows.sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0));
      } else if (args?.orderBy?.createdAt === 'asc') {
        rows = rows.sort((a, b) => (a.createdAt?.getTime?.() ?? 0) - (b.createdAt?.getTime?.() ?? 0));
      }
      return rows[0] ?? null;
    },
    update: async (args: any) => {
      const id = args?.where?.id;
      const found = this.settlementBatches.find((b) => b.id === id);
      if (!found) throw new Error('SettlementBatch not found');
      applyUpdate(found, args?.data);
      return found;
    },
    findUnique: async (args: any) => {
      const id = args?.where?.id;
      const found = this.settlementBatches.find((b) => b.id === id) ?? null;
      if (!found) return null;
      if (args?.include?.items) {
        const items = this.settlementItems.filter((i) => i.batchId === id);
        return { ...found, items };
      }
      return found;
    },
  };

  settlementItem = {
    create: async (args: any) => {
      const created: any = { id: this.nextId('si'), createdAt: new Date(), updatedAt: new Date(), ...args.data };
      const batch = this.settlementBatches.find((b) => b.id === created.batchId) ?? null;
      if (batch) created.batch = batch;
      this.settlementItems.push(created);
      return created;
    },
    update: async (args: any) => {
      const id = args?.where?.id;
      const found = this.settlementItems.find((i) => i.id === id);
      if (!found) throw new Error('SettlementItem not found');
      applyUpdate(found, args?.data);
      return found;
    },
    updateMany: async (args: any) => {
      const where = args?.where;
      const data = args?.data;
      let count = 0;
      for (const item of this.settlementItems) {
        if (!matchesWhere(item, where)) continue;
        applyUpdate(item, data);
        count += 1;
      }
      return { count };
    },
    findMany: async (args: any) => {
      const where = args?.where;
      let items = this.settlementItems.filter((i) => matchesWhere(i, where));
      if (args?.orderBy?.settleAmount === 'desc') {
        items = items.sort((a, b) => b.settleAmount - a.settleAmount);
      }
      return items;
    },
    aggregate: async (args: any) => {
      const where = args?.where;
      const rows = this.settlementItems.filter((i) => matchesWhere(i, where));
      const sumSpec = args?._sum ?? {};
      const result: any = { _sum: {} };
      for (const key of Object.keys(sumSpec)) {
        result._sum[key] = rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
      }
      return result;
    },
    groupBy: async (args: any) => {
      const where = args?.where;
      const rows = this.settlementItems.filter((i) => matchesWhere(i, where));
      const groups = new Map<string, any>();
      for (const row of rows) {
        const key = row.hostId;
        const current = groups.get(key) ?? { hostId: key, _sum: { settleAmount: 0 } };
        current._sum.settleAmount += row.settleAmount ?? 0;
        groups.set(key, current);
      }
      return Array.from(groups.values());
    },
  };

  settlementAuditEvent = {
    create: async (args: any) => {
      const created: any = { id: this.nextId('sua'), createdAt: new Date(), ...args.data };
      this.settlementAuditEvents.push(created);
      return created;
    },
  };
}

export class StripeClientStub {
  refundsCreateCalls: Array<{ params: any; opts?: any }> = [];
  transfersCreateCalls: Array<{ params: any; opts?: any }> = [];
  paymentIntents: Record<string, Stripe.PaymentIntent> = {};

  shouldFailTransfersCreate: boolean = false;
  shouldFailRefundsCreate: boolean = false;

  webhooks = {
    constructEvent: (rawBody: Buffer) => JSON.parse(rawBody.toString('utf8')) as Stripe.Event,
  };

  checkout = {
    sessions: {
      create: async () => {
        throw new Error('not implemented');
      },
      retrieve: async () => {
        throw new Error('not implemented');
      },
      expire: async () => {
        throw new Error('not implemented');
      },
    },
  };

  refunds = {
    create: async (params: any, opts?: any) => {
      this.refundsCreateCalls.push({ params, opts });
      if (this.shouldFailRefundsCreate) throw new Error('refund_failed');
      const idx = this.refundsCreateCalls.length;
      return { id: `re_test_${idx}`, amount: params.amount, currency: 'jpy' } as any;
    },
  };

  paymentIntentsApi = {
    retrieve: async (paymentIntentId: string) => {
      const intent = this.paymentIntents[paymentIntentId];
      if (!intent) throw new Error(`payment_intent_not_found:${paymentIntentId}`);
      return intent;
    },
  };

  transfers = {
    create: async (params: any, opts?: any) => {
      this.transfersCreateCalls.push({ params, opts });
      if (this.shouldFailTransfersCreate) throw new Error('insufficient_funds');
      return { id: `tr_${this.transfersCreateCalls.length}`, ...params } as any;
    },
    retrieve: async () => {
      throw new Error('not implemented');
    },
  };
}

export const buildStripeServiceStub = (client: StripeClientStub) => {
  return {
    enabled: true,
    successUrlBase: 'https://example.com/success',
    cancelUrlBase: 'https://example.com/cancel',
    client: {
      webhooks: client.webhooks,
      checkout: client.checkout,
      refunds: client.refunds,
      paymentIntents: { retrieve: client.paymentIntentsApi.retrieve },
      transfers: client.transfers,
    },
  };
};

export class PermissionsServiceStub {
  assertEventManager = async () => {};
  assertCommunityManager = async () => {};
  assertAdmin = async () => {};
  assertOrganizerPayoutPolicyAccepted = async () => {};
}

export class NotificationServiceStub {
  notifyRegistrationSuccess = async () => {};
  notifyRefundByStripeCharge = async () => {};
  notifyRefundByPayment = async () => {};
}

export class SettlementServiceStub {
  runSettlementBatch = async () => ({ batchId: 'stub', status: 'skipped' });
}
