/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/unbound-method */
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { promises as fs } from 'fs';
import { dirname, extname } from 'path';
import type { Express } from 'express';
import { PaymentsService } from '../payments/payments.service';
import { AiService, TranslateTextDto } from '../ai/ai.service';
import { PermissionsService } from '../auth/permissions.service';
import { assetKeyToDiskPath, buildAssetUrl } from '../common/storage/asset-path';
import { ContentModerationService, ModerationResult } from '../common/moderation/content-moderation.service';
import { NotificationService } from '../notifications/notification.service';
import { normalizeImageUrl } from '../common/utils/normalize-image-url';

const EVENT_UPLOAD_PREFIX = 'events';

interface LocalizedField {
  original?: string;
  lang?: string;
  translations?: Record<string, string>;
  [key: string]: unknown;
}

@Injectable()
export class ConsoleEventsService {
  private readonly logger = new Logger(ConsoleEventsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly paymentsService: PaymentsService,
    private readonly aiService: AiService,
    private readonly moderationService: ContentModerationService,
    private readonly notifications: NotificationService,
  ) {}

  private assertPaidTicketPricesPublishable(ticketTypes: any[]) {
    const MIN_PAID_TICKET_PRICE_TO_PUBLISH_JPY = 100;
    const invalid = (ticketTypes ?? []).some((ticket) => {
      const raw = (ticket as any)?.price ?? 0;
      const price = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(price) && price > 0 && price < MIN_PAID_TICKET_PRICE_TO_PUBLISH_JPY;
    });
    if (invalid) {
      throw new BadRequestException(`有料チケットの価格は${MIN_PAID_TICKET_PRICE_TO_PUBLISH_JPY}円以上に設定してください`);
    }
  }

