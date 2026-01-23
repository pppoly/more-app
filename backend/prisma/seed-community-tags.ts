import { PrismaClient } from '@prisma/client';
import {
  COMMUNITY_TAG_TAXONOMY,
  type CommunityTagCategoryInput,
  type CommunityTagInput,
} from '../src/communities/community-tags.taxonomy';

const prisma = new PrismaClient();

async function upsertCategory(category: CommunityTagCategoryInput) {
  const existing = await prisma.communityTagCategory.findFirst({ where: { nameJa: category.nameJa } });
  if (existing) {
    const updated = await prisma.communityTagCategory.update({
      where: { id: existing.id },
      data: {
        nameZh: category.nameZh ?? null,
        nameEn: category.nameEn ?? null,
        order: category.order,
        active: true,
      },
    });
    return updated.id;
  }

  const created = await prisma.communityTagCategory.create({
    data: {
      nameJa: category.nameJa,
      nameZh: category.nameZh ?? null,
      nameEn: category.nameEn ?? null,
      order: category.order,
      active: true,
    },
  });
  return created.id;
}

async function upsertTag(categoryId: string, tag: CommunityTagInput, order: number) {
  const existing = await prisma.communityTag.findFirst({
    where: { categoryId, nameJa: tag.nameJa },
  });
  if (existing) {
    await prisma.communityTag.update({
      where: { id: existing.id },
      data: {
        nameZh: tag.nameZh ?? null,
        nameEn: tag.nameEn ?? null,
        order,
        active: true,
      },
    });
    return existing.id;
  }
  const created = await prisma.communityTag.create({
    data: {
      categoryId,
      nameJa: tag.nameJa,
      nameZh: tag.nameZh ?? null,
      nameEn: tag.nameEn ?? null,
      order,
      active: true,
    },
  });
  return created.id;
}

async function main() {
  for (const category of COMMUNITY_TAG_TAXONOMY) {
    const categoryId = await upsertCategory(category);
    for (const [idx, tag] of category.tags.entries()) {
      await upsertTag(categoryId, tag, idx + 1);
    }
  }

  const totalCategories = await prisma.communityTagCategory.count();
  const totalTags = await prisma.communityTag.count();
  // eslint-disable-next-line no-console
  console.log(`Seeded community tag taxonomy. Categories: ${totalCategories}, Tags: ${totalTags}`);
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Failed to seed community tags', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
