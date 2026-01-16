/* eslint-disable @typescript-eslint/no-explicit-any */
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsService } from '../auth/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('admin/stats')
@UseGuards(JwtAuthGuard)
export class AdminStatsController {
  constructor(private readonly prisma: PrismaService, private readonly permissions: PermissionsService) {}

  @Get()
  async summary(@Req() req: any) {
    await this.permissions.assertAdmin(req.user.id);
    const [userCount, organizerCount, communityCount, eventCount, gmvAgg, refundAgg, subscriptionCount] =
      await this.prisma.$transaction([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { isOrganizer: true } }),
        this.prisma.community.count(),
        this.prisma.event.count(),
        this.prisma.payment.aggregate({
          _sum: { amount: true },
          where: { status: { in: ['paid', 'refunded'] } },
        }),
        this.prisma.payment.aggregate({
          _sum: { refundedGrossTotal: true },
          where: { refundedGrossTotal: { gt: 0 } },
        }),
        this.prisma.community.count({ where: { pricingPlanId: { not: null } } }),
      ]);
    return {
      registeredUsers: userCount,
      organizers: organizerCount,
      communities: communityCount,
      subscriptions: subscriptionCount,
      events: eventCount,
      gmv: gmvAgg._sum.amount ?? 0,
      refunds: refundAgg._sum.refundedGrossTotal ?? 0,
    };
  }
}
