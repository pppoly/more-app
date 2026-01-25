/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { BadRequestException, Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsService } from '../auth/permissions.service';
import { NotificationService } from '../notifications/notification.service';
import { NotificationType } from '../notifications/notification.types';

@Controller('admin/notifications')
@UseGuards(JwtAuthGuard)
export class AdminNotificationsController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly permissions: PermissionsService,
  ) {}

  @Post('test-email')
  async sendTestEmail(
    @Req() req: any,
    @Body()
    body:
      | { toEmail?: string; toName?: string; subject?: string; body?: string; dryRun?: boolean }
      | undefined,
  ) {
    await this.permissions.assertAdmin(req.user.id);
    return this.notifications.sendTestEmail({
      toEmail: body?.toEmail || '',
      toName: body?.toName,
      subject: body?.subject,
      body: body?.body,
      dryRun: Boolean(body?.dryRun),
    });
  }

  @Get('templates')
  async listTemplates(@Req() req: any) {
    await this.permissions.assertAdmin(req.user.id);
    return this.notifications.listTemplateSettings();
  }

  @Put('templates/:type')
  async updateTemplate(
    @Req() req: any,
    @Param('type') type: string,
    @Body() body: { enabled?: boolean } | undefined,
  ) {
    await this.permissions.assertAdmin(req.user.id);
    if (typeof body?.enabled !== 'boolean') {
      throw new BadRequestException('enabled is required');
    }
    return this.notifications.updateTemplateSetting(type as NotificationType, body.enabled);
  }

  @Post('event-reminders')
  async sendEventReminders(
    @Req() req: any,
    @Body() body: { targetDate?: string; dryRun?: boolean } | undefined,
  ) {
    await this.permissions.assertAdmin(req.user.id);
    return this.notifications.sendEventReminders({
      targetDate: body?.targetDate,
      dryRun: Boolean(body?.dryRun),
    });
  }

  @Post('organizer-event-reminders')
  async sendOrganizerEventReminders(
    @Req() req: any,
    @Body() body: { targetDate?: string; dryRun?: boolean } | undefined,
  ) {
    await this.permissions.assertAdmin(req.user.id);
    return this.notifications.sendOrganizerEventReminders({
      targetDate: body?.targetDate,
      dryRun: Boolean(body?.dryRun),
    });
  }
}
