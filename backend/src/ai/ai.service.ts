import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import OpenAI from 'openai';

export interface GenerateEventContentDto {
  baseLanguage: string;
  topic: string;
  audience: string;
  style: string;
  details: string;
}

export interface AiLocalizedField {
  original: string;
  lang: string;
  translations: Record<string, string>;
}

export interface AiEventContent {
  title: AiLocalizedField;
  description: AiLocalizedField;
  notes: AiLocalizedField;
  riskNotice: AiLocalizedField;
  snsCaptions: {
    line: Record<string, string>;
    instagram: Record<string, string>;
  };
}

@Injectable()
export class AiService {
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async generateEventContent(payload: GenerateEventContentDto): Promise<AiEventContent> {
    if (!this.client) {
      throw new HttpException('OpenAI API key is not configured', HttpStatus.BAD_REQUEST);
    }

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.7,
        response_format: {
          type: 'json_schema',
          json_schema: this.buildJsonSchema(),
        },
        messages: [
          {
            role: 'system',
            content:
              'You are MORE App event planner AI assistant. Respond ONLY with JSON that follows the provided schema. Focus on multicultural community events in Japan.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              instruction:
                'Generate multilingual content for an event hosted on MORE App. Use warm, inclusive tone. Keep sentences concise enough for mobile UI.',
              data: payload,
            }),
          },
        ],
      });

      const messageContent = completion.choices[0]?.message?.content;
      const raw =
        typeof messageContent === 'string'
          ? messageContent
          : Array.isArray(messageContent)
            ? (messageContent as Array<{ text?: string } | null>)
                .map((part) => part?.text ?? '')
                .join('')
            : '';

      if (!raw) {
        throw new Error('Empty response from AI');
      }

      return JSON.parse(raw) as AiEventContent;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to generate event copy', HttpStatus.INTERNAL_SERVER_ERROR, {
        cause: error,
      });
    }
  }

  private buildJsonSchema() {
    const localized = {
      type: 'object',
      properties: {
        original: { type: 'string' },
        lang: { type: 'string', enum: ['ja', 'zh', 'en'] },
        translations: {
          type: 'object',
          properties: {
            ja: { type: 'string' },
            zh: { type: 'string' },
            en: { type: 'string' },
          },
          additionalProperties: { type: 'string' },
          required: ['ja', 'zh', 'en'],
        },
      },
      required: ['original', 'lang', 'translations'],
      additionalProperties: false,
    };

    const caption = {
      type: 'object',
      properties: {
        ja: { type: 'string' },
        zh: { type: 'string' },
        en: { type: 'string' },
      },
      required: ['ja', 'zh', 'en'],
      additionalProperties: false,
    };

    return {
      name: 'MoreAppEventContent',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: localized,
          description: localized,
          notes: localized,
          riskNotice: localized,
          snsCaptions: {
            type: 'object',
            properties: {
              line: caption,
              instagram: caption,
            },
            required: ['line', 'instagram'],
            additionalProperties: false,
          },
        },
        required: ['title', 'description', 'notes', 'riskNotice', 'snsCaptions'],
      },
    };
  }
}
