/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-floating-promises, @typescript-eslint/unbound-method */
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { buildAssetUrl, toAssetKey } from '../common/storage/asset-path';
import { normalizeImageUrl } from '../common/utils/normalize-image-url';

interface CreateRegistrationDto {
  ticketTypeId?: string;
  formAnswers?: Prisma.JsonValue;
}

type PrismaClientOrTx = PrismaService | Prisma.TransactionClient;

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  async listPublicOpenEvents() {
    const frontendBaseUrl = process.env.FRONTEND_BASE_URL;
    const successRegistrationWhere = this.successfulRegistrationWhere();
    const now = new Date();
    const events = await this.prisma.event.findMany({
      where: {
        visibility: 'public',
        status: 'open',
        reviewStatus: 'approved',
        endTime: { gte: now },
      },
      orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
      select: this.publicEventSelect(successRegistrationWhere),
    });

    return this.mapPublicEvents(events, frontendBaseUrl);
  }

  async listPublicOpenEventsPage(params: { limit?: number; cursor?: string }) {
    const frontendBaseUrl = process.env.FRONTEND_BASE_URL;
    const successRegistrationWhere = this.successfulRegistrationWhere();
    const limit = this.normalizeEventListLimit(params.limit);
    const now = new Date();
    const where: Prisma.EventWhereInput = {
      visibility: 'public',
      status: 'open',
      reviewStatus: 'approved',
      endTime: { gte: now },
    };

    let cursor: { id: string } | undefined;
    if (params.cursor) {
      const cursorEvent = await this.prisma.event.findFirst({
        where: { id: params.cursor, ...where },
        select: { id: true },
      });
      if (cursorEvent) {
        cursor = { id: cursorEvent.id };
      }
    }

    const events = await this.prisma.event.findMany({
      where,
      orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor, skip: 1 } : {}),
      select: this.publicEventSelect(successRegistrationWhere),
    });

    const sliced = events.slice(0, limit);
    const nextCursor = events.length > limit ? sliced[sliced.length - 1]?.id ?? null : null;

    return {
      items: this.mapPublicEvents(sliced, frontendBaseUrl),
      nextCursor,
    };
  }

  private normalizeEventListLimit(raw?: number) {
    if (!Number.isFinite(raw)) return 20;
    return Math.min(Math.max(Math.floor(raw ?? 20), 1), 50);
  }

  private publicEventSelect(
    successRegistrationWhere: Prisma.EventRegistrationWhereInput,
  ): Prisma.EventSelect {
    return {
      id: true,
      status: true,
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
        where: successRegistrationWhere,
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
          registrations: { where: successRegistrationWhere },
        },
      },
      galleries: {
        orderBy: { order: 'asc' },
        take: 1,
        select: { imageUrl: true },
      },
    };
  }

  private mapPublicEvents(events: any[], frontendBaseUrl?: string) {
    const DEFAULT_AVATAR =
      normalizeImageUrl('/api/v1/og/assets/default-avatar.png', frontendBaseUrl) ||
      '/api/v1/og/assets/default-avatar.png';

    return events.map((event) => {
      const prices = event.ticketTypes.map((tt: { price?: number | null }) => tt.price ?? 0);
      const min = prices.length ? Math.min(...prices) : 0;
      const max = prices.length ? Math.max(...prices) : 0;
      const attendeeAvatars = event.registrations.map(
        (registration: any) =>
          normalizeImageUrl(registration.user?.avatarUrl, frontendBaseUrl) ?? DEFAULT_AVATAR,
      );
      const communityLogo = normalizeImageUrl(
        this.extractCommunityLogo(event.community?.description),
        frontendBaseUrl,
      );
      const currentParticipants = event._count?.registrations ?? 0;
      const capacityFromConfig =
        (event.config as any)?.capacity ?? (event.config as any)?.maxParticipants ?? event.maxParticipants ?? null;
      const coverImageUrl = normalizeImageUrl(buildAssetUrl(event.galleries[0]?.imageUrl), frontendBaseUrl);
      return {
        id: event.id,
        status: event.status,
        startTime: event.startTime,
        endTime: event.endTime,
        regStartTime: event.regStartTime,
        regEndTime: event.regEndTime,
        regDeadline: event.regDeadline,
        locationText: event.locationText,
        locationLat: event.locationLat,
        locationLng: event.locationLng,
        title: event.title,
        description: event.description,
        category: event.category,
        community: {
          id: event.community.id,
          name: event.community.name,
          slug: event.community.slug,
        },
        communityLogoUrl: communityLogo ?? null,
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
    const frontendBaseUrl = process.env.FRONTEND_BASE_URL;
    const DEFAULT_AVATAR =
      normalizeImageUrl('/api/v1/og/assets/default-avatar.png', frontendBaseUrl) || '/api/v1/og/assets/default-avatar.png';
    const successRegistrationWhere = this.successfulRegistrationWhere();
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
        requireApproval: true,
        registrations: {
        where: successRegistrationWhere,
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
        select: { registrations: { where: successRegistrationWhere } },
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
      .map((reg) => normalizeImageUrl(reg.user?.avatarUrl, frontendBaseUrl) ?? DEFAULT_AVATAR)
      .filter((url): url is string => Boolean(url));
    const participants = event.registrations.map((reg) => ({
      id: reg.id,
      name: reg.user?.name ?? 'ゲスト',
      avatarUrl: normalizeImageUrl(reg.user?.avatarUrl, frontendBaseUrl) ?? DEFAULT_AVATAR,
    }));

    const communityCoverUrl = normalizeImageUrl(buildAssetUrl(event.community?.coverImageUrl), frontendBaseUrl);
    const communityLogo =
      normalizeImageUrl(this.extractCommunityLogo(event.community?.description), frontendBaseUrl) ??
      communityCoverUrl ??
      null;

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
      coverImageUrl: normalizeImageUrl(buildAssetUrl(galleries?.[0]?.imageUrl), frontendBaseUrl),
      config: mergedConfig,
    };
  }

  async getFollowStatus(eventId: string, userId: string) {
    await this.assertEventExists(eventId);
    const follow = await this.prisma.eventFollow.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    return { following: Boolean(follow) };
  }

  async followEvent(eventId: string, userId: string) {
    await this.assertEventExists(eventId);
    await this.prisma.eventFollow.upsert({
      where: { eventId_userId: { eventId, userId } },
      update: {},
      create: { eventId, userId },
    });
    return { following: true };
  }

  async unfollowEvent(eventId: string, userId: string) {
    const follow = await this.prisma.eventFollow.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (!follow) return { following: false };
    await this.prisma.eventFollow.delete({
      where: { eventId_userId: { eventId, userId } },
    });
    return { following: false };
  }

  async createRegistration(eventId: string, userId: string, dto: CreateRegistrationDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      const event = await tx.event.findUnique({
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

      const requireApproval = Boolean(event.requireApproval);

      const existing = await tx.eventRegistration.findFirst({
        where: {
          userId,
          eventId,
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

      if (existing && !['cancelled', 'rejected', 'refunded'].includes(existing.status)) {
        await this.ensureActiveMembership(event.communityId, userId, tx);
        return {
          registrationId: existing.id,
          status: existing.status,
          paymentStatus: existing.paymentStatus,
          paymentRequired:
            (existing.amount ?? 0) > 0 &&
            existing.paymentStatus !== 'paid' &&
            (!requireApproval || existing.status === 'approved'),
          amount: existing.amount ?? 0,
          eventId: existing.event?.id ?? eventId,
          ticketTypeId: existing.ticketTypeId ?? dto.ticketTypeId,
          event: existing.event ?? {
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

      const notifyCreated = !existing || ['cancelled', 'rejected', 'refunded'].includes(existing.status);

      const now = new Date();
      if (event.regStartTime && now < event.regStartTime) {
        throw new BadRequestException('Registration has not started');
      }
      const regEndTime = event.regEndTime ?? event.regDeadline ?? null;
      if (regEndTime && now > regEndTime) {
        throw new BadRequestException('Registration is closed');
      }

      await this.ensureActiveMembership(event.communityId, userId, tx);

      let eventTicketTypes = event.ticketTypes;
      if (!eventTicketTypes.length) {
        const fallbackName = this.getLocalizedText(event.title) || '参加チケット';
        const fallbackTicket = await tx.eventTicketType.create({
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
      await this.assertRegistrationCapacity(tx, event, ticketType, isFree);
      const initialStatus = requireApproval
        ? 'pending'
        : isFree
          ? 'paid'
          : 'pending_payment';
      const initialPaymentStatus = requireApproval ? 'unpaid' : isFree ? 'paid' : 'unpaid';

      const baseData = {
        eventId,
        userId,
        ticketTypeId: ticketType.id,
        status: initialStatus,
        formAnswers: dto.formAnswers ?? Prisma.JsonNull,
        amount: ticketType.price ?? 0,
        paidAmount: initialPaymentStatus === 'paid' ? ticketType.price ?? 0 : 0,
        paymentStatus: initialPaymentStatus,
        attended: false,
        noShow: false,
      };

      const registration = existing
        ? await tx.eventRegistration.update({
            where: { id: existing.id },
            data: baseData,
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
          })
        : await tx.eventRegistration.create({
            data: baseData,
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
        paymentRequired:
          (registration.amount ?? 0) > 0 &&
          registration.paymentStatus !== 'paid' &&
          (!requireApproval || registration.status === 'approved'),
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
        notifyCreated,
      };
    });

    const { notifyCreated, ...response } = result as typeof result & { notifyCreated?: boolean };
    if (notifyCreated) {
      void this.notifications.notifyRegistrationCreated(response.registrationId).catch((error) => {
        this.logger.warn(`Failed to send registration created notification: ${error instanceof Error ? error.message : String(error)}`);
      });
      if (response.status === 'pending') {
        void this.notifications.notifyOrganizerRegistrationPending(response.registrationId).catch((error) => {
          this.logger.warn(`Failed to send organizer pending notification: ${error instanceof Error ? error.message : String(error)}`);
        });
      }
    }

    if (response.status === 'paid' && (response.paymentStatus === 'paid' || response.amount === 0)) {
      void this.notifications.notifyRegistrationSuccess(response.registrationId).catch((error) => {
        // best-effort; do not block registration
        this.logger.warn(`Failed to send registration notification: ${error instanceof Error ? error.message : String(error)}`);
      });
    }

    return response;
  }

  private successfulRegistrationWhere(): Prisma.EventRegistrationWhereInput {
    return {
      status: { in: ['paid', 'approved'] },
      OR: [{ paymentStatus: 'paid' }, { amount: 0 }],
    };
  }

  private async assertRegistrationCapacity(
    db: PrismaClientOrTx,
    event: { id: string; maxParticipants?: number | null },
    ticketType: { id: string; quota?: number | null },
    isFree: boolean,
  ) {
    const reservedStatuses = isFree ? ['paid', 'approved'] : ['paid', 'pending_payment', 'approved'];
    if (event.maxParticipants !== null && event.maxParticipants !== undefined) {
      const reservedTotal = await db.eventRegistration.count({
        where: { eventId: event.id, status: { in: reservedStatuses } },
      });
      if (reservedTotal >= event.maxParticipants) {
        throw new BadRequestException('Event is full');
      }
    }
    if (ticketType.quota !== null && ticketType.quota !== undefined) {
      const reservedByTicket = await db.eventRegistration.count({
        where: { eventId: event.id, ticketTypeId: ticketType.id, status: { in: reservedStatuses } },
      });
      if (reservedByTicket >= ticketType.quota) {
        throw new BadRequestException('Ticket quota reached');
      }
    }
  }

  private async ensureActiveMembership(communityId: string, userId: string, db: PrismaClientOrTx = this.prisma) {
    const member = await db.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
    });

    if (member && member.status === 'blocked') {
      throw new ForbiddenException('You are blocked from this community');
    }

    if (!member) {
      await db.communityMember.create({
        data: {
          communityId,
          userId,
          role: 'member',
          status: 'active',
        },
      });
    }
  }

  private async assertEventExists(eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }

  async getEventGallery(eventId: string) {
    const frontendBaseUrl = process.env.FRONTEND_BASE_URL;
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
        const normalized = normalizeImageUrl(buildAssetUrl(item.imageUrl), frontendBaseUrl);
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
