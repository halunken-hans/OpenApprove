-- Add explicit download/view assets and per-version approval requirement.
ALTER TABLE "FileVersion" ADD COLUMN "downloadSha256" TEXT NOT NULL DEFAULT '';
ALTER TABLE "FileVersion" ADD COLUMN "downloadSize" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FileVersion" ADD COLUMN "downloadMime" TEXT NOT NULL DEFAULT 'application/octet-stream';
ALTER TABLE "FileVersion" ADD COLUMN "downloadStoragePath" TEXT NOT NULL DEFAULT '';
ALTER TABLE "FileVersion" ADD COLUMN "viewSha256" TEXT;
ALTER TABLE "FileVersion" ADD COLUMN "viewSize" INTEGER;
ALTER TABLE "FileVersion" ADD COLUMN "viewMime" TEXT;
ALTER TABLE "FileVersion" ADD COLUMN "viewStoragePath" TEXT;
ALTER TABLE "FileVersion" ADD COLUMN "approvalRequired" BOOLEAN NOT NULL DEFAULT true;

-- Backfill existing rows: prior single-asset data is both download and view.
UPDATE "FileVersion"
SET
  "downloadSha256" = "sha256",
  "downloadSize" = "size",
  "downloadMime" = "mime",
  "downloadStoragePath" = "storagePath",
  "viewSha256" = "sha256",
  "viewSize" = "size",
  "viewMime" = "mime",
  "viewStoragePath" = "storagePath"
WHERE "downloadStoragePath" = '' OR "downloadStoragePath" IS NULL;
