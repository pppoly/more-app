import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConsoleCommunitiesService } from './console-communities.service';
import { ConsoleEventsService } from './console-events.service';

@Controller('console/communities')
@UseGuards(JwtAuthGuard)
export class ConsoleCommunitiesController {
  constructor(
    private readonly service: ConsoleCommunitiesService,
    private readonly consoleEventsService: ConsoleEventsService,
  ) {}

  @Get()
  listMyCommunities(@Req() req: any) {
    return this.service.listManagedCommunities(req.user.id);
  }

  @Post()
  createCommunity(@Req() req: any, @Body() body: any) {
    return this.service.createCommunity(req.user.id, body);
  }

  @Get(':communityId')
  getCommunity(@Param('communityId') communityId: string, @Req() req: any) {
    return this.service.getCommunity(req.user.id, communityId);
  }

  @Patch(':communityId')
  updateCommunity(@Param('communityId') communityId: string, @Req() req: any, @Body() body: any) {
    return this.service.updateCommunity(req.user.id, communityId, body);
  }

  @Get(':communityId/events')
  listCommunityEvents(@Param('communityId') communityId: string, @Req() req: any) {
    return this.consoleEventsService.listCommunityEvents(req.user.id, communityId);
  }

  @Post(':communityId/events')
  createEvent(
    @Param('communityId') communityId: string,
    @Req() req: any,
    @Body() body: any,
  ) {
    return this.consoleEventsService.createEvent(req.user.id, communityId, body);
  }

  @Get(':communityId/blacklist')
  listBlacklist(@Param('communityId') communityId: string, @Req() req: any) {
    return this.service.listBlacklist(communityId, req.user.id);
  }

  @Post(':communityId/blacklist')
  addToBlacklist(
    @Param('communityId') communityId: string,
    @Req() req: any,
    @Body('userId') targetUserId: string,
  ) {
    return this.service.addToBlacklist(communityId, req.user.id, targetUserId);
  }

  @Delete(':communityId/blacklist/:userId')
  removeFromBlacklist(
    @Param('communityId') communityId: string,
    @Param('userId') targetUserId: string,
    @Req() req: any,
  ) {
    return this.service.removeFromBlacklist(communityId, req.user.id, targetUserId);
  }

  @Get(':communityId/analytics')
  analytics(@Param('communityId') communityId: string, @Req() req: any) {
    return this.service.getAnalytics(communityId, req.user.id);
  }
}
