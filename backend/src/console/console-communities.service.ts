import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConsoleCommunitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async listManagedCommunities(userId: string) {
    return this.prisma.community.findMany({
      where: {
        OR: [
          { ownerId: userId },
          {
            members: {
              some: {
                userId,
                role: { in: ['admin', 'owner'] },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        labels: true,
        visibleLevel: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async createCommunity(userId: string, payload: {
    name: string;
    slug: string;
    description: Prisma.InputJsonValue;
    labels: string[];
    visibleLevel: string;
    coverImageUrl?: string | null;
  }) {
    const community = await this.prisma.community.create({
      data: {
        ownerId: userId,
        name: payload.name,
        slug: payload.slug,
        description: payload.description,
        labels: payload.labels,
        visibleLevel: payload.visibleLevel,
        coverImageUrl: payload.coverImageUrl ?? null,
        language: 'ja',
      },
    });

    await this.prisma.communityMember.create({
      data: {
        communityId: community.id,
        userId,
        role: 'owner',
        status: 'active',
      },
    });

    return community;
  }

  async getCommunity(userId: string, communityId: string) {
    await this.ensureCommunityAdmin(userId, communityId);
    return this.prisma.community.findUnique({
      where: { id: communityId },
    });
  }

  async updateCommunity(userId: string, communityId: string, payload: Partial<{
    name: string;
    description: Prisma.InputJsonValue;
    labels: string[];
    visibleLevel: string;
    coverImageUrl?: string | null;
  }>) {
    await this.ensureCommunityAdmin(userId, communityId);
    const data: Prisma.CommunityUpdateInput = {};
    if (payload.name !== undefined) data.name = payload.name;
    if (payload.description !== undefined) data.description = payload.description;
    if (payload.labels !== undefined) data.labels = payload.labels;
    if (payload.visibleLevel !== undefined) data.visibleLevel = payload.visibleLevel;
    if (payload.coverImageUrl !== undefined) data.coverImageUrl = payload.coverImageUrl;

    return this.prisma.community.update({
      where: { id: communityId },
      data,
    });
  }

  async listBlacklist(communityId: string, userId: string) {
    await this.ensureCommunityAdmin(userId, communityId);

    return this.prisma.communityMember.findMany({
      where: { communityId, status: 'blocked' },
      select: {
        id: true,
        userId: true,
        totalNoShow: true,
        user: {
          select: {
            name: true,
            language: true,
          },
        },
      },
    });
  }

  async addToBlacklist(communityId: string, userId: string, targetUserId: string) {
    await this.ensureCommunityAdmin(userId, communityId);

    await this.prisma.communityMember.upsert({
      where: { communityId_userId: { communityId, userId: targetUserId } },
      create: {
        communityId,
        userId: targetUserId,
        role: 'member',
        status: 'blocked',
      },
      update: { status: 'blocked' },
    });

    return { communityId, userId: targetUserId, status: 'blocked' };
  }

  async removeFromBlacklist(communityId: string, userId: string, targetUserId: string) {
    await this.ensureCommunityAdmin(userId, communityId);

    await this.prisma.communityMember.updateMany({
      where: { communityId, userId: targetUserId, status: 'blocked' },
      data: { status: 'active' },
    });

    return { communityId, userId: targetUserId, status: 'active' };
  }

  async getAnalytics(communityId: string, userId: string) {
    await this.ensureCommunityAdmin(userId, communityId);

    const totalEvents = await this.prisma.event.count({ where: { communityId } });

    const registrations = await this.prisma.eventRegistration.findMany({
      where: { event: { communityId } },
      select: { attended: true, noShow: true },
    });

    const totalRegistrations = registrations.length;
    const totalAttended = registrations.filter((reg) => reg.attended).length;
    const totalNoShow = registrations.filter((reg) => reg.noShow).length;

    return {
      communityId,
      totalEvents,
      totalRegistrations,
      totalAttended,
      totalNoShow,
      attendanceRate: totalRegistrations ? totalAttended / totalRegistrations : 0,
    };
  }

  private async ensureCommunityAdmin(userId: string, communityId: string) {
    const community = await this.prisma.community.findUnique({ where: { id: communityId } });
    if (!community) {
      throw new NotFoundException('Community not found');
    }

    if (community.ownerId === userId) {
      return;
    }

    const member = await this.prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
    });

    if (!member || (member.role !== 'admin' && member.role !== 'owner')) {
      throw new ForbiddenException('Not authorized');
    }
  }
}
