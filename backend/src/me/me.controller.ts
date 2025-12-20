import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Query,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MeService } from './me.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Express } from 'express';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Get('events')
  getMyEvents(@Req() req: any) {
    return this.meService.getMyEvents(req.user.id);
  }

  @Get('communities')
  getMyCommunities(@Req() req: any, @Query('includeInactive') includeInactive?: string) {
    return this.meService.getMyCommunities(req.user.id, includeInactive === '1');
  }

  @Post('avatar')
  @UseInterceptors(FileInterceptor('avatar', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadAvatar(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: any) {
    if (!file) {
      throw new BadRequestException('Avatar file is required');
    }
    return this.meService.updateAvatar(req.user.id, file);
  }

  @Post('profile')
  async updateProfile(
    @Body('name') name: string | undefined,
    @Body('preferredLocale') preferredLocale: string | undefined,
    @Req() req: any,
  ) {
    return this.meService.updateProfile(req.user.id, { name, preferredLocale });
  }

  @Post('events/:registrationId/cancel')
  cancelMyEvent(@Param('registrationId') registrationId: string, @Req() req: any) {
    if (!registrationId) {
      throw new BadRequestException('registrationId is required');
    }
    return this.meService.cancelEventRegistration(req.user.id, registrationId);
  }

  @Post('events/:registrationId/cancel-request')
  requestCancel(@Param('registrationId') registrationId: string, @Body('reason') reason: string, @Req() req: any) {
    if (!registrationId) {
      throw new BadRequestException('registrationId is required');
    }
    return this.meService.requestCancelRegistration(req.user.id, registrationId, reason);
  }
}
