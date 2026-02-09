-- Add supersede markers for file versions (keep history but only one active version per logical file)
ALTER TABLE "FileVersion" ADD COLUMN "isCurrent" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "FileVersion" ADD COLUMN "supersededAt" DATETIME;
ALTER TABLE "FileVersion" ADD COLUMN "supersededByVersionId" TEXT;

-- Backfill existing rows as current
UPDATE "FileVersion" SET "isCurrent" = true WHERE "isCurrent" IS NULL;

CREATE INDEX "FileVersion_fileId_isCurrent_idx" ON "FileVersion"("fileId", "isCurrent");
