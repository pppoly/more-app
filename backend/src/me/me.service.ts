import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { extname, join } from 'path';
import { promises as fs } from 'fs';
import type { Express } from 'express';

const AVATAR_UPLOAD_ROOT = join(process.cwd(), 'uploads', 'avatars');

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyEvents(userId: string) {
    const registrations = await this.prisma.eventRegistration.findMany({
      where: {
        userId,
        NOT: { status: 'cancelled' },
      },
      orderBy: {
        event: {
          startTime: 'asc',
        },
      },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        amount: true,
        attended: true,
        noShow: true,
        event: {
          select: {
            id: true,
            startTime: true,
            endTime: true,
            locationText: true,
            title: true,
            community: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    return registrations.map((registration) => ({
      registrationId: registration.id,
      status: registration.status,
      paymentStatus: registration.paymentStatus,
      amount: registration.amount,
      attended: registration.attended,
      noShow: registration.noShow,
      event: registration.event,
    }));
  }

  async updateAvatar(userId: string, file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('無効な画像ファイルです');
    }
    await fs.mkdir(AVATAR_UPLOAD_ROOT, { recursive: true });
    const userDir = join(AVATAR_UPLOAD_ROOT, userId);
    await fs.mkdir(userDir, { recursive: true });
    const extension = extname(file.originalname?.toLowerCase() || '') || '.jpg';
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`;
    const filePath = join(userDir, filename);
    await fs.writeFile(filePath, file.buffer);
    const avatarUrl = `/uploads/avatars/${userId}/${filename}`;
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: {
        id: true,
        name: true,
        language: true,
        prefecture: true,
        avatarUrl: true,
        isOrganizer: true,
        isAdmin: true,
      },
    });
  }

  async updateProfile(userId: string, payload: { name?: string | undefined }) {
    const data: Record<string, any> = {};
    if (payload.name !== undefined) {
      const trimmed = payload.name.trim();
      if (!trimmed) {
        throw new BadRequestException('表示名を入力してください');
      }
      data.name = trimmed;
    }
    if (!Object.keys(data).length) {
      throw new BadRequestException('更新する項目が未指定です');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        name: true,
        language: true,
        prefecture: true,
        avatarUrl: true,
        isOrganizer: true,
        isAdmin: true,
      },
    });
  }
}
