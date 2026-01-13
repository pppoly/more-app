/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-floating-promises, @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents */
import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { OrganizersService } from './organizers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface OrganizerApplyDto {
  reason?: string;
  experience?: string;
  contact?: string;
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
