/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-redundant-type-constituents */
import { Body, Controller, HttpException, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConsoleEventDraftService } from './console-event-draft.service';

@Controller('console/communities/:communityId/event-draft')
@UseGuards(JwtAuthGuard)
export class ConsoleEventDraftController {
  constructor(private readonly draftService: ConsoleEventDraftService) {}

  @Post('extract')
  async extractDraft(
    @Param('communityId') communityId: string,
    @Body() body: { draft?: string; language?: string; urls?: string[]; imageUrls?: string[] },
    @Req() req: any,
  ) {
    if (!body?.draft?.trim()) {
      throw new HttpException('请提供活动草案', HttpStatus.BAD_REQUEST);
    }
    return this.draftService.extractDraft(
      req.user.id,
      communityId,
      body.draft,
      body.language,
      body.urls,
      body.imageUrls,
    );
  }
}
