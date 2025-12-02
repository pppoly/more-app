import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

const EVENT_UPLOAD_PREFIX = 'events';

interface LocalizedField {
  original?: string;
  lang?: string;
  translations?: Record<string, string>;
  [key: string]: unknown;
}

@Injectable()
export class ConsoleEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly paymentsService: PaymentsService,
    private readonly aiService: AiService,
    private readonly moderationService: ContentModerationService,
  ) {}

  async listCommunityEvents(userId: string, communityId: string) {
    await this.permissions.assertCommunityManager(userId, communityId);
    const events = await this.prisma.event.findMany({
      where: { communityId },
      orderBy: { startTime: 'asc' },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        status: true,
        visibility: true,
        galleries: {
          orderBy: { order: 'asc' },
          take: 1,
          select: { imageUrl: true },
        },
      },
    });
    return events.map((event) => {
      const coverImageUrl = buildAssetUrl(event.galleries[0]?.imageUrl);
      return {
        id: event.id,
        title: event.title,
        startTime: event.startTime,
        endTime: event.endTime,
        status: event.status,
        visibility: event.visibility,
        coverImageUrl,
      };
    });
  }

  async createEvent(userId: string, communityId: string, payload: any) {
    await this.permissions.assertOrganizer(userId);
    await this.permissions.assertCommunityManager(userId, communityId);
    const { ticketTypes = [], ...rest } = payload;
    const eventData = this.prepareEventData(rest) as Prisma.EventCreateInput;
    const moderation = await this.moderateEventText(rest);
    this.applyModerationToEventData(eventData, moderation, false);
    const created = await this.prisma.event.create({
      data: {
        ...eventData,
        community: { connect: { id: communityId } },
        reviewStatus: eventData.reviewStatus ?? 'pending_review',
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
    await this.prisma.event.update({
      where: { id: created.id },
      data: {
        config: this.mergeReviewConfig(created.config, {
          status: moderation.decision === 'reject' ? 'rejected' : moderation.decision === 'needs_review' ? 'pending_review' : 'approved',
          reviewerId: 'system',
          reason: eventData.reviewReason ?? null,
          reviewedAt: moderation.decision === 'approve' ? new Date() : null,
        }),
      },
    });
    this.queueEventTranslation(created.id, created.originalLanguage, {
      title: created.title,
      description: created.description,
      descriptionHtml: created.descriptionHtml,
    });
    return this.prisma.event.findUnique({ where: { id: created.id }, include: { ticketTypes: true } });
  }

  async getEvent(userId: string, eventId: string) {
    await this.permissions.assertEventManager(userId, eventId);
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { ticketTypes: true, community: true, galleries: { orderBy: { order: 'asc' } } },
    });
    if (!event) throw new NotFoundException('Event not found');
    const galleries = (event.galleries ?? []).map((gallery) => ({
      ...gallery,
      imageUrl: buildAssetUrl(gallery.imageUrl),
    }));
    return { ...event, galleries };
  }

  async updateEvent(userId: string, eventId: string, data: any) {
    await this.permissions.assertEventManager(userId, eventId);
    const existing = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { status: true, config: true, reviewStatus: true },
    });
    const { ticketTypes = [], ...rest } = data;
    const eventData = this.prepareEventData(rest, true) as Prisma.EventUpdateInput;
    if (!eventData.status && existing?.reviewStatus === 'rejected') {
      eventData.reviewStatus = 'pending_review';
      eventData.status = 'pending_review';
      eventData.config = this.mergeReviewConfig(existing.config ?? null, {
        status: 'pending_review',
        reviewerId: 'system',
        reason: null,
        reviewedAt: null,
      });
    }
    const moderation = await this.moderateEventText(rest);
    this.applyModerationToEventData(eventData, moderation, true);
    const baseConfig = eventData.config ?? existing?.config ?? null;
    eventData.config = this.mergeReviewConfig(baseConfig as any, {
      status: moderation.decision === 'reject' ? 'rejected' : moderation.decision === 'needs_review' ? 'pending_review' : 'approved',
      reviewerId: 'system',
      reason: (eventData as any).reviewReason ?? null,
      reviewedAt: moderation.decision === 'approve' ? new Date() : null,
    });
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

    this.queueEventTranslation(eventId, updated.originalLanguage, {
      title: updated.title,
      description: updated.description,
      descriptionHtml: updated.descriptionHtml,
    });

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

    const activeRegistrations = registrations.filter((reg) => reg.status !== 'rejected');
    const total = activeRegistrations.length;
    const paid = activeRegistrations.filter((reg) => reg.paymentStatus === 'paid').length;
    const attended = activeRegistrations.filter((reg) => reg.attended).length;
    const noShow = activeRegistrations.filter((reg) => reg.noShow).length;
    const capacity = fullEvent.maxParticipants ?? null;

    const groups = fullEvent.ticketTypes.map((ticket) => ({
      label: this.getLocalizedText(ticket.name),
      count: activeRegistrations.filter((reg) => reg.ticketTypeId === ticket.id).length,
      capacity: ticket.quota ?? capacity,
    }));

    const avatars = activeRegistrations.slice(0, 20).map((reg) => ({
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

  async exportRegistrationsCsv(userId: string, eventId: string) {
    const event = await this.permissions.assertEventManager(userId, eventId);
    const fullEvent = await this.prisma.event.findUnique({ where: { id: event.id } });
    if (!fullEvent) throw new NotFoundException('Event not found');

    const formSchema = Array.isArray(fullEvent.registrationFormSchema)
      ? (fullEvent.registrationFormSchema as Array<Record<string, any>>)
      : [];
    const dynamicColumns = formSchema.map((field, index) => {
      const label = field?.label ? String(field.label) : `Field ${index + 1}`;
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
      'User Name',
      'User ID',
      'Ticket Name',
      'Ticket Price',
      'Amount',
      'Payment Status',
      'Status',
      'Attended',
      'No Show',
      'Created At',
    ];
    const headerRow = [...baseHeaders, ...dynamicColumns.map((col) => col.label)];

    const rows = registrations.map((reg) => {
      const ticketName = reg.ticketType ? this.getLocalizedText(reg.ticketType.name) : '';
      const baseValues = [
        reg.user?.name ?? 'ゲスト',
        reg.user?.id ?? '',
        ticketName,
        (reg.ticketType?.price ?? '').toString(),
        reg.amount?.toString() ?? '',
        reg.paymentStatus,
        reg.status,
        reg.attended ? 'yes' : 'no',
        reg.noShow ? 'yes' : 'no',
        reg.createdAt.toISOString(),
      ];

      const answers = (reg.formAnswers ?? {}) as Record<string, any>;
      const dynamicValues = dynamicColumns.map((col) => {
        const raw = answers[col.key] ?? answers[col.label];
        if (raw === undefined || raw === null) return '';
        if (Array.isArray(raw)) return raw.join('; ');
        if (typeof raw === 'object') return JSON.stringify(raw);
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
          ...(event.config as Record<string, any>),
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
    let needsReview = false;
    for (const file of files) {
      const moderation = await this.moderationService.moderateImageFromBuffer(file.buffer, file.originalname);
      if (moderation.decision === 'reject') {
        throw new BadRequestException('アップロードした画像がガイドラインに違反しています。別の画像をお試しください。');
      }
      if (moderation.decision === 'needs_review') {
        needsReview = true;
      }
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
    if (needsReview) {
      await this.prisma.event.update({
        where: { id: eventId },
        data: {
          reviewStatus: 'pending_review',
          status: event.status === 'rejected' ? 'pending_review' : event.status ?? 'pending_review',
          reviewReason: '画像の確認が必要です。',
          config: this.mergeReviewConfig(event.config, {
            status: 'pending_review',
            reviewerId: 'system',
            reviewedAt: null,
            reason: '画像の確認が必要です。',
          }),
        },
      });
    }
    return created.map((item) => ({
      id: item.id,
      imageUrl: buildAssetUrl(item.imageUrl),
      order: item.order,
    }));
  }

  async removeEventCover(userId: string, eventId: string, coverId: string) {
    await this.permissions.assertEventManager(userId, eventId);
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
      imageUrl: buildAssetUrl(item.imageUrl),
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
    assign('status', payload.status ?? (isUpdate ? undefined : 'pending_review'));
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
