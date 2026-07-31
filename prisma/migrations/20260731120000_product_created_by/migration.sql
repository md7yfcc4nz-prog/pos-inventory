-- AlterTable
ALTER TABLE "Product" ADD COLUMN "createdById" TEXT;

-- CreateIndex
CREATE INDEX "Product_createdById_idx" ON "Product"("createdById");
