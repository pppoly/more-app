import { Body, Controller, ForbiddenException, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConsoleEventAssistantService } from './console-event-assistant.service';

@Controller('console/communities/:communityId/event-assistant')
@UseGuards(JwtAuthGuard)
export class ConsoleEventAssistantController {
  constructor(private readonly assistantService: ConsoleEventAssistantService) {}

  @Post('logs')
  saveLog(
    @Param('communityId') communityId: string,
    @Body()
    body: {
      stage?: string;
      summary?: string;
      qaState?: any;
      messages: any;
      aiResult?: any;
      promptVersion?: string;
      status?: string;
      turnCount?: number;
      language?: string;
      meta?: any;
    },
    @Req() req: any,
  ) {
    return this.assistantService.saveLog(req.user.id, communityId, body);
  }

  @Get('logs')
  listLogs(@Param('communityId') communityId: string, @Req() req: any) {
    return this.assistantService.listLogs(req.user.id, communityId);
  }

  @Get('dashboard')
  dashboard(@Param('communityId') communityId: string, @Req() req: any) {
    if (!req.user?.isAdmin) {
      throw new ForbiddenException('Admins only');
    }
    return this.assistantService.getDashboard(req.user.id, communityId, true);
  }
}
