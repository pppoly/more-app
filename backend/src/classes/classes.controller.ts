/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-redundant-type-constituents */
import { Body, Controller, Get, Param, Post, UseGuards, Req } from '@nestjs/common';
import { ClassesService } from './classes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateClassRegistrationDto } from './dto/create-registration.dto';

@Controller()
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Get('communities/:communityId/classes')
  getClasses(@Param('communityId') communityId: string) {
    return this.classesService.listCommunityClasses(communityId);
  }

  @Get('classes/:classId')
  getClassDetail(@Param('classId') classId: string) {
    return this.classesService.getClassDetail(classId);
  }

  @Post('classes/:classId/registrations')
  @UseGuards(JwtAuthGuard)
  createRegistration(
    @Param('classId') classId: string,
    @Req() req: any,
    @Body() body: CreateClassRegistrationDto,
  ) {
    return this.classesService.createRegistration(classId, req.user.id, body);
  }
}
