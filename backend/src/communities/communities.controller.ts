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
