import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface CreateRegistrationDto {
  ticketTypeId?: string;
  formAnswers?: Prisma.JsonValue;
}

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublicOpenEvents() {
    const events = await this.prisma.event.findMany({
      where: {
        visibility: 'public',
      },
      orderBy: {
        startTime: 'asc',
      },
      select: {
        id: true,
        status: true,
        startTime: true,
        endTime: true,
        locationText: true,
        title: true,
        description: true,
        descriptionHtml: true,
        category: true,
        community: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        ticketTypes: {
          select: {
            price: true,
          },
        },
      },
    });

    return events.map((event) => {
      const prices = event.ticketTypes.map((tt) => tt.price ?? 0);
      const min = prices.length ? Math.min(...prices) : 0;
      const max = prices.length ? Math.max(...prices) : 0;
      return {
        id: event.id,
        status: event.status,
        startTime: event.startTime,
        endTime: event.endTime,
        locationText: event.locationText,
        title: event.title,
        description: event.description,
        community: event.community,
        priceRange: { min, max },
      };
    });
  }

  async getEventById(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        startTime: true,
        endTime: true,
        regStartTime: true,
        regEndTime: true,
        regDeadline: true,
        locationText: true,
        title: true,
        description: true,
        descriptionHtml: true,
        registrationFormSchema: true,
        config: true,
        category: true,
        minParticipants: true,
        maxParticipants: true,
        community: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return event;
  }

  async createRegistration(eventId: string, userId: string, dto: CreateRegistrationDto) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { ticketTypes: true },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.status !== 'open') {
      throw new BadRequestException('Event is not open for registration');
    }

    if (event.visibility !== 'public' && event.visibility !== 'community-only') {
      throw new BadRequestException('Event is not available for registration');
    }

    const now = new Date();
    if (event.regStartTime && now < event.regStartTime) {
      throw new BadRequestException('Registration has not started yet');
    }
    const regClose = event.regEndTime ?? event.regDeadline;
    if (regClose && regClose < now) {
      throw new BadRequestException('Registration deadline has passed');
    }

    await this.ensureActiveMembership(event.communityId, userId);

    const existing = await this.prisma.eventRegistration.findFirst({
      where: {
        eventId,
        userId,
        NOT: { status: 'cancelled' },
      },
    });

    if (existing) {
      throw new BadRequestException('You have already registered for this event');
    }

    let ticketType =
      dto.ticketTypeId &&
      event.ticketTypes.find((ticket) => ticket.id === dto.ticketTypeId);

    if (!ticketType) {
      ticketType =
        event.ticketTypes.find((ticket) => ticket.type === 'free') ||
        event.ticketTypes[0];
    }

    if (!ticketType) {
      throw new BadRequestException('No ticket types available for this event');
    }

    const isFree = ticketType.type === 'free' || (ticketType.price ?? 0) === 0;
    const registration = await this.prisma.eventRegistration.create({
      data: {
        eventId,
        userId,
        ticketTypeId: ticketType.id,
        status: isFree ? 'paid' : 'approved',
        formAnswers: dto.formAnswers ?? Prisma.JsonNull,
        amount: ticketType.price ?? 0,
        paidAmount: isFree ? ticketType.price ?? 0 : 0,
        paymentStatus: isFree ? 'paid' : 'unpaid',
      },
      select: {
        id: true,
        status: true,
        ticketTypeId: true,
        amount: true,
        paymentStatus: true,
        event: {
          select: {
            id: true,
            title: true,
            startTime: true,
            endTime: true,
            locationText: true,
            community: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    return {
      registrationId: registration.id,
      status: registration.status,
      paymentStatus: registration.paymentStatus,
      paymentRequired: !isFree,
      amount: registration.amount,
      eventId: registration.event.id,
      ticketTypeId: registration.ticketTypeId,
      event: registration.event,
    };
  }

  private async ensureActiveMembership(communityId: string, userId: string) {
    const member = await this.prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
    });

    if (member && member.status === 'blocked') {
      throw new ForbiddenException('You are blocked from this community');
    }

    if (!member) {
      await this.prisma.communityMember.create({
        data: {
          communityId,
          userId,
          role: 'member',
          status: 'active',
        },
      });
    }
  }

  async getEventGallery(eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return this.prisma.eventGallery.findMany({
      where: { eventId },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        imageUrl: true,
        order: true,
      },
    });
  }
}
