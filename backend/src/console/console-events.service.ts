import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { promises as fs } from 'fs';
import { extname, join } from 'path';
import type { Express } from 'express';

const EVENT_UPLOAD_ROOT = join(process.cwd(), 'uploads', 'events');

@Injectable()
export class ConsoleEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async listCommunityEvents(userId: string, communityId: string) {
    await this.ensureCommunityAdmin(userId, communityId);
    return this.prisma.event.findMany({
      where: { communityId },
      orderBy: { startTime: 'asc' },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        status: true,
        visibility: true,
      },
    });
  }

  async createEvent(userId: string, communityId: string, payload: any) {
    await this.ensureCommunityAdmin(userId, communityId);
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
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { ticketTypes: true, community: true, galleries: { orderBy: { order: 'asc' } } },
    });
    if (!event) throw new NotFoundException('Event not found');
    await this.ensureCommunityAdmin(userId, event.communityId, event.community.ownerId);
    return event;
  }

  async updateEvent(userId: string, eventId: string, data: any) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, include: { community: true } });
    if (!event) throw new NotFoundException('Event not found');
    await this.ensureCommunityAdmin(userId, event.communityId, event.community.ownerId);
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

  async listRegistrations(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, include: { community: true } });
    if (!event) throw new NotFoundException('Event not found');
    await this.ensureCommunityAdmin(userId, event.communityId, event.community.ownerId);

    return this.prisma.eventRegistration.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        createdAt: true,
        user: { select: { id: true, name: true, language: true } },
      },
    });
  }

  async closeEvent(eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { community: true },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    await this.ensureCommunityAdmin(userId, event.communityId, event.community.ownerId);

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

  private async ensureCommunityAdmin(userId: string, communityId: string, ownerId?: string) {
    if (!ownerId) {
      const community = await this.prisma.community.findUnique({ where: { id: communityId } });
      if (!community) throw new NotFoundException('Community not found');
      ownerId = community.ownerId;
    }

    if (ownerId === userId) {
      return;
    }

    const member = await this.prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
    });

    if (!member || (member.role !== 'admin' && member.role !== 'owner')) {
      throw new ForbiddenException('Not authorized');
    }
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

  async uploadEventCovers(userId: string, eventId: string, files: Express.Multer.File[]) {
    if (!files || !files.length) {
      return [];
    }
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, include: { community: true } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    await this.ensureCommunityAdmin(userId, event.communityId, event.community.ownerId);

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
      assign('regStartTime', payload.startTime ?? new Date());
    }

    assign('locationText', payload.locationText);

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
}
