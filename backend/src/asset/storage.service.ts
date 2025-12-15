import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Storage, GetSignedUrlConfig } from '@google-cloud/storage';
import { mkdir, stat, writeFile, readFile } from 'fs/promises';
import { join, dirname } from 'path';
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
  private useLocal: boolean;
  private localRoot: string;
  private fallbackToLocal: boolean;

  constructor() {
    this.storage = new Storage();
    this.bucketName = process.env.GCS_BUCKET || '';
    this.cdnBase = process.env.CDN_BASE_URL || '';
    this.useLocal = !this.bucketName;
    this.localRoot = UPLOAD_ROOT;
    this.fallbackToLocal = this.useLocal;

    if (this.useLocal) {
      // eslint-disable-next-line no-console
      console.warn('[StorageService] GCS_BUCKET is not set. Using local disk storage under', this.localRoot);
    }
  }

  getDefaultBucket() {
    return this.bucketName || 'local';
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

  buildObjectKey(params: BuildKeyParams) {
    const yyyy = params.now.getFullYear();
    const mm = String(params.now.getMonth() + 1).padStart(2, '0');
    const dd = String(params.now.getDate()).padStart(2, '0');
    return `${params.env}/${params.tenantId}/${params.resourceType}/${yyyy}/${mm}/${dd}/${params.uuid}_orig.${params.extension}`;
  }

  async getPresignedUploadUrl(params: PresignParams): Promise<PresignResult> {
    if (this.useLocal) {
      throw new InternalServerErrorException('Presigned uploads require GCS_BUCKET; running in local storage mode');
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
    if (this.useLocal) {
      try {
        const target = join(this.localRoot, objectKey);
        const stats = await stat(target);
        return { size: stats.size };
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
    if (this.useLocal) {
      const target = join(this.localRoot, objectKey);
      return readFile(target);
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
    if (this.useLocal) {
      const target = join(this.localRoot, params.objectKey);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, params.buffer);
      return this.buildPublicUrl(params.bucket, params.objectKey);
    }
    try {
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
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[StorageService] GCS upload failed, falling back to local disk:', err);
      this.fallbackToLocal = true;
      const target = join(this.localRoot, params.objectKey);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, params.buffer);
      return this.buildPublicUrl(params.bucket, params.objectKey);
    }
  }

  buildPublicUrl(bucket: string, objectKey: string) {
    if (this.useLocal || this.fallbackToLocal) {
      return `/uploads/${objectKey}`;
    }
    if (this.cdnBase) {
      return `${this.cdnBase}/${objectKey}`;
    }
    return `https://storage.googleapis.com/${bucket}/${objectKey}`;
  }
}
