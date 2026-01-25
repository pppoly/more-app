/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsService } from '../auth/permissions.service';
import { NotificationService } from '../notifications/notification.service';

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
}
