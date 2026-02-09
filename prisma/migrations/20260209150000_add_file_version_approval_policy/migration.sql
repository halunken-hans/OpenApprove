-- Add per-file-version approval configuration.
ALTER TABLE "FileVersion" ADD COLUMN "approvalRule" TEXT NOT NULL DEFAULT 'ALL_APPROVE';
ALTER TABLE "FileVersion" ADD COLUMN "approvalPolicyJson" TEXT NOT NULL DEFAULT '{}';
