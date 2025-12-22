import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Community, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../auth/permissions.service';
import { StripeService } from '../stripe/stripe.service';
import { StripeOnboardingService } from '../stripe/stripe-onboarding.service';
import { buildAssetUrl, toAssetKey } from '../common/storage/asset-path';
import { AssetService } from '../asset/asset.service';

@Injectable()
export class ConsoleCommunitiesService {
  private readonly logger = new Logger(ConsoleCommunitiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly stripeService: StripeService,
    private readonly stripeOnboarding: StripeOnboardingService,
    private readonly assetService: AssetService,
  ) {}

  private readonly defaultPortalConfig = {
    theme: 'immersive',
    layout: ['hero', 'about', 'upcoming', 'past', 'moments'],
  };

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
      coverImageUrl: buildAssetUrl(community.coverImageUrl),
      logoImageUrl: this.getLogoUrl(community as any),
      role: community.ownerId === userId ? 'owner' : (community as any).members?.[0]?.role ?? 'admin',
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
    let community: Community;
    try {
      community = await this.prisma.community.create({
        data: {
          ownerId: userId,
          name: payload.name,
          slug: payload.slug,
          description: payload.description,
          labels: payload.labels,
          visibleLevel: payload.visibleLevel,
          coverImageUrl: toAssetKey(payload.coverImageUrl) ?? payload.coverImageUrl ?? null,
          language: 'ja',
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = Array.isArray(error.meta?.target) ? error.meta?.target : [error.meta?.target];
        if (target?.includes('slug')) {
          throw new BadRequestException('このスラッグは既に使用されています。別のスラッグを指定してください。');
        }
      }
      throw error;
    }

    await this.prisma.communityMember.create({
      data: {
        communityId: community.id,
        userId,
        role: 'owner',
        status: 'active',
      },
    });

    return this.decorateCommunity(community);
  }

  async getCommunity(userId: string, communityId: string) {
    await this.permissions.assertCommunityManager(userId, communityId);
    const community = await this.prisma.community.findUnique({ where: { id: communityId } });
    if (!community) {
      throw new NotFoundException('Community not found');
    }
    const synced = await this.syncStripeAccountStatus(community);
    return this.decorateCommunity(synced);
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
    const needsDescription =
      payload.description !== undefined || payload.logoImageUrl !== undefined;
    const currentDescription = needsDescription
      ? (
          await this.prisma.community.findUnique({
            where: { id: communityId },
            select: { description: true },
          })
        )?.description
      : undefined;
    const data: Prisma.CommunityUpdateInput = {};
    if (payload.name !== undefined) data.name = payload.name;
    if (payload.description !== undefined) data.description = payload.description;
    if (payload.labels !== undefined) data.labels = payload.labels;
    if (payload.visibleLevel !== undefined) data.visibleLevel = payload.visibleLevel;
    if (payload.coverImageUrl !== undefined) {
      data.coverImageUrl = toAssetKey(payload.coverImageUrl) ?? payload.coverImageUrl;
    }
    if (payload.logoImageUrl !== undefined) {
      const baseDescription =
        payload.description !== undefined ? payload.description : currentDescription;
      data.description = this.mergeLogoIntoDescription(baseDescription, payload.logoImageUrl);
    } else if (payload.description !== undefined) {
      // ensure description updates apply when logo unchanged
      data.description = payload.description;
    }

    const updated = await this.prisma.community.update({ where: { id: communityId }, data });
    return this.decorateCommunity(updated);
  }

  async refreshStripeStatus(userId: string, communityId: string) {
    await this.permissions.assertCommunityManager(userId, communityId);
    const community = await this.prisma.community.findUnique({ where: { id: communityId } });
    if (!community) {
      throw new NotFoundException('Community not found');
    }
    const updated = await this.syncStripeAccountStatus(community);
    return { stripeAccountId: updated.stripeAccountId, stripeAccountOnboarded: updated.stripeAccountOnboarded };
  }

  private decorateCommunity(community: Community) {
    return {
      ...community,
      coverImageUrl: buildAssetUrl(community.coverImageUrl),
      logoImageUrl: this.getLogoUrl(community),
    };
  }

  private getLogoUrl(community: Community): string | null {
    const desc = community.description as any;
    const rawFromDesc =
      desc && typeof desc === 'object' && typeof desc.logoImageUrl === 'string' ? desc.logoImageUrl : null;
    const rawFromPortal =
      desc && typeof desc === 'object' && desc._portalConfig && typeof desc._portalConfig.logoImageUrl === 'string'
        ? desc._portalConfig.logoImageUrl
        : null;
    const rawTop = typeof (community as any).logoImageUrl === 'string' ? (community as any).logoImageUrl : null;
    const rawLogo = rawFromDesc || rawFromPortal || rawTop;
    return buildAssetUrl(rawLogo);
  }

  private mergeLogoIntoDescription(
    baseDescription: Prisma.InputJsonValue | null | undefined,
    logoImageUrl: string | null,
  ) {
    const desc =
      baseDescription && typeof baseDescription === 'object'
        ? { ...(baseDescription as Record<string, any>) }
        : {};
    if (logoImageUrl === null) {
      delete desc.logoImageUrl;
      if (desc._portalConfig) delete desc._portalConfig.logoImageUrl;
    } else {
      desc.logoImageUrl = toAssetKey(logoImageUrl) ?? logoImageUrl;
    }
    return desc as Prisma.InputJsonValue;
  }

  async getPortalConfig(userId: string, communityId: string) {
    await this.permissions.assertCommunityManager(userId, communityId);
    const community = await this.prisma.community.findUnique({
      where: { id: communityId },
      select: { id: true, pricingPlanId: true, description: true },
    });
    if (!community) {
      throw new NotFoundException('Community not found');
    }
    this.assertPortalAllowed(community);
    const config = this.extractPortalConfig(community.description);
    return { communityId, config };
  }

  async updatePortalConfig(
    userId: string,
    communityId: string,
    payload: Partial<{ theme: string; layout: string[] }>,
  ) {
    await this.permissions.assertCommunityManager(userId, communityId);
    const community = await this.prisma.community.findUnique({
      where: { id: communityId },
      select: { id: true, pricingPlanId: true, description: true },
    });
    if (!community) {
      throw new NotFoundException('Community not found');
    }
    this.assertPortalAllowed(community);
    const current = this.extractPortalConfig(community.description);
    const nextTheme = payload.theme || current.theme;
    const nextLayout = Array.isArray(payload.layout) && payload.layout.length ? payload.layout : current.layout;
    const nextConfig = { theme: nextTheme, layout: nextLayout };
    const mergedDescription = this.mergePortalConfig(community.description, nextConfig);
    await this.prisma.community.update({
      where: { id: communityId },
      data: { description: mergedDescription },
    });
    return { communityId, config: nextConfig };
  }

  private assertPortalAllowed(community: { pricingPlanId: string | null }) {
    if (!community.pricingPlanId) {
      throw new BadRequestException('门户模板为订阅功能，请升级后使用');
    }
  }

  private extractPortalConfig(description: Prisma.InputJsonValue | null | undefined) {
    if (description && typeof description === 'object') {
      const record = description as Record<string, any>;
      if (record._portalConfig && typeof record._portalConfig === 'object') {
        const cfg = record._portalConfig as Record<string, any>;
        const theme = typeof cfg.theme === 'string' ? cfg.theme : this.defaultPortalConfig.theme;
        const layout = Array.isArray(cfg.layout) && cfg.layout.length ? cfg.layout : this.defaultPortalConfig.layout;
        return { theme, layout };
      }
    }
    return this.defaultPortalConfig;
  }

  private mergePortalConfig(description: Prisma.InputJsonValue | null | undefined, config: { theme: string; layout: string[] }) {
    let base: Record<string, any> = {};
    if (description && typeof description === 'object') {
      base = { ...(description as Record<string, any>) };
    } else if (description) {
      base = { original: description };
    }
    base._portalConfig = config;
    return base as Prisma.InputJsonValue;
  }

  async uploadCommunityAsset(userId: string, communityId: string, file: Express.Multer.File | undefined, type?: string) {
    await this.permissions.assertCommunityManager(userId, communityId);
    if (!file) {
      throw new BadRequestException('ファイルが必要です');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('画像のみアップロードできます');
    }
    const role = type === 'logo' ? 'logo' : 'cover';
    const { asset, publicUrl } = await this.assetService.uploadImageFromBuffer({
      userId,
      tenantId: communityId,
      resourceType: 'community',
      resourceId: communityId,
      role,
      file,
    });

    // persist to community immediately so subsequent GET has latest paths
    if (type === 'cover') {
      await this.prisma.community.update({
        where: { id: communityId },
        data: { coverImageUrl: publicUrl },
      });
    } else if (type === 'logo') {
      const community = await this.prisma.community.findUnique({
        where: { id: communityId },
        select: { description: true },
      });
      const merged = this.mergeLogoIntoDescription(community?.description ?? {}, publicUrl);
      await this.prisma.community.update({
        where: { id: communityId },
        data: { description: merged },
      });
    }

    return { assetId: asset.id, imageUrl: publicUrl, variants: asset.variants ?? null };
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
      select: { attended: true, noShow: true, status: true, paymentStatus: true, amount: true },
    });
    const successfulRegistrations = registrations.filter((reg) => {
      if (!['paid', 'approved'].includes(reg.status)) return false;
      return reg.paymentStatus === 'paid' || (reg.amount ?? 0) === 0;
    });
    const totalRegistrations = successfulRegistrations.length;
    const totalAttended = successfulRegistrations.filter((reg) => reg.attended).length;
    const totalNoShow = successfulRegistrations.filter((reg) => reg.noShow).length;
    const followerCount = await this.prisma.communityMember.count({
      where: { communityId, status: 'active' },
    });
    return {
      communityId,
      totalEvents,
      totalRegistrations,
      totalAttended,
      totalNoShow,
      attendanceRate: totalRegistrations ? totalAttended / totalRegistrations : 0,
      followerCount,
      pageViewsMonth: 0,
    };
  }

  async listPricingPlans() {
    return this.prisma.pricingPlan.findMany({
      where: { active: true },
      orderBy: { monthlyFee: 'asc' },
    });
  }

  async startStripeOnboarding(userId: string, communityId: string) {
    this.logger.log('[ConsoleCommunities] *** startStripeOnboarding HIT', { communityId, userId });
    await this.permissions.assertCommunityManager(userId, communityId);
    await this.permissions.assertOrganizerPayoutPolicyAccepted(userId);
    const community = await this.prisma.community.findUnique({
      where: { id: communityId },
      include: { owner: { select: { email: true, name: true } } },
    });
    if (!community) {
      throw new NotFoundException('Community not found');
    }

    this.logger.log('[ConsoleCommunities] before createOrGetExpressAccount', {
      communityId: community.id,
      communitySlug: community.slug,
      stripeAccountId: community.stripeAccountId ?? null,
    });
    const { accountId, created, onboarded } = await this.stripeOnboarding.createOrGetExpressAccount({
      existingAccountId: community.stripeAccountId,
      email: community.owner?.email ?? undefined,
      name: community.name,
      productDescription: 'Community events organizer on MORE',
      supportEmail: community.owner?.email ?? undefined,
      url: `${this.stripeService.frontendBaseUrl}/community/${community.slug}`,
      metadata: { communityId },
      country: 'JP',
    });
    this.logger.log('[ConsoleCommunities] after createOrGetExpressAccount', {
      communityId: community.id,
      communitySlug: community.slug,
      stripeAccountId: community.stripeAccountId ?? null,
      created,
      accountId,
    });
    if (created || community.stripeAccountId !== accountId || community.stripeAccountOnboarded !== onboarded) {
      await this.prisma.community.update({
        where: { id: communityId },
        data: {
          stripeAccountId: accountId,
          stripeAccountOnboarded: onboarded,
        },
      });
    }

    const url = await this.stripeOnboarding.createOnboardingLink(accountId);
    return { url };
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
    if (plan.monthlyFee <= 0) {
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
      return { planId: plan.id, subscriptionId: null, checkoutUrl: null, sessionId: null };
    }

    if (!this.stripeService.enabled) {
      throw new BadRequestException('Stripe連携が無効です');
    }
    if (!this.stripeService.publishableKey) {
      throw new BadRequestException('Stripeの公開鍵が設定されていません');
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

    const priceId = await this.ensureStripePrice(plan);
    this.logger.log(
      `Creating subscription via Payment Element: community=${communityId}, plan=${planId}, price=${priceId}`,
    );
    const subscription = await this.stripeService.client.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
        payment_method_types: ['card'],
      },
      metadata: { communityId, planId, context: 'community_subscription' },
      expand: ['latest_invoice.payment_intent'],
    });
    const paymentIntent =
      subscription.latest_invoice &&
      typeof subscription.latest_invoice !== 'string' &&
      subscription.latest_invoice.payment_intent &&
      typeof subscription.latest_invoice.payment_intent !== 'string'
        ? subscription.latest_invoice.payment_intent
        : null;
    const clientSecret = paymentIntent?.client_secret ?? null;
    if (!clientSecret) {
      throw new BadRequestException('Stripe支払いの初期化に失敗しました');
    }

    await this.prisma.community.update({
      where: { id: communityId },
      data: {
        pricingPlanId: plan.id,
        stripeSubscriptionId: subscription.id,
      },
    });

    return {
      planId: plan.id,
      subscriptionId: subscription.id,
      checkoutUrl: null,
      sessionId: null,
      clientSecret,
      publishableKey: this.stripeService.publishableKey,
      customerId,
    };
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


  private subscriptionReturnUrls(communityId: string) {
    const successBase = this.normalizeBaseUrl(this.stripeService.successUrlBase);
    const cancelBase = this.normalizeBaseUrl(this.stripeService.cancelUrlBase);
    const successUrl = `${successBase}?context=community_subscription&communityId=${communityId}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${cancelBase}?context=community_subscription&communityId=${communityId}`;
    return { successUrl, cancelUrl };
  }

  private normalizeBaseUrl(base?: string | null) {
    const fallback = 'http://localhost:5173';
    const cleaned = (base || '').trim().replace(/\/$/, '');
    if (!cleaned) return fallback;
    try {
      // Validate absolute URL; Stripe requires a full URL here.
      const parsed = new URL(cleaned);
      // Stripe only permits http for localhost. If the host is not localhost and protocol is http, fall back.
      if (parsed.protocol === 'http:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
        return fallback;
      }
      return parsed.toString().replace(/\/$/, '');
    } catch (err) {
      // If protocol is missing, try http://
      try {
        const withProtocol = `http://${cleaned}`;
        const parsed = new URL(withProtocol);
        if (parsed.protocol === 'http:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
          return fallback;
        }
        return parsed.toString().replace(/\/$/, '');
      } catch {
        return fallback;
      }
    }
  }

  private async ensureStripePrice(plan: {
    id: string;
    name: string;
    monthlyFee: number;
    stripePriceId?: string | null;
  }) {
    if (!this.stripeService.enabled) {
      throw new BadRequestException('Stripe連携が無効です');
    }

    // If a price already exists, verify the amount matches; otherwise create a fresh one.
    if (plan.stripePriceId) {
      try {
        const existing = await this.stripeService.client.prices.retrieve(plan.stripePriceId);
        const desiredAmount = Math.max(0, Math.round(plan.monthlyFee ?? 0));
        const existingAmount = existing.unit_amount ?? 0;
        const isMonthly = existing.recurring?.interval === 'month';
        if (existing.active && isMonthly && existingAmount === desiredAmount) {
          return existing.id;
        }
        // If mismatched, deactivate old price and create a new one.
        await this.stripeService.client.prices.update(existing.id, { active: false }).catch(() => {});
      } catch (err) {
        this.logger.warn(`Failed to retrieve existing Stripe price ${plan.stripePriceId}: ${err}`);
      }
    }

    const product = await this.stripeService.client.products.create({
      name: plan.name,
      metadata: { planId: plan.id },
    });
    const price = await this.stripeService.client.prices.create({
      product: product.id,
      currency: 'jpy',
      unit_amount: Math.max(0, Math.round(plan.monthlyFee ?? 0)),
      recurring: { interval: 'month' },
      metadata: { planId: plan.id },
    });
    await this.prisma.pricingPlan.update({
      where: { id: plan.id },
      data: { stripePriceId: price.id },
    });
    return price.id;
  }
}
