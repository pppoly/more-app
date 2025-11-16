import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { OrganizersService } from './organizers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface OrganizerApplyDto {
  reason?: string;
  experience?: string;
}

@Controller('organizers')
@UseGuards(JwtAuthGuard)
export class OrganizersController {
  constructor(private readonly organizersService: OrganizersService) {}

  @Post('apply')
  apply(@Req() req: any, @Body() body: OrganizerApplyDto) {
    return this.organizersService.apply(req.user.id, body);
  }

  @Get('me/application')
  getMyApplication(@Req() req: any) {
    return this.organizersService.getMyApplication(req.user.id);
  }
}
