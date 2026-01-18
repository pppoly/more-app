import { Module } from '@nestjs/common';
import { OrganizersController } from './organizers.controller';
import { OrganizerPayoutPolicyController } from './organizer-payout-policy.controller';
import { OrganizersService } from './organizers.service';

@Module({
  controllers: [OrganizersController, OrganizerPayoutPolicyController],
  providers: [OrganizersService],
})
export class OrganizersModule {}
