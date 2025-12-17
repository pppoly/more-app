import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { EventsService } from '../events/events.service';

@Controller('og')
export class OgController {
  constructor(private readonly eventsService: EventsService) {}

  private frontendBaseUrl() {
    const raw = (process.env.FRONTEND_BASE_URL || '').trim().replace(/\/$/, '');
    try {
      return new URL(raw || 'http://localhost:5173').toString().replace(/\/$/, '');
    } catch {
      return 'http://localhost:5173';
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
    return new URL(url.replace(/^\/+/, ''), `${base}/`).toString();
  }

  private formatDateTime(start: string, end?: string | null) {
    const s = new Date(start);
    const e = end ? new Date(end) : null;
    const startText = s.toLocaleString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    if (!e) return startText;
    const endText = e.toLocaleString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    return `${startText} – ${endText}`;
  }

  @Get('events/:id')
  async renderEventOg(@Param('id') id: string, @Res() res: Response) {
    const frontend = this.frontendBaseUrl();
    const shareUrl = `${frontend}/events/${id}?from=line_share`;
    try {
      const event = await this.eventsService.getEventById(id);
      const title =
        typeof event.title === 'string'
          ? event.title
          : (event.title as any)?.original || (event.title as any)?.ja || 'イベント';
      const timeText = this.formatDateTime(event.startTime, event.endTime);
      const location = (event.locationText || '').split(/、|,|・|\||\/|-/)[0]?.trim() || '場所未定';
      const description = `${timeText} ｜ ${location}`;
      const cover =
        this.toAbsolute((event as any).coverImageUrl) ||
        'https://raw.githubusercontent.com/moreard/dev-assets/main/socialmore/default-event-cover.png';

      const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${cover}" />
  <meta property="og:url" content="${shareUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${cover}" />
</head>
<body>
  <script>location.href='${shareUrl.replace(/'/g, "\\'")}';</script>
</body>
</html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(html);
    } catch (err) {
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"></head><body>Not found</body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(404).send(html);
    }
  }
}
