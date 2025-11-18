import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api/v1');
  app.use('/api/v1/payments/stripe/webhook', bodyParser.raw({ type: 'application/json' }));
  const allowedOrigins = (process.env.FRONTEND_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads/' });

  const port = process.env.PORT || 3000;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);
  console.log(`MORE App backend is running on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/api/v1`);
}

bootstrap();
