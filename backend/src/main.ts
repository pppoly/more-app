import ogRouter from "./og.routes";
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-floating-promises, @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger, ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import { UPLOAD_ROOT } from './common/storage/upload-root';
import type { IncomingMessage } from 'http';

const normalizePathSegment = (segment: string) => segment.replace(/^\/+|\/+$/g, '');

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  // Disable Nest built-in body parser to allow custom raw handler for Stripe webhook
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
app.use('/api/v1/og', ogRouter);
  const globalPrefix = 'api/v1';
  const envLabel = (process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
  const isDevLike = !envLabel || envLabel === 'development' || envLabel === 'dev' || envLabel === 'local';
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  // Register parsers manually: raw for Stripe webhook FIRST, then json/urlencoded for others.
  const stripeWebhookPath = '/api/v1/payments/stripe/webhook';
  const stripeWebhookDebug = process.env.STRIPE_WEBHOOK_DEBUG === '1';
  const isStripeWebhook = (req: express.Request) => {
    const path = (req.originalUrl || '').split('?')[0] || req.path;
    return path === stripeWebhookPath;
  };
  const stripeRawType = (req: IncomingMessage) => {
    const header = req.headers['content-type'];
    const contentType = Array.isArray(header) ? header.join(';') : header || '';
    return /^application\/json\b/i.test(contentType) || /\+json\b/i.test(contentType);
  };
  const stripeRawBodyParser = express.raw({ type: stripeRawType });
  app.use(stripeWebhookPath, (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.method !== 'POST') return next();
    return stripeRawBodyParser(req, res, next);
  });
  app.use(stripeWebhookPath, (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    if (req.method !== 'POST') return next();
    if (stripeWebhookDebug) {
      const body = req.body as unknown;
      const isBuffer = Buffer.isBuffer(body);
      const length = isBuffer ? body.length : body ? Buffer.byteLength(String(body)) : 0;
      const contentType = req.headers['content-type'] ?? '';
      console.log(
        `[stripe webhook debug] method=${req.method} content-type=${contentType} bodyType=${typeof body} isBuffer=${isBuffer} length=${length}`,
      );
    }
    return next();
  });
  const jsonParser = bodyParser.json({ limit: '15mb' });
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (isStripeWebhook(req)) return next();
    return jsonParser(req, res, next);
  });
  const urlencodedParser = bodyParser.urlencoded({ limit: '15mb', extended: true });
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (isStripeWebhook(req)) return next();
    return urlencodedParser(req, res, next);
  });
  app.setGlobalPrefix(globalPrefix);
  const defaultConfiguredOrigins = isDevLike ? 'http://localhost:5173,http://127.0.0.1:5173' : '';
  const configuredOrigins = (process.env.FRONTEND_ORIGINS ?? defaultConfiguredOrigins)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (!configuredOrigins.length && !isDevLike) {
    try {
      const raw = (process.env.FRONTEND_BASE_URL || '').trim();
      if (raw) {
        const url = new URL(raw);
        configuredOrigins.push(url.origin);
      }
    } catch {
      // ignore invalid FRONTEND_BASE_URL; require explicit FRONTEND_ORIGINS for deployed envs
    }
  }

  const defaultDevOrigins = isDevLike
    ? ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']
    : [];
  const allowedOrigins = Array.from(new Set([...configuredOrigins, ...defaultDevOrigins]));

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  const uploadsPrefix = `/${normalizePathSegment(process.env.UPLOADS_HTTP_PREFIX || 'uploads')}`;
  app.use(uploadsPrefix, express.static(UPLOAD_ROOT));
  const apiUploadsPrefix = `/${normalizePathSegment(globalPrefix)}/${normalizePathSegment(
    process.env.UPLOADS_HTTP_PREFIX || 'uploads',
  )}`;
  app.use(apiUploadsPrefix, express.static(UPLOAD_ROOT));

  // Desktop redirect to promo in test environment
  const enableDesktopPromoEnv =
    process.env.DESKTOP_PROMO === '1' || envLabel === 'test' || envLabel === 'testing' || envLabel === 'staging';
  app.use((req: any, res: any, next: any) => {
    if (req.method !== 'GET') return next();
    const accept = (req.headers.accept as string | undefined) || '';
    if (!accept.includes('text/html')) return next();

    const host = (req.headers.host as string | undefined)?.toLowerCase() || '';
    const shouldPromo = enableDesktopPromoEnv || host.includes('test.');
    if (!shouldPromo) return next();

    const path = req.path || req.originalUrl || '';
    const allowPrefixes = [
      '/api/',
      '/assets/',
      '/uploads/',
      '/favicon',
      '/manifest',
      '/auth/',
      '/liff',
      '/callback',
      '/oauth',
      '/promo',
      '/health',
      '/metrics',
    ];
    if (
      allowPrefixes.some((p) => path.startsWith(p)) ||
      path.endsWith('.js') ||
      path.endsWith('.css') ||
      path.endsWith('.map')
    ) {
      return next();
    }

    const ua = (req.headers['user-agent'] as string | undefined) || '';
    const isMobile = /Mobile|Android|iPhone|iPod|iPad/i.test(ua);
    if (!ua) return next(); // no UA, allow
    if (isMobile) return next();

    if (path.startsWith('/promo')) return next();
    const original = req.originalUrl || req.url || path;
    const from = encodeURIComponent(original);
    return res.redirect(302, `/promo?from=${from}`);
  });

  const port = process.env.PORT || 3000;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);
  logger.log(`MORE App backend is running on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/api/v1`);
}

bootstrap();
