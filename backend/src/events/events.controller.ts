import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { EventsService } from './events.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Prisma } from '@prisma/client';

interface CreateRegistrationDto {
  ticketTypeId?: string;
  formAnswers?: Prisma.JsonValue;
}

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  getPublicEvents() {
    return this.eventsService.listPublicOpenEvents();
  }

  @Get(':id')
  getEventById(@Param('id') id: string) {
    return this.eventsService.getEventById(id);
  }

  @Get(':eventId/gallery')
  getEventGallery(@Param('eventId') eventId: string) {
    return this.eventsService.getEventGallery(eventId);
  }

  @Get(':eventId/follow')
  @UseGuards(JwtAuthGuard)
  getFollowStatus(@Param('eventId') eventId: string, @Req() req: any) {
    return this.eventsService.getFollowStatus(eventId, req.user.id);
  }

  @Post(':eventId/follow')
  @UseGuards(JwtAuthGuard)
  followEvent(@Param('eventId') eventId: string, @Req() req: any) {
    return this.eventsService.followEvent(eventId, req.user.id);
  }

  @Delete(':eventId/follow')
  @UseGuards(JwtAuthGuard)
  unfollowEvent(@Param('eventId') eventId: string, @Req() req: any) {
    return this.eventsService.unfollowEvent(eventId, req.user.id);
  }

  @Post(':eventId/registrations')
  @UseGuards(JwtAuthGuard)
  createRegistration(
    @Param('eventId') eventId: string,
    @Req() req: any,
    @Body() body: CreateRegistrationDto,
  ) {
    return this.eventsService.createRegistration(eventId, req.user.id, body);
  }
}
