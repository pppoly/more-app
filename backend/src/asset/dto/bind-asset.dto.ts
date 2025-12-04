import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class BindAssetDto {
  @IsString()
  @IsNotEmpty()
  assetId: string;

  @IsString()
  @IsNotEmpty()
  resourceType: string;

  @IsString()
  @IsNotEmpty()
  resourceId: string;

  @IsOptional()
  @IsString()
  role?: string; // cover|gallery|avatar
}