  async listCommunityEvents(userId: string, communityId: string) {
    await this.permissions.assertCommunityManager(userId, communityId);
    const frontendBaseUrl = process.env.FRONTEND_BASE_URL;
    const successRegistrationWhere: Prisma.EventRegistrationWhereInput = {
      status: { in: ['paid', 'approved'] },
      OR: [{ paymentStatus: 'paid' }, { amount: 0 }],
    };
    const events = await this.prisma.event.findMany({
      where: { communityId },
      orderBy: { startTime: 'desc' },
      take: 30, // limit to speed up copy overlay
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        regStartTime: true,
        regEndTime: true,
        regDeadline: true,
        status: true,
        visibility: true,
        maxParticipants: true,
        config: true,
        galleries: {
          orderBy: { order: 'asc' },
          take: 1,
          select: { imageUrl: true },
        },
        _count: {
          select: {
            registrations: { where: successRegistrationWhere },
          },
        },
      },
    });
    return events.map((event) => {
      const { _count, ...rest } = event;
      const coverImageUrl = normalizeImageUrl(buildAssetUrl(rest.galleries[0]?.imageUrl), frontendBaseUrl);
      const currentParticipants = _count?.registrations ?? 0;
      const baseConfig =
        rest.config && typeof rest.config === 'object' ? { ...(rest.config as Record<string, any>) } : {};
      const config = {
        ...baseConfig,
        currentParticipants,
      };
      return {
        id: rest.id,
        title: rest.title,
        startTime: rest.startTime,
        endTime: rest.endTime,
        regStartTime: rest.regStartTime,
        regEndTime: rest.regEndTime,
        regDeadline: rest.regDeadline,
        status: rest.status,
        visibility: rest.visibility,
        maxParticipants: rest.maxParticipants,
        config,
        coverImageUrl,
      };
    });
  }

  async createEvent(userId: string, communityId: string, payload: any) {
    await this.permissions.assertOrganizer(userId);
    await this.permissions.assertCommunityManager(userId, communityId);
    const { ticketTypes = [], ...rest } = payload;
    const isDraft = rest?.status === 'draft';
    if (!isDraft) {
      this.assertPaidTicketPricesPublishable(ticketTypes);
    }
    const hasPaidTickets = (ticketTypes ?? []).some((t: any) => (t?.price ?? 0) > 0);
    if (!isDraft && hasPaidTickets) {
      const stripe = await this.prisma.community.findUnique({
        where: { id: communityId },
        select: { stripeAccountId: true, stripeAccountOnboarded: true },
      });
      if (!stripe?.stripeAccountId || !stripe?.stripeAccountOnboarded) {
        throw new BadRequestException('Stripe onboarding 未完了のため、有料イベントは公開できません');
      }
    }
    const eventData = this.prepareEventData(rest) as Prisma.EventCreateInput;
    const refundDeadlineAt = eventData.refundDeadlineAt ? new Date(eventData.refundDeadlineAt as any) : null;
    const endTime = eventData.endTime ? new Date(eventData.endTime as any) : null;
    if (refundDeadlineAt && endTime && refundDeadlineAt > endTime) {
      throw new BadRequestException('返金締切は終了日時より前に設定してください');
    }
    if (!isDraft) {
      const moderation = await this.moderateEventText(rest);
      this.applyModerationToEventData(eventData, moderation, false);
      eventData.status = 'open';
      eventData.reviewStatus = 'approved';
      eventData.reviewReason = null;
    } else {
      eventData.status = 'draft';
      eventData.reviewStatus = 'draft';
      eventData.reviewReason = null;
    }
    const created = await this.prisma.event.create({
      data: {
        ...eventData,
        community: { connect: { id: communityId } },
        reviewStatus: eventData.reviewStatus ?? (isDraft ? 'draft' : 'approved'),
        reviewReason: eventData.reviewReason ?? null,
        ticketTypes: {
          create: ticketTypes.map((ticket: any) => ({
            name: ticket.name,
            type: ticket.type,
            price: ticket.price,
            quota: ticket.quota ?? 50,
          })),
        },
      },
      include: { ticketTypes: true },
    });
    if (!isDraft) {
      await this.prisma.event.update({
        where: { id: created.id },
        data: {
          config: this.mergeReviewConfig(created.config, {
            status: 'approved',
            reviewerId: 'system',
            reason: eventData.reviewReason ?? null,
            reviewedAt: new Date(),
          }),
        },
      });
      this.queueEventTranslation(created.id, created.originalLanguage, {
        title: created.title,
        description: created.description,
        descriptionHtml: created.descriptionHtml,
      });
      void this.notifications.notifyEventPublished(created.id).catch((error) => {
        this.logger.warn(`Failed to notify event publish: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
    return this.prisma.event.findUnique({ where: { id: created.id }, include: { ticketTypes: true } });
  }

  async getEvent(userId: string, eventId: string) {
    await this.permissions.assertEventManager(userId, eventId);
    const frontendBaseUrl = process.env.FRONTEND_BASE_URL;
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { ticketTypes: true, community: true, galleries: { orderBy: { order: 'asc' } } },
    });
    if (!event) throw new NotFoundException('Event not found');
    const galleries = (event.galleries ?? []).map((gallery) => ({
      ...gallery,
      imageUrl: normalizeImageUrl(buildAssetUrl(gallery.imageUrl), frontendBaseUrl),
    }));
    return { ...event, galleries };
  }

  async updateEvent(userId: string, eventId: string, data: any) {
    await this.permissions.assertEventManager(userId, eventId);
    const existing = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { status: true, config: true, reviewStatus: true, communityId: true, ticketTypes: { select: { price: true } } },
    });
    const wasDraft = existing?.status === 'draft';
    const { ticketTypes = [], ...rest } = data;
    const isDraft = rest?.status === 'draft';
    const nextTicketTypes = ticketTypes && ticketTypes.length ? ticketTypes : existing?.ticketTypes ?? [];
    if (!isDraft) {
      this.assertPaidTicketPricesPublishable(nextTicketTypes);
    }
    const hasPaidTickets = (nextTicketTypes ?? []).some((t: any) => (t?.price ?? 0) > 0);
    if (!isDraft && hasPaidTickets && existing?.communityId) {
      const stripe = await this.prisma.community.findUnique({
        where: { id: existing.communityId },
        select: { stripeAccountId: true, stripeAccountOnboarded: true },
      });
      if (!stripe?.stripeAccountId || !stripe?.stripeAccountOnboarded) {
        throw new BadRequestException('Stripe onboarding 未完了のため、有料イベントは公開できません');
      }
    }
    const eventData = this.prepareEventData(rest, true) as Prisma.EventUpdateInput;
    const updateRefundDeadlineAt = eventData.refundDeadlineAt ? new Date(eventData.refundDeadlineAt as any) : null;
    const updateEndTime = eventData.endTime ? new Date(eventData.endTime as any) : null;
    if (updateRefundDeadlineAt && updateEndTime && updateRefundDeadlineAt > updateEndTime) {
      throw new BadRequestException('返金締切は終了日時より前に設定してください');
    }
    if (!isDraft) {
      const moderation = await this.moderateEventText(rest);
      this.applyModerationToEventData(eventData, moderation, true);
    }
    const baseConfig = eventData.config ?? existing?.config ?? null;
    const reviewStatus = isDraft ? 'draft' : 'approved';
    eventData.config = this.mergeReviewConfig(baseConfig as any, {
      status: reviewStatus,
      reviewerId: isDraft ? null : 'system',
      reason: (eventData as any).reviewReason ?? null,
      reviewedAt: isDraft ? null : new Date(),
    });
    eventData.reviewStatus = reviewStatus;
    eventData.reviewReason = null;
    eventData.status = isDraft ? 'draft' : 'open';
    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: eventData,
      include: { ticketTypes: true },
    });

    if (ticketTypes && ticketTypes.length) {
      const existingTicket = await this.prisma.eventTicketType.findFirst({ where: { eventId } });
      if (existingTicket) {
        await this.prisma.eventTicketType.update({
          where: { id: existingTicket.id },
          data: {
            price: ticketTypes[0].price,
            type: ticketTypes[0].type,
            name: ticketTypes[0].name ?? existingTicket.name,
          },
        });
      } else {
        await this.prisma.eventTicketType.create({
          data: {
            eventId,
            name: ticketTypes[0].name,
            type: ticketTypes[0].type,
            price: ticketTypes[0].price,
          },
        });
      }
    }

    if (!isDraft) {
      this.queueEventTranslation(eventId, updated.originalLanguage, {
        title: updated.title,
        description: updated.description,
        descriptionHtml: updated.descriptionHtml,
      });
      if (wasDraft) {
        void this.notifications.notifyEventPublished(eventId).catch((error) => {
          this.logger.warn(`Failed to notify event publish: ${error instanceof Error ? error.message : String(error)}`);
        });
      }
    }

    return this.prisma.event.findUnique({ where: { id: eventId }, include: { ticketTypes: true } });
  }

  async listRegistrationsDetailed(userId: string, eventId: string) {
    await this.permissions.assertEventManager(userId, eventId);
    const registrations = await this.prisma.eventRegistration.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        ticketType: { select: { id: true, name: true, price: true } },
        payment: { select: { id: true } },
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
      },
    });

    return {
      total: registrations.length,
      items: registrations.map((reg) => ({
        registrationId: reg.id,
        user: {
          id: reg.user?.id ?? '',
          name: reg.user?.name ?? 'ゲスト',
          avatarUrl: reg.user?.avatarUrl ?? null,
        },
        ticket: reg.ticketType
          ? {
              id: reg.ticketType.id,
              name: this.getLocalizedText(reg.ticketType.name),
              price: reg.ticketType.price,
            }
          : null,
        status: reg.status,
        paymentStatus: reg.paymentStatus,
        paymentId: reg.payment?.id ?? null,
        refundRequest: reg.refundRequest
          ? {
              id: reg.refundRequest.id,
              status: reg.refundRequest.status,
              decision: reg.refundRequest.decision ?? null,
              requestedAmount: reg.refundRequest.requestedAmount,
              approvedAmount: reg.refundRequest.approvedAmount ?? null,
              refundedAmount: reg.refundRequest.refundedAmount ?? null,
              reason: reg.refundRequest.reason ?? null,
            }
          : null,
        attended: reg.attended,
        noShow: reg.noShow,
        amount: reg.amount,
        createdAt: reg.createdAt,
        formAnswers: reg.formAnswers ?? {},
      })),
    };
  }

  async approveRegistration(userId: string, eventId: string, registrationId: string) {
    await this.permissions.assertEventManager(userId, eventId);
    const registration = await this.prisma.eventRegistration.findUnique({ where: { id: registrationId } });
    if (!registration || registration.eventId !== eventId) {
      throw new NotFoundException('Registration not found');
    }
    if (registration.status !== 'pending') {
      throw new BadRequestException('报名已处理或不需要审核');
    }
    await this.prisma.eventRegistration.update({
      where: { id: registrationId },
      data: { status: 'approved', paymentStatus: registration.paymentStatus ?? 'unpaid' },
    });
    if ((registration.amount ?? 0) === 0 || registration.paymentStatus === 'paid') {
      void this.notifications.notifyRegistrationSuccess(registrationId).catch((error) => {
        this.logger.warn(`Failed to notify approved registration: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
    return { registrationId, status: 'approved' };
  }

  async rejectRegistration(userId: string, eventId: string, registrationId: string) {
    await this.permissions.assertEventManager(userId, eventId);
    const registration = await this.prisma.eventRegistration.findUnique({ where: { id: registrationId } });
    if (!registration || registration.eventId !== eventId) {
      throw new NotFoundException('Registration not found');
    }
    if (registration.status !== 'pending') {
      throw new BadRequestException('报名已处理或不需要审核');
    }
    await this.prisma.eventRegistration.update({
      where: { id: registrationId },
      data: { status: 'rejected', paymentStatus: registration.paymentStatus ?? 'unpaid' },
    });
    return { registrationId, status: 'rejected' };
  }

  async cancelRegistration(
    userId: string,
    eventId: string,
    registrationId: string,
    options?: { reason?: string },
  ) {
    await this.permissions.assertEventManager(userId, eventId);
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: { payment: true },
    });
    if (!registration || registration.eventId !== eventId) {
      throw new NotFoundException('Registration not found');
    }
    if (['cancelled', 'refunded'].includes(registration.status)) {
      return { registrationId, status: registration.status };
    }
    if (['pending_refund', 'cancel_requested'].includes(registration.status)) {
      return { registrationId, status: registration.status };
    }

    const payment =
      registration.payment ??
      (await this.prisma.payment.findFirst({ where: { registrationId: registration.id } }));

    if (registration.paymentStatus === 'paid' && (registration.amount ?? 0) > 0) {
      if (!payment) {
        throw new BadRequestException('支払い情報が見つかりません');
      }
      await this.paymentsService.refundStripePayment(userId, payment.id, options?.reason);
      return { registrationId, status: 'refunded', paymentId: payment.id };
    }

    if (payment && !['paid', 'refunded', 'cancelled'].includes(payment.status)) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'cancelled' },
      });
    }

    await this.prisma.eventRegistration.update({
      where: { id: registration.id },
      data: {
        status: 'cancelled',
        paymentStatus: 'cancelled',
        paidAmount: 0,
        attended: false,
        noShow: false,
      },
    });
    return { registrationId, status: 'cancelled' };
  }

  async decideRefundRequest(
    userId: string,
    requestId: string,
    payload: { decision: 'approve_full' | 'approve_partial' | 'reject'; amount?: number; reason?: string },
  ) {
    const request = await this.prisma.refundRequest.findUnique({
      where: { id: requestId },
      include: {
        registration: {
          include: {
            event: { select: { id: true } },
            payment: true,
          },
        },
        payment: true,
      },
    });
    if (!request) {
      throw new NotFoundException('Refund request not found');
    }
    const registration = request.registration;
    if (registration.eventId) {
      await this.permissions.assertEventManager(userId, registration.eventId);
    } else if (registration.lessonId) {
      const lesson = await this.prisma.lesson.findUnique({
        where: { id: registration.lessonId },
        include: { class: true },
      });
      if (!lesson) throw new NotFoundException('Lesson not found');
      await this.permissions.assertCommunityManager(userId, lesson.class.communityId);
    } else {
      throw new BadRequestException('紐付けイベントがありません');
    }

    if (['processing', 'completed', 'rejected'].includes(request.status)) {
      throw new ConflictException('Refund request already processed');
    }

    if (payload.decision === 'reject') {
    await this.prisma.$transaction([
      this.prisma.refundRequest.update({
        where: { id: requestId },
        data: {
          decision: 'reject',
          status: 'rejected',
            approvedAmount: 0,
            refundedAmount: 0,
            reason: payload.reason ?? request.reason ?? null,
          },
        }),
      this.prisma.eventRegistration.update({
        where: { id: registration.id },
        data: { status: 'cancelled' },
      }),
    ]);
      return { requestId, status: 'rejected', decision: 'reject' };
    }

    const payment =
      request.payment ??
      registration.payment ??
      (await this.prisma.payment.findFirst({ where: { registrationId: registration.id } }));

    if (!payment) {
      throw new BadRequestException('Refund対象の支払いが見つかりません');
    }

    const approvedAmount =
      payload.decision === 'approve_partial'
        ? payload.amount
        : request.requestedAmount || registration.amount || payment.amount;

    if (!approvedAmount || approvedAmount < 0) {
      throw new BadRequestException('返金額が不正です');
    }
    if (approvedAmount > payment.amount) {
      throw new BadRequestException('返金額が支払い額を超えています');
    }

    await this.prisma.refundRequest.update({
      where: { id: requestId },
      data: {
        decision: payload.decision,
        approvedAmount,
        status: 'processing',
        paymentId: payment.id,
        reason: payload.reason ?? request.reason ?? null,
      },
    });

    let refundId: string | null = null;
    if (payment.method === 'stripe') {
      const result = await this.paymentsService.refundStripePaymentInternal(userId, payment.id, approvedAmount, payload.reason);
      refundId = (result as any)?.refundId ?? null;
    } else {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'refunded' },
      });
    }

    await this.prisma.$transaction([
      this.prisma.refundRequest.update({
        where: { id: requestId },
        data: { status: 'completed', refundedAmount: approvedAmount, gatewayRefundId: refundId ?? undefined },
      }),
      this.prisma.eventRegistration.update({
        where: { id: registration.id },
        data: {
          status: 'cancelled',
          paymentStatus: 'refunded',
          paidAmount: Math.max((registration.paidAmount ?? 0) - approvedAmount, 0),
        },
      }),
    ]);

    void this.notifications
      .notifyRefundSuccess({ registrationId: registration.id, refundAmount: approvedAmount, refundId })
      .catch((error) => {
        this.logger.warn(`Failed to notify refund success: ${error instanceof Error ? error.message : String(error)}`);
      });
    return { requestId, status: 'completed', approvedAmount, refundId };
  }

  async getRegistrationsSummary(userId: string, eventId: string) {
    const event = await this.permissions.assertEventManager(userId, eventId);
    const fullEvent = await this.prisma.event.findUnique({
      where: { id: event.id },
      include: { ticketTypes: true },
    });
    if (!fullEvent) {
      throw new NotFoundException('Event not found');
    }

    const registrations = await this.prisma.eventRegistration.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });

    const successfulRegistrations = registrations.filter((reg) => this.isSuccessfulRegistration(reg));
    const total = successfulRegistrations.length;
    const paid = successfulRegistrations.filter((reg) => reg.paymentStatus === 'paid').length;
    const attended = successfulRegistrations.filter((reg) => reg.attended).length;
    const noShow = successfulRegistrations.filter((reg) => reg.noShow).length;
    const capacity = fullEvent.maxParticipants ?? null;

    const groups = fullEvent.ticketTypes.map((ticket) => ({
      label: this.getLocalizedText(ticket.name),
      count: successfulRegistrations.filter((reg) => reg.ticketTypeId === ticket.id).length,
      capacity: ticket.quota ?? capacity,
    }));

    const avatars = successfulRegistrations.slice(0, 20).map((reg) => ({
      userId: reg.userId,
      name: reg.user?.name ?? 'ゲスト',
      avatarUrl: reg.user?.avatarUrl ?? null,
      status: reg.paymentStatus,
    }));

    return {
      eventId: fullEvent.id,
      title: this.getLocalizedText(fullEvent.title),
      status: fullEvent.status,
      capacity,
      totalRegistrations: total,
      paidRegistrations: paid,
      attended,
      noShow,
      groups,
      avatars,
    };
  }

  private isSuccessfulRegistration(reg: { status?: string | null; paymentStatus?: string | null; amount?: number | null }) {
    const status = reg.status ?? '';
    const paymentStatus = reg.paymentStatus ?? '';
    const amount = reg.amount ?? 0;
    if (!['paid', 'approved'].includes(status)) return false;
    return paymentStatus === 'paid' || amount === 0;
  }

  async exportRegistrationsCsv(userId: string, eventId: string) {
    const event = await this.permissions.assertEventManager(userId, eventId);
    const fullEvent = await this.prisma.event.findUnique({ where: { id: event.id } });
    if (!fullEvent) throw new NotFoundException('Event not found');

    const formatPaymentStatus = (status?: string | null) => {
      switch (status) {
        case 'paid':
          return '支払済み';
        case 'unpaid':
          return '未払い';
        case 'refunded':
          return '返金済み';
        case 'pending_refund':
          return '返金待ち';
        case 'pending':
          return '処理中';
        case 'cancelled':
          return 'キャンセル';
        default:
          return status ? '不明' : '';
      }
    };

    const formatRegistrationStatus = (status?: string | null) => {
      switch (status) {
        case 'pending':
          return '審査待ち';
        case 'approved':
          return '承認済み';
        case 'cancel_requested':
          return '返金申請中';
        case 'rejected':
          return '拒否';
        case 'paid':
          return '支払済み';
        case 'refunded':
          return '返金済み';
        case 'pending_refund':
          return '返金待ち';
        case 'cancelled':
          return 'キャンセル';
        case 'checked_in':
          return '受付済み';
        default:
          return status ? '不明' : '';
      }
    };

    const formatBoolean = (value: boolean) => (value ? 'はい' : 'いいえ');
    const formatAmount = (value?: number | null) => (value == null ? '' : value.toString());
    const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const formSchema = Array.isArray(fullEvent.registrationFormSchema)
      ? (fullEvent.registrationFormSchema as Array<Record<string, any>>)
      : [];
    const dynamicColumns = formSchema.map((field, index) => {
      const label = field?.label ? String(field.label) : `項目${index + 1}`;
      const key = field?.id ? String(field.id) : `${field?.label ?? 'field'}-${index}`;
      return { key, label };
    });

    const registrations = await this.prisma.eventRegistration.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, name: true } },
        ticketType: { select: { id: true, name: true, price: true } },
      },
    });

    const baseHeaders = [
      '参加者名',
      '参加者ID',
      'チケット名',
      'チケット金額(円)',
      '支払金額(円)',
      '支払い状況',
      '申込ステータス',
      '出席',
      '無断欠席',
      '申込日時',
    ];
    const headerRow = [...baseHeaders, ...dynamicColumns.map((col) => col.label)];

    const rows = registrations.map((reg) => {
      const ticketName = reg.ticketType ? this.getLocalizedText(reg.ticketType.name) : '';
      const baseValues = [
        reg.user?.name ?? 'ゲスト',
        reg.user?.id ?? '',
        ticketName,
        formatAmount(reg.ticketType?.price ?? null),
        formatAmount(reg.amount ?? null),
        formatPaymentStatus(reg.paymentStatus),
        formatRegistrationStatus(reg.status),
        formatBoolean(reg.attended),
        formatBoolean(reg.noShow),
        dateFormatter.format(reg.createdAt),
      ];

      const answers = (reg.formAnswers ?? {}) as Record<string, any>;
      const dynamicValues = dynamicColumns.map((col) => {
        const raw = answers[col.key] ?? answers[col.label];
        if (raw === undefined || raw === null) return '';
        if (Array.isArray(raw)) return raw.join('、');
        if (typeof raw === 'object') {
          const record = raw as Record<string, unknown>;
          if (typeof record.label === 'string' && record.label.trim()) return record.label;
          if (typeof record.value === 'string' && record.value.trim()) return record.value;
          return JSON.stringify(raw);
        }
        return String(raw);
      });

      return [...baseValues, ...dynamicValues];
    });

    const csvLines = [headerRow, ...rows].map((row) => row.map(this.escapeCsv).join(','));
    return {
      filename: `event-${eventId}-registrations.csv`,
      csv: csvLines.join('\n'),
    };
  }

  async checkinRegistration(userId: string, eventId: string, registrationId: string) {
    await this.permissions.assertEventManager(userId, eventId);
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: {
        id: true,
        eventId: true,
        status: true,
        userId: true,
      },
    });
    if (!registration || registration.eventId !== eventId) {
      throw new NotFoundException('Registration not found');
    }
    if (registration.status === 'cancelled') {
      throw new BadRequestException('Registration was cancelled');
    }
    const existingCheckin = await this.prisma.eventCheckin.findFirst({
      where: { eventId, registrationId },
    });
    if (!existingCheckin) {
      await this.prisma.eventCheckin.create({
        data: {
          eventId,
          registrationId,
          checkinType: 'qr_scan',
        },
      });
    }
    await this.prisma.eventRegistration.update({
      where: { id: registrationId },
      data: { attended: true, noShow: false },
    });
    return { registrationId, status: 'checked_in' };
  }

  async listRegistrations(userId: string, eventId: string) {
    return this.listRegistrationsDetailed(userId, eventId);
  }

  async closeEvent(eventId: string, userId: string) {
    await this.permissions.assertEventManager(userId, eventId);
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { community: true },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.status === 'closed') {
      return { eventId: event.id, status: 'closed', summary: await this.buildSummary(eventId) };
    }

    const registrations = await this.prisma.eventRegistration.findMany({
      where: {
        eventId,
        status: { in: ['approved', 'paid'] },
      },
      select: {
        id: true,
        userId: true,
        paymentStatus: true,
      },
    });

    const checkins = await this.prisma.eventCheckin.findMany({
      where: { eventId },
      select: { registrationId: true },
    });
    const checkinSet = new Set(checkins.map((checkin) => checkin.registrationId));

    let attendedCount = 0;
    let noShowCount = 0;

    const operations: Prisma.PrismaPromise<unknown>[] = [];

    for (const registration of registrations) {
      const attended = checkinSet.has(registration.id);
      const noShow = !attended && registration.paymentStatus === 'paid';

      if (attended) attendedCount += 1;
      if (noShow) noShowCount += 1;

      operations.push(
        this.prisma.eventRegistration.update({
          where: { id: registration.id },
          data: { attended, noShow },
        }),
      );

      operations.push(
        this.prisma.communityMember.upsert({
          where: { communityId_userId: { communityId: event.communityId, userId: registration.userId } },
          create: {
            communityId: event.communityId,
            userId: registration.userId,
            role: 'member',
            status: 'active',
            totalRegistered: 1,
            totalAttendance: attended ? 1 : 0,
            totalNoShow: noShow ? 1 : 0,
          },
          update: {
            totalRegistered: { increment: 1 },
            totalAttendance: { increment: attended ? 1 : 0 },
            totalNoShow: { increment: noShow ? 1 : 0 },
          },
        }),
      );
    }

    operations.push(
      this.prisma.event.update({
        where: { id: eventId },
        data: { status: 'closed' },
      }),
    );

    await this.prisma.$transaction(operations);

    return {
      eventId: event.id,
      status: 'closed',
      summary: {
        totalRegistrations: registrations.length,
        attended: attendedCount,
        noShow: noShowCount,
      },
    };
  }

  async cancelEvent(eventId: string, userId: string, options: { reason?: string; notify?: boolean }) {
    await this.permissions.assertEventManager(userId, eventId);
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        community: true,
        registrations: {
          include: { user: { select: { id: true, name: true, email: true } }, payment: true },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.status === 'cancelled') {
      return { eventId: event.id, status: 'cancelled' };
    }

    const freeRegistrations = event.registrations.filter(
      (reg) => reg.paymentStatus !== 'paid' && reg.status !== 'rejected',
    );
    const paidRegistrations = event.registrations.filter((reg) => reg.paymentStatus === 'paid');

    const refundResults: Array<{ registrationId: string; status: string; error?: string }> = [];

    for (const reg of paidRegistrations) {
      try {
        const payment = reg.payment ?? (await this.prisma.payment.findFirst({ where: { registrationId: reg.id } }));
        if (!payment) {
          refundResults.push({ registrationId: reg.id, status: 'skipped', error: 'No payment found' });
          continue;
        }
        if (payment.method !== 'stripe') {
          refundResults.push({ registrationId: reg.id, status: 'skipped', error: 'Unsupported payment method' });
          continue;
        }
        await this.paymentsService.refundStripePayment(userId, payment.id, options?.reason);
        await this.prisma.eventRegistration.update({
          where: { id: reg.id },
          data: { status: 'refunded', paymentStatus: 'refunded', noShow: false, attended: false },
        });
        refundResults.push({ registrationId: reg.id, status: 'refunded' });
      } catch (err) {
        refundResults.push({
          registrationId: reg.id,
          status: 'refund_failed',
          error: err instanceof Error ? err.message : 'Refund failed',
        });
        await this.prisma.eventRegistration.update({
          where: { id: reg.id },
          data: { status: 'pending_refund', paymentStatus: reg.paymentStatus },
        });
      }
    }

    if (freeRegistrations.length) {
      await this.prisma.eventRegistration.updateMany({
        where: { id: { in: freeRegistrations.map((r) => r.id) } },
        data: { status: 'cancelled', noShow: false, attended: false },
      });
    }

    await this.prisma.event.update({
      where: { id: eventId },
      data: {
        status: 'cancelled',
        config: {
          ...(event.config && typeof event.config === 'object' ? (event.config as Record<string, any>) : {}),
          cancelledAt: new Date(),
          cancelledBy: userId,
          cancelReason: options?.reason ?? null,
        },
      },
    });

    const failed = refundResults.filter((r) => r.status === 'refund_failed');
    return {
      eventId,
      status: 'cancelled',
      refunds: refundResults,
      refundFailed: failed.length,
      refundTotal: paidRegistrations.length,
    };
  }

  async approveEvent(eventId: string, userId: string) {
    await this.permissions.assertAdmin(userId);
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        status: 'open',
        reviewStatus: 'approved',
        config: this.mergeReviewConfig(event.config, {
          status: 'approved',
          reviewerId: userId,
          reviewedAt: new Date(),
          reason: null,
        }),
      },
    });
    return { eventId: updated.id, status: updated.status };
  }

  async rejectEvent(eventId: string, userId: string, reason?: string) {
    await this.permissions.assertAdmin(userId);
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        status: 'rejected',
        reviewStatus: 'rejected',
        config: this.mergeReviewConfig(event.config, {
          status: 'rejected',
          reviewerId: userId,
          reviewedAt: new Date(),
          reason: reason ?? '内容未通过审核',
        }),
      },
    });
    return { eventId: updated.id, status: updated.status, reason: reason ?? null };
  }

  private getLocalizedText(content: Prisma.JsonValue | string | null | undefined): string {
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (typeof content === 'object') {
      const record = content as Record<string, any>;
      if (typeof record.original === 'string') {
        return record.original;
      }
    }
    return '';
  }

  private escapeCsv(value: string) {
    const str = value ?? '';
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  async uploadEventCovers(userId: string, eventId: string, files: Express.Multer.File[]) {
    if (!files || !files.length) {
      return [];
    }
    await this.permissions.assertEventManager(userId, eventId);
    const frontendBaseUrl = process.env.FRONTEND_BASE_URL;
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { config: true, status: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    const aggregate = await this.prisma.eventGallery.aggregate({
      where: { eventId },
      _max: { order: true },
    });
    let nextOrder = (aggregate._max.order ?? -1) + 1;

    const creations = [];
    for (const file of files) {
      // 暂时跳过图片审核，直接接受上传
      const extension = extname(file.originalname) || '.jpg';
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`;
      const imageKey = `${EVENT_UPLOAD_PREFIX}/${eventId}/${filename}`;
      const filePath = assetKeyToDiskPath(imageKey);
      if (filePath) {
        await fs.mkdir(dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, file.buffer);
      }
      creations.push(
        this.prisma.eventGallery.create({
          data: {
            eventId,
            imageUrl: imageKey,
            order: nextOrder,
            isCover: nextOrder === 0,
          },
        }),
      );
      nextOrder += 1;
    }

    const created = await this.prisma.$transaction(creations);
    return created.map((item) => ({
      id: item.id,
      imageUrl: normalizeImageUrl(buildAssetUrl(item.imageUrl), frontendBaseUrl),
      order: item.order,
    }));
  }

  async removeEventCover(userId: string, eventId: string, coverId: string) {
    await this.permissions.assertEventManager(userId, eventId);
    const frontendBaseUrl = process.env.FRONTEND_BASE_URL;
    const target = await this.prisma.eventGallery.findUnique({ where: { id: coverId } });
    if (!target || target.eventId !== eventId) {
      throw new NotFoundException('封面不存在');
    }
    await this.prisma.eventGallery.delete({ where: { id: coverId } });

    if (target.imageUrl) {
      const filePath = assetKeyToDiskPath(target.imageUrl);
      if (filePath) {
        try {
          await fs.unlink(filePath);
        } catch (err) {
          // 文件可能已不存在，忽略
        }
      }
    }

    const remaining = await this.prisma.eventGallery.findMany({
      where: { eventId },
      orderBy: { order: 'asc' },
    });

    await this.prisma.$transaction(
      remaining.map((item, index) =>
        this.prisma.eventGallery.update({
          where: { id: item.id },
          data: { order: index, isCover: index === 0 },
        }),
      ),
    );

    return remaining.map((item, index) => ({
      id: item.id,
      imageUrl: normalizeImageUrl(buildAssetUrl(item.imageUrl), frontendBaseUrl),
      order: index,
    }));
  }

  private queueEventTranslation(
    eventId: string,
    originalLanguage: string | null | undefined,
    fields?: { title?: any; description?: any; descriptionHtml?: string | null },
  ) {
    const targetLangs = this.getTranslationTargets(originalLanguage ?? undefined);
    if (!targetLangs.length) return;
    // Fire-and-forget so the API response is not blocked by translation latency.
    void this.translateEventIfNeeded(eventId, originalLanguage, targetLangs, fields).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('queueEventTranslation failed', { eventId, error: err });
    });
  }

  private prepareEventData(payload: any, isUpdate = false): Prisma.EventCreateInput | Prisma.EventUpdateInput {
    const data: Record<string, any> = {};
    const assign = (key: string, value: any) => {
      if (value !== undefined) {
        data[key] = value;
      }
    };

    const originalLang = payload.originalLanguage ?? (isUpdate ? undefined : 'ja');

    assign('title', this.ensureLocalizedField(payload.title, originalLang));
    assign('description', this.ensureLocalizedField(payload.description, originalLang));
    assign('descriptionHtml', payload.descriptionHtml ?? null);
    assign('originalLanguage', originalLang);
    assign('category', payload.category ?? null);
    assign('startTime', payload.startTime);
    assign('endTime', payload.endTime);
    if (payload.refundDeadlineAt !== undefined) {
      assign('refundDeadlineAt', payload.refundDeadlineAt ?? null);
    } else if (!isUpdate && payload.startTime) {
      assign('refundDeadlineAt', payload.startTime);
    }

    const regEnd = payload.regEndTime ?? payload.regDeadline ?? payload.regEnd;
    if (regEnd !== undefined) {
      assign('regDeadline', regEnd ?? payload.startTime ?? new Date());
      assign('regEndTime', regEnd);
    } else if (!isUpdate) {
      assign('regDeadline', payload.startTime ?? new Date());
      assign('regEndTime', payload.startTime ?? new Date());
    }

    if (payload.regStartTime !== undefined) {
      assign('regStartTime', payload.regStartTime);
    } else if (!isUpdate) {
      assign('regStartTime', new Date());
    }

    assign('locationText', payload.locationText);
    assign('locationLat', payload.locationLat ?? null);
    assign('locationLng', payload.locationLng ?? null);

    if (payload.minParticipants !== undefined) {
      assign('minParticipants', payload.minParticipants);
    } else if (!isUpdate) {
      assign('minParticipants', null);
    }

    if (payload.maxParticipants !== undefined) {
      assign('maxParticipants', payload.maxParticipants);
    }

    assign('visibility', payload.visibility);
    assign('requireApproval', payload.requireApproval ?? (isUpdate ? undefined : false));
    assign('status', payload.status ?? (isUpdate ? undefined : 'open'));
    if (payload.registrationFormSchema !== undefined) {
      assign('registrationFormSchema', payload.registrationFormSchema ?? Prisma.JsonNull);
    } else if (!isUpdate) {
      assign('registrationFormSchema', Prisma.JsonNull);
    }
    if (payload.config !== undefined) {
      assign('config', payload.config ?? Prisma.JsonNull);
    } else if (!isUpdate) {
      assign('config', Prisma.JsonNull);
    }
    assign('coverType', payload.coverType ?? null);
    return data;
  }

  private ensureLocalizedField(value: any, lang?: string): LocalizedField | null {
    if (value === undefined) return null;
    if (value === null) return null;
    const normalizedLang = typeof lang === 'string' ? lang : undefined;
    if (typeof value === 'string') {
      return { original: value, lang: normalizedLang, translations: {} };
    }
    if (typeof value === 'object') {
      const existing = value as LocalizedField;
      return {
        ...existing,
        lang: existing.lang ?? normalizedLang,
        translations: existing.translations ?? {},
      };
    }
    return { original: String(value), lang: normalizedLang, translations: {} };
  }

  private mergeReviewConfig(
    config: Prisma.JsonValue | null | undefined,
    review: { status: string; reviewerId?: string | null; reviewedAt?: Date | null; reason?: string | null; labels?: string[] },
  ): Prisma.InputJsonValue {
    const base = typeof config === 'object' && config !== null ? { ...(config as Record<string, any>) } : {};
    base.review = {
      ...(typeof base.review === 'object' ? base.review : {}),
      status: review.status,
      reviewerId: review.reviewerId ?? null,
      reviewedAt: review.reviewedAt === undefined ? new Date() : review.reviewedAt,
      reason: review.reason ?? null,
      labels: review.labels ?? [],
    };
    return base as Prisma.InputJsonValue;
  }

  private async moderateEventText(payload: any): Promise<ModerationResult> {
    const title = this.getLocalizedText(payload?.title);
    const description = this.getLocalizedText(payload?.description);
    const combined = [title, description].filter(Boolean).join('\n').trim();
    return this.moderationService.moderateText(combined);
  }

  private applyModerationToEventData(
    eventData: Prisma.EventCreateInput | Prisma.EventUpdateInput,
    result: ModerationResult,
    isUpdate: boolean,
  ) {
    const data = eventData as any;
    if (result.decision === 'reject') {
      data.reviewStatus = 'rejected';
      data.reviewReason = result.reason ?? 'コンテンツがガイドラインに違反しています。';
      data.status = 'rejected';
    } else if (result.decision === 'needs_review') {
      data.reviewStatus = 'pending_review';
      data.reviewReason = result.reason ?? 'システム審査が必要です。';
      if (!isUpdate && !data.status) {
        data.status = 'pending_review';
      }
    } else {
      data.reviewStatus = data.reviewStatus ?? 'approved';
      data.reviewReason = data.reviewReason ?? null;
      if (!data.status && !isUpdate) {
        data.status = 'pending_review';
      }
    }
  }

  private extractOriginalText(field: any): { text: string | null; lang: string | null } {
    if (!field) return { text: null, lang: null };
    if (typeof field === 'string') return { text: field, lang: null };
    if (typeof field === 'object') {
      const obj = field as LocalizedField;
      const text = typeof obj.original === 'string' ? obj.original : null;
      const lang = typeof obj.lang === 'string' ? obj.lang : null;
      return { text, lang };
    }
    return { text: String(field), lang: null };
  }

  private async translateEventIfNeeded(
    eventId: string,
    originalLanguage: string | null | undefined,
    targetLangs: string[],
    fields?: { title?: any; description?: any; descriptionHtml?: string | null },
  ) {
    const sourceLang = (originalLanguage ?? '').toLowerCase() || 'ja';
    const targets = targetLangs
      .map((l) => l.toLowerCase())
      .filter((l) => l && l !== sourceLang);
    if (!targets.length || !fields) return;

    const items: TranslateTextDto['items'] = [];
    const titleInfo = this.extractOriginalText(fields.title);
    if (titleInfo.text) {
      items.push({ key: 'title', text: titleInfo.text, preserveFormat: 'plain' });
    }
    const descText =
      typeof fields.descriptionHtml === 'string' && fields.descriptionHtml.trim().length
        ? fields.descriptionHtml
        : this.extractOriginalText(fields.description).text;
    if (descText) {
      items.push({ key: 'description', text: descText, preserveFormat: 'html' });
    }

    if (!items.length) return;

    // 如果已有目标语言的翻译则跳过对应目标
    const existingTitle = this.ensureLocalizedField(fields.title, sourceLang);
    const existingDesc = this.ensureLocalizedField(fields.description, sourceLang);
    const pendingTargets = targets.filter((lang) => {
      const hasTitle = existingTitle?.translations?.[lang];
      const hasDesc = existingDesc?.translations?.[lang];
      return !(hasTitle && hasDesc);
    });
    if (!pendingTargets.length) return;

    try {
      const result = await this.aiService.translateText({
        sourceLang,
        targetLangs: pendingTargets,
        items,
      });
      const updateData: Record<string, any> = {};

      for (const translation of result.translations ?? []) {
        for (const lang of pendingTargets) {
          const translatedText = translation.translated?.[lang];
          if (!translatedText) continue;
          if (translation.key === 'title') {
            const existing = existingTitle ?? { translations: {} };
            updateData.title = {
              ...existing,
              translations: { ...(existing.translations ?? {}), [lang]: translatedText },
            };
          }
          if (translation.key === 'description') {
            const existing = existingDesc ?? { translations: {} };
            updateData.description = {
              ...existing,
              translations: { ...(existing.translations ?? {}), [lang]: translatedText },
            };
          }
        }
      }

      if (Object.keys(updateData).length) {
        await this.prisma.event.update({
          where: { id: eventId },
          data: updateData,
        });
      }
    } catch (err) {
      // 翻译失败不阻塞主流程，记录日志便于排查
      // eslint-disable-next-line no-console
      console.warn('translateEventIfNeeded failed', { eventId, error: err });
    }
  }

  private getTranslationTargets(originalLanguage?: string) {
    const envTargets = process.env.TRANSLATION_TARGET_LANGUAGES;
    const defaults = ['ja', 'en', 'zh', 'vi', 'ko', 'tl', 'pt-br', 'ne', 'id', 'th', 'zh-tw', 'my'];
    const list = envTargets
      ? envTargets
          .split(',')
          .map((l) => l.trim().toLowerCase())
          .filter(Boolean)
      : defaults;
    const unique = Array.from(new Set(list));
    const source = (originalLanguage ?? '').toLowerCase();
    return source ? unique.filter((l) => l !== source) : unique;
  }

  private async buildSummary(eventId: string) {
    const totalRegistrations = await this.prisma.eventRegistration.count({ where: { eventId } });
    const attended = await this.prisma.eventRegistration.count({ where: { eventId, attended: true } });
    const noShow = await this.prisma.eventRegistration.count({ where: { eventId, noShow: true } });
    return {
      totalRegistrations,
      attended,
      noShow,
    };
  }
}
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/unbound-method */
