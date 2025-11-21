import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConsoleCommunitiesService } from './console-communities.service';
import { ConsoleEventsService } from './console-events.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

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

  @Get('pricing-plans')
  listPricingPlans() {
    return this.service.listPricingPlans();
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('organizer')
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

  @Post('uploads')
  @UseGuards(RolesGuard)
  @Roles('organizer')
  @UseInterceptors(FileInterceptor('file'))
  uploadCommunityAsset(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('type') type?: string,
    @Query('communityId') communityId?: string,
  ) {
    if (!communityId) {
      throw new BadRequestException('communityId is required');
    }
    return this.service.uploadCommunityAsset(req.user.id, communityId, file, type);
  }

  @Get(':communityId/events')
  listCommunityEvents(@Param('communityId') communityId: string, @Req() req: any) {
    return this.consoleEventsService.listCommunityEvents(req.user.id, communityId);
  }

  @Post(':communityId/events')
  @UseGuards(RolesGuard)
  @Roles('organizer')
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

  @Post(':communityId/stripe/onboard')
  startStripeOnboarding(@Param('communityId') communityId: string, @Req() req: any) {
    return this.service.startStripeOnboarding(req.user.id, communityId);
  }

  @Post(':communityId/subscription')
  updateSubscription(
    @Param('communityId') communityId: string,
    @Req() req: any,
    @Body('planId') planId: string,
  ) {
    if (!planId) {
      throw new BadRequestException('planId is required');
    }
    return this.service.subscribeCommunityPlan(req.user.id, communityId, planId);
  }

  @Get(':communityId/portal')
  getPortalConfig(@Param('communityId') communityId: string, @Req() req: any) {
    return this.service.getPortalConfig(req.user.id, communityId);
  }

  @Patch(':communityId/portal')
  updatePortalConfig(@Param('communityId') communityId: string, @Req() req: any, @Body() body: any) {
    return this.service.updatePortalConfig(req.user.id, communityId, body);
  }
}
