import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { extname, join } from 'path';
import { promises as fs } from 'fs';
import type { Express } from 'express';
import { UPLOAD_ROOT } from '../common/storage/upload-root';

const AVATAR_UPLOAD_ROOT = join(UPLOAD_ROOT, 'avatars');
const DEFAULT_SUPPORTED_LANGS = ['ja', 'en', 'zh', 'vi', 'ko', 'tl', 'pt-br', 'ne', 'id', 'th', 'zh-tw', 'my'];

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyEvents(userId: string) {
    const registrations = await this.prisma.eventRegistration.findMany({
      where: {
        userId,
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
            galleries: {
              orderBy: { order: 'asc' },
              take: 1,
              select: {
                imageUrl: true,
              },
            },
          },
        },
      },
    });

    return registrations.map((registration) => {
      const { event, ...rest } = registration;
      const galleries = (event as any)?.galleries ?? [];
      const coverImageUrl = galleries[0]?.imageUrl ?? null;
      const { galleries: _omit, ...eventData } = event as typeof event & {
        galleries?: { imageUrl: string | null }[];
      };
      return {
        registrationId: rest.id,
        status: rest.status,
        paymentStatus: rest.paymentStatus,
        amount: rest.amount,
        attended: rest.attended,
        noShow: rest.noShow,
        event: {
          ...eventData,
          coverImageUrl,
        },
      };
    });
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
        preferredLocale: true,
        prefecture: true,
        avatarUrl: true,
        isOrganizer: true,
        isAdmin: true,
      },
    });
  }

  async updateProfile(userId: string, payload: { name?: string | undefined; preferredLocale?: string | undefined }) {
    const data: Record<string, any> = {};
    if (payload.name !== undefined) {
      const trimmed = payload.name.trim();
      if (!trimmed) {
        throw new BadRequestException('表示名を入力してください');
      }
      data.name = trimmed;
    }
    if (payload.preferredLocale !== undefined) {
      const supported = this.getSupportedLocales();
      const normalized = payload.preferredLocale.trim().toLowerCase();
      if (!supported.includes(normalized)) {
        throw new BadRequestException('サポートされていない言語です');
      }
      data.preferredLocale = normalized;
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
        preferredLocale: true,
        prefecture: true,
        avatarUrl: true,
        isOrganizer: true,
        isAdmin: true,
      },
    });
  }

  async cancelEventRegistration(userId: string, registrationId: string) {
    const registration = await this.prisma.eventRegistration.findFirst({
      where: {
        id: registrationId,
        userId,
        status: { not: 'cancelled' },
      },
      select: {
        id: true,
        amount: true,
        paymentStatus: true,
        event: {
          select: { startTime: true },
        },
      },
    });

    if (!registration) {
      throw new NotFoundException('キャンセル可能な申込が見つかりません');
    }

    if (new Date(registration.event.startTime) <= new Date()) {
      throw new BadRequestException('イベント開始後はキャンセルできません');
    }

    if ((registration.amount ?? 0) > 0 && registration.paymentStatus === 'paid') {
      throw new BadRequestException('有料イベントのキャンセルはサポートにお問い合わせください');
    }

    await this.prisma.eventRegistration.update({
      where: { id: registrationId },
      data: { status: 'cancelled' },
    });

    return { registrationId, status: 'cancelled' };
  }

  private getSupportedLocales() {
    const configured = process.env.SUPPORTED_LANGUAGES;
    const list = configured
      ? configured
          .split(',')
          .map((l) => l.trim().toLowerCase())
          .filter(Boolean)
      : DEFAULT_SUPPORTED_LANGS;
    return Array.from(new Set(list));
  }
}
