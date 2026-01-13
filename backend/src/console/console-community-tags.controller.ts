/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-redundant-type-constituents */
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsService } from '../auth/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('console/community-tags')
export class ConsoleCommunityTagsController {
  constructor(private readonly prisma: PrismaService, private readonly permissions: PermissionsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@Req() req: any, @Query('includeInactive') includeInactive?: string) {
    await this.permissions.assertOrganizer(req.user.id);
    const activeOnly = includeInactive !== 'true';
    return this.prisma.communityTagCategory.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: { order: 'asc' },
      include: {
        tags: {
          where: activeOnly ? { active: true } : undefined,
          orderBy: { order: 'asc' },
        },
      },
    });
  }
}
