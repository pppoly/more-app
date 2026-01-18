/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-redundant-type-constituents */
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../auth/permissions.service';
import { Prisma } from '@prisma/client';
import { mergeAssistantMessages } from './assistant-log.utils';

interface SaveAssistantLogPayload {
  logId?: string | null;
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
    const shouldUpdate = payload.logId;
    if (shouldUpdate) {
      const existing = await this.prisma.aiEventDraftLog.findUnique({
        where: { id: payload.logId as string },
      });
      if (!existing) {
        throw new NotFoundException('assistant log not found');
      }
      if (existing.communityId !== communityId || existing.userId !== userId) {
        throw new ForbiddenException('not your assistant log');
      }
      const storedTurn = existing.turnCount ?? 0;
      const incomingTurn = payload.turnCount ?? storedTurn;
      if (incomingTurn < storedTurn) {
        return this.serialize(existing);
      }
      const safeJson = (value: Prisma.InputJsonValue | null | undefined) =>
        value === null ? Prisma.JsonNull : value ?? Prisma.JsonNull;
      const mergedMessages =
        payload.messages !== undefined
          ? mergeAssistantMessages(existing.messages, payload.messages)
          : existing.messages;
      const updated = await this.prisma.aiEventDraftLog.update({
        where: { id: existing.id },
        data: {
          stage: payload.stage ?? existing.stage,
          summary: payload.summary ?? existing.summary,
          qaState: safeJson(payload.qaState ?? existing.qaState),
          messages: mergedMessages as Prisma.InputJsonValue,
          aiResult: safeJson(payload.aiResult ?? existing.aiResult),
          promptVersion: payload.promptVersion ?? existing.promptVersion,
          status: payload.status ?? existing.status,
          turnCount: incomingTurn,
          language: payload.language ?? existing.language,
          meta: safeJson(payload.meta ?? existing.meta),
        },
        include: {
          user: { select: { id: true, name: true } },
        },
      });
      return this.serialize(updated);
    }
    const initialMessages = mergeAssistantMessages([], payload.messages ?? []);
    const log = await this.prisma.aiEventDraftLog.create({
      data: {
        communityId,
        userId,
        stage: payload.stage ?? 'writer',
        summary: payload.summary ?? null,
        qaState: payload.qaState ?? Prisma.JsonNull,
        messages: initialMessages as Prisma.InputJsonValue,
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

  async getLog(userId: string, communityId: string, logId: string) {
    await this.permissions.assertCommunityManager(userId, communityId);
    const log = await this.prisma.aiEventDraftLog.findUnique({
      where: { id: logId },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!log) {
      throw new NotFoundException('assistant log not found');
    }
    if (log.communityId !== communityId || log.userId !== userId) {
      throw new ForbiddenException('not your assistant log');
    }
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
