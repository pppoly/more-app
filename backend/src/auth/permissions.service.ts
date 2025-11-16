import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async assertOrganizer(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { isOrganizer: true } });
    if (!user?.isOrganizer) {
      throw new ForbiddenException({
        error: 'NOT_ORGANIZER',
        message: '現在のアカウントは主理人ではありません。主理人申請を行ってください。',
      });
    }
  }

  async assertAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
    if (!user?.isAdmin) {
      throw new ForbiddenException('Administrator privileges required');
    }
  }

  async assertCommunityManager(userId: string, communityId: string) {
    const community = await this.prisma.community.findUnique({ where: { id: communityId }, select: { ownerId: true } });
    if (!community) {
      throw new NotFoundException('Community not found');
    }
    if (community.ownerId === userId) {
      return;
    }
    const membership = await this.prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { role: true, status: true },
    });
    if (!membership || membership.status !== 'active' || !['admin', 'owner'].includes(membership.role)) {
      throw new ForbiddenException({ error: 'NOT_COMMUNITY_MANAGER', message: 'コミュニティ管理権限がありません。' });
    }
  }

  async assertEventManager(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, communityId: true },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    await this.assertCommunityManager(userId, event.communityId);
    return event;
  }
}
