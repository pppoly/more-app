import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Storage, GetSignedUrlConfig } from '@google-cloud/storage';

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

  constructor() {
    this.storage = new Storage();
    this.bucketName = process.env.GCS_BUCKET || '';
    this.cdnBase = process.env.CDN_BASE_URL || '';
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

  buildObjectKey(params: BuildKeyParams) {
    const yyyy = params.now.getFullYear();
    const mm = String(params.now.getMonth() + 1).padStart(2, '0');
    const dd = String(params.now.getDate()).padStart(2, '0');
    return `${params.env}/${params.tenantId}/${params.resourceType}/${yyyy}/${mm}/${dd}/${params.uuid}_orig.${params.extension}`;
  }

  async getPresignedUploadUrl(params: PresignParams): Promise<PresignResult> {
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
    const file = this.storage.bucket(bucket).file(objectKey);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [meta] = await file.getMetadata();
    return meta;
  }

  async download(bucket: string, objectKey: string): Promise<Buffer> {
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
    if (this.cdnBase) {
      return `${this.cdnBase}/${objectKey}`;
    }
    return `https://storage.googleapis.com/${bucket}/${objectKey}`;
  }
}
