import { PrismaClient } from '@prisma/client';

const parseNumber = (value: string | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

async function main() {
  const prisma = new PrismaClient();
  const sinceDays = parseNumber(process.env.SINCE_DAYS) ?? 90;
  const limit = parseNumber(process.env.LIMIT);
  const communityId = (process.env.COMMUNITY_ID || '').trim() || null;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  try {
    const where = {
      updatedAt: { gte: since },
      ...(communityId ? { communityId } : {}),
    } as const;

    const [total, missingEligibleAt, missingPayoutMode, missingEligibilityStatus, missingPayoutStatus, missingReasonCode, missingRuleVersion] =
      await Promise.all([
        prisma.payment.count({ where }),
        prisma.payment.count({ where: { ...where, eligibleAt: null } }),
        prisma.payment.count({ where: { ...where, payoutMode: null } }),
        prisma.payment.count({ where: { ...where, eligibilityStatus: null } }),
        prisma.payment.count({ where: { ...where, payoutStatus: null } }),
        prisma.payment.count({ where: { ...where, reasonCode: null } }),
        prisma.payment.count({ where: { ...where, ruleVersionId: null } }),
      ]);

    const reasonCodeGroups = await prisma.payment.groupBy({
      by: ['reasonCode'],
      where,
      _count: { reasonCode: true },
      orderBy: { _count: { reasonCode: 'desc' } },
      take: limit ?? 50,
    });

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          sinceDays,
          communityId,
          total,
          missing: {
            eligibleAt: missingEligibleAt,
            payoutMode: missingPayoutMode,
            eligibilityStatus: missingEligibilityStatus,
            payoutStatus: missingPayoutStatus,
            reasonCode: missingReasonCode,
            ruleVersionId: missingRuleVersion,
          },
          reasonCodeTop: reasonCodeGroups.map((row) => ({
            reasonCode: row.reasonCode ?? 'null',
            count: row._count.reasonCode,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
