import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class PresignUploadDto {
  @IsString()
  @IsNotEmpty()
  resourceType: string;

  @IsOptional()
  @IsString()
  role?: string; // cover|gallery|avatar|banner

  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @Type(() => Number)
  @IsInt()
  size: number;
}
