import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../auth/permissions.service';
import { Prisma } from '@prisma/client';

interface SaveAssistantLogPayload {
  stage?: string;
  summary?: string;
  qaState?: Prisma.InputJsonValue | null;
  messages: Prisma.InputJsonValue;
  aiResult?: Prisma.InputJsonValue | null;
}

@Injectable()
export class ConsoleEventAssistantService {
  constructor(private readonly prisma: PrismaService, private readonly permissions: PermissionsService) {}

  async saveLog(userId: string, communityId: string, payload: SaveAssistantLogPayload) {
    await this.permissions.assertCommunityManager(userId, communityId);
    const log = await this.prisma.aiEventDraftLog.create({
      data: {
        communityId,
        userId,
        stage: payload.stage ?? 'writer',
        summary: payload.summary ?? null,
        qaState: payload.qaState ?? Prisma.JsonNull,
        messages: payload.messages,
        aiResult: payload.aiResult ?? Prisma.JsonNull,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });
    return this.serialize(log);
  }

  async listLogs(userId: string, communityId: string, limit = 50) {
    await this.permissions.assertCommunityManager(userId, communityId);
    const logs = await this.prisma.aiEventDraftLog.findMany({
      where: { communityId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { id: true, name: true } },
      },
    });
    return logs.map((log) => this.serialize(log));
  }

  private serialize(log: any) {
    return {
      id: log.id,
      communityId: log.communityId,
      userId: log.userId,
      user: log.user ? { id: log.user.id, name: log.user.name } : null,
      stage: log.stage,
      summary: log.summary,
      qaState: log.qaState,
      messages: log.messages,
      aiResult: log.aiResult,
      createdAt: log.createdAt,
    };
  }
}
