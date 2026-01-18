import { Prisma } from '@prisma/client';
import { getPaymentsConfig } from './payments.config';

export type BackfillSettlementFieldsResult = {
  scanned: number;
  updated: number;
  skipped: number;
  missingEligibilitySource: number;
};

const resolveActiveRuleVersionId = async (tx: Prisma.TransactionClient) => {
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
};

const buildFields = (params: {
  now: Date;
  refundDeadlineAt?: Date | null;
  eventEndAt?: Date | null;
  communityId?: string | null;
  eventId?: string | null;
  eventCategory?: string | null;
}) => {
  const { now } = params;
  const config = getPaymentsConfig();
  const payoutMode = config.settlementPayoutMode;
  if (!params.refundDeadlineAt && !params.eventEndAt) {
    return {
      eligibleAt: null,
      payoutMode,
      eligibilityStatus: 'EXCEPTION',
      payoutStatus: 'NOT_SCHEDULED',
      reasonCode: 'missing_event_end',
    };
  }
  if (params.refundDeadlineAt) {
    const eligible = params.refundDeadlineAt <= now;
    return {
      eligibleAt: params.refundDeadlineAt,
      payoutMode,
      eligibilityStatus: eligible ? 'ELIGIBLE' : 'PENDING',
      payoutStatus: 'NOT_SCHEDULED',
      reasonCode: eligible ? 'refund_deadline_reached' : 'pending_refund_window',
    };
  }
  const isR3Allowed =
    config.settlementR3Enabled &&
    ((params.communityId && config.settlementR3WhitelistCommunityIds.includes(params.communityId)) ||
      (params.eventId && config.settlementR3WhitelistEventIds.includes(params.eventId)) ||
      (params.eventCategory && config.settlementR3WhitelistEventCategories.includes(params.eventCategory)));

  if (isR3Allowed && params.eventEndAt) {
    const eligible = params.eventEndAt <= now;
    return {
      eligibleAt: params.eventEndAt,
      payoutMode,
      eligibilityStatus: eligible ? 'ELIGIBLE' : 'PENDING',
      payoutStatus: 'NOT_SCHEDULED',
      reasonCode: eligible ? 'event_end_reached' : 'pending_refund_window',
    };
  }

  const delayDays = Math.max(0, config.settlementDelayDays ?? 0);
  const eligibleAt = new Date((params.eventEndAt as Date).getTime() + delayDays * 24 * 60 * 60 * 1000);
  const eligible = eligibleAt <= now;
  return {
    eligibleAt,
    payoutMode,
    eligibilityStatus: eligible ? 'ELIGIBLE' : 'PENDING',
    payoutStatus: 'NOT_SCHEDULED',
    reasonCode: eligible ? 'fallback_end_plus_n' : 'pending_refund_window',
  };
};

export async function backfillSettlementFields(
  prisma: Prisma.TransactionClient,
  params?: { limit?: number; dryRun?: boolean },
): Promise<BackfillSettlementFieldsResult> {
  const payments = await prisma.payment.findMany({
    where: {
      OR: [
        { eligibleAt: null },
        { payoutMode: null },
        { eligibilityStatus: null },
        { payoutStatus: null },
        { reasonCode: null },
        { ruleVersionId: null },
      ],
    },
    take: params?.limit,
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      communityId: true,
      eventId: true,
      eligibleAt: true,
      payoutMode: true,
      eligibilityStatus: true,
      payoutStatus: true,
      reasonCode: true,
      ruleVersionId: true,
      event: { select: { endTime: true, eventEndAt: true, refundDeadlineAt: true, category: true } },
      lesson: { select: { endAt: true, eventEndAt: true, refundDeadlineAt: true } },
    },
  });

  const result: BackfillSettlementFieldsResult = {
    scanned: payments.length,
    updated: 0,
    skipped: 0,
    missingEligibilitySource: 0,
  };
  if (!payments.length) return result;

  const now = new Date();
  const ruleVersionId = await resolveActiveRuleVersionId(prisma);

  for (const payment of payments) {
    const refundDeadlineAt = payment.event?.refundDeadlineAt ?? payment.lesson?.refundDeadlineAt ?? null;
    const eventEndAt = payment.event?.eventEndAt ?? payment.event?.endTime ?? payment.lesson?.eventEndAt ?? payment.lesson?.endAt ?? null;
    const fields = buildFields({
      now,
      refundDeadlineAt,
      eventEndAt,
      communityId: payment.communityId ?? null,
      eventId: payment.eventId ?? null,
      eventCategory: payment.event?.category ?? null,
    });
    if (fields.reasonCode === 'missing_event_end') result.missingEligibilitySource += 1;

    if (params?.dryRun) {
      result.updated += 1;
      continue;
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        eligibleAt: payment.eligibleAt ?? fields.eligibleAt,
        payoutMode: payment.payoutMode ?? fields.payoutMode,
        eligibilityStatus: payment.eligibilityStatus ?? fields.eligibilityStatus,
        payoutStatus: payment.payoutStatus ?? fields.payoutStatus,
        reasonCode: payment.reasonCode ?? fields.reasonCode,
        ruleVersionId: payment.ruleVersionId ?? ruleVersionId,
      },
    });
    result.updated += 1;
  }

  return result;
}
