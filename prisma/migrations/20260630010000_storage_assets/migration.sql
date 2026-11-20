-- Add database metadata for S3-compatible product media and private digital downloads.
ALTER TABLE "ProductImage"
ADD COLUMN "contentType" TEXT NOT NULL DEFAULT 'application/octet-stream';

ALTER TABLE "ProductImage"
ALTER COLUMN "contentType" DROP DEFAULT;

CREATE TABLE "ProductDigitalAsset" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductDigitalAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductDigitalAsset_productId_key" ON "ProductDigitalAsset"("productId");
CREATE UNIQUE INDEX "ProductDigitalAsset_storageKey_key" ON "ProductDigitalAsset"("storageKey");
CREATE INDEX "ProductDigitalAsset_createdAt_idx" ON "ProductDigitalAsset"("createdAt");

ALTER TABLE "ProductDigitalAsset"
ADD CONSTRAINT "ProductDigitalAsset_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
