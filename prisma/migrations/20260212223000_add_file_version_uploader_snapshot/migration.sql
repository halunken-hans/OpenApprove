-- Store uploader snapshot per file version so history stays correct after uploader changes on process.
ALTER TABLE "FileVersion" ADD COLUMN "uploadedByUploaderId" TEXT;
ALTER TABLE "FileVersion" ADD COLUMN "uploadedByUploaderEmail" TEXT;
ALTER TABLE "FileVersion" ADD COLUMN "uploadedByUploaderName" TEXT;

-- Backfill existing versions from current process uploader as best-effort fallback.
UPDATE "FileVersion"
SET
  "uploadedByUploaderId" = (
    SELECT p."uploaderId"
    FROM "File" f
    JOIN "Process" p ON p."id" = f."processId"
    WHERE f."id" = "FileVersion"."fileId"
  ),
  "uploadedByUploaderEmail" = (
    SELECT p."uploaderEmail"
    FROM "File" f
    JOIN "Process" p ON p."id" = f."processId"
    WHERE f."id" = "FileVersion"."fileId"
  ),
  "uploadedByUploaderName" = (
    SELECT p."uploaderName"
    FROM "File" f
    JOIN "Process" p ON p."id" = f."processId"
    WHERE f."id" = "FileVersion"."fileId"
  )
WHERE "uploadedByUploaderId" IS NULL;
