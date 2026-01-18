/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsService } from '../auth/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('admin/community-tags')
export class AdminCommunityTagsController {
  constructor(private readonly prisma: PrismaService, private readonly permissions: PermissionsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@Req() req: any) {
    await this.permissions.assertAdmin(req.user.id);
    return this.prisma.communityTagCategory.findMany({
      orderBy: { order: 'asc' },
      include: {
        tags: { where: { }, orderBy: { order: 'asc' } },
      },
    });
  }

  @Post('categories')
  @UseGuards(JwtAuthGuard)
  async createCategory(
    @Req() req: any,
    @Body()
    body: {
      nameJa: string;
      nameEn?: string | null;
      nameZh?: string | null;
      order?: number;
      active?: boolean;
    },
  ) {
    await this.permissions.assertAdmin(req.user.id);
    return this.prisma.communityTagCategory.create({
      data: {
        nameJa: body.nameJa?.trim(),
        nameEn: body.nameEn?.trim() || null,
        nameZh: body.nameZh?.trim() || null,
        order: body.order ?? 1000,
        active: body.active ?? true,
      },
    });
  }

  @Patch('categories/:id')
  @UseGuards(JwtAuthGuard)
  async updateCategory(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      nameJa?: string;
      nameEn?: string | null;
      nameZh?: string | null;
      order?: number;
      active?: boolean;
    },
  ) {
    await this.permissions.assertAdmin(req.user.id);
    const data: any = {};
    if (body.nameJa !== undefined) data.nameJa = body.nameJa?.trim();
    if (body.nameEn !== undefined) data.nameEn = body.nameEn?.trim() || null;
    if (body.nameZh !== undefined) data.nameZh = body.nameZh?.trim() || null;
    if (body.order !== undefined) data.order = body.order;
    if (body.active !== undefined) data.active = body.active;
    return this.prisma.communityTagCategory.update({ where: { id }, data });
  }

  @Post('categories/:id/tags')
  @UseGuards(JwtAuthGuard)
  async createTag(
    @Req() req: any,
    @Param('id') categoryId: string,
    @Body()
    body: { nameJa: string; nameEn?: string | null; nameZh?: string | null; order?: number; active?: boolean },
  ) {
    await this.permissions.assertAdmin(req.user.id);
    return this.prisma.communityTag.create({
      data: {
        categoryId,
        nameJa: body.nameJa?.trim(),
        nameEn: body.nameEn?.trim() || null,
        nameZh: body.nameZh?.trim() || null,
        order: body.order ?? 1000,
        active: body.active ?? true,
      },
    });
  }

  @Patch('tags/:id')
  @UseGuards(JwtAuthGuard)
  async updateTag(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: { nameJa?: string; nameEn?: string | null; nameZh?: string | null; order?: number; active?: boolean },
  ) {
    await this.permissions.assertAdmin(req.user.id);
    const data: any = {};
    if (body.nameJa !== undefined) data.nameJa = body.nameJa?.trim();
    if (body.nameEn !== undefined) data.nameEn = body.nameEn?.trim() || null;
    if (body.nameZh !== undefined) data.nameZh = body.nameZh?.trim() || null;
    if (body.order !== undefined) data.order = body.order;
    if (body.active !== undefined) data.active = body.active;
    return this.prisma.communityTag.update({ where: { id }, data });
  }
}
