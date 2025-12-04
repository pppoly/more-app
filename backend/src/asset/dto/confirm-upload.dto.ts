import { IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class ConfirmUploadDto {
  @IsString()
  assetId: string;

  @IsOptional()
  @IsString()
  uploadId?: string;

  @Type(() => Number)
  @IsInt()
  size: number;

  @IsOptional()
  @IsString()
  hash?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  width?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  height?: number;

  @IsOptional()
  @IsString()
  originalName?: string;

  @IsOptional()
  @IsString()
  mimeType?: string;
}
