-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requiresExpiry" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_key_key" ON "ProductCategory"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_name_key" ON "ProductCategory"("name");

-- Seed default categories used by existing products
INSERT INTO "ProductCategory" ("id", "key", "name", "requiresExpiry", "createdAt", "updatedAt")
VALUES
  ('cat_drinks', 'DRINKS', 'Drinks', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat_medicine', 'MEDICINE', 'Medicine', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat_other', 'OTHER', 'Other', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
