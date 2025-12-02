import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsService } from '../auth/permissions.service';
import { AiService } from '../ai/ai.service';

@Controller('console/ai')
@UseGuards(JwtAuthGuard)
export class ConsoleAiController {
  constructor(private readonly aiService: AiService, private readonly permissions: PermissionsService) {}

  @Get('communities/:communityId/usage')
  async getCommunityUsage(@Param('communityId') communityId: string, @Req() req: any) {
    await this.permissions.assertCommunityManager(req.user.id, communityId);
    return this.aiService.getCommunityUsage(communityId);
  }
}
