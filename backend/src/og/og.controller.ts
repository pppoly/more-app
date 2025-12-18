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

  private esc(attr: string) {
    return attr
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  @Get('events/:id')
  async renderEventOg(@Param('id') id: string, @Query() query: Record<string, string>, @Res() res: Response) {
    const base = this.frontendBaseUrl();
    const queryStr = Object.keys(query || {}).length ? `?${new URLSearchParams(query as any).toString()}` : '';
    const shareUrl = `${base}/events/${id}${queryStr}`;

    const fallbackTitle = 'SOCIALMORE イベント';
    const fallbackDesc = 'イベントの詳細をチェックして参加しよう。';
    const fallbackImage = 'https://raw.githubusercontent.com/moreard/dev-assets/main/socialmore/default-event-cover.png';

    let title = fallbackTitle;
    let desc = fallbackDesc;
    let image = fallbackImage;

    try {
      const event = await this.eventsService.getEventById(id);
      const t =
        typeof event.title === 'string'
          ? event.title
          : (event.title as any)?.ja || (event.title as any)?.original || fallbackTitle;
      title = t || fallbackTitle;
      desc =
        (event as any).description ||
        (event as any).shortDescription ||
        (event as any).summary ||
        fallbackDesc;
      image =
        this.toAbsolute((event as any).coverImageUrl) ||
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
