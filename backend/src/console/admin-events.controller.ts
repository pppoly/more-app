/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-redundant-type-constituents */
import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsService } from '../auth/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConsoleEventsService } from './console-events.service';

@Controller('admin/events')
@UseGuards(JwtAuthGuard)
export class AdminEventsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly consoleEventsService: ConsoleEventsService,
  ) {}

  @Get('reviews')
  async listPendingReviews(@Req() req: any) {
    await this.permissions.assertAdmin(req.user.id);
    const events = await this.prisma.event.findMany({
      where: { reviewStatus: { in: ['pending_review', 'rejected'] } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        title: true,
        status: true,
        reviewStatus: true,
        reviewReason: true,
        createdAt: true,
        updatedAt: true,
        community: { select: { id: true, name: true, slug: true } },
      },
    });
    return events.map((ev) => ({
      id: ev.id,
      title: ev.title,
      status: ev.status,
      reviewStatus: ev.reviewStatus,
      reviewReason: ev.reviewReason,
      updatedAt: ev.updatedAt,
      community: ev.community,
    }));
  }

  @Post(':eventId/approve')
  async approve(@Param('eventId') eventId: string, @Req() req: any) {
    return this.consoleEventsService.approveEvent(eventId, req.user.id);
  }

  @Post(':eventId/reject')
  async reject(@Param('eventId') eventId: string, @Body('reason') reason: string, @Req() req: any) {
    return this.consoleEventsService.rejectEvent(eventId, req.user.id, reason);
  }
}
