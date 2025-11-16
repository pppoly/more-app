import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { HelloController } from './hello/hello.controller';

@Module({
  imports: [],
  controllers: [HealthController, HelloController],
  providers: [],
})
export class AppModule {}
