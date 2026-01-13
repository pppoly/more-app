/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars */
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { PromptDefinition } from './prompt.entity';

const DEFAULT_PROMPTS_PATH = join(__dirname, 'prompts', 'default-prompts.json');
const WRITABLE_PROMPTS_PATH = join(process.cwd(), 'generated', 'prompts.json');

@Injectable()
export class PromptStoreService {
  private cache: PromptDefinition[] | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getAll(): Promise<PromptDefinition[]> {
    if (this.cache) return this.cache;
    this.cache = await this.loadPrompts();
    return this.cache;
  }

  async upsert(prompts: PromptDefinition[], actorId?: string): Promise<PromptDefinition[]> {
    await this.ensureWritableDir();
    await this.writeDb(prompts, actorId);
    await fs.writeFile(WRITABLE_PROMPTS_PATH, JSON.stringify(prompts, null, 2), 'utf8');
    this.cache = prompts;
    await this.appendAudit(prompts, actorId);
    return this.cache;
  }

  private async loadPrompts(): Promise<PromptDefinition[]> {
    const fromDefault = await this.readIfExists(DEFAULT_PROMPTS_PATH);
    const fromWritable = await this.readIfExists(WRITABLE_PROMPTS_PATH);
    const fromDb = await this.readDb();
    const merged = new Map<string, PromptDefinition>();

    (fromDefault ?? []).forEach((p) => merged.set(p.id, p));
    (fromWritable ?? []).forEach((p) => merged.set(p.id, p));
    (fromDb ?? []).forEach((p) => merged.set(p.id, p));

    return Array.from(merged.values());
  }

  private async readIfExists(path: string): Promise<PromptDefinition[] | null> {
    try {
      const content = await fs.readFile(path, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed as PromptDefinition[];
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new InternalServerErrorException('Failed to read prompts');
      }
    }
    return null;
  }

  private async ensureWritableDir() {
    const dir = join(process.cwd(), 'generated');
    await fs.mkdir(dir, { recursive: true });
  }

  private async appendAudit(prompts: PromptDefinition[], actorId?: string) {
    try {
      await this.prisma.promptAuditLog.createMany({
        data: prompts.map((p) => ({
          promptId: p.id,
          version: p.version ?? null,
          action: 'update',
          actorId: actorId ?? null,
          notes: p.description ?? null,
        })),
      });
    } catch (err) {
      // best effort, do not block
      // eslint-disable-next-line no-console
      console.warn('prompt audit failed', err);
    }
  }

  private mapDbToDefinition(db: any): PromptDefinition {
    return {
      id: db.id,
      name: db.name,
      description: db.description ?? '',
      version: db.version ?? '',
      system: db.system,
      instructions: db.instructions ?? '',
      params: Array.isArray(db.params) ? db.params : [],
      tags: Array.isArray(db.tags) ? db.tags : [],
      meta: (db.meta as Record<string, any>) ?? {},
      status: db.status ?? 'draft',
      approvedById: db.approvedById ?? null,
      approvedAt: db.approvedAt ? db.approvedAt.toISOString?.() ?? db.approvedAt : null,
    };
  }

  private mapDefinitionToDb(prompt: PromptDefinition, actorId?: string) {
    return {
      id: prompt.id,
      name: prompt.name,
      description: prompt.description ?? '',
      version: prompt.version ?? '',
      system: prompt.system,
      instructions: prompt.instructions ?? '',
      params: prompt.params ?? [],
      tags: prompt.tags ?? [],
      meta: prompt.meta ?? {},
      status: (prompt as any).status ?? 'draft',
      updatedById: actorId ?? null,
      createdById: actorId ?? null,
      approvedById: (prompt as any).approvedById ?? null,
      approvedAt: (prompt as any).approvedAt ?? null,
    };
  }

  private async readDb(): Promise<PromptDefinition[] | null> {
    try {
      const rows = await this.prisma.promptDefinition.findMany();
      if (!rows?.length) return null;
      return rows.map((row) => this.mapDbToDefinition(row));
    } catch (err: any) {
      if (err?.code === 'P2021' || err?.code === 'P2022' || err?.code === 'P2023') {
        // table not found or schema mismatch, fallback
        return null;
      }
      console.warn('readDb prompts failed, fallback to file', err);
      return null;
    }
  }

  private async writeDb(prompts: PromptDefinition[], actorId?: string) {
    try {
      await this.prisma.$transaction([
        this.prisma.promptDefinition.deleteMany({}),
        ...prompts.map((p) =>
          this.prisma.promptDefinition.create({
            data: this.mapDefinitionToDb(p, actorId),
          }),
        ),
      ]);
    } catch (err: any) {
      if (err?.code === 'P2021' || err?.code === 'P2022' || err?.code === 'P2023') {
        // table missing, ignore to allow fallback
        return;
      }
      console.warn('writeDb prompts failed, continue writing file only', err);
    }
  }
}
