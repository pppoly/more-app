import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AnalyticsEventInput {
  eventName: string;
  timestamp?: string | Date;
  sessionId: string;
  userId?: string | null;
  path?: string | null;
  isLiff?: boolean;
  userAgent?: string | null;
  payload?: Record<string, any> | null;
}

@Injectable()
export class AnalyticsService {
  private readonly MAX_BATCH = 50;

  constructor(private readonly prisma: PrismaService) {}

  async recordEvents(events: AnalyticsEventInput[]) {
    if (!Array.isArray(events) || !events.length) {
      throw new BadRequestException('events are required');
    }
    const sliced = events.slice(0, this.MAX_BATCH);
    const data = sliced.map((evt) => ({
      eventName: evt.eventName?.trim(),
      timestamp: evt.timestamp ? new Date(evt.timestamp) : new Date(),
      sessionId: evt.sessionId?.trim() || 'unknown',
      userId: evt.userId || null,
      path: evt.path || null,
      isLiff: !!evt.isLiff,
      userAgent: evt.userAgent || null,
      payload: evt.payload ?? undefined,
    }));
    data.forEach((d) => {
      if (!d.eventName) {
        throw new BadRequestException('eventName is required');
      }
      if (!d.sessionId) {
        throw new BadRequestException('sessionId is required');
      }
    });
    await this.prisma.analyticsEvent.createMany({ data });
    return { success: true, stored: data.length };
  }
}
