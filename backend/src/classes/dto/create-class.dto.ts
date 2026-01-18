import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateClassDto {
  @IsNotEmpty()
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  locationName?: string;

  @IsInt()
  @Min(0)
  priceYenPerLesson!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  defaultCapacity?: number | null;
}

export class UpdateClassDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  locationName?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceYenPerLesson?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  defaultCapacity?: number | null;

  @IsOptional()
  @IsString()
  status?: string;
}
