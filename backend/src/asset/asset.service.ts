/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars */
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { BindAssetDto } from './dto/bind-asset.dto';
import { StorageService } from './storage.service';
import { randomUUID } from 'crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { IMAGE_QUEUE_NAME, PROCESS_IMAGE_JOB } from './image.queue';
import type { Express } from 'express';

const ALLOWED_RESOURCE_TYPES = ['community', 'event', 'class', 'user-avatar', 'event-gallery', 'banner'];
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

@Injectable()
export class AssetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue(IMAGE_QUEUE_NAME) private readonly imageQueue: Queue,
  ) {}

  async presign(dto: PresignUploadDto, ctx: { userId: string; tenantId: string }) {
    if (!ctx.userId || !ctx.tenantId) {
      throw new ForbiddenException('missing context');
    }
    if (!ALLOWED_RESOURCE_TYPES.includes(dto.resourceType)) {
      throw new BadRequestException('resourceType not allowed');
    }
    if (!ALLOWED_MIME.includes(dto.mimeType)) {
      throw new BadRequestException('mimeType not allowed');
    }
    if (dto.size <= 0 || dto.size > MAX_SIZE) {
      throw new BadRequestException('file size not allowed');
    }

    const now = new Date();
    const ext = this.storage.getExtensionFromMime(dto.mimeType);
    const objectKey = this.storage.buildObjectKey({
      env: this.storage.getEnvPrefix(),
      tenantId: ctx.tenantId,
      resourceType: dto.resourceType,
      uuid: randomUUID(),
      extension: ext,
      now,
    });

    const asset = await this.prisma.managedAsset.create({
      data: {
        tenantId: ctx.tenantId,
        ownerId: ctx.userId,
        resourceType: dto.resourceType,
        resourceId: null,
        role: dto.role ?? null,
        bucket: this.storage.getDefaultBucket(),
        objectKey,
        mimeType: dto.mimeType,
        size: dto.size,
        status: 'pending',
        moderationStatus: 'pending',
        visibility: 'public',
      },
    });

    const signed = await this.storage.getPresignedUploadUrl({
      bucket: asset.bucket,
      objectKey: asset.objectKey,
      mimeType: asset.mimeType,
      expiresInSeconds: 15 * 60,
    });

    return {
      uploadId: asset.id,
      assetId: asset.id,
      bucket: asset.bucket,
      objectKey: asset.objectKey,
      url: signed.url,
      headers: signed.headers,
      expireAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
    };
  }

  async confirmUpload(dto: ConfirmUploadDto, ctx: { userId: string; tenantId: string }) {
    if (!ctx.userId || !ctx.tenantId) throw new ForbiddenException('missing context');
    const asset = await this.prisma.managedAsset.findUnique({ where: { id: dto.assetId } });
    if (!asset) throw new NotFoundException('asset not found');
    if (asset.tenantId !== ctx.tenantId || asset.ownerId !== ctx.userId) {
      throw new ForbiddenException('no permission');
    }
    if (!['pending', 'uploaded'].includes(asset.status)) {
      throw new BadRequestException('invalid asset status');
    }
    const mimeToCheck = dto.mimeType ?? asset.mimeType;
    if (mimeToCheck && !ALLOWED_MIME.includes(mimeToCheck)) {
      throw new BadRequestException('mimeType not allowed');
    }
    if (dto.size <= 0 || dto.size > MAX_SIZE) {
      throw new BadRequestException('file size not allowed');
    }

    const meta = await this.storage.headObject(asset.bucket, asset.objectKey);
    if (!meta) throw new BadRequestException('object not found in storage');
    const storedSize = Number((meta as any).size || (meta as any).contentLength || 0);
    const allowedDelta = 256 * 1024;
    if (storedSize && Math.abs(storedSize - dto.size) > allowedDelta) {
      throw new BadRequestException('size mismatch');
    }

    const updated = await this.prisma.managedAsset.update({
      where: { id: dto.assetId },
      data: {
        size: dto.size ?? asset.size,
        hash: dto.hash ?? asset.hash,
        width: dto.width ?? asset.width,
        height: dto.height ?? asset.height,
        originalName: dto.originalName ?? asset.originalName,
        mimeType: dto.mimeType ?? asset.mimeType,
        status: 'uploaded',
      },
    });

    await this.imageQueue.add(PROCESS_IMAGE_JOB, { assetId: updated.id });

    return {
      assetId: updated.id,
      status: updated.status,
      publicUrl: this.storage.buildPublicUrl(updated.bucket, updated.objectKey),
      variants: null,
    };
  }

  async bindAsset(dto: BindAssetDto, ctx: { userId: string; tenantId: string }) {
    if (!ctx.userId || !ctx.tenantId) throw new ForbiddenException('missing context');
    if (!ALLOWED_RESOURCE_TYPES.includes(dto.resourceType)) {
      throw new BadRequestException('resourceType not allowed');
    }
    const asset = await this.prisma.managedAsset.findUnique({ where: { id: dto.assetId } });
    if (!asset) throw new NotFoundException('asset not found');
    if (asset.tenantId !== ctx.tenantId || asset.ownerId !== ctx.userId) {
      throw new ForbiddenException('no permission');
    }

    const updated = await this.prisma.managedAsset.update({
      where: { id: dto.assetId },
      data: {
        resourceType: dto.resourceType,
        resourceId: dto.resourceId,
        role: dto.role ?? asset.role,
      },
    });

    return {
      asset: {
        ...updated,
        publicUrl: this.storage.buildPublicUrl(updated.bucket, updated.objectKey),
      },
    };
  }

  async softDelete(id: string, ctx: { userId: string; tenantId: string }) {
    if (!ctx.userId || !ctx.tenantId) throw new ForbiddenException('missing context');
    const asset = await this.prisma.managedAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('asset not found');
    if (asset.tenantId !== ctx.tenantId || asset.ownerId !== ctx.userId) {
      throw new ForbiddenException('no permission');
    }
    const updated = await this.prisma.managedAsset.update({
      where: { id },
      data: {
        status: 'deleted',
        deletedAt: new Date(),
      },
    });
    return updated;
  }

  async getAsset(id: string, ctx: { userId: string; tenantId: string }) {
    if (!ctx.userId || !ctx.tenantId) throw new ForbiddenException('missing context');
    const asset = await this.prisma.managedAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('asset not found');
    if (asset.tenantId !== ctx.tenantId) {
      throw new ForbiddenException('no permission');
    }
    return {
      ...asset,
      publicUrl: this.storage.buildPublicUrl(asset.bucket, asset.objectKey),
    };
  }

  // Server-side avatar upload using buffer (for legacy multipart endpoints)
  async uploadImageFromBuffer(params: {
    userId: string;
    tenantId: string;
    resourceType: string;
    resourceId: string;
    role: string;
    file: Express.Multer.File;
  }) {
    const { userId, tenantId, resourceType, resourceId, role, file } = params;
    if (!userId || !tenantId) throw new ForbiddenException('missing context');
    if (!ALLOWED_RESOURCE_TYPES.includes(resourceType)) {
      throw new BadRequestException('resourceType not allowed');
    }
    if (!file?.buffer?.length) throw new BadRequestException('無効な画像ファイルです');
    const mimeType = file.mimetype || 'image/jpeg';
    if (!ALLOWED_MIME.includes(mimeType)) throw new BadRequestException('mimeType not allowed');
    if (file.size <= 0 || file.size > MAX_SIZE) throw new BadRequestException('file size not allowed');

    const now = new Date();
    const ext = this.storage.getExtensionFromMime(mimeType);
    const objectKey = this.storage.buildObjectKey({
      env: this.storage.getEnvPrefix(),
      tenantId,
      resourceType,
      uuid: randomUUID(),
      extension: ext,
      now,
    });

    const asset = await this.prisma.managedAsset.create({
      data: {
        tenantId,
        ownerId: userId,
        resourceType,
        resourceId,
        role,
        bucket: this.storage.getDefaultBucket(),
        objectKey,
        mimeType,
        size: file.size,
        status: 'pending',
        moderationStatus: 'pending',
        visibility: 'public',
        originalName: file.originalname || null,
      },
    });

    await this.storage.uploadBuffer({
      bucket: asset.bucket,
      objectKey: asset.objectKey,
      buffer: file.buffer,
      contentType: mimeType,
      makePublic: true,
    });

    await this.prisma.managedAsset.update({
      where: { id: asset.id },
      data: { status: 'uploaded' },
    });

    // 队列若不可用（如 Redis 未启动），不阻断主流程
    try {
      await this.imageQueue.add(PROCESS_IMAGE_JOB, { assetId: asset.id });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('queue add failed, skip image processing', err);
    }

    return {
      asset,
      publicUrl: this.storage.buildPublicUrl(asset.bucket, asset.objectKey),
      variants: null,
    };
  }

  async uploadUserAvatarFromBuffer(params: {
    userId: string;
    tenantId: string;
    file: Express.Multer.File;
  }) {
    const { userId, tenantId, file } = params;
    if (!userId || !tenantId) throw new ForbiddenException('missing context');
    if (!file?.buffer?.length) throw new BadRequestException('無効な画像ファイルです');
    const mimeType = file.mimetype || 'image/jpeg';
    if (!ALLOWED_MIME.includes(mimeType)) throw new BadRequestException('mimeType not allowed');
    if (file.size <= 0 || file.size > MAX_SIZE) throw new BadRequestException('file size not allowed');

    const now = new Date();
    const ext = this.storage.getExtensionFromMime(mimeType);
    const objectKey = this.storage.buildObjectKey({
      env: this.storage.getEnvPrefix(),
      tenantId,
      resourceType: 'user-avatar',
      uuid: randomUUID(),
      extension: ext,
      now,
    });

    const { asset, publicUrl, variants } = await this.uploadImageFromBuffer({
      userId,
      tenantId,
      resourceType: 'user-avatar',
      resourceId: userId,
      role: 'avatar',
      file,
    });
    return { assetId: asset.id, publicUrl, variants };
  }
}
