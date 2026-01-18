/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsService } from '../auth/permissions.service';
import { PaymentsService } from '../payments/payments.service';

@Controller('admin/payments')
@UseGuards(JwtAuthGuard)
export class AdminPaymentsController {
  constructor(private readonly paymentsService: PaymentsService, private readonly permissions: PermissionsService) {}

  @Get()
  async list(
    @Req() req: any,
    @Query('communityId') communityId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    await this.permissions.assertAdmin(req.user.id);
    return this.paymentsService.listAdminPayments({
      communityId: communityId || undefined,
      status: status || undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}
