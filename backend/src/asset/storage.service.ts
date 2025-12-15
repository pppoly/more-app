import { Injectable, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { Storage, GetSignedUrlConfig } from '@google-cloud/storage';
import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { UPLOAD_ROOT } from '../common/storage/upload-root';

interface PresignParams {
  bucket: string;
  objectKey: string;
  mimeType: string;
  expiresInSeconds: number;
}

interface PresignResult {
  url: string;
  headers: Record<string, string>;
}

interface BuildKeyParams {
  env: string;
  tenantId: string;
  resourceType: string;
  uuid: string;
  extension: string;
  now: Date;
}

@Injectable()
export class StorageService {
  private storage: Storage;
  private bucketName: string;
  private cdnBase: string;
  private uploadsPrefix: string;
  private isLocal: boolean;

  constructor() {
    this.storage = new Storage();
    const forceLocal = process.env.FORCE_LOCAL_UPLOADS === 'true';
    this.bucketName = process.env.GCS_BUCKET || 'local';
    this.cdnBase = process.env.CDN_BASE_URL || '';
    this.uploadsPrefix = (process.env.UPLOADS_HTTP_PREFIX || 'uploads').replace(/^\/+|\/+$/g, '');
    this.isLocal = forceLocal || !process.env.GCS_BUCKET;
  }

  getDefaultBucket() {
    return this.bucketName;
  }

  getEnvPrefix() {
    return process.env.NODE_ENV || 'dev';
  }

  getExtensionFromMime(mime: string) {
    if (mime === 'image/png') return 'png';
    if (mime === 'image/webp') return 'webp';
    if (mime === 'image/heic' || mime === 'image/heif') return 'heic';
    return 'jpg';
  }

  private buildLocalUrl(objectKey: string) {
    const cleanKey = objectKey.replace(/^\/+/, '');
    return `/${this.uploadsPrefix}/${cleanKey}`;
  }

  buildObjectKey(params: BuildKeyParams) {
    const yyyy = params.now.getFullYear();
    const mm = String(params.now.getMonth() + 1).padStart(2, '0');
    const dd = String(params.now.getDate()).padStart(2, '0');
    return `${params.env}/${params.tenantId}/${params.resourceType}/${yyyy}/${mm}/${dd}/${params.uuid}_orig.${params.extension}`;
  }

  async getPresignedUploadUrl(params: PresignParams): Promise<PresignResult> {
    if (this.isLocal) {
      throw new BadRequestException('Local storage mode does not support presigned uploads');
    }
    try {
      const bucket = this.storage.bucket(params.bucket);
      const file = bucket.file(params.objectKey);
      const config: GetSignedUrlConfig = {
        version: 'v4',
        action: 'write',
        expires: Date.now() + params.expiresInSeconds * 1000,
        contentType: params.mimeType,
      };
      const [url] = await file.getSignedUrl(config);
      return {
        url,
        headers: {
          'Content-Type': params.mimeType,
        },
      };
    } catch (err) {
      throw new InternalServerErrorException('Failed to generate signed URL');
    }
  }

  async headObject(bucket: string, objectKey: string) {
    if (this.isLocal) {
      const fullPath = join(UPLOAD_ROOT, objectKey);
      try {
        const info = await stat(fullPath);
        return { size: info.size };
      } catch {
        return null;
      }
    }
    const file = this.storage.bucket(bucket).file(objectKey);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [meta] = await file.getMetadata();
    return meta;
  }

  async download(bucket: string, objectKey: string): Promise<Buffer> {
    if (this.isLocal) {
      const fullPath = join(UPLOAD_ROOT, objectKey);
      return readFile(fullPath);
    }
    const file = this.storage.bucket(bucket).file(objectKey);
    const [buf] = await file.download();
    return buf;
  }

  async uploadBuffer(params: {
    bucket: string;
    objectKey: string;
    buffer: Buffer;
    contentType: string;
    makePublic?: boolean;
  }) {
    if (this.isLocal) {
      const cleanKey = params.objectKey.replace(/^\/+/, '');
      const fullPath = join(UPLOAD_ROOT, cleanKey);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, params.buffer);
      return this.buildLocalUrl(cleanKey);
    }
    const bucket = this.storage.bucket(params.bucket);
    const file = bucket.file(params.objectKey);
    await file.save(params.buffer, {
      contentType: params.contentType,
      resumable: false,
    });
    if (params.makePublic) {
      await file.makePublic();
    }
    return this.buildPublicUrl(params.bucket, params.objectKey);
  }

  buildPublicUrl(bucket: string, objectKey: string) {
    if (this.isLocal) {
      return this.buildLocalUrl(objectKey);
    }
    if (this.cdnBase) {
      return `${this.cdnBase}/${objectKey}`;
    }
    return `https://storage.googleapis.com/${bucket}/${objectKey}`;
  }
}
