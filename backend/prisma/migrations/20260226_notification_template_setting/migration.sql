-- Store admin-controlled notification template enablement.
CREATE TABLE "NotificationTemplateSetting" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "NotificationTemplateSetting_type_key" ON "NotificationTemplateSetting"("type");
