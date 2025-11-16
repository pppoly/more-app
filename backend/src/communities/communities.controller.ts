import { Controller, Get, Param } from '@nestjs/common';
import { CommunitiesService } from './communities.service';

@Controller('communities')
export class CommunitiesController {
  constructor(private readonly communitiesService: CommunitiesService) {}

  @Get('slug/:slug')
  getBySlug(@Param('slug') slug: string) {
    return this.communitiesService.findBySlug(slug);
  }
}
