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
  const allowedOrigins = (process.env.FRONTEND_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

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
