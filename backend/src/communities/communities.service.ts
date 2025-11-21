import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CommunitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findBySlug(slug: string) {
    const community = await this.prisma.community.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        coverImageUrl: true,
        labels: true,
        visibleLevel: true,
        pricingPlanId: true,
        events: {
          where: {
            visibility: 'public',
            status: 'open',
          },
          orderBy: {
            startTime: 'desc',
          },
          take: 3,
          select: {
            id: true,
            startTime: true,
            locationText: true,
            status: true,
            title: true,
          },
        },
      },
    });

    if (!community) {
      throw new NotFoundException('Community not found');
    }

    const portalConfig = this.extractPortalConfig(community.description);

    return {
      ...community,
      portalConfig,
    };
  }

  private extractPortalConfig(description: any) {
    const defaultConfig = { theme: 'immersive', layout: ['hero', 'about', 'upcoming', 'past', 'moments'] };
    if (description && typeof description === 'object' && description._portalConfig) {
      const cfg = description._portalConfig as any;
      const theme = typeof cfg.theme === 'string' ? cfg.theme : defaultConfig.theme;
      const layout = Array.isArray(cfg.layout) && cfg.layout.length ? cfg.layout : defaultConfig.layout;
      return { theme, layout };
    }
    return defaultConfig;
  }
}
