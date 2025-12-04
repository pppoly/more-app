import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsService } from '../auth/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('admin/communities')
@UseGuards(JwtAuthGuard)
export class AdminCommunitiesController {
  constructor(private readonly prisma: PrismaService, private readonly permissions: PermissionsService) {}

  @Get()
  async list(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    await this.permissions.assertAdmin(req.user.id);
    const pageNum = Math.max(1, Number(page) || 1);
    const size = Math.min(50, Math.max(1, Number(pageSize) || 20));
    const where = status ? { status } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.community.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * size,
        take: size,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          pricingPlanId: true,
          stripeAccountId: true,
          stripeAccountOnboarded: true,
          createdAt: true,
        },
      }),
      this.prisma.community.count({ where }),
    ]);
    return { page: pageNum, pageSize: size, total, items };
  }

  @Patch(':communityId/status')
  async updateStatus(@Param('communityId') communityId: string, @Body('status') status: string, @Req() req: any) {
    await this.permissions.assertAdmin(req.user.id);
    if (!['active', 'disabled'].includes(status)) {
      throw new Error('Invalid status');
    }
    const updated = await this.prisma.community.update({
      where: { id: communityId },
      data: { status },
      select: { id: true, status: true },
    });
    return updated;
  }
}
