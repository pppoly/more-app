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
