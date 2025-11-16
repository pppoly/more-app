import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConsoleEventsService } from './console-events.service';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Express } from 'express';

@Controller('console/events')
@UseGuards(JwtAuthGuard)
export class ConsoleEventsController {
  constructor(private readonly consoleEventsService: ConsoleEventsService) {}

  @Get(':eventId')
  getEvent(@Param('eventId') eventId: string, @Req() req: any) {
    return this.consoleEventsService.getEvent(req.user.id, eventId);
  }

  @Patch(':eventId')
  updateEvent(@Param('eventId') eventId: string, @Body() body: any, @Req() req: any) {
    return this.consoleEventsService.updateEvent(req.user.id, eventId, body);
  }

  @Get(':eventId/registrations')
  listRegistrations(@Param('eventId') eventId: string, @Req() req: any) {
    return this.consoleEventsService.listRegistrations(req.user.id, eventId);
  }

  @Post(':eventId/close')
  closeEvent(@Param('eventId') eventId: string, @Req() req: any) {
    return this.consoleEventsService.closeEvent(eventId, req.user.id);
  }

  @Post(':eventId/covers')
  @UseInterceptors(FilesInterceptor('files', 10, { storage: memoryStorage() }))
  uploadCovers(
    @Param('eventId') eventId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: any,
  ) {
    return this.consoleEventsService.uploadEventCovers(req.user.id, eventId, files);
  }
}
