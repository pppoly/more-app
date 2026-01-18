import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface OrganizerApplicationDto {
  reason?: string;
  experience?: string;
  contact?: string;
}

@Injectable()
export class OrganizersService {
  constructor(private readonly prisma: PrismaService) {}

  async apply(userId: string, payload: OrganizerApplicationDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isOrganizer) {
      const latest = await this.latestApplication(userId);
      return {
        alreadyOrganizer: true,
        autoApproved: false,
        application: latest,
      };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const application = await tx.organizerApplication.create({
        data: {
          userId,
          status: 'pending',
          reason: payload.reason?.trim() || null,
          experience: payload.experience?.trim() || null,
          contact: payload.contact?.trim() || null,
        },
      });

      const approved = await tx.organizerApplication.update({
        where: { id: application.id },
        data: {
          status: 'approved',
          reviewedAt: new Date(),
          reviewerId: 'system',
        },
      });

      await tx.user.update({ where: { id: userId }, data: { isOrganizer: true } });

      return approved;
    });

    return {
      autoApproved: true,
      application: result,
    };
  }

  async getMyApplication(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { isOrganizer: true } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const application = await this.latestApplication(userId);
    return {
      hasApplied: Boolean(application),
      isOrganizer: user.isOrganizer,
      application,
    };
  }

  async getPayoutPolicyStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { organizerPayoutPolicyAcceptedAt: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return { acceptedAt: user.organizerPayoutPolicyAcceptedAt };
  }

  async acceptPayoutPolicy(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { organizerPayoutPolicyAcceptedAt: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.organizerPayoutPolicyAcceptedAt) {
      return { acceptedAt: user.organizerPayoutPolicyAcceptedAt };
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { organizerPayoutPolicyAcceptedAt: new Date() },
      select: { organizerPayoutPolicyAcceptedAt: true },
    });
    return { acceptedAt: updated.organizerPayoutPolicyAcceptedAt };
  }

  private latestApplication(userId: string) {
    return this.prisma.organizerApplication.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
