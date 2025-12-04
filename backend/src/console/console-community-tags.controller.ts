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
