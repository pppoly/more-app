import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildAssetUrl, toAssetKey } from '../common/storage/asset-path';

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
        status: 'open',
        reviewStatus: 'approved',
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
        locationLat: true,
        locationLng: true,
        title: true,
        description: true,
        descriptionHtml: true,
        category: true,
        maxParticipants: true,
        config: true,
        community: {
          select: {
            id: true,
            name: true,
            slug: true,
            coverImageUrl: true,
            description: true,
          },
        },
        ticketTypes: {
          select: {
            price: true,
          },
        },
        registrations: {
          where: {
            status: {
              in: ['paid', 'approved'],
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 6,
          select: {
            user: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
              },
            },
          },
        },
        _count: {
          select: {
            registrations: true,
          },
        },
        galleries: {
          orderBy: { order: 'asc' },
          take: 1,
          select: { imageUrl: true },
        },
      },
    });

    const DEFAULT_AVATAR =
      'https://raw.githubusercontent.com/moreard/dev-assets/main/socialmore/default-avatar.png';

    return events.map((event) => {
      const prices = event.ticketTypes.map((tt) => tt.price ?? 0);
      const min = prices.length ? Math.min(...prices) : 0;
      const max = prices.length ? Math.max(...prices) : 0;
      const attendeeAvatars = event.registrations.map(
        (registration) => registration.user?.avatarUrl ?? DEFAULT_AVATAR,
      );
      const communityLogo = this.extractCommunityLogo(event.community?.description) ?? null;
      const currentParticipants = event._count?.registrations ?? 0;
      const capacityFromConfig =
        (event.config as any)?.capacity ?? (event.config as any)?.maxParticipants ?? event.maxParticipants ?? null;
      const coverImageUrl = buildAssetUrl(event.galleries[0]?.imageUrl);
      return {
        id: event.id,
        status: event.status,
        startTime: event.startTime,
        endTime: event.endTime,
        locationText: event.locationText,
        locationLat: event.locationLat,
        locationLng: event.locationLng,
        title: event.title,
        description: event.description,
        community: {
          id: event.community.id,
          name: event.community.name,
          slug: event.community.slug,
        },
        communityLogoUrl: communityLogo,
        priceRange: { min, max },
        coverImageUrl,
        config: {
          ...(event.config as Record<string, any>),
          attendeeAvatars,
          currentParticipants,
          capacity: capacityFromConfig,
        },
      };
    });
  }

  async getEventById(id: string) {
    const DEFAULT_AVATAR =
      'https://raw.githubusercontent.com/moreard/dev-assets/main/socialmore/default-avatar.png';
    const event = await this.prisma.event.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        visibility: true,
        startTime: true,
        endTime: true,
        regStartTime: true,
        regEndTime: true,
        regDeadline: true,
        locationText: true,
        locationLat: true,
        locationLng: true,
      title: true,
      description: true,
      descriptionHtml: true,
      registrationFormSchema: true,
      config: true,
      category: true,
      minParticipants: true,
      maxParticipants: true,
      registrations: {
        where: { status: { in: ['paid', 'approved'] } },
        orderBy: { createdAt: 'desc' },
        take: 24,
        select: {
          id: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
      },
      _count: {
        select: { registrations: { where: { status: { in: ['paid', 'approved'] } } } },
      },
      galleries: {
        orderBy: { order: 'asc' },
        take: 1,
        select: { imageUrl: true },
      },
      community: {
        select: {
          id: true,
          name: true,
          slug: true,
          coverImageUrl: true,
          description: true,
        },
      },
        ticketTypes: {
          select: {
            id: true,
            type: true,
            price: true,
            name: true,
            quota: true,
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (['pending_review', 'rejected'].includes(event.status) || ['pending_review', 'rejected'].includes((event as any).reviewStatus)) {
      throw new ForbiddenException('Event is not available');
    }

    const currentParticipants = event._count?.registrations ?? 0;
    const capacity = event.maxParticipants ?? null;
    const regProgress = capacity ? Math.min(100, Math.round((currentParticipants / capacity) * 100)) : 0;
    const attendeeAvatars = event.registrations
      .map((reg) => reg.user?.avatarUrl ?? DEFAULT_AVATAR)
      .filter((url): url is string => Boolean(url));
    const participants = event.registrations.map((reg) => ({
      id: reg.id,
      name: reg.user?.name ?? 'ゲスト',
      avatarUrl: reg.user?.avatarUrl ?? DEFAULT_AVATAR,
    }));

    const communityCoverUrl = buildAssetUrl(event.community?.coverImageUrl);
    const communityLogo = this.extractCommunityLogo(event.community?.description) ?? communityCoverUrl ?? null;

    const mergedConfig = {
      ...(event.config as Record<string, any>),
      communityLogoUrl: communityLogo ?? undefined,
      attendeeAvatars,
      participants,
      participantCount: participants.length,
      currentParticipants,
      regCount: currentParticipants,
      capacity,
      regProgress,
      regSummary:
        (event.config as any)?.regSummary ??
        `${currentParticipants}名が参加予定${capacity ? ` / 定員 ${capacity}名` : ''}`,
      showRegistrationStatus: true,
    };

    const { registrations, _count, galleries, ...rest } = event;
    return {
      ...rest,
      coverImageUrl: buildAssetUrl(galleries?.[0]?.imageUrl),
      config: mergedConfig,
    };
  }

  async createRegistration(eventId: string, userId: string, dto: CreateRegistrationDto) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { ticketTypes: true, community: true },
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
    // 注册截止时间暂时不阻止用户报名，保持开放体验

    await this.ensureActiveMembership(event.communityId, userId);

    const existing = await this.prisma.eventRegistration.findFirst({
      where: {
        eventId,
        userId,
        NOT: { status: 'cancelled' },
      },
      include: {
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

    if (existing) {
      return {
        registrationId: existing.id,
        status: existing.status,
        paymentStatus: existing.paymentStatus ?? 'paid',
        paymentRequired: existing.paymentStatus !== 'paid',
        amount: existing.amount ?? 0,
        eventId: existing.eventId,
        ticketTypeId: existing.ticketTypeId ?? undefined,
        event: existing.event,
      };
    }

    let eventTicketTypes = event.ticketTypes;
    if (!eventTicketTypes.length) {
      const fallbackName = this.getLocalizedText(event.title) || '参加チケット';
      const fallbackTicket = await this.prisma.eventTicketType.create({
        data: {
          eventId,
          name: { original: fallbackName },
          type: 'free',
          price: 0,
          quota: event.maxParticipants ?? 100,
        },
      });
      eventTicketTypes = [fallbackTicket];
    }

    let ticketType =
      dto.ticketTypeId &&
      eventTicketTypes.find((ticket) => ticket.id === dto.ticketTypeId);

    if (!ticketType) {
      ticketType =
        eventTicketTypes.find((ticket) => ticket.type === 'free') ||
        eventTicketTypes[0];
    }

    if (!ticketType) {
      throw new BadRequestException('No ticket types available for this event');
    }

    const isFree = ticketType.type === 'free' || (ticketType.price ?? 0) === 0;
    const requireApproval = Boolean(event.requireApproval);
    const initialStatus = requireApproval
      ? 'pending'
      : isFree
        ? 'paid'
        : 'approved';
    const initialPaymentStatus = requireApproval ? 'unpaid' : isFree ? 'paid' : 'unpaid';

    const registration = await this.prisma.eventRegistration.create({
      data: {
        eventId,
        userId,
        ticketTypeId: ticketType.id,
        status: initialStatus,
        formAnswers: dto.formAnswers ?? Prisma.JsonNull,
        amount: ticketType.price ?? 0,
        paidAmount: initialPaymentStatus === 'paid' ? ticketType.price ?? 0 : 0,
        paymentStatus: initialPaymentStatus,
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
      eventId: registration.event?.id ?? eventId,
      ticketTypeId: registration.ticketTypeId,
      event: registration.event ?? {
        id: eventId,
        title: event.title,
        startTime: event.startTime,
        endTime: event.endTime,
        locationText: event.locationText,
        community: {
          id: event.communityId,
          name: this.getLocalizedText(event.title) || '',
          slug: '',
        },
      },
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
    const gallery = await this.prisma.eventGallery.findMany({
      where: { eventId },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        imageUrl: true,
        order: true,
      },
    });
    return gallery
      .map((item) => {
        const normalized = buildAssetUrl(item.imageUrl);
        return normalized
          ? {
              ...item,
              imageUrl: normalized,
            }
          : null;
      })
      .filter((item): item is { id: string; imageUrl: string; order: number } => Boolean(item));
  }
  private getLocalizedText(content: Prisma.JsonValue | string | null | undefined) {
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

  private extractCommunityLogo(description: Prisma.JsonValue | null | undefined) {
    if (!description || typeof description !== 'object') return null;
    const record = description as Record<string, any>;
    if (record.logoImageUrl && typeof record.logoImageUrl === 'string') {
      return buildAssetUrl(record.logoImageUrl);
    }
    if (typeof record.original === 'object' && record.original?.logoImageUrl) {
      return buildAssetUrl(record.original.logoImageUrl);
    }
    return null;
  }
}
