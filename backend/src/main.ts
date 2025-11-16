import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api/v1');
  app.use('/api/v1/payments/stripe/webhook', bodyParser.raw({ type: 'application/json' }));
  app.enableCors({
    origin: 'http://localhost:5173',
    credentials: true,
  });
  app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads/' });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`MORE App backend is running on http://localhost:${port}/api/v1`);
}

bootstrap();
