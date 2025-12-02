import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsService } from '../auth/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConsoleEventsService } from '../console/console-events.service';

@Controller('admin/events')
@UseGuards(JwtAuthGuard)
export class AdminEventsListController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly consoleEventsService: ConsoleEventsService,
  ) {}

  @Get()
  async list(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    await this.permissions.assertAdmin(req.user.id);
    const pageNum = Math.max(1, Number(page) || 1);
    const size = Math.min(50, Math.max(1, Number(pageSize) || 20));
    const where: any = {};
    if (status) {
      where.status = status;
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (pageNum - 1) * size,
        take: size,
        select: {
          id: true,
          title: true,
          status: true,
          reviewStatus: true,
          reviewReason: true,
          community: { select: { id: true, name: true } },
          startTime: true,
          endTime: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.event.count({ where }),
    ]);
    return { page: pageNum, pageSize: size, total, items };
  }

  @Post(':eventId/approve')
  approve(@Param('eventId') eventId: string, @Req() req: any) {
    return this.consoleEventsService.approveEvent(eventId, req.user.id);
  }

  @Post(':eventId/reject')
  reject(@Param('eventId') eventId: string, @Body('reason') reason: string, @Req() req: any) {
    return this.consoleEventsService.rejectEvent(eventId, req.user.id, reason);
  }

  @Post(':eventId/close')
  close(@Param('eventId') eventId: string, @Req() req: any) {
    return this.consoleEventsService.closeEvent(eventId, req.user.id);
  }

  @Post(':eventId/cancel')
  cancel(@Param('eventId') eventId: string, @Body('reason') reason: string, @Req() req: any) {
    return this.consoleEventsService.cancelEvent(eventId, req.user.id, { reason, notify: false });
  }
}
