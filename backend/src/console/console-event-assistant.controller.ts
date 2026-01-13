/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-redundant-type-constituents */
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
      logId?: string;
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

  @Get('logs/:logId')
  getLog(
    @Param('communityId') communityId: string,
    @Param('logId') logId: string,
    @Req() req: any,
  ) {
    return this.assistantService.getLog(req.user.id, communityId, logId);
  }

  @Get('dashboard')
  dashboard(@Param('communityId') communityId: string, @Req() req: any) {
    if (!req.user?.isAdmin) {
      throw new ForbiddenException('Admins only');
    }
    return this.assistantService.getDashboard(req.user.id, communityId, true);
  }
}
