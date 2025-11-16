import { Body, Controller, HttpException, HttpStatus, Post } from '@nestjs/common';
import { AiService, GenerateEventContentDto, AiEventContent } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('events/generate')
  async generateEventCopy(@Body() body: Partial<GenerateEventContentDto>): Promise<AiEventContent> {
    const requiredFields: Array<keyof GenerateEventContentDto> = [
      'baseLanguage',
      'topic',
      'audience',
      'style',
      'details',
    ];

    for (const field of requiredFields) {
      if (!body || typeof body[field] !== 'string' || !body[field]) {
        throw new HttpException(`${String(field)} is required`, HttpStatus.BAD_REQUEST);
      }
    }

    return this.aiService.generateEventContent(body as GenerateEventContentDto);
  }
}
