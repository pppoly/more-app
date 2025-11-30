import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildAssetUrl } from '../common/storage/asset-path';
import { Prisma } from '@prisma/client';

@Injectable()
export class CommunitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findBySlug(slug: string, userId?: string) {
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
        _count: {
          select: {
            members: {
              where: { status: 'active' },
            },
          },
        },
        members: {
          where: { status: 'active' },
          orderBy: { lastActiveAt: 'desc' },
          take: 20,
          select: {
            user: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
              },
            },
          },
        },
        events: {
          where: {
            visibility: 'public',
            status: 'open',
          },
          orderBy: {
            startTime: 'desc',
          },
          take: 20,
          select: {
            id: true,
            startTime: true,
            locationText: true,
            status: true,
            title: true,
            galleries: {
              select: {
                imageUrl: true,
                order: true,
              },
              orderBy: { order: 'asc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!community) {
      throw new NotFoundException('Community not found');
    }

    const portalConfig = this.extractPortalConfig(community.description);
    const logoImageUrl = this.extractCommunityLogo(community.description);

    const events =
      (community.events || []).map((event) => ({
        ...event,
        coverImageUrl: buildAssetUrl(event.galleries?.[0]?.imageUrl),
      })) ?? [];

    const { _count, members, events: _discardEvents, ...rest } = community as any;
    const memberList: any[] = Array.isArray(members) ? members : [];
    let isFollowing = false;
    if (userId) {
      const follow = await this.getFollowStatus(rest.id, userId);
      isFollowing = follow.following;
    }

    return {
      ...rest,
      logoImageUrl,
      events,
      members: memberList.map((member) => ({
        id: member.user.id,
        name: member.user.name,
        avatarUrl: member.user.avatarUrl,
      })),
      memberCount: _count?.members ?? 0,
      isFollowing,
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

  private extractCommunityLogo(description: any) {
    if (!description || typeof description !== 'object') return null;
    const record = description as Record<string, any>;
    if (typeof record.logoImageUrl === 'string') {
      return record.logoImageUrl;
    }
    if (record._portalConfig && typeof record._portalConfig.logoImageUrl === 'string') {
      return record._portalConfig.logoImageUrl;
    }
    return null;
  }

  async getFollowStatus(communityId: string, userId: string) {
    const membership = await this.prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { status: true, role: true },
    });
    const active = membership?.status === 'active';
    const locked = active && membership && membership.role && membership.role !== 'follower';
    return { following: active, locked };
  }

  async followCommunity(communityId: string, userId: string) {
    await this.ensureCommunityExists(communityId);
    await this.prisma.communityMember.upsert({
      where: { communityId_userId: { communityId, userId } },
      create: {
        communityId,
        userId,
        role: 'follower',
        status: 'active',
      },
      update: {
        status: 'active',
      },
    });
    return { following: true };
  }

  async unfollowCommunity(communityId: string, userId: string) {
    await this.ensureCommunityExists(communityId);
    const membership = await this.prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { role: true, status: true },
    });
    if (!membership) {
      return { following: false };
    }
    if (membership.role && membership.role !== 'follower') {
      return { following: true, locked: true };
    }
    await this.prisma.communityMember.delete({
      where: { communityId_userId: { communityId, userId } },
    });
    return { following: false };
  }

  private async ensureCommunityExists(communityId: string) {
    const exists = await this.prisma.community.findUnique({ where: { id: communityId }, select: { id: true } });
    if (!exists) {
      throw new NotFoundException('Community not found');
    }
  }
}
