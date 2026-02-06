-- CreateTable
CREATE TABLE "Process" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "customerNumber" TEXT NOT NULL,
  "attributesJson" TEXT NOT NULL DEFAULT '{}',
  "uploaderId" TEXT NOT NULL,
  "uploaderEmail" TEXT,
  "uploaderName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "File" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "processId" TEXT NOT NULL,
  "normalizedOriginalFilename" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FileVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "fileId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "mime" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "attributesJson" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApprovalCycle" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "processId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "rule" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Participant" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "cycleId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "displayName" TEXT,
  "email" TEXT,
  "tokenId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("cycleId") REFERENCES "ApprovalCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Decision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "processId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "fileVersionId" TEXT,
  "decision" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("cycleId") REFERENCES "ApprovalCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Token" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "scopes" TEXT NOT NULL,
  "expiry" DATETIME NOT NULL,
  "oneTime" BOOLEAN NOT NULL DEFAULT FALSE,
  "processId" TEXT,
  "participantId" TEXT,
  "customerNumber" TEXT,
  "uploaderId" TEXT,
  "roleAtTime" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" DATETIME
);

-- CreateTable
CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "timestampUtc" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "eventType" TEXT NOT NULL,
  "processId" TEXT,
  "cycleId" TEXT,
  "fileId" TEXT,
  "fileVersionId" TEXT,
  "tokenId" TEXT,
  "roleAtTime" TEXT,
  "customerNumber" TEXT,
  "uploaderId" TEXT,
  "ip" TEXT,
  "userAgent" TEXT,
  "validatedData" TEXT NOT NULL,
  "prevHash" TEXT NOT NULL,
  "eventHash" TEXT NOT NULL,
  FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Annotation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "fileVersionId" TEXT NOT NULL,
  "participantId" TEXT,
  "tokenId" TEXT,
  "dataJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("fileVersionId") REFERENCES "FileVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Webhook" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "url" TEXT NOT NULL,
  "secret" TEXT NOT NULL,
  "events" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "webhookId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "signature" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "responseCode" INTEGER,
  "error" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" DATETIME,
  FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "File_processId_idx" ON "File"("processId");
CREATE INDEX "FileVersion_fileId_idx" ON "FileVersion"("fileId");
CREATE INDEX "ApprovalCycle_processId_idx" ON "ApprovalCycle"("processId");
CREATE INDEX "Participant_cycleId_idx" ON "Participant"("cycleId");
CREATE INDEX "Decision_processId_idx" ON "Decision"("processId");
CREATE INDEX "AuditEvent_processId_idx" ON "AuditEvent"("processId");
CREATE INDEX "Token_expiry_idx" ON "Token"("expiry");
