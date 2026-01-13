/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsService } from '../auth/permissions.service';
import { PaymentsService } from '../payments/payments.service';

@Controller('admin/payments/ops')
@UseGuards(JwtAuthGuard)
export class AdminPaymentsOpsController {
  constructor(private readonly paymentsService: PaymentsService, private readonly permissions: PermissionsService) {}

  @Post(':paymentId/refund')
  async refund(
    @Param('paymentId') paymentId: string,
    @Body('amount') amount: number | undefined,
    @Body('reason') reason: string | undefined,
    @Req() req: any,
  ) {
    await this.permissions.assertAdmin(req.user.id);
    return this.paymentsService.refundStripePaymentInternal(req.user.id, paymentId, amount, reason);
  }

  @Post(':paymentId/diagnose')
  async diagnose(@Param('paymentId') paymentId: string, @Req() req: any) {
    await this.permissions.assertAdmin(req.user.id);
    return this.paymentsService.diagnoseStripePayment(paymentId);
  }

  @Post('consistency/scan')
  async scanConsistency(
    @Body('sinceDays') sinceDays: number | undefined,
    @Body('limit') limit: number | undefined,
    @Req() req: any,
  ) {
    await this.permissions.assertAdmin(req.user.id);
    return this.paymentsService.scanPaymentInconsistencies({ sinceDays, limit });
  }

  @Post('consistency/reconcile')
  async reconcileConsistency(
    @Body('sinceDays') sinceDays: number | undefined,
    @Body('limit') limit: number | undefined,
    @Body('dryRun') dryRun: boolean | undefined,
    @Req() req: any,
  ) {
    await this.permissions.assertAdmin(req.user.id);
    return this.paymentsService.reconcilePaymentInconsistencies({ sinceDays, limit, dryRun });
  }
}
