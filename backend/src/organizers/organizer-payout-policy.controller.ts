import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { OrganizersService } from './organizers.service';

@Controller('organizer/payout-policy')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('organizer')
export class OrganizerPayoutPolicyController {
  constructor(private readonly organizersService: OrganizersService) {}

  @Get()
  getStatus(@Req() req: any) {
    return this.organizersService.getPayoutPolicyStatus(req.user.id);
  }

  @Post('accept')
  accept(@Req() req: any) {
    return this.organizersService.acceptPayoutPolicy(req.user.id);
  }
}
