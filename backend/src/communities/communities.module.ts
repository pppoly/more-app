import { Module } from '@nestjs/common';
import { CommunitiesService } from './communities.service';
import { CommunitiesController } from './communities.controller';
import { PermissionsService } from '../auth/permissions.service';

@Module({
  controllers: [CommunitiesController],
  providers: [CommunitiesService, PermissionsService],
})
export class CommunitiesModule {}
