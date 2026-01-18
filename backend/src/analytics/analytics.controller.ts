/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars */
import { Body, Controller, Post, Req } from '@nestjs/common';
import { AnalyticsService, AnalyticsEventInput } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('events')
  async recordEvents(@Body() body: { events?: AnalyticsEventInput[] } | AnalyticsEventInput[], @Req() req: any) {
    const events = Array.isArray(body) ? body : body?.events;
    const userAgent = req?.headers?.['user-agent'] as string | undefined;
    const enriched = (events || []).map((evt) => ({
      ...evt,
      userAgent: evt.userAgent ?? userAgent ?? null,
    }));
    return this.analyticsService.recordEvents(enriched);
  }
}
