/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsService } from '../auth/permissions.service';
import { SettlementService } from '../payments/settlement.service';
import type { Response } from 'express';

@Controller('admin/settlements')
@UseGuards(JwtAuthGuard)
export class AdminSettlementsController {
  constructor(private readonly settlementService: SettlementService, private readonly permissions: PermissionsService) {}

  @Get('config')
  async config(@Req() req: any) {
    await this.permissions.assertAdmin(req.user.id);
    return this.settlementService.getAdminSettlementConfig();
  }

  @Get('batches')
  async list(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    await this.permissions.assertAdmin(req.user.id);
    return this.settlementService.listAdminSettlementBatches({
      status: status || undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('batches/:batchId')
  async getBatch(@Param('batchId') batchId: string, @Req() req: any) {
    await this.permissions.assertAdmin(req.user.id);
    return this.settlementService.getAdminSettlementBatch(batchId);
  }

  @Get('batches/:batchId/export')
  async exportBatch(
    @Param('batchId') batchId: string,
    @Query('format') format = 'csv',
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.permissions.assertAdmin(req.user.id);
    if (format !== 'csv') {
      throw new BadRequestException('Unsupported export format');
    }
    const { filename, csv } = await this.settlementService.exportAdminSettlementBatchCsv(batchId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  }

  @Post('run')
  @HttpCode(200)
  async run(@Req() req: any, @Body('periodFrom') periodFrom?: string, @Body('periodTo') periodTo?: string) {
    await this.permissions.assertAdmin(req.user.id);

    const config = this.settlementService.getAdminSettlementConfig();
    let periodFromDate: Date;
    let periodToDate: Date;

    if ((periodFrom && !periodTo) || (!periodFrom && periodTo)) {
      throw new BadRequestException('periodFrom and periodTo must be both provided');
    }

    if (periodFrom && periodTo) {
      periodFromDate = new Date(periodFrom);
      periodToDate = new Date(periodTo);
      if (Number.isNaN(periodFromDate.getTime()) || Number.isNaN(periodToDate.getTime())) {
        throw new BadRequestException('Invalid periodFrom/periodTo');
      }
      if (periodFromDate >= periodToDate) {
        throw new BadRequestException('periodFrom must be before periodTo');
      }
    } else {
      periodToDate = new Date();
      periodFromDate = new Date(periodToDate.getTime() - config.settlementWindowDays * 24 * 60 * 60 * 1000);
    }

    return this.settlementService.runSettlementBatch({
      periodFrom: periodFromDate,
      periodTo: periodToDate,
      trigger: { type: 'manual', userId: req.user.id },
    });
  }

  @Post('batches/:batchId/retry')
  @HttpCode(200)
  async retry(@Param('batchId') batchId: string, @Req() req: any) {
    await this.permissions.assertAdmin(req.user.id);
    return this.settlementService.retrySettlementBatch(batchId);
  }
}

