import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { promises as fs } from 'fs';
import { extname, join } from 'path';
import type { Express } from 'express';
import { PermissionsService } from '../auth/permissions.service';
import { UPLOAD_ROOT } from '../common/storage/upload-root';

const EVENT_UPLOAD_ROOT = join(UPLOAD_ROOT, 'events');

@Injectable()
export class ConsoleEventsService {
  constructor(private readonly prisma: PrismaService, private readonly permissions: PermissionsService) {}

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
    return events.map((event) => ({
      id: event.id,
      title: event.title,
      startTime: event.startTime,
      endTime: event.endTime,
      status: event.status,
      visibility: event.visibility,
      coverImageUrl: event.galleries[0]?.imageUrl ?? null,
    }));
  }

  async createEvent(userId: string, communityId: string, payload: any) {
    await this.permissions.assertOrganizer(userId);
    await this.permissions.assertCommunityManager(userId, communityId);
    const { ticketTypes = [], ...rest } = payload;
    const eventData = this.prepareEventData(rest) as Prisma.EventCreateInput;
    return this.prisma.event.create({
      data: {
        ...eventData,
        community: { connect: { id: communityId } },
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
  }

  async getEvent(userId: string, eventId: string) {
    await this.permissions.assertEventManager(userId, eventId);
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { ticketTypes: true, community: true, galleries: { orderBy: { order: 'asc' } } },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  async updateEvent(userId: string, eventId: string, data: any) {
    await this.permissions.assertEventManager(userId, eventId);
    const { ticketTypes = [], ...rest } = data;
    const eventData = this.prepareEventData(rest, true) as Prisma.EventUpdateInput;
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

    return updated;
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

    const total = registrations.length;
    const paid = registrations.filter((reg) => reg.paymentStatus === 'paid').length;
    const attended = registrations.filter((reg) => reg.attended).length;
    const noShow = registrations.filter((reg) => reg.noShow).length;
    const capacity = fullEvent.maxParticipants ?? null;

    const groups = fullEvent.ticketTypes.map((ticket) => ({
      label: this.getLocalizedText(ticket.name),
      count: registrations.filter((reg) => reg.ticketTypeId === ticket.id).length,
      capacity: ticket.quota ?? capacity,
    }));

    const avatars = registrations.slice(0, 20).map((reg) => ({
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

    await fs.mkdir(EVENT_UPLOAD_ROOT, { recursive: true });
    const eventDir = join(EVENT_UPLOAD_ROOT, eventId);
    await fs.mkdir(eventDir, { recursive: true });

    const aggregate = await this.prisma.eventGallery.aggregate({
      where: { eventId },
      _max: { order: true },
    });
    let nextOrder = (aggregate._max.order ?? -1) + 1;

    const creations = [];
    for (const file of files) {
      const extension = extname(file.originalname) || '.jpg';
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`;
      const filePath = join(eventDir, filename);
      await fs.writeFile(filePath, file.buffer);
      const imageUrl = `/uploads/events/${eventId}/${filename}`;
      creations.push(
        this.prisma.eventGallery.create({
          data: {
            eventId,
            imageUrl,
            order: nextOrder,
            isCover: nextOrder === 0,
          },
        }),
      );
      nextOrder += 1;
    }

    const created = await this.prisma.$transaction(creations);
    return created.map((item) => ({ id: item.id, imageUrl: item.imageUrl, order: item.order }));
  }

  async removeEventCover(userId: string, eventId: string, coverId: string) {
    await this.permissions.assertEventManager(userId, eventId);
    const target = await this.prisma.eventGallery.findUnique({ where: { id: coverId } });
    if (!target || target.eventId !== eventId) {
      throw new NotFoundException('封面不存在');
    }
    await this.prisma.eventGallery.delete({ where: { id: coverId } });

    if (target.imageUrl) {
      const filename = target.imageUrl.split('/').pop();
      if (filename) {
        const filePath = join(EVENT_UPLOAD_ROOT, eventId, filename);
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
      imageUrl: item.imageUrl,
      order: index,
    }));
  }

  private prepareEventData(payload: any, isUpdate = false): Prisma.EventCreateInput | Prisma.EventUpdateInput {
    const data: Record<string, any> = {};
    const assign = (key: string, value: any) => {
      if (value !== undefined) {
        data[key] = value;
      }
    };

    assign('title', payload.title);
    assign('description', payload.description);
    assign('descriptionHtml', payload.descriptionHtml ?? null);
    assign('originalLanguage', payload.originalLanguage ?? (isUpdate ? undefined : 'ja'));
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
