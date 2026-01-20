import { BadRequestException, Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConsoleEventsService } from './console-events.service';

type AuthedRequest = { user: { id: string } };

@Controller('console')
@UseGuards(JwtAuthGuard)
export class ConsoleRefundRequestsController {
  constructor(private readonly consoleEventsService: ConsoleEventsService) {}

  @Post('refund-requests/:requestId/decision')
  decideRefund(
    @Param('requestId') requestId: string,
    @Body('decision') decision: 'approve_full' | 'approve_partial' | 'reject',
    @Body('amount') amount: number | undefined,
    @Body('reason') reason: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    if (!requestId) {
      throw new BadRequestException('requestId is required');
    }
    if (!decision) {
      throw new BadRequestException('decision is required');
    }
    return this.consoleEventsService.decideRefundRequest(req.user.id, requestId, { decision, amount, reason });
  }
}
