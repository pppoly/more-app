import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConsoleEventsService } from './console-events.service';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Express } from 'express';
import type { Response } from 'express';

@Controller('console/events')
@UseGuards(JwtAuthGuard)
export class ConsoleEventsController {
  constructor(private readonly consoleEventsService: ConsoleEventsService) {}

  @Get(':eventId')
  getEvent(@Param('eventId') eventId: string, @Req() req: any) {
    return this.consoleEventsService.getEvent(req.user.id, eventId);
  }

  @Get(':eventId/registrations/summary')
  getRegistrationSummary(@Param('eventId') eventId: string, @Req() req: any) {
    return this.consoleEventsService.getRegistrationsSummary(req.user.id, eventId);
  }

  @Patch(':eventId')
  updateEvent(@Param('eventId') eventId: string, @Body() body: any, @Req() req: any) {
    return this.consoleEventsService.updateEvent(req.user.id, eventId, body);
  }

  @Get(':eventId/registrations')
  listRegistrations(@Param('eventId') eventId: string, @Req() req: any) {
    return this.consoleEventsService.listRegistrationsDetailed(req.user.id, eventId);
  }

  @Post(':eventId/close')
  closeEvent(@Param('eventId') eventId: string, @Req() req: any) {
    return this.consoleEventsService.closeEvent(eventId, req.user.id);
  }

  @Post(':eventId/cancel')
  cancelEvent(
    @Param('eventId') eventId: string,
    @Body('reason') reason: string,
    @Body('notify') notify: boolean,
    @Req() req: any,
  ) {
    return this.consoleEventsService.cancelEvent(eventId, req.user.id, { reason, notify });
  }

  @Post(':eventId/review/approve')
  approveEvent(@Param('eventId') eventId: string, @Req() req: any) {
    return this.consoleEventsService.approveEvent(eventId, req.user.id);
  }

  @Post(':eventId/review/reject')
  rejectEvent(@Param('eventId') eventId: string, @Body('reason') reason: string, @Req() req: any) {
    return this.consoleEventsService.rejectEvent(eventId, req.user.id, reason);
  }

  @Post(':eventId/checkins')
  checkinRegistration(
    @Param('eventId') eventId: string,
    @Body('registrationId') registrationId: string,
    @Req() req: any,
  ) {
    if (!registrationId) {
      throw new BadRequestException('registrationId is required');
    }
    return this.consoleEventsService.checkinRegistration(req.user.id, eventId, registrationId);
  }

  @Post(':eventId/covers')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadCovers(
    @Param('eventId') eventId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: any,
  ) {
    return this.consoleEventsService.uploadEventCovers(req.user.id, eventId, files);
  }

  @Delete(':eventId/covers/:coverId')
  removeCover(@Param('eventId') eventId: string, @Param('coverId') coverId: string, @Req() req: any) {
    return this.consoleEventsService.removeEventCover(req.user.id, eventId, coverId);
  }

  @Post(':eventId/registrations/:registrationId/approve')
  approveRegistration(
    @Param('eventId') eventId: string,
    @Param('registrationId') registrationId: string,
    @Req() req: any,
  ) {
    return this.consoleEventsService.approveRegistration(req.user.id, eventId, registrationId);
  }

  @Post(':eventId/registrations/:registrationId/reject')
  rejectRegistration(
    @Param('eventId') eventId: string,
    @Param('registrationId') registrationId: string,
    @Req() req: any,
  ) {
    return this.consoleEventsService.rejectRegistration(req.user.id, eventId, registrationId);
  }

  @Get(':eventId/registrations/export')
  async exportRegistrations(
    @Param('eventId') eventId: string,
    @Query('format') format = 'csv',
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (format !== 'csv') {
      throw new BadRequestException('Unsupported export format');
    }
    const { filename, csv } = await this.consoleEventsService.exportRegistrationsCsv(req.user.id, eventId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  }
}
