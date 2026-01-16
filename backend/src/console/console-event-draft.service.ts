import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { PermissionsService } from '../auth/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

export type EventDraftExtractResult = {
  title?: string | null;
  description?: string | null;
  rules?: string | null;
  category?: string | null;
  locationText?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  regStartTime?: string | null;
  regEndTime?: string | null;
  minParticipants?: number | null;
  maxParticipants?: number | null;
  ticketPrice?: number | null;
  visibility?: 'public' | 'community-only' | 'private' | null;
  visibleRange?: 'public' | 'community' | 'private' | null;
  refundPolicy?: string | null;
  ticketTypes?: Array<{ name: string; price: number; currency?: string; quota?: number | null; type?: string }>;
  registrationForm?: Array<{ label: string; type: string; required?: boolean }>;
  advice?: string[];
  compliance?: string[];
};

@Injectable()
export class ConsoleEventDraftService {
  constructor(
    private readonly aiService: AiService,
    private readonly permissions: PermissionsService,
    private readonly prisma: PrismaService,
  ) {}

  private buildSystemPrompt(): string {
    return [
      '你是 MORE App 的活动策划助手，负责把用户草案整理成表单要素并给出风险提示。',
      '只输出 JSON，字段：',
      `{
  "title": string,
  "description": string,
  "category": "hiking"|"running"|"cycling"|"camping"|"water"|"kids"|"language"|"other"|null,
  "locationText": string|null,
  "startTime": string|null,
  "endTime": string|null,
  "regStartTime": string|null,
  "regEndTime": string|null,
  "minParticipants": number|null,
  "maxParticipants": number|null,
  "ticketPrice": number|null,
  "visibility": "public"|"community-only"|"private"|null,
  "visibleRange": "public"|"community"|"private"|null,
  "refundPolicy": string|null,
  "rules": string|null,
  "ticketTypes": Array<{ name: string; price: number; currency?: string; quota?: number|null; type?: string }>,
  "registrationForm": Array<{ label: string; type: string; required?: boolean }>,
  "advice": string[],
  "compliance": string[]
}`,
      '请尽量从自然语言中解析时间/地点/人数/费用：',
      '- 时间：从文中提取开始/结束时间，转换为 ISO8601，默认时区 Asia/Tokyo；只有日期无时间则保留日期、时间留空。',
      '- 报名时间：出现“申込締切/报名截止”等字样时填入 regEndTime；无则留空 regStartTime/EndTime。',
      '- 人数：如 “20人/20 名”，填入 maxParticipants，minParticipants 无则留空。',
      '- 费用：如 “2,000円”等金额，填入 ticketPrice，currency=JPY。',
      '- 地点：合并场馆/地址文本。',
      '- 分类：根据关键词推断，kids/儿童/小学生 => kids；その他/艺术/ワークショップ => other，如无法判断留空。',
      '- 可见性：未知则 visibility=public，visibleRange=null。',
      '- 报名表：若提到需填写姓名/电话等，转为 registrationForm；否则空数组。',
      '无法确定的字段请返回 null 或空数组，保持 JSON 结构。不要输出除 JSON 以外的任何内容。',
    ].join('\n');
  }

  async extractDraft(
    userId: string,
    communityId: string,
    draft: string,
    language?: string,
    urls?: string[] | null,
    imageUrls?: string[] | null,
  ) {
    if (!draft?.trim()) {
      throw new HttpException('Draft is empty', HttpStatus.BAD_REQUEST);
    }
    await this.permissions.assertCommunityManager(userId, communityId);

    const system = this.buildSystemPrompt();
    const userContent = [`草案：${draft}`];
    if (language) {
      userContent.push(`语言：${language}`);
    }
    const urlList = (urls || []).filter(Boolean);
    const imageList = (imageUrls || []).filter(Boolean);
    if (urlList.length) {
      userContent.push(`参考URL:\n- ${urlList.join('\n- ')}`);
    }
    if (imageList.length) {
      userContent.push(`画像リンク/スクショ:\n- ${imageList.join('\n- ')}`);
    }

    const { content } = await this.aiService.completeWithPrompt({
      prompt: { system },
      messages: [{ role: 'user', content: userContent.join('\n') }],
      promptId: 'event-draft-extract-v1',
      userId,
      tenantId: communityId,
      temperature: 0.2,
    });

    let parsed: EventDraftExtractResult;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? (JSON.parse(jsonMatch[0]) as EventDraftExtractResult) : (JSON.parse(content) as EventDraftExtractResult);
    } catch (err) {
      throw new HttpException('Failed to parse AI response', HttpStatus.BAD_GATEWAY, { cause: err as Error });
    }

    await this.prisma.aiEventDraftLog.create({
      data: {
        communityId,
        userId,
      stage: 'draft-extract',
      summary: parsed.title ?? null,
      messages: [
      { role: 'system', content: system },
      { role: 'user', content: userContent.join('\n') },
      { role: 'assistant', content },
    ] as Prisma.InputJsonValue,
    aiResult: parsed as Prisma.InputJsonValue,
    promptVersion: 'event-draft-extract-v2',
    status: 'ready',
    turnCount: 1,
    language: language ?? null,
  },
});

    return parsed;
  }
}
