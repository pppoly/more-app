import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as bodyParser from 'body-parser';
import { UPLOAD_ROOT } from './common/storage/upload-root';

const normalizePathSegment = (segment: string) => segment.replace(/^\/+|\/+$/g, '');
const buildPrefixedPath = (...segments: string[]) => {
  const filtered = segments.map(normalizePathSegment).filter(Boolean);
  return `/${filtered.join('/')}/`;
};

async function bootstrap() {
  // Disable Nest built-in body parser to allow custom raw handler for Stripe webhook
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const globalPrefix = 'api/v1';
  // Register parsers manually: raw for Stripe webhook FIRST, then json/urlencoded for others.
  app.use('/api/v1/payments/stripe/webhook', bodyParser.raw({ type: 'application/json' }));
  app.use(bodyParser.json({ limit: '15mb' }));
  app.use(bodyParser.urlencoded({ limit: '15mb', extended: true }));
  app.setGlobalPrefix(globalPrefix);
  const defaultConfiguredOrigins = 'http://localhost:5173,http://127.0.0.1:5173';
  const configuredOrigins = (process.env.FRONTEND_ORIGINS ?? defaultConfiguredOrigins)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const defaultDevOrigins =
    process.env.NODE_ENV === 'production'
      ? []
      : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173'];
  const allowedOrigins = Array.from(new Set([...configuredOrigins, ...defaultDevOrigins]));

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  const uploadsPrefix = buildPrefixedPath(process.env.UPLOADS_HTTP_PREFIX || 'uploads');
  app.useStaticAssets(UPLOAD_ROOT, { prefix: uploadsPrefix });
  const apiUploadsPrefix = buildPrefixedPath(globalPrefix, process.env.UPLOADS_HTTP_PREFIX || 'uploads');
  app.useStaticAssets(UPLOAD_ROOT, { prefix: apiUploadsPrefix });

  // Desktop redirect to promo in test environment
  const envLabel = (process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
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
  console.log(`MORE App backend is running on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/api/v1`);
}

bootstrap();
