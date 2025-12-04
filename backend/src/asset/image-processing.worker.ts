import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { StorageService } from './storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { IMAGE_QUEUE_NAME, PROCESS_IMAGE_JOB } from './image.queue';
import sharp from 'sharp';

@Processor(IMAGE_QUEUE_NAME)
export class ImageProcessingWorker extends WorkerHost {
  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  // BullMQ WorkerHost entrypoint
  async process(job: Job<{ assetId: string }>) {
    const { assetId } = job.data;
    const asset = await this.prisma.managedAsset.findUnique({ where: { id: assetId } });
    if (!asset) return;
    const originalBuffer = await this.storage.download(asset.bucket, asset.objectKey);
    const baseName = asset.objectKey.replace(/_orig\.[^.]+$/, '');
    const original = sharp(originalBuffer, { failOn: 'none' }).rotate();
    const originalJpeg = await original.jpeg({ quality: 90 }).toBuffer();
    const metadata = await sharp(originalJpeg).metadata();
    const width = metadata.width || null;
    const height = metadata.height || null;

    const sizes = [
      { key: 'sm', width: 400 },
      { key: 'md', width: 800 },
      { key: 'lg', width: 1600 },
    ];

    const variants: Record<string, string> = {};
    const originalKey = `${baseName}_orig.jpg`;
    variants.original = await this.storage.uploadBuffer({
      bucket: asset.bucket,
      objectKey: originalKey,
      buffer: originalJpeg,
      contentType: 'image/jpeg',
      makePublic: true,
    });

    for (const size of sizes) {
      const resized = await sharp(originalJpeg)
        .resize({ width: size.width, withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      const variantKey = `${baseName}_${size.key}.jpg`;
      const url = await this.storage.uploadBuffer({
        bucket: asset.bucket,
        objectKey: variantKey,
        buffer: resized,
        contentType: 'image/jpeg',
        makePublic: true,
      });
      variants[size.key] = url;
    }

    await this.prisma.managedAsset.update({
      where: { id: assetId },
      data: {
        variants,
        width,
        height,
        status: 'ready',
        moderationStatus: 'approved',
      },
    });
  }
}
