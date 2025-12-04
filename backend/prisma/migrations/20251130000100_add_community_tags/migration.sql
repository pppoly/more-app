-- Add community tag categories (multilingual) and tags
CREATE TABLE "CommunityTagCategory" (
    "id" TEXT NOT NULL,
    "nameJa" TEXT NOT NULL,
    "nameEn" TEXT,
    "nameZh" TEXT,
    "order" INTEGER NOT NULL DEFAULT 1000,
    "active" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommunityTagCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunityTag" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "nameJa" TEXT NOT NULL,
    "nameEn" TEXT,
    "nameZh" TEXT,
    "order" INTEGER NOT NULL DEFAULT 1000,
    "active" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommunityTag_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CommunityTag_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CommunityTagCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "CommunityTag_categoryId_idx" ON "CommunityTag"("categoryId");
