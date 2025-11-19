import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../auth/permissions.service';
import { Prisma } from '@prisma/client';

interface SaveAssistantLogPayload {
  stage?: string;
  summary?: string | null;
  qaState?: Prisma.InputJsonValue | null;
  messages: Prisma.InputJsonValue;
  aiResult?: Prisma.InputJsonValue | null;
  promptVersion?: string | null;
  status?: string | null;
  turnCount?: number | null;
  language?: string | null;
  meta?: Prisma.InputJsonValue | null;
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
        promptVersion: payload.promptVersion ?? 'coach-v1',
        status: payload.status ?? 'collecting',
        turnCount: payload.turnCount ?? 0,
        language: payload.language ?? null,
        meta: payload.meta ?? Prisma.JsonNull,
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
      promptVersion: log.promptVersion,
      status: log.status,
      turnCount: log.turnCount,
      language: log.language,
      meta: log.meta,
      createdAt: log.createdAt,
    };
  }

  async getDashboard(userId: string, communityId: string, isAdmin: boolean) {
    if (!isAdmin) {
      await this.permissions.assertCommunityManager(userId, communityId);
    }
    const logs = await this.prisma.aiEventDraftLog.findMany({
      where: { communityId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const total = logs.length;
    const ready = logs.filter((log) => log.status === 'ready').length;
    const avgTurns =
      total > 0
        ? Number(
            (
              logs.reduce((sum, log) => sum + (log.turnCount ?? 0), 0) / total
            ).toFixed(1),
          )
        : 0;
    const promptVersions: Record<string, number> = {};
    const languages: Record<string, number> = {};
    logs.forEach((log) => {
      if (log.promptVersion) {
        promptVersions[log.promptVersion] = (promptVersions[log.promptVersion] ?? 0) + 1;
      }
      if (log.language) {
        languages[log.language] = (languages[log.language] ?? 0) + 1;
      }
    });
    return {
      stats: {
        totalSessions: total,
        readySessions: ready,
        readyRate: total ? Number(((ready / total) * 100).toFixed(1)) : 0,
        averageTurns: avgTurns,
        promptVersions,
        languages,
      },
      logs: logs.map((log) => this.serialize(log)),
    };
  }
}
