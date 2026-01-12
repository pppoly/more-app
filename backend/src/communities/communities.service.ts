import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildAssetUrl } from '../common/storage/asset-path';
import { Prisma } from '@prisma/client';
import { PermissionsService } from '../auth/permissions.service';

@Injectable()
export class CommunitiesService {
  constructor(private readonly prisma: PrismaService, private readonly permissions: PermissionsService) {}

  async findBySlug(slug: string, userId?: string) {
    const successRegistrationWhere: Prisma.EventRegistrationWhereInput = {
      status: { in: ['paid', 'approved'] },
      OR: [{ paymentStatus: 'paid' }, { amount: 0 }],
    };

    const community = await this.prisma.community.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        ownerId: true,
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
            endTime: true,
            regStartTime: true,
            regEndTime: true,
            regDeadline: true,
            locationText: true,
            status: true,
            title: true,
            maxParticipants: true,
            config: true,
            galleries: {
              select: {
                imageUrl: true,
                order: true,
              },
              orderBy: { order: 'asc' },
              take: 1,
            },
            _count: {
              select: {
                registrations: { where: successRegistrationWhere },
              },
            },
          },
        },
      },
    });

    if (!community) {
      throw new NotFoundException('Community not found');
    }

    // enforce visibility rules
    if (community.visibleLevel === 'semi-public') {
      if (!userId) {
        throw new ForbiddenException('Login required to view this community');
      }
      const member = await this.prisma.communityMember.findFirst({
        where: { communityId: community.id, userId, status: 'active' },
      });
      if (!member && community.ownerId !== userId) {
        throw new ForbiddenException('Only community members can view this page');
      }
    } else if (community.visibleLevel === 'private') {
      if (!userId) {
        throw new ForbiddenException('Login required to view this community');
      }
      const isOwner = community.ownerId === userId;
      const isAdmin = await this.permissions.isAdmin?.(userId);
      if (!isOwner && !isAdmin) {
        throw new ForbiddenException('This community is private');
      }
    }

    const portalConfig = this.extractPortalConfig(community.description);
    const logoImageUrlRaw = this.extractCommunityLogo(community.description);
    const logoImageUrl = buildAssetUrl(logoImageUrlRaw);
    const coverImageUrl = buildAssetUrl(community.coverImageUrl);

    const events =
      ((community as any).events || []).map((event: any) => {
        const { _count, ...rest } = event;
        const currentParticipants = _count?.registrations ?? 0;
        const baseConfig =
          rest.config && typeof rest.config === 'object' ? { ...(rest.config as Record<string, any>) } : {};
        const config = {
          ...baseConfig,
          currentParticipants,
        };
        return {
          ...rest,
          config,
          coverImageUrl: buildAssetUrl(rest.galleries?.[0]?.imageUrl),
        };
      }) ?? [];

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
      coverImageUrl,
      events,
      members: memberList.map((member) => ({
        id: member.user.id,
        name: member.user.name,
        avatarUrl: buildAssetUrl(member.user.avatarUrl),
      })),
      memberCount: _count?.members ?? 0,
      isFollowing,
      portalConfig,
    };
  }

  private extractPortalConfig(description: any) {
    const defaultConfig = { theme: 'clean', layout: ['hero', 'about', 'upcoming', 'past', 'moments'] };
    if (description && typeof description === 'object' && description._portalConfig) {
      const cfg = description._portalConfig;
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
    const follow = await this.prisma.communityFollow.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { id: true },
    });
    return { following: Boolean(follow), locked: false };
  }

  async followCommunity(communityId: string, userId: string) {
    await this.ensureCommunityExists(communityId);
    await this.prisma.communityFollow.upsert({
      where: { communityId_userId: { communityId, userId } },
      create: { communityId, userId },
      update: {},
    });
    return { following: true };
  }

  async unfollowCommunity(communityId: string, userId: string) {
    await this.ensureCommunityExists(communityId);
    const follow = await this.prisma.communityFollow.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { id: true },
    });
    if (!follow) return { following: false };
    await this.prisma.communityFollow.delete({ where: { communityId_userId: { communityId, userId } } });
    return { following: false };
  }

  private async ensureCommunityExists(communityId: string) {
    const exists = await this.prisma.community.findUnique({ where: { id: communityId }, select: { id: true } });
    if (!exists) {
      throw new NotFoundException('Community not found');
    }
  }
}
