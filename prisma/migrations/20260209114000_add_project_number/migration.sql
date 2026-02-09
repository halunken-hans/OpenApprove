ALTER TABLE "Process" ADD COLUMN "projectNumber" TEXT NOT NULL DEFAULT '';
CREATE INDEX "Process_projectNumber_idx" ON "Process"("projectNumber");
