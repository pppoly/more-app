/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-floating-promises, @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { Express } from 'express';
import { buildAssetUrl } from '../common/storage/asset-path';
import { AssetService } from '../asset/asset.service';
import { NotificationService } from '../notifications/notification.service';
import { normalizeLocale } from '../notifications/notification.utils';
import { PaymentsService } from '../payments/payments.service';
import { createHash, randomBytes } from 'crypto';
const DEFAULT_SUPPORTED_LANGS = ['ja', 'en', 'zh', 'vi', 'ko', 'tl', 'pt-br', 'ne', 'id', 'th', 'zh-tw', 'my'];
const FRONTEND_BASE_URL = (process.env.FRONTEND_BASE_URL || '').trim().replace(/\/$/, '');
const DEFAULT_COMMUNITY_AVATAR = FRONTEND_BASE_URL
  ? `${FRONTEND_BASE_URL}/api/v1/og/assets/default-avatar.png`
  : '/api/v1/og/assets/default-avatar.png';
const EMAIL_ROLES = ['participant', 'organizer'] as const;
type EmailRole = (typeof EMAIL_ROLES)[number];
type EmailStatus = 'none' | 'unverified' | 'verified' | 'hard_bounce';
const EMAIL_VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const EMAIL_VERIFY_RESEND_COOLDOWN_MS = 60 * 1000;

