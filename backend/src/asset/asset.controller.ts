/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars */
import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AssetService } from './asset.service';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { BindAssetDto } from './dto/bind-asset.dto';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('assets')
@UseGuards(JwtAuthGuard)
export class AssetController {
  constructor(private readonly assetService: AssetService) {}

  @Post('presign')
  presign(@Body() dto: PresignUploadDto, @Req() req: Request & { user?: any }) {
    const userId = req.user?.id;
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'];
    return this.assetService.presign(dto, { userId, tenantId: String(tenantId) });
  }

  @Post('confirm-upload')
  confirm(@Body() dto: ConfirmUploadDto, @Req() req: Request & { user?: any }) {
    const userId = req.user?.id;
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'];
    return this.assetService.confirmUpload(dto, { userId, tenantId: String(tenantId) });
  }

  @Post('bind')
  bind(@Body() dto: BindAssetDto, @Req() req: Request & { user?: any }) {
    const userId = req.user?.id;
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'];
    return this.assetService.bindAsset(dto, { userId, tenantId: String(tenantId) });
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    const userId = req.user?.id;
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'];
    return this.assetService.softDelete(id, { userId, tenantId: String(tenantId) });
  }

  @Get(':id')
  getOne(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    const userId = req.user?.id;
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'];
    return this.assetService.getAsset(id, { userId, tenantId: String(tenantId) });
  }
}
