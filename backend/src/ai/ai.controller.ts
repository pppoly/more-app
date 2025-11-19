import { Body, Controller, Get, HttpException, HttpStatus, Post } from '@nestjs/common';
import {
  AiAssistantReply,
  AiAssistantProfileDefaults,
  AiEventContent,
  AiService,
  AssistantConversationMessage,
  GenerateAssistantReplyDto,
  GenerateEventContentDto,
} from './ai.service';

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

  @Post('events/assistant')
  async generateAssistantReply(
    @Body() body: Partial<GenerateAssistantReplyDto>,
  ): Promise<AiAssistantReply> {
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

    const conversation = Array.isArray(body?.conversation) ? body.conversation : [];
    const normalizedConversation: AssistantConversationMessage[] = conversation
      .filter(
        (item): item is AssistantConversationMessage =>
          Boolean(item) &&
          typeof item.role === 'string' &&
          (item.role === 'user' || item.role === 'assistant') &&
          typeof item.content === 'string' &&
          item.content.length > 0,
      )
      .slice(-12);

    return this.aiService.generateAssistantReply({
      ...(body as GenerateEventContentDto),
      conversation: normalizedConversation,
    });
  }

  @Get('events/profile-defaults')
  getProfileDefaults(): AiAssistantProfileDefaults {
    return this.aiService.getProfileDefaults();
  }
}
