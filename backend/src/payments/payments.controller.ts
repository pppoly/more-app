import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService } from './payments.service';

interface MockPaymentDto {
  registrationId: string;
}

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('mock')
  createMockPayment(@Req() req: any, @Body() body: MockPaymentDto) {
    return this.paymentsService.createMockPayment(req.user.id, body.registrationId);
  }
}
