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
}
