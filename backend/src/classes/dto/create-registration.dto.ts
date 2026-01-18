import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Prisma } from '@prisma/client';

export class CreateClassRegistrationDto {
  @IsNotEmpty()
  @IsString()
  lessonId!: string;

  @IsOptional()
  ticketTypeId?: string;

  @IsOptional()
  formAnswers?: Prisma.JsonValue;
}
