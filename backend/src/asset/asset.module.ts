import { Module } from '@nestjs/common';
import { AssetController } from './asset.controller';
import { AssetService } from './asset.service';
import { StorageService } from './storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { IMAGE_QUEUE_NAME } from './image.queue';
import { ImageProcessingWorker } from './image-processing.worker';
import { Queue } from 'bullmq';

const bullDisabled =
  process.env.BULL_DISABLED === 'true' || (!process.env.REDIS_HOST && !process.env.REDIS_PORT);

@Module({
  imports: [
    ...(bullDisabled
      ? []
      : [
          BullModule.registerQueue({
            name: IMAGE_QUEUE_NAME,
          }),
        ]),
  ],
  controllers: [AssetController],
  providers: [
    AssetService,
    StorageService,
    PrismaService,
    ...(bullDisabled
        ? [
          {
            provide: getQueueToken(IMAGE_QUEUE_NAME),
            useValue: {
              add: async () => null as any, // no-op queue when Bull is disabled
            } as unknown as Pick<Queue, 'add'>,
          },
        ]
      : [ImageProcessingWorker]),
  ],
  exports: [AssetService],
})
export class AssetModule {}
