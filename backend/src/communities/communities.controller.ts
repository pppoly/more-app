/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-redundant-type-constituents */
import { Controller, Get, Param, Post, Delete, UseGuards, Req } from '@nestjs/common';
import { CommunitiesService } from './communities.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('communities')
export class CommunitiesController {
  constructor(private readonly communitiesService: CommunitiesService) {}

  @Get('slug/:slug')
  getBySlug(@Param('slug') slug: string, @Req() req: any) {
    const userId = req.user?.id;
    return this.communitiesService.findBySlug(slug, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':communityId/follow')
  getFollowStatus(@Param('communityId') communityId: string, @Req() req: any) {
    return this.communitiesService.getFollowStatus(communityId, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':communityId/follow')
  follow(@Param('communityId') communityId: string, @Req() req: any) {
    return this.communitiesService.followCommunity(communityId, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':communityId/follow')
  unfollow(@Param('communityId') communityId: string, @Req() req: any) {
    return this.communitiesService.unfollowCommunity(communityId, req.user.id);
  }
}
