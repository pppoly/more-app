/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-floating-promises, @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents */
import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { EventsService } from '../events/events.service';
import { join } from 'path';
import sharp from 'sharp';
import { UPLOAD_ROOT } from '../common/storage/upload-root';

@Controller('og')
export class OgController {
  constructor(private readonly eventsService: EventsService) {}

  private static defaultEventCoverPng: Buffer | null = null;
  private static defaultEventCoverJpeg: Buffer | null = null;
  private static defaultAvatarPng: Buffer | null = null;

  private requestOrigin(req: Request): string {
    const forwardedProto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim();
    const forwardedHost = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim();
    const host = forwardedHost || req.headers.host;
    const proto = forwardedProto || 'https';
    if (!host) return this.frontendBaseUrl();
    return `${proto}://${host}`;
  }

  private buildQueryString(query: Record<string, unknown>): string {
    const params = new URLSearchParams();
    for (const [key, raw] of Object.entries(query || {})) {
      if (raw === null || raw === undefined) continue;
      if (Array.isArray(raw)) {
        const seen = new Set<string>();
        for (const item of raw) {
          if (item === null || item === undefined) continue;
          const value = String(item);
          if (seen.has(value)) continue;
          seen.add(value);
          params.append(key, value);
        }
        continue;
      }
      params.set(key, String(raw));
    }
    const s = params.toString();
    return s ? `?${s}` : '';
  }

  private defaultEventCoverUrl(req: Request): string {
    return `${this.requestOrigin(req)}/api/v1/og/assets/default-event-cover.png`;
  }

  private defaultAvatarUrl(req: Request): string {
    return `${this.requestOrigin(req)}/api/v1/og/assets/default-avatar.png`;
  }

  private async ensureDefaultEventCoverPng(): Promise<Buffer> {
    if (OgController.defaultEventCoverPng) return OgController.defaultEventCoverPng;
    const buffer = await sharp({
      create: {
        width: 1200,
        height: 630,
        channels: 4,
        background: { r: 246, g: 248, b: 251, alpha: 1 },
      },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    OgController.defaultEventCoverPng = buffer;
    return buffer;
  }

  private async ensureDefaultEventCoverJpeg(): Promise<Buffer> {
    if (OgController.defaultEventCoverJpeg) return OgController.defaultEventCoverJpeg;
    const buffer = await sharp({
      create: {
        width: 1200,
        height: 630,
        channels: 3,
        background: { r: 246, g: 248, b: 251 },
      },
    })
      .jpeg({ quality: 85 })
      .toBuffer();
    OgController.defaultEventCoverJpeg = buffer;
    return buffer;
  }

  private async ensureDefaultAvatarPng(): Promise<Buffer> {
    if (OgController.defaultAvatarPng) return OgController.defaultAvatarPng;
    const buffer = await sharp({
      create: {
        width: 256,
        height: 256,
        channels: 4,
        background: { r: 229, g: 231, b: 235, alpha: 1 },
      },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    OgController.defaultAvatarPng = buffer;
    return buffer;
  }

  @Get('assets/default-event-cover.png')
  async renderDefaultEventCover(@Req() req: Request, @Res() res: Response) {
    const png = await this.ensureDefaultEventCoverPng();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Length', String(png.length));
    return res.status(200).send(png);
  }

  @Get('assets/default-avatar.png')
  async renderDefaultAvatar(@Req() req: Request, @Res() res: Response) {
    const png = await this.ensureDefaultAvatarPng();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Length', String(png.length));
    return res.status(200).send(png);
  }

  private extractUploadKey(rawUrl?: string | null): string | null {
    if (!rawUrl) return null;
    const trimmed = rawUrl.trim();
    if (!trimmed) return null;
    let pathname = trimmed;
    try {
      pathname = new URL(trimmed).pathname;
    } catch {
      pathname = trimmed.split('?')[0]?.split('#')[0] || trimmed;
    }
    const marker = '/uploads/';
    const index = pathname.indexOf(marker);
    if (index >= 0) {
      const key = pathname.slice(index + marker.length).replace(/^\/+/, '');
      return key || null;
    }
    const cleaned = pathname.replace(/^\/+/, '');
    if (cleaned.startsWith('uploads/')) return cleaned.slice('uploads/'.length) || null;
    return null;
  }

  @Get('events/:id/image.jpg')
  async renderEventOgImage(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    let coverUrl: string | null = null;
    try {
      const event = await this.eventsService.getEventById(id);
      coverUrl =
        this.toAbsolute((event as any).coverImageUrl) ||
        this.toAbsolute((event as any).bannerUrl) ||
        this.toAbsolute((event as any).coverUrl) ||
        null;
    } catch {
      coverUrl = null;
    }

    const fallback = await this.ensureDefaultEventCoverJpeg();
    const uploadKey = this.extractUploadKey(coverUrl);
    const background = { r: 246, g: 248, b: 251 };

    if (uploadKey) {
      const diskPath = join(UPLOAD_ROOT, uploadKey);
      try {
        const jpeg = await sharp(diskPath, { failOn: 'none' })
          .rotate()
          .resize({ width: 1200, height: 630, fit: 'contain', background })
          .jpeg({ quality: 85 })
          .toBuffer();
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Content-Length', String(jpeg.length));
        return res.status(200).send(jpeg);
      } catch {
        // fall through to fallback
      }
    }

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Length', String(fallback.length));
    return res.status(200).send(fallback);
  }

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
  async renderEventOg(
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const queryStr = this.buildQueryString(query);
    const origin = this.requestOrigin(req);
    const sharePath = `/events/${id}${queryStr}`;
    const shareUrl = `${origin}${sharePath}`;
    const redirectUrl = `${origin}/?to=${encodeURIComponent(sharePath)}`;

    const fallbackTitle = 'SOCIALMORE イベント';
    const fallbackDesc = 'SOCIALMOREで開催されるイベントです。詳細をチェックして参加しませんか？';
    const fallbackImage = `${origin}/api/v1/og/events/${encodeURIComponent(id)}/image.jpg`;

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
      image = fallbackImage;
    } catch {
      // use fallback
    }

    const meta = {
      title: this.esc(title),
      desc: this.esc(desc),
      image: this.esc(image),
      url: this.esc(shareUrl),
      redirectUrl: this.esc(redirectUrl),
    };

    const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta property="og:title" content="${meta.title}" />
  <meta property="og:description" content="${meta.desc}" />
  <meta property="og:image" content="${meta.image}" />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${meta.title}" />
  <meta property="og:url" content="${meta.url}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="SOCIALMORE" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${meta.title}" />
  <meta name="twitter:description" content="${meta.desc}" />
  <meta name="twitter:image" content="${meta.image}" />
  <meta http-equiv="refresh" content="0;url=${meta.redirectUrl}" />
  <script>
    (function () {
      try {
        if (typeof window === 'undefined') return;
        window.location.replace("${meta.redirectUrl}");
      } catch {}
    })();
  </script>
</head>
<body>
  <a href="${meta.redirectUrl}">Continue</a>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  }
}
