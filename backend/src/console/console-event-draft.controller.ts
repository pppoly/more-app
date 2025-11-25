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
    @Body() body: { draft?: string; language?: string },
    @Req() req: any,
  ) {
    if (!body?.draft?.trim()) {
      throw new HttpException('请提供活动草案', HttpStatus.BAD_REQUEST);
    }
    return this.draftService.extractDraft(req.user.id, communityId, body.draft, body.language);
  }
}
