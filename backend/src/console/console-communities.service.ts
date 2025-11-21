import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Community, Prisma } from '@prisma/client';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../auth/permissions.service';
import { StripeService } from '../stripe/stripe.service';

@Injectable()
export class ConsoleCommunitiesService {
  private readonly logger = new Logger(ConsoleCommunitiesService.name);
  private readonly uploadRoot = join(process.cwd(), 'uploads');

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly stripeService: StripeService,
  ) {}

  async listManagedCommunities(userId: string) {
    const communities = await this.prisma.community.findMany({
      where: {
        OR: [
          { ownerId: userId },
          {
            members: {
              some: {
                userId,
                role: { in: ['admin', 'owner'] },
                status: 'active',
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
        coverImageUrl: true,
        ownerId: true,
        members: {
          where: { userId, status: 'active' },
          select: { role: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return communities.map((community) => ({
      id: community.id,
      name: community.name,
      slug: community.slug,
      labels: community.labels,
      visibleLevel: community.visibleLevel,
      createdAt: community.createdAt,
      coverImageUrl: community.coverImageUrl,
      role: community.ownerId === userId ? 'owner' : community.members[0]?.role ?? 'admin',
    }));
  }

  async createCommunity(
    userId: string,
    payload: {
      name: string;
      slug: string;
      description: Prisma.InputJsonValue;
      labels: string[];
      visibleLevel: string;
      coverImageUrl?: string | null;
    },
  ) {
    await this.permissions.assertOrganizer(userId);
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
    await this.permissions.assertCommunityManager(userId, communityId);
    const community = await this.prisma.community.findUnique({ where: { id: communityId } });
    if (!community) {
      throw new NotFoundException('Community not found');
    }
    return this.syncStripeAccountStatus(community);
  }

  async updateCommunity(
    userId: string,
    communityId: string,
    payload: Partial<{
      name: string;
      description: Prisma.InputJsonValue;
      labels: string[];
      visibleLevel: string;
      coverImageUrl?: string | null;
      logoImageUrl?: string | null;
    }>,
  ) {
    await this.permissions.assertCommunityManager(userId, communityId);
    const data: Prisma.CommunityUpdateInput = {};
    if (payload.name !== undefined) data.name = payload.name;
    if (payload.description !== undefined) data.description = payload.description;
    if (payload.labels !== undefined) data.labels = payload.labels;
    if (payload.visibleLevel !== undefined) data.visibleLevel = payload.visibleLevel;
    if (payload.coverImageUrl !== undefined) data.coverImageUrl = payload.coverImageUrl;

    return this.prisma.community.update({ where: { id: communityId }, data });
  }

  async uploadCommunityAsset(userId: string, communityId: string, file: Express.Multer.File | undefined, type?: string) {
    await this.permissions.assertCommunityManager(userId, communityId);
    if (!file) {
      throw new BadRequestException('ファイルが必要です');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('画像のみアップロードできます');
    }
    const folder = type === 'logo' ? 'logos' : 'covers';
    const targetDir = join(this.uploadRoot, 'communities', communityId, folder);
    await fs.mkdir(targetDir, { recursive: true });
    const ext = this.getExtension(file.originalname) || 'jpg';
    const filename = `${randomUUID()}.${ext}`;
    await fs.writeFile(join(targetDir, filename), file.buffer);
    const imageUrl = `/uploads/communities/${communityId}/${folder}/${filename}`;
    return { imageUrl };
  }

  private getExtension(filename: string) {
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop()?.toLowerCase() : null;
  }

  async listBlacklist(communityId: string, userId: string) {
    await this.permissions.assertCommunityManager(userId, communityId);
    return this.prisma.communityMember.findMany({
      where: { communityId, status: 'blocked' },
      select: {
        id: true,
        userId: true,
        totalNoShow: true,
        user: { select: { name: true, language: true } },
      },
    });
  }

  async addToBlacklist(communityId: string, userId: string, targetUserId: string) {
    await this.permissions.assertCommunityManager(userId, communityId);
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
    await this.permissions.assertCommunityManager(userId, communityId);
    await this.prisma.communityMember.updateMany({
      where: { communityId, userId: targetUserId, status: 'blocked' },
      data: { status: 'active' },
    });
    return { communityId, userId: targetUserId, status: 'active' };
  }

  async getAnalytics(communityId: string, userId: string) {
    await this.permissions.assertCommunityManager(userId, communityId);
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

  async listPricingPlans() {
    return this.prisma.pricingPlan.findMany({
      where: { active: true },
      orderBy: { monthlyFee: 'asc' },
    });
  }

  async startStripeOnboarding(userId: string, communityId: string) {
    await this.permissions.assertCommunityManager(userId, communityId);
    if (!this.stripeService.enabled) {
      throw new BadRequestException('Stripe連携が無効です');
    }
    const community = await this.prisma.community.findUnique({
      where: { id: communityId },
      include: { owner: { select: { email: true, name: true } } },
    });
    if (!community) {
      throw new NotFoundException('Community not found');
    }

    let stripeAccountId = community.stripeAccountId;
    let onboarded = community.stripeAccountOnboarded;
    if (!stripeAccountId) {
      const account = await this.stripeService.client.accounts.create({
        type: 'express',
        email: community.owner?.email ?? undefined,
        country: 'JP',
        business_profile: {
          name: community.name,
          product_description: 'Community events organizer on MORE',
          support_email: community.owner?.email ?? undefined,
          url: `${this.stripeService.frontendBaseUrl}/community/${community.slug}`,
        },
        metadata: { communityId },
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true },
        },
      });
      stripeAccountId = account.id;
      onboarded = account.details_submitted ?? false;
      await this.prisma.community.update({
        where: { id: communityId },
        data: {
          stripeAccountId,
          stripeAccountOnboarded: onboarded,
        },
      });
    }

    const link = await this.stripeService.client.accountLinks.create({
      account: stripeAccountId,
      refresh_url: this.consoleReturnUrl(communityId),
      return_url: this.consoleReturnUrl(communityId),
      type: 'account_onboarding',
    });
    return { url: link.url };
  }

  async subscribeCommunityPlan(userId: string, communityId: string, planId: string) {
    await this.permissions.assertCommunityManager(userId, communityId);
    const plan = await this.prisma.pricingPlan.findUnique({ where: { id: planId } });
    if (!plan || !plan.active) {
      throw new NotFoundException('Pricing plan not found');
    }
    const community = await this.prisma.community.findUnique({
      where: { id: communityId },
      include: { owner: { select: { email: true, name: true } } },
    });
    if (!community) {
      throw new NotFoundException('Community not found');
    }

    // Free plans without Stripe price simply update the reference and cancel any active subscription.
    if (!plan.stripePriceId) {
      if (community.stripeSubscriptionId && this.stripeService.enabled) {
        try {
          await this.stripeService.client.subscriptions.cancel(community.stripeSubscriptionId);
        } catch (error) {
          this.logger.warn(`Failed to cancel Stripe subscription ${community.stripeSubscriptionId}: ${error}`);
        }
      }
      await this.prisma.community.update({
        where: { id: communityId },
        data: {
          pricingPlanId: plan.id,
          stripeSubscriptionId: null,
        },
      });
      return { planId: plan.id, subscriptionId: null };
    }

    if (!this.stripeService.enabled) {
      throw new BadRequestException('Stripe連携が無効です');
    }
    if (!community.stripeAccountOnboarded || !community.stripeAccountId) {
      throw new BadRequestException('先にStripeアカウント連携を完了してください');
    }

    let customerId = community.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripeService.client.customers.create({
        name: community.name,
        email: community.owner?.email ?? undefined,
        metadata: { communityId },
      });
      customerId = customer.id;
      await this.prisma.community.update({
        where: { id: communityId },
        data: { stripeCustomerId: customerId },
      });
    }

    let subscriptionId = community.stripeSubscriptionId;
    if (subscriptionId) {
      const subscription = await this.stripeService.client.subscriptions.retrieve(subscriptionId);
      const itemId = subscription.items.data[0]?.id;
      if (!itemId) {
        throw new BadRequestException('Stripeサブスクリプションの更新に失敗しました');
      }
      const updated = await this.stripeService.client.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
        proration_behavior: 'none',
        items: [{ id: itemId, price: plan.stripePriceId }],
        metadata: { communityId, planId },
      });
      subscriptionId = updated.id;
    } else {
      const subscription = await this.stripeService.client.subscriptions.create({
        customer: customerId,
        items: [{ price: plan.stripePriceId }],
        collection_method: 'send_invoice',
        days_until_due: 30,
        metadata: { communityId, planId },
      });
      subscriptionId = subscription.id;
    }

    await this.prisma.community.update({
      where: { id: communityId },
      data: {
        pricingPlanId: plan.id,
        stripeSubscriptionId: subscriptionId,
      },
    });

    return { planId: plan.id, subscriptionId };
  }

  private async syncStripeAccountStatus(community: Community) {
    if (!this.stripeService.enabled || !community.stripeAccountId) {
      return community;
    }
    if (community.stripeAccountOnboarded) {
      return community;
    }
    try {
      const account = await this.stripeService.client.accounts.retrieve(community.stripeAccountId);
      if ((account.details_submitted ?? false) !== community.stripeAccountOnboarded) {
        return this.prisma.community.update({
          where: { id: community.id },
          data: { stripeAccountOnboarded: account.details_submitted ?? false },
        });
      }
    } catch (error) {
      this.logger.warn(`Failed to sync Stripe account ${community.stripeAccountId}: ${error}`);
    }
    return community;
  }

  private consoleReturnUrl(communityId: string) {
    return `${this.stripeService.frontendBaseUrl}/console/communities/${communityId}/events`;
  }
}
