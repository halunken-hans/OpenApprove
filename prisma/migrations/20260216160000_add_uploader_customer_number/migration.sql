-- Add uploader company binding on process level.
ALTER TABLE "Process" ADD COLUMN "uploaderCustomerNumber" TEXT;

-- Backfill existing rows to keep current behavior for old data.
UPDATE "Process"
SET "uploaderCustomerNumber" = "customerNumber"
WHERE "uploaderCustomerNumber" IS NULL;

CREATE INDEX "Process_uploaderCustomerNumber_idx" ON "Process"("uploaderCustomerNumber");

-- Keep uploader company snapshot per uploaded file version for audit/debug visibility.
ALTER TABLE "FileVersion" ADD COLUMN "uploadedByUploaderCustomerNumber" TEXT;

UPDATE "FileVersion"
SET "uploadedByUploaderCustomerNumber" = (
  SELECT COALESCE(p."uploaderCustomerNumber", p."customerNumber")
  FROM "File" f
  JOIN "Process" p ON p."id" = f."processId"
  WHERE f."id" = "FileVersion"."fileId"
)
WHERE "uploadedByUploaderCustomerNumber" IS NULL;
