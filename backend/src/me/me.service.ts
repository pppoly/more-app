import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Express } from 'express';
import { buildAssetUrl } from '../common/storage/asset-path';
import { AssetService } from '../asset/asset.service';
const DEFAULT_SUPPORTED_LANGS = ['ja', 'en', 'zh', 'vi', 'ko', 'tl', 'pt-br', 'ne', 'id', 'th', 'zh-tw', 'my'];

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetService: AssetService,
  ) {}

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
          },
        },
        event: {
          select: {
            id: true,
            startTime: true,
            endTime: true,
            locationText: true,
            title: true,
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

    return registrations.map((registration) => {
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
      return {
        registrationId: rest.id,
        status: rest.status,
        paymentStatus: derivedPaymentStatus,
        amount: rest.amount,
        attended: rest.attended,
        noShow: rest.noShow,
        refundRequest: rest?.refundRequest ?? null,
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
    });
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
        language: true,
        preferredLocale: true,
        prefecture: true,
        avatarUrl: true,
        isOrganizer: true,
        isAdmin: true,
      },
    });
  }

  async updateProfile(userId: string, payload: { name?: string | undefined; preferredLocale?: string | undefined }) {
    const data: Record<string, any> = {};
    if (payload.name !== undefined) {
      const trimmed = payload.name.trim();
      if (!trimmed) {
        throw new BadRequestException('表示名を入力してください');
      }
      data.name = trimmed;
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
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        name: true,
        language: true,
        preferredLocale: true,
        prefecture: true,
        avatarUrl: true,
        isOrganizer: true,
        isAdmin: true,
      },
    });
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
          select: { startTime: true },
        },
        payment: {
          select: { id: true },
        },
      },
    });

    if (!registration) {
      throw new NotFoundException('キャンセル可能な申込が見つかりません');
    }

    if (registration.event && new Date(registration.event.startTime) <= new Date()) {
      throw new BadRequestException('イベント開始後はキャンセルできません');
    }

    if ((registration.amount ?? 0) > 0 && registration.paymentStatus === 'paid') {
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
      return { registrationId, status: 'cancel_requested', refundRequest };
    }

    await this.prisma.eventRegistration.update({
      where: { id: registrationId },
      data: { status: 'cancelled' },
    });
    await this.ensureZeroLedgerEntry(registrationId, `zero:cancel:${registrationId}`);

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
          select: { startTime: true },
        },
        payment: true,
      },
    });

    if (!registration) {
      throw new NotFoundException('キャンセル可能な申込が見つかりません');
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
      return { registrationId, status: 'cancelled' };
    }

    if ((registration.amount ?? 0) > 0 && registration.paymentStatus === 'paid') {
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
      return { registrationId, status: 'cancel_requested', refundRequest };
    }

    await this.prisma.eventRegistration.update({
      where: { id: registrationId },
      data: { status: 'cancelled' },
    });
    await this.ensureZeroLedgerEntry(registrationId, `zero:cancel:${registrationId}`);

    return { registrationId, status: 'cancelled' };
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
