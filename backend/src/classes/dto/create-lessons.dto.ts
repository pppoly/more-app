import { ArrayNotEmpty, IsArray, IsDateString, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class LessonInputDto {
  @IsDateString()
  startAt!: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  capacity?: number | null;
}

export class BatchCreateLessonsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => LessonInputDto)
  lessons!: LessonInputDto[];
}