function extractCommunityLogo(description: any): string | null {
  if (!description || typeof description !== 'object') return null;
  const record = description as Record<string, any>;
  if (typeof record.logoImageUrl === 'string') return record.logoImageUrl;
  if (record._portalConfig && typeof record._portalConfig.logoImageUrl === 'string') {
    return record._portalConfig.logoImageUrl;
  }
  if (record.original && typeof record.original.logoImageUrl === 'string') {
    return record.original.logoImageUrl;
  }
  return null;
}

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetService: AssetService,
    private readonly notifications: NotificationService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async getMyCommunities(userId: string, includeInactive = false) {
    const follows = await this.prisma.communityFollow.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        communityId: true,
        createdAt: true,
        community: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            coverImageUrl: true,
            pricingPlanId: true,
            status: true,
            events: {
              orderBy: { startTime: 'desc' },
              take: 1,
              select: { startTime: true },
            },
          },
        },
      },
    });

    return follows
      .map((follow) => {
        const community = follow.community;
        if (!community) return null;
        const lastEvent = community.events?.[0];
        const coverRawCandidate =
          (typeof community.coverImageUrl === 'string' && community.coverImageUrl.trim()) ||
          extractCommunityLogo(community.description);
        const coverRaw = typeof coverRawCandidate === 'string' ? coverRawCandidate : null;
        const coverImageResolved = buildAssetUrl(coverRaw);
        const logoImageUrl = buildAssetUrl(extractCommunityLogo(community.description));
        const avatarUrl = coverImageResolved || logoImageUrl || DEFAULT_COMMUNITY_AVATAR;
        const imageUrl = avatarUrl;
        const base = {
          id: community.id,
          name: community.name,
          slug: community.slug,
          role: 'follower',
          lastActiveAt: follow.createdAt,
          avatarUrl,
          imageUrl,
          coverImage: coverImageResolved,
          coverImageUrl: community.coverImageUrl ?? null,
          logoImageUrl,
          lastEventAt: lastEvent?.startTime ?? null,
        };
        if (!includeInactive && community.status && community.status !== 'active') {
          return null;
        }
        return base;
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }

  async getMyEvents(userId: string) {
    const registrations = await this.prisma.eventRegistration.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        createdAt: true,
        status: true,
        paymentStatus: true,
        amount: true,
        attended: true,
        noShow: true,
        refundRequest: {
          select: {
            id: true,
            status: true,
            decision: true,
            requestedAmount: true,
            approvedAmount: true,
            refundedAmount: true,
            reason: true,
          },
        },
        payment: {
          select: {
            status: true,
            id: true,
            amount: true,
            method: true,
            createdAt: true,
          },
        },
        event: {
          select: {
            id: true,
            startTime: true,
            endTime: true,
            locationText: true,
            title: true,
            config: true,
            community: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
            galleries: {
              orderBy: { order: 'asc' },
              take: 1,
              select: {
                imageUrl: true,
              },
            },
          },
        },
        lesson: {
          select: {
            id: true,
            startAt: true,
            endAt: true,
            status: true,
            class: {
              select: {
                id: true,
                title: true,
                locationName: true,
                community: {
                  select: { id: true, name: true, slug: true },
                },
              },
            },
          },
        },
      },
    });

    return registrations
      .map((registration) => {
        const { event, lesson, ...rest } = registration as any;
        const galleries = event?.galleries ?? [];
        const coverImageUrl = buildAssetUrl(galleries[0]?.imageUrl);
        const paymentStatusFromPayment = registration?.payment?.status;
        const derivedPaymentStatus =
          rest.status === 'paid'
            ? 'paid'
            : (rest.amount ?? 0) === 0
            ? 'paid'
            : rest.paymentStatus === 'paid'
              ? 'paid'
              : rest.paymentStatus === 'refunded'
                ? 'refunded'
                : ['paid', 'succeeded', 'captured'].includes(paymentStatusFromPayment || '')
                  ? 'paid'
                  : paymentStatusFromPayment === 'refunded'
                    ? 'refunded'
                    : rest.paymentStatus || 'unpaid';
        const derivedStatus =
          (rest.amount ?? 0) > 0 &&
          derivedPaymentStatus === 'unpaid' &&
          ['approved', 'paid'].includes(rest.status)
            ? 'pending_payment'
            : rest.status;

        const shouldHideCancelledPayment = (rest.amount ?? 0) > 0 && derivedPaymentStatus === 'cancelled';
        if (shouldHideCancelledPayment) return null;

        return {
          registrationId: rest.id,
          createdAt: rest.createdAt,
          status: derivedStatus,
          paymentStatus: derivedPaymentStatus,
          amount: rest.amount,
          attended: rest.attended,
          noShow: rest.noShow,
          refundRequest: rest?.refundRequest ?? null,
          paymentMethod: registration.payment?.method ?? null,
          paymentCreatedAt: registration.payment?.createdAt ?? null,
          event: event
            ? {
                ...event,
                coverImageUrl,
              }
            : null,
          lesson: lesson
            ? {
                ...lesson,
                class: lesson.class
                  ? {
                      ...lesson.class,
                    }
                  : null,
              }
            : null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }

  async getFavoriteEvents(userId: string) {
    const follows = await this.prisma.eventFollow.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        event: {
          select: {
            id: true,
            title: true,
            startTime: true,
            endTime: true,
            locationText: true,
            galleries: {
              orderBy: { order: 'asc' },
              take: 1,
              select: { imageUrl: true },
            },
          },
        },
      },
    });

    return follows
      .map((follow) => {
        const event = follow.event;
        if (!event) return null;
        const coverImageUrl = buildAssetUrl(event.galleries?.[0]?.imageUrl);
        return {
          id: event.id,
          title: event.title,
          startTime: event.startTime,
          endTime: event.endTime,
          locationText: event.locationText,
          coverImageUrl,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }

  async updateAvatar(userId: string, file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('無効な画像ファイルです');
    }
    const tenantId = 'default'; // TODO: derive tenant from auth/request context if multi-tenant
    const uploaded = await this.assetService.uploadUserAvatarFromBuffer({ userId, tenantId, file });
    const avatarUrl = uploaded.publicUrl;
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: {
        id: true,
        name: true,
        lineUserId: true,
        email: true,
        phone: true,
        language: true,
        preferredLocale: true,
        prefecture: true,
        avatarUrl: true,
        authProviders: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        lastLoginAt: true,
        isOrganizer: true,
        isAdmin: true,
      },
    });
  }

  async updateProfile(
    userId: string,
    payload: { name?: string | undefined; preferredLocale?: string | undefined; email?: string | undefined },
  ) {
    const data: Record<string, any> = {};
    if (payload.name !== undefined) {
      const trimmed = payload.name.trim();
      if (!trimmed) {
        throw new BadRequestException('表示名を入力してください');
      }
      data.name = trimmed;
    }
    if (payload.email !== undefined) {
      const normalized = payload.email.trim().toLowerCase();
      if (!normalized) {
        throw new BadRequestException('メールアドレスを入力してください');
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        throw new BadRequestException('メールアドレスの形式が正しくありません');
      }
      data.email = normalized;
    }
    if (payload.preferredLocale !== undefined) {
      const supported = this.getSupportedLocales();
      const normalized = payload.preferredLocale.trim().toLowerCase();
      if (!supported.includes(normalized)) {
        throw new BadRequestException('サポートされていない言語です');
      }
      data.preferredLocale = normalized;
    }
    if (!Object.keys(data).length) {
      throw new BadRequestException('更新する項目が未指定です');
    }
    try {
      return this.prisma.user.update({
        where: { id: userId },
        data,
        select: {
        id: true,
        name: true,
        lineUserId: true,
        email: true,
        phone: true,
        language: true,
        preferredLocale: true,
        prefecture: true,
        avatarUrl: true,
        authProviders: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        lastLoginAt: true,
        isOrganizer: true,
        isAdmin: true,
      },
    });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('このメールアドレスは既に使用されています');
      }
      throw error;
    }
  }

  async getEmailContacts(userId: string) {
    const contacts = await this.prisma.userEmailContact.findMany({
      where: { userId, role: { in: [...EMAIL_ROLES] } },
    });
    const map = new Map<string, (typeof contacts)[number]>();
    for (const contact of contacts) {
      map.set(contact.role, contact);
    }
    return {
      participant: this.formatEmailContact(map.get('participant') ?? null, 'participant'),
      organizer: this.formatEmailContact(map.get('organizer') ?? null, 'organizer'),
    };
  }

  async setEmailContact(userId: string, role: EmailRole, email: string) {
    if (!EMAIL_ROLES.includes(role)) {
      throw new BadRequestException('role is invalid');
    }
    const normalized = this.normalizeEmail(email);
    if (!normalized) {
      throw new BadRequestException('メールアドレスを入力してください');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, preferredLocale: true, language: true },
    });
    if (!user) {
      throw new NotFoundException('ユーザーが見つかりません');
    }

    const otherRole: EmailRole = role === 'organizer' ? 'participant' : 'organizer';
    const [currentContact, otherContact] = await Promise.all([
      this.prisma.userEmailContact.findUnique({
        where: { userId_role: { userId, role } },
        select: { email: true, status: true, pendingEmail: true },
      }),
      this.prisma.userEmailContact.findUnique({
        where: { userId_role: { userId, role: otherRole } },
        select: { email: true, status: true, verifiedAt: true, pendingTokenHash: true, pendingExpiresAt: true, lastVerificationSentAt: true },
      }),
    ]);
    const now = new Date();

    if (currentContact?.status === 'verified' && currentContact.email === normalized) {
      return this.getEmailContacts(userId);
    }
    if (currentContact?.status === 'unverified' && currentContact.pendingEmail === normalized) {
      return this.resendEmailVerification(userId, role);
    }

    if (otherContact?.status === 'verified' && otherContact.email === normalized) {
      await this.prisma.userEmailContact.upsert({
        where: { userId_role: { userId, role } },
        update: {
          email: normalized,
          status: 'verified',
          verifiedAt: otherContact.verifiedAt ?? now,
          pendingEmail: null,
          pendingTokenHash: null,
          pendingExpiresAt: null,
          bounceReason: null,
          bouncedAt: null,
        },
        create: {
          userId,
          role,
          email: normalized,
          status: 'verified',
          verifiedAt: otherContact.verifiedAt ?? now,
        },
      });
      return this.getEmailContacts(userId);
    }

    if (otherContact?.status === 'unverified' && otherContact.email === normalized && otherContact.pendingTokenHash) {
      await this.prisma.userEmailContact.upsert({
        where: { userId_role: { userId, role } },
        update: {
          email: normalized,
          status: 'unverified',
          verifiedAt: null,
          pendingEmail: normalized,
          pendingTokenHash: otherContact.pendingTokenHash,
          pendingExpiresAt: otherContact.pendingExpiresAt,
          lastVerificationSentAt: otherContact.lastVerificationSentAt,
          bounceReason: null,
          bouncedAt: null,
        },
        create: {
          userId,
          role,
          email: normalized,
          status: 'unverified',
          pendingEmail: normalized,
          pendingTokenHash: otherContact.pendingTokenHash,
          pendingExpiresAt: otherContact.pendingExpiresAt,
          lastVerificationSentAt: otherContact.lastVerificationSentAt,
        },
      });
      return this.getEmailContacts(userId);
    }

    const token = this.generateEmailToken();
    const tokenHash = this.hashEmailToken(token);
    const expiresAt = new Date(now.getTime() + EMAIL_VERIFY_TOKEN_TTL_MS);

    await this.prisma.userEmailContact.upsert({
      where: { userId_role: { userId, role } },
      update: {
        email: normalized,
        status: 'unverified',
        verifiedAt: null,
        pendingEmail: normalized,
        pendingTokenHash: tokenHash,
        pendingExpiresAt: expiresAt,
        lastVerificationSentAt: now,
        bounceReason: null,
        bouncedAt: null,
      },
      create: {
        userId,
        role,
        email: normalized,
        status: 'unverified',
        pendingEmail: normalized,
        pendingTokenHash: tokenHash,
        pendingExpiresAt: expiresAt,
        lastVerificationSentAt: now,
      },
    });

    const verifyUrl = this.buildEmailVerificationUrl(token);
    await this.notifications.sendVerificationEmail({
      email: normalized,
      name: user.name ?? null,
      role,
      verifyUrl,
      locale: normalizeLocale(user.preferredLocale || user.language),
    });

    return this.getEmailContacts(userId);
  }

  async resendEmailVerification(userId: string, role: EmailRole) {
    if (!EMAIL_ROLES.includes(role)) {
      throw new BadRequestException('role is invalid');
    }
    const contact = await this.prisma.userEmailContact.findUnique({
      where: { userId_role: { userId, role } },
    });
    if (!contact || contact.status !== 'unverified' || !contact.pendingEmail) {
      throw new BadRequestException('再送できるメールがありません');
    }

    const lastSentAt = contact.lastVerificationSentAt?.getTime() ?? 0;
    const nowMs = Date.now();
    if (lastSentAt && nowMs - lastSentAt < EMAIL_VERIFY_RESEND_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((EMAIL_VERIFY_RESEND_COOLDOWN_MS - (nowMs - lastSentAt)) / 1000);
      throw new BadRequestException(`再送は${waitSeconds}秒後にお試しください`);
    }

    const token = this.generateEmailToken();
    const tokenHash = this.hashEmailToken(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + EMAIL_VERIFY_TOKEN_TTL_MS);

    await this.prisma.userEmailContact.update({
      where: { id: contact.id },
      data: {
        pendingTokenHash: tokenHash,
        pendingExpiresAt: expiresAt,
        lastVerificationSentAt: now,
        bounceReason: null,
        bouncedAt: null,
      },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, preferredLocale: true, language: true },
    });
    const verifyUrl = this.buildEmailVerificationUrl(token);
    await this.notifications.sendVerificationEmail({
      email: contact.pendingEmail,
      name: user?.name ?? null,
      role,
      verifyUrl,
      locale: normalizeLocale(user?.preferredLocale || user?.language),
    });

    return this.getEmailContacts(userId);
  }

  async verifyEmailToken(token: string) {
    const trimmed = (token || '').trim();
    if (!trimmed) {
      throw new BadRequestException('token is required');
    }
    const tokenHash = this.hashEmailToken(trimmed);
    const contact = await this.prisma.userEmailContact.findFirst({
      where: { pendingTokenHash: tokenHash },
    });
    if (!contact || !contact.pendingEmail) {
      throw new BadRequestException('無効な確認リンクです');
    }
    if (contact.pendingExpiresAt && contact.pendingExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('確認リンクの有効期限が切れています');
    }

    const now = new Date();
    const verifiedEmail = contact.pendingEmail;
    await this.prisma.userEmailContact.update({
      where: { id: contact.id },
      data: {
        email: verifiedEmail,
        status: 'verified',
        verifiedAt: now,
        pendingEmail: null,
        pendingTokenHash: null,
        pendingExpiresAt: null,
        bounceReason: null,
        bouncedAt: null,
      },
    });

    const otherRole: EmailRole = contact.role === 'organizer' ? 'participant' : 'organizer';
    await this.prisma.userEmailContact.updateMany({
      where: { userId: contact.userId, role: otherRole, email: verifiedEmail },
      data: {
        status: 'verified',
        verifiedAt: now,
        pendingEmail: null,
        pendingTokenHash: null,
        pendingExpiresAt: null,
        bounceReason: null,
        bouncedAt: null,
      },
    });

    return { success: true, role: contact.role, email: verifiedEmail };
  }

  async processBrevoWebhook(payload: any) {
    const events = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.events)
        ? payload.events
        : payload
          ? [payload]
          : [];
    let updated = 0;
    for (const event of events) {
      const email = this.resolveBrevoEmail(event);
      const eventType = this.resolveBrevoEventType(event);
      if (!email || !eventType) continue;
      if (!this.shouldMarkBrevoBounce(eventType)) continue;
      updated += await this.markEmailBounced(email, event?.reason || event?.message || null);
    }
    return { received: events.length, updated };
  }

  async cancelEventRegistration(userId: string, registrationId: string) {
    const registration = await this.prisma.eventRegistration.findFirst({
      where: {
        id: registrationId,
        userId,
        status: { not: 'cancelled' },
      },
      select: {
        id: true,
        amount: true,
        paymentStatus: true,
        lessonId: true,
        event: {
          select: { startTime: true, refundDeadlineAt: true, config: true, refundPolicy: true },
        },
        payment: {
          select: { id: true },
        },
      },
    });

    if (!registration) {
      throw new NotFoundException('キャンセル可能な申込が見つかりません');
    }

    if (registration.event) {
      const refundDeadlineAt = registration.event.refundDeadlineAt ?? registration.event.startTime;
      if (refundDeadlineAt && new Date(refundDeadlineAt) <= new Date()) {
        throw new BadRequestException('返金締切を過ぎているためキャンセルできません');
      }
      if (new Date(registration.event.startTime) <= new Date()) {
        throw new BadRequestException('イベント開始後はキャンセルできません');
      }
    }

    if ((registration.amount ?? 0) > 0 && registration.paymentStatus === 'paid') {
      const refundPercent = this.resolveRefundPercent(registration.event);
      if (refundPercent === null) {
        const refundRequest = await this.prisma.refundRequest.upsert({
          where: { registrationId },
          update: {
            status: 'requested',
            decision: null,
            approvedAmount: null,
            refundedAmount: null,
            reason: null,
            paymentId: registration.payment?.id ?? null,
          },
          create: {
            registrationId,
            paymentId: registration.payment?.id ?? null,
            status: 'requested',
            requestedAmount: registration.amount ?? 0,
            reason: null,
            lessonId: registration.lessonId ?? null,
          },
        });
        await this.prisma.eventRegistration.update({
          where: { id: registrationId },
          data: { status: 'cancel_requested' },
        });
        void this.notifications.notifyRegistrationCancelled(registrationId, 'paid').catch(() => null);
        return { registrationId, status: 'cancel_requested', refundRequest };
      }

      const refundAmount = this.calculateRefundAmount(registration.amount ?? 0, refundPercent);
      if (refundAmount <= 0) {
        await this.prisma.eventRegistration.update({
          where: { id: registrationId },
          data: { status: 'cancelled' },
        });
        await this.ensureZeroLedgerEntry(registrationId, `zero:cancel:${registrationId}`);
        void this.notifications.notifyRegistrationCancelled(registrationId, 'paid').catch(() => null);
        return { registrationId, status: 'cancelled', refundedAmount: 0 };
      }

      try {
        const result = await this.paymentsService.refundStripePaymentForRegistration(
          userId,
          registrationId,
          refundAmount,
        );
        const refundRequest = await this.prisma.refundRequest.upsert({
          where: { registrationId },
          update: {
            status: 'completed',
            decision: 'approve_auto',
            approvedAmount: refundAmount,
            refundedAmount: refundAmount,
            reason: null,
            paymentId: registration.payment?.id ?? null,
            gatewayRefundId: result.refundId ?? null,
          },
          create: {
            registrationId,
            paymentId: registration.payment?.id ?? null,
            status: 'completed',
            decision: 'approve_auto',
            requestedAmount: registration.amount ?? 0,
            approvedAmount: refundAmount,
            refundedAmount: refundAmount,
            reason: null,
            lessonId: registration.lessonId ?? null,
            gatewayRefundId: result.refundId ?? null,
          },
        });
        void this.notifications.notifyRegistrationCancelled(registrationId, 'paid').catch(() => null);
        return { registrationId, status: 'refunded', refundRequest };
      } catch (error) {
        await this.prisma.refundRequest.upsert({
          where: { registrationId },
          update: {
            status: 'processing',
            decision: null,
            approvedAmount: refundAmount,
            refundedAmount: null,
            reason: error instanceof Error ? error.message : 'Refund failed',
            paymentId: registration.payment?.id ?? null,
          },
          create: {
            registrationId,
            paymentId: registration.payment?.id ?? null,
            status: 'processing',
            requestedAmount: registration.amount ?? 0,
            approvedAmount: refundAmount,
            reason: error instanceof Error ? error.message : 'Refund failed',
            lessonId: registration.lessonId ?? null,
          },
        });
        await this.prisma.eventRegistration.update({
          where: { id: registrationId },
          data: { status: 'pending_refund' },
        });
        void this.notifications.notifyRegistrationCancelled(registrationId, 'paid').catch(() => null);
        return { registrationId, status: 'pending_refund' };
      }
    }

    await this.prisma.eventRegistration.update({
      where: { id: registrationId },
      data: { status: 'cancelled' },
    });
    await this.ensureZeroLedgerEntry(registrationId, `zero:cancel:${registrationId}`);
    void this.notifications.notifyRegistrationCancelled(registrationId, 'free').catch(() => null);

    return { registrationId, status: 'cancelled' };
  }

  async requestCancelRegistration(userId: string, registrationId: string, reason?: string) {
    const registration = await this.prisma.eventRegistration.findFirst({
      where: {
        id: registrationId,
        userId,
      },
      include: {
        event: {
          select: { startTime: true, refundDeadlineAt: true, config: true, refundPolicy: true },
        },
        payment: true,
      },
    });

    if (!registration) {
      throw new NotFoundException('キャンセル可能な申込が見つかりません');
    }
    if (registration.event) {
      const refundDeadlineAt = registration.event.refundDeadlineAt ?? registration.event.startTime;
      if (refundDeadlineAt && new Date(refundDeadlineAt) <= new Date()) {
        throw new BadRequestException('返金締切を過ぎているためキャンセルできません');
      }
    }

    if (registration.status === 'cancel_requested') {
      return { registrationId, status: 'cancel_requested' };
    }

    if (registration.status === 'pending_payment') {
      const payment = registration.payment ?? (await this.prisma.payment.findFirst({ where: { registrationId } }));
      if (payment) {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'cancelled' },
        });
      }
      await this.prisma.eventRegistration.update({
        where: { id: registrationId },
        data: { status: 'cancelled', paymentStatus: 'cancelled' },
      });
      await this.ensureZeroLedgerEntry(registrationId, `zero:cancel:${registrationId}`);
      void this.notifications.notifyRegistrationCancelled(registrationId, 'free').catch(() => null);
      return { registrationId, status: 'cancelled' };
    }

    if ((registration.amount ?? 0) > 0 && registration.paymentStatus === 'paid') {
      const refundPercent = this.resolveRefundPercent(registration.event);
      if (refundPercent === null) {
        const refundRequest = await this.prisma.refundRequest.upsert({
          where: { registrationId },
          update: {
            status: 'requested',
            decision: null,
            approvedAmount: null,
            refundedAmount: null,
            reason: reason ?? null,
            paymentId: registration.payment?.id ?? null,
          },
          create: {
            registrationId,
            paymentId: registration.payment?.id ?? null,
            status: 'requested',
            requestedAmount: registration.amount ?? 0,
            reason: reason ?? null,
            lessonId: registration.lessonId ?? null,
          },
        });
        await this.prisma.eventRegistration.update({
          where: { id: registrationId },
          data: { status: 'cancel_requested' },
        });
        void this.notifications.notifyRegistrationCancelled(registrationId, 'paid').catch(() => null);
        return { registrationId, status: 'cancel_requested', refundRequest };
      }

      const refundAmount = this.calculateRefundAmount(registration.amount ?? 0, refundPercent);
      if (refundAmount <= 0) {
        await this.prisma.eventRegistration.update({
          where: { id: registrationId },
          data: { status: 'cancelled' },
        });
        await this.ensureZeroLedgerEntry(registrationId, `zero:cancel:${registrationId}`);
        void this.notifications.notifyRegistrationCancelled(registrationId, 'paid').catch(() => null);
        return { registrationId, status: 'cancelled', refundedAmount: 0 };
      }

      try {
        const result = await this.paymentsService.refundStripePaymentForRegistration(
          userId,
          registrationId,
          refundAmount,
          reason,
        );
        const refundRequest = await this.prisma.refundRequest.upsert({
          where: { registrationId },
          update: {
            status: 'completed',
            decision: 'approve_auto',
            approvedAmount: refundAmount,
            refundedAmount: refundAmount,
            reason: reason ?? null,
            paymentId: registration.payment?.id ?? null,
            gatewayRefundId: result.refundId ?? null,
          },
          create: {
            registrationId,
            paymentId: registration.payment?.id ?? null,
            status: 'completed',
            decision: 'approve_auto',
            requestedAmount: registration.amount ?? 0,
            approvedAmount: refundAmount,
            refundedAmount: refundAmount,
            reason: reason ?? null,
            lessonId: registration.lessonId ?? null,
            gatewayRefundId: result.refundId ?? null,
          },
        });
        void this.notifications.notifyRegistrationCancelled(registrationId, 'paid').catch(() => null);
        return { registrationId, status: 'refunded', refundRequest };
      } catch (error) {
        await this.prisma.refundRequest.upsert({
          where: { registrationId },
          update: {
            status: 'processing',
            decision: null,
            approvedAmount: refundAmount,
            refundedAmount: null,
            reason: error instanceof Error ? error.message : 'Refund failed',
            paymentId: registration.payment?.id ?? null,
          },
          create: {
            registrationId,
            paymentId: registration.payment?.id ?? null,
            status: 'processing',
            requestedAmount: registration.amount ?? 0,
            approvedAmount: refundAmount,
            reason: error instanceof Error ? error.message : 'Refund failed',
            lessonId: registration.lessonId ?? null,
          },
        });
        await this.prisma.eventRegistration.update({
          where: { id: registrationId },
          data: { status: 'pending_refund' },
        });
        void this.notifications.notifyRegistrationCancelled(registrationId, 'paid').catch(() => null);
        return { registrationId, status: 'pending_refund' };
      }
    }

    await this.prisma.eventRegistration.update({
      where: { id: registrationId },
      data: { status: 'cancelled' },
    });
    await this.ensureZeroLedgerEntry(registrationId, `zero:cancel:${registrationId}`);
    void this.notifications.notifyRegistrationCancelled(registrationId, 'free').catch(() => null);

    return { registrationId, status: 'cancelled' };
  }

  async getNotificationPreferences(userId: string) {
    const prefs = await this.prisma.notificationPreference.findMany({
      where: { userId, category: 'marketing' },
    });
    const map = new Map<string, boolean>();
    for (const pref of prefs) {
      map.set(pref.channel, pref.enabled);
    }
    return {
      marketing: {
        line: map.get('line') ?? true,
        email: map.get('email') ?? true,
      },
    };
  }

  async updateNotificationPreference(userId: string, payload: { channel?: string; enabled?: boolean; category?: string }) {
    const channel = payload.channel;
    const enabled = payload.enabled;
    const category = payload.category ?? 'marketing';
    if (!channel || !['line', 'email'].includes(channel)) {
      throw new BadRequestException('channel is required');
    }
    if (typeof enabled !== 'boolean') {
      throw new BadRequestException('enabled is required');
    }
    if (category !== 'marketing') {
      throw new BadRequestException('Only marketing preferences are supported');
    }
    await this.prisma.notificationPreference.upsert({
      where: { userId_category_channel: { userId, category, channel } },
      update: { enabled },
      create: { userId, category, channel, enabled },
    });
    return this.getNotificationPreferences(userId);
  }

  private formatEmailContact(contact: any | null, role: EmailRole) {
    const status = (contact?.status as EmailStatus) ?? 'none';
    const lastSentAt = contact?.lastVerificationSentAt ?? null;
    const resendAvailableAt = lastSentAt
      ? new Date(lastSentAt.getTime() + EMAIL_VERIFY_RESEND_COOLDOWN_MS)
      : null;
    return {
      role,
      email: contact?.email ?? null,
      status,
      verifiedAt: contact?.verifiedAt ?? null,
      pendingEmail: contact?.pendingEmail ?? null,
      pendingExpiresAt: contact?.pendingExpiresAt ?? null,
      lastVerificationSentAt: lastSentAt,
      resendAvailableAt,
      bounceReason: contact?.bounceReason ?? null,
      bouncedAt: contact?.bouncedAt ?? null,
    };
  }

  private normalizeEmail(input: string) {
    const trimmed = (input || '').trim().toLowerCase();
    if (!trimmed) return '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      throw new BadRequestException('メールアドレスの形式が正しくありません');
    }
    return trimmed;
  }

  private generateEmailToken() {
    return randomBytes(32).toString('hex');
  }

  private hashEmailToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private resolveFrontendBaseUrl() {
    const raw =
      (process.env.FRONTEND_BASE_URL || '').trim() ||
      (process.env.FRONTEND_BASE_URL_LIVE || '').trim() ||
      (process.env.FRONTEND_BASE_URL_UAT || '').trim() ||
      'http://localhost:5173';
    return raw.replace(/\/$/, '');
  }

  private buildEmailVerificationUrl(token: string) {
    const base = this.resolveFrontendBaseUrl();
    return `${base}/verify-email?token=${encodeURIComponent(token)}`;
  }

  private resolveBrevoEmail(event: any) {
    if (event && typeof event.email === 'string') return event.email.trim().toLowerCase();
    if (event && typeof event.recipient === 'string') return event.recipient.trim().toLowerCase();
    return '';
  }

  private resolveBrevoEventType(event: any) {
    if (event && typeof event.event === 'string') return event.event.trim().toLowerCase();
    if (event && typeof event.eventType === 'string') return event.eventType.trim().toLowerCase();
    if (event && typeof event.type === 'string') return event.type.trim().toLowerCase();
    return '';
  }

  private shouldMarkBrevoBounce(eventType: string) {
    const normalized = eventType.replace(/\s+/g, '_');
    return normalized === 'hard_bounce' || normalized === 'complaint' || normalized === 'spam';
  }

  private async markEmailBounced(email: string, reason?: string | null) {
    const normalized = (email || '').trim().toLowerCase();
    if (!normalized) return 0;
    const now = new Date();
    const result = await this.prisma.userEmailContact.updateMany({
      where: { email: normalized },
      data: {
        status: 'hard_bounce',
        bounceReason: reason ?? null,
        bouncedAt: now,
        pendingEmail: null,
        pendingTokenHash: null,
        pendingExpiresAt: null,
      },
    });
    return result.count ?? 0;
  }

  private async ensureZeroLedgerEntry(registrationId: string, idempotencyKey: string) {
    try {
      await this.prisma.ledgerEntry.upsert({
        where: { idempotencyKey },
        update: {},
        create: {
          businessPaymentId: 'zero', // marker
          businessRegistrationId: registrationId,
          entryType: 'adjustment',
          direction: 'in',
          amount: 0,
          currency: 'jpy',
          provider: 'internal',
          idempotencyKey,
        },
      });
    } catch (error) {
      // best effort; do not block cancellation
      // eslint-disable-next-line no-console
      console.warn('Failed to write zero ledger entry', error);
    }
  }

  private normalizeRefundPolicyRules(raw: any): {
    mode: 'none' | 'single' | 'tiered';
    tiers?: Array<{ daysBefore: number; percent: number }>;
    single?: { daysBefore: number; percent: number };
  } | null {
    if (!raw || typeof raw !== 'object') return null;
    const mode = raw.mode;
    if (mode === 'none') return { mode: 'none' };
    if (mode === 'single') {
      const single = raw.single;
      if (!single) return { mode: 'single', single: { daysBefore: 3, percent: 50 } };
      return {
        mode: 'single',
        single: {
          daysBefore: Number.isFinite(Number(single.daysBefore)) ? Math.max(0, Number(single.daysBefore)) : 3,
          percent: Number.isFinite(Number(single.percent)) ? Math.max(0, Math.min(100, Number(single.percent))) : 50,
        },
      };
    }
    if (mode === 'tiered') {
      const tiers = Array.isArray(raw.tiers) ? raw.tiers : [];
      const tier1 = tiers[0] ?? { daysBefore: 7, percent: 100 };
      const tier2 = tiers[1] ?? { daysBefore: 3, percent: 50 };
      return {
        mode: 'tiered',
        tiers: [
          {
            daysBefore: Number.isFinite(Number(tier1.daysBefore)) ? Math.max(0, Number(tier1.daysBefore)) : 7,
            percent: Number.isFinite(Number(tier1.percent)) ? Math.max(0, Math.min(100, Number(tier1.percent))) : 100,
          },
          {
            daysBefore: Number.isFinite(Number(tier2.daysBefore)) ? Math.max(0, Number(tier2.daysBefore)) : 3,
            percent: Number.isFinite(Number(tier2.percent)) ? Math.max(0, Math.min(100, Number(tier2.percent))) : 50,
          },
        ],
      };
    }
    return null;
  }

  private resolveRefundPercent(
    event?: { startTime?: Date; config?: unknown | null; refundPolicy?: unknown | null } | null,
  ): number | null {
    const rules = this.normalizeRefundPolicyRules(this.extractRefundPolicyRules(event));
    if (!rules) return null;
    if (rules.mode === 'none') return 0;
    const startTime = event?.startTime ? new Date(event.startTime) : null;
    if (!startTime || Number.isNaN(startTime.getTime())) return null;
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    if (rules.mode === 'single' && rules.single) {
      const cutoff = new Date(startTime.getTime() - rules.single.daysBefore * dayMs);
      return now <= cutoff ? rules.single.percent : 0;
    }
    if (rules.mode === 'tiered' && rules.tiers?.length) {
      const tiers = [...rules.tiers].sort((a, b) => b.daysBefore - a.daysBefore);
      for (const tier of tiers) {
        const cutoff = new Date(startTime.getTime() - tier.daysBefore * dayMs);
        if (now <= cutoff) return tier.percent;
      }
      return 0;
    }
    return null;
  }

  private extractRefundPolicyRules(event?: { config?: unknown | null; refundPolicy?: unknown | null } | null) {
    const candidates = [event?.config, event?.refundPolicy];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const raw = this.parseJsonMaybe(candidate);
      if (!raw || typeof raw !== 'object') continue;
      const rulesCandidate =
        (raw as any)?.refundPolicyRules ??
        (raw as any)?.rules ??
        (raw as any);
      const rules = this.parseJsonMaybe(rulesCandidate);
      if (rules && typeof rules === 'object') return rules;
    }
    return null;
  }

  private parseJsonMaybe(value: unknown) {
    if (!value) return null;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    if (typeof value === 'object') return value;
    return null;
  }

  private calculateRefundAmount(amount: number, percent: number) {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    if (!Number.isFinite(percent) || percent <= 0) return 0;
    return Math.round((amount * percent) / 100);
  }

  private getSupportedLocales() {
    const configured = process.env.SUPPORTED_LANGUAGES;
    const list = configured
      ? configured
          .split(',')
          .map((l) => l.trim().toLowerCase())
          .filter(Boolean)
      : DEFAULT_SUPPORTED_LANGS;
    return Array.from(new Set(list));
  }
}
