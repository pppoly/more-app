/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-floating-promises, @typescript-eslint/unbound-method */
import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService } from '../payments/payments.service';

@Controller('console')
@UseGuards(JwtAuthGuard)
export class ConsolePaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('communities/:communityId/payments')
  listPayments(
    @Param('communityId') communityId: string,
    @Req() req: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('eventId') eventId?: string,
    @Query('status') status?: string,
  ) {
    return this.paymentsService.listCommunityPayments(req.user.id, communityId, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      eventId: eventId || undefined,
      status: status || undefined,
    });
  }

  @Get('communities/:communityId/balance')
  getBalance(@Param('communityId') communityId: string, @Req() req: any, @Query('period') period?: string) {
    return this.paymentsService.getCommunityBalance(req.user.id, communityId, period);
  }

  @Post('payments/:paymentId/refund')
  refundPayment(
    @Param('paymentId') paymentId: string,
    @Req() req: any,
    @Body('amount') amount?: number,
    @Body('reason') reason?: string,
  ) {
    if (amount !== undefined && Number.isNaN(Number(amount))) {
      throw new BadRequestException('amount must be a number');
    }
    return this.paymentsService.refundStripePaymentInternal(
      req.user.id,
      paymentId,
      amount !== undefined ? Number(amount) : undefined,
      reason,
    );
  }
}
