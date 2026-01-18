/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-floating-promises, @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents */
import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { EventsService } from '../events/events.service';

@Controller('og')
export class OgController {
  constructor(private readonly eventsService: EventsService) {}

  private frontendBaseUrl() {
    const raw = (process.env.FRONTEND_BASE_URL || 'https://test.socialmore.jp').trim().replace(/\/$/, '');
    try {
      return new URL(raw).toString().replace(/\/$/, '');
    } catch {
      return 'https://test.socialmore.jp';
    }
  }

  private toAbsolute(url?: string | null) {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
    } catch {
      /* ignore */
    }
    const base = this.frontendBaseUrl();
    return `${base}/${url.replace(/^\/+/, '')}`;
  }

  private esc(attr?: unknown) {
    // Ensure we always escape a string value to avoid calling replace on null/objects
    const value = typeof attr === 'string' ? attr : String(attr ?? '');
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private pickLocalized(value: any, fallback: string) {
    if (!value) return fallback;
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
      return value.ja || value.zh || value.en || value.original || fallback;
    }
    return fallback;
  }

  private normalizeDesc(raw: string, fallback: string) {
    const text = raw || fallback;
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= 120) return normalized;
    return `${normalized.slice(0, 120).trim()}…`;
  }

  @Get('events/:id')
  async renderEventOg(@Param('id') id: string, @Query() query: Record<string, string>, @Res() res: Response) {
    const base = this.frontendBaseUrl();
    const queryStr = Object.keys(query || {}).length ? `?${new URLSearchParams(query as any).toString()}` : '';
    const shareUrl = `${base}/events/${id}${queryStr}`;

    const fallbackTitle = 'SOCIALMORE イベント';
    const fallbackDesc = 'SOCIALMOREで開催されるイベントです。詳細をチェックして参加しませんか？';
    const fallbackImage = 'https://raw.githubusercontent.com/moreard/dev-assets/main/socialmore/default-event-cover.png';

    let title = fallbackTitle;
    let desc = fallbackDesc;
    let image = fallbackImage;

    try {
      const event = await this.eventsService.getEventById(id);
      const rawTitle =
        typeof event.title === 'string'
          ? event.title
          : this.pickLocalized(event.title, this.pickLocalized((event as any).title, fallbackTitle));
      const safeTitle = (rawTitle || '').trim();
      title = safeTitle.toLowerCase() === 'test' || safeTitle === '' ? fallbackTitle : safeTitle;

      const rawDesc = this.pickLocalized(
        (event as any).shortDescription ?? (event as any).description ?? (event as any).summary,
        fallbackDesc,
      );
      desc = this.normalizeDesc(rawDesc, fallbackDesc);
      image =
        this.toAbsolute((event as any).coverImageUrl) ||
        this.toAbsolute((event as any).bannerUrl) ||
        this.toAbsolute((event as any).coverUrl) ||
        fallbackImage;
    } catch {
      // use fallback
    }

    const meta = {
      title: this.esc(title),
      desc: this.esc(desc),
      image: this.esc(image),
      url: this.esc(shareUrl),
    };

    const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta property="og:title" content="${meta.title}" />
  <meta property="og:description" content="${meta.desc}" />
  <meta property="og:image" content="${meta.image}" />
  <meta property="og:url" content="${meta.url}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${meta.title}" />
  <meta name="twitter:description" content="${meta.desc}" />
  <meta name="twitter:image" content="${meta.image}" />
</head>
<body></body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  }
}
