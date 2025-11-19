import { Controller, ForbiddenException, Get, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from './ai.service';

@Controller('admin/ai')
@UseGuards(JwtAuthGuard)
export class AiAdminController {
  constructor(private readonly aiService: AiService) {}

  @Get('usage-summary')
  getUsageSummary(@Req() req: any) {
    this.assertAdmin(req);
    return this.aiService.getAiUsageSummary();
  }

  @Get('usage/:moduleId')
  getUsageDetail(@Param('moduleId') moduleId: string, @Req() req: any) {
    this.assertAdmin(req);
    return this.aiService.getAiUsageDetail(moduleId);
  }

  private assertAdmin(req: any) {
    if (!req.user?.isAdmin) {
      throw new ForbiddenException('Administrator privileges required');
    }
  }
}
