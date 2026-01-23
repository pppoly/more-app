import { PrismaClient } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  COMMUNITY_TAG_TAXONOMY,
  type CommunityTagCategoryInput,
  type CommunityTagInput,
} from '../src/communities/community-tags.taxonomy';

type ExportTag = CommunityTagInput & { order: number; active: boolean };
type ExportCategory = Omit<CommunityTagCategoryInput, 'tags'> & {
  tags: ExportTag[];
  active: boolean;
};

const readArgValue = (name: string) => {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  const value = process.argv[idx + 1];
  return value && !value.startsWith('-') ? value : undefined;
};

const hasFlag = (name: string) => process.argv.includes(name);

const exportFromSeed = (): ExportCategory[] =>
  COMMUNITY_TAG_TAXONOMY.map((category) => ({
    nameJa: category.nameJa,
    nameZh: category.nameZh ?? null,
    nameEn: category.nameEn ?? null,
    order: category.order,
    active: true,
    tags: category.tags.map((tag, idx) => ({
      nameJa: tag.nameJa,
      nameZh: tag.nameZh ?? null,
      nameEn: tag.nameEn ?? null,
      order: idx + 1,
      active: true,
    })),
  }));

const exportFromDb = async (prisma: PrismaClient, includeInactive: boolean): Promise<ExportCategory[]> => {
  const activeOnly = !includeInactive;
  const categories = await prisma.communityTagCategory.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: { order: 'asc' },
    include: {
      tags: {
        where: activeOnly ? { active: true } : undefined,
        orderBy: { order: 'asc' },
      },
    },
  });

  return categories.map((category) => ({
    nameJa: category.nameJa,
    nameZh: category.nameZh ?? null,
    nameEn: category.nameEn ?? null,
    order: category.order,
    active: category.active,
    tags: category.tags.map((tag) => ({
      nameJa: tag.nameJa,
      nameZh: tag.nameZh ?? null,
      nameEn: tag.nameEn ?? null,
      order: tag.order,
      active: tag.active,
    })),
  }));
};

async function main() {
  const includeInactive = hasFlag('--includeInactive');
  const source = (readArgValue('--source') ?? 'auto') as 'auto' | 'db' | 'seed';
  const outArg = readArgValue('--out') ?? readArgValue('-o');
  const outPath = outArg
    ? path.resolve(process.cwd(), outArg)
    : path.resolve(__dirname, '../../tmp/community-tags.json');

  let exported: ExportCategory[];

  if (source === 'seed') {
    exported = exportFromSeed();
  } else {
    const prisma = new PrismaClient();
    try {
      exported = await exportFromDb(prisma, includeInactive);
    } catch (error) {
      if (source === 'db') {
        throw error;
      }
      // eslint-disable-next-line no-console
      console.warn('[export-community-tags] DB export failed; falling back to seed taxonomy.');
      exported = exportFromSeed();
    } finally {
      await prisma.$disconnect().catch(() => {});
    }
  }

  const payload = `${JSON.stringify(exported, null, 2)}\n`;
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, payload, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`Exported community tags: ${outPath}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[export-community-tags] Failed', error instanceof Error ? error.message : String(error));
  process.exit(1);
});

