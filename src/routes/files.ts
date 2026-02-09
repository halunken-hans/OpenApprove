import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { tokenAuth, requireAnyScope } from "../middleware/auth.js";
import { validateBody } from "../utils/validation.js";
import { storeFileVersion } from "../services/files.js";
import { appendAuditEvent } from "../services/audit.js";
import { emitWebhook } from "../services/webhooks.js";
import { AuditEventType } from "@prisma/client";
import { prisma } from "../db.js";
import fs from "node:fs/promises";
import path from "node:path";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export const filesRouter = Router();

function safeDownloadName(name: string, fallback: string) {
  const raw = (name || "").trim();
  if (!raw) return fallback;
  return path.basename(raw).replace(/[\r\n"]/g, "_");
}

function parseJsonString(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

const UploadSchema = z.object({
  processId: z.string().min(1),
  attributesJson: z.string().optional()
});

filesRouter.post(
  "/upload",
  tokenAuth,
  requireAnyScope(["ADMIN", "UPLOAD_PROCESS"]),
  upload.single("file"),
  async (req, res) => {
    const parsed = UploadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    if (!req.file) return res.status(400).json({ error: "Missing file" });
    if (req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ error: "Only PDF supported" });
    }

    let attributesJson: Record<string, unknown> | undefined;
    if (parsed.data.attributesJson) {
      try {
        const parsedJson = JSON.parse(parsed.data.attributesJson);
        if (parsedJson && typeof parsedJson === "object" && !Array.isArray(parsedJson)) {
          attributesJson = parsedJson as Record<string, unknown>;
        } else {
          return res.status(400).json({ error: "attributesJson must be an object" });
        }
      } catch (err) {
        return res.status(400).json({ error: "Invalid attributesJson" });
      }
    }
    const { file, fileVersion } = await storeFileVersion({
      processId: parsed.data.processId,
      originalFilename: req.file.originalname,
      buffer: req.file.buffer,
      mime: req.file.mimetype,
      attributesJson
    });

    await appendAuditEvent({
      eventType: AuditEventType.FILE_VERSION_UPLOADED,
      processId: parsed.data.processId,
      fileId: file.id,
      fileVersionId: fileVersion.id,
      tokenId: req.token?.id,
      roleAtTime: req.token?.roleAtTime ?? null,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: { filename: req.file.originalname, attributesJson }
    });
    await emitWebhook("file.version.uploaded", { processId: parsed.data.processId, fileId: file.id, fileVersionId: fileVersion.id });

    res.status(201).json({
      file,
      fileVersion: {
        ...fileVersion,
        attributesJson: parseJsonString(fileVersion.attributesJson)
      }
    });
  }
);

filesRouter.get("/versions/:id/download", tokenAuth, requireAnyScope(["VIEW_PDF", "DOWNLOAD_PDF", "ADMIN"]), async (req, res) => {
  const version = await prisma.fileVersion.findUnique({ where: { id: req.params.id }, include: { file: true } });
  if (!version) return res.status(404).json({ error: "Not found" });
  if (!req.token?.scopes.includes("ADMIN") && req.token?.processId && req.token.processId !== version.file.processId) {
    return res.status(403).json({ error: "Token not bound to process" });
  }
  await appendAuditEvent({
    eventType: AuditEventType.ACCESS_LOGGED,
    processId: version.file.processId,
    fileVersionId: version.id,
    tokenId: req.token?.id,
    roleAtTime: req.token?.roleAtTime ?? null,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    validatedData: { action: "fileVersion.download" }
  });
  const file = await fs.readFile(version.storagePath);
  const downloadName = safeDownloadName(
    version.file.originalFilename || version.file.normalizedOriginalFilename,
    `document-v${version.versionNumber}.pdf`
  );
  res.setHeader("Content-Type", version.mime);
  res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
  res.send(file);
});

filesRouter.get("/versions/:id/annotations", tokenAuth, requireAnyScope(["VIEW_PDF", "ANNOTATE_PDF", "ADMIN"]), async (req, res) => {
  const version = await prisma.fileVersion.findUnique({ where: { id: req.params.id }, include: { file: true } });
  if (!version) return res.status(404).json({ error: "Not found" });
  if (!req.token?.scopes.includes("ADMIN") && req.token?.processId && req.token.processId !== version.file.processId) {
    return res.status(403).json({ error: "Token not bound to process" });
  }
  const annotations = await prisma.annotation.findMany({ where: { fileVersionId: version.id } });
  await appendAuditEvent({
    eventType: AuditEventType.ACCESS_LOGGED,
    processId: version.file.processId,
    fileVersionId: version.id,
    tokenId: req.token?.id,
    roleAtTime: req.token?.roleAtTime ?? null,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    validatedData: { action: "annotations.download" }
  });
  res.json(annotations.map(annotation => ({
    ...annotation,
    dataJson: parseJsonString(annotation.dataJson)
  })));
});

const UpdateVersionSchema = z.object({
  attributesJson: z.record(z.unknown())
});

filesRouter.patch(
  "/versions/:id",
  tokenAuth,
  requireAnyScope(["ADMIN", "UPLOAD_PROCESS"]),
  validateBody(UpdateVersionSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof UpdateVersionSchema>;
    const version = await prisma.fileVersion.update({
      where: { id: req.params.id },
      data: { attributesJson: JSON.stringify(body.attributesJson) }
    });
    await appendAuditEvent({
      eventType: AuditEventType.FILE_VERSION_UPLOADED,
      fileVersionId: version.id,
      tokenId: req.token?.id,
      roleAtTime: req.token?.roleAtTime ?? null,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: { action: "fileVersion.update", attributesJson: body.attributesJson }
    });
    res.json({
      ...version,
      attributesJson: parseJsonString(version.attributesJson)
    });
  }
);
