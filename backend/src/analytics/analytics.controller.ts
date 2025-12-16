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
