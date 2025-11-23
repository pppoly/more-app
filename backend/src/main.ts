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
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const globalPrefix = 'api/v1';
  app.setGlobalPrefix(globalPrefix);
  app.use('/api/v1/payments/stripe/webhook', bodyParser.raw({ type: 'application/json' }));
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

  const port = process.env.PORT || 3000;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);
  console.log(`MORE App backend is running on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/api/v1`);
}

bootstrap();
