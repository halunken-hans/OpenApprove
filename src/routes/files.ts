import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { tokenAuth, requireAnyScope } from "../middleware/auth.js";
import { validateBody } from "../utils/validation.js";
import { storeFileVersion } from "../services/files.js";
import { appendAuditEvent } from "../services/audit.js";
import { emitWebhook } from "../services/webhooks.js";
import { ApprovalRule, AuditEventType } from "@prisma/client";
import { prisma } from "../db.js";
import fs from "node:fs/promises";
import path from "node:path";
import { canAccessCustomer, canAccessMyUploads } from "../services/permissions.js";

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
  approvalRequired: z.string().optional(),
  approvalRule: z.nativeEnum(ApprovalRule).optional(),
  approvalPolicyJson: z.string().optional(),
  attributesJson: z.string().optional()
});

function parseBooleanFlag(input: string | undefined, fallback: boolean) {
  if (input == null || input === "") return fallback;
  const normalized = input.trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return null;
}

function extractUploadFiles(req: {
  file?: Express.Multer.File;
  files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
}) {
  const fileMap =
    req.files && !Array.isArray(req.files)
      ? req.files
      : {};
  const legacyFile = req.file ?? (Array.isArray(req.files) ? req.files[0] : undefined);
  const downloadFile = fileMap.downloadFile?.[0] ?? fileMap.file?.[0] ?? legacyFile;
  const viewFile = fileMap.viewFile?.[0] ?? null;
  return { downloadFile, viewFile };
}

function canReadProcess(
  token:
    | {
        scopes: string[];
        processId?: string | null;
        customerNumber?: string | null;
        uploaderId?: string | null;
      }
    | undefined,
  process: { id: string; customerNumber: string; uploaderId: string }
) {
  if (!token) return false;
  if (token.scopes.includes("ADMIN")) return true;
  if (token.processId && token.processId === process.id) return true;
  if (token.scopes.includes("CUSTOMER_PORTAL_VIEW")) {
    if (canAccessCustomer(token.customerNumber, process.customerNumber)) return true;
    if (canAccessMyUploads(token.uploaderId, process.uploaderId)) return true;
  }
  return false;
}

filesRouter.post(
  "/upload",
  tokenAuth,
  requireAnyScope(["ADMIN", "UPLOAD_PROCESS"]),
  upload.fields([
    { name: "downloadFile", maxCount: 1 },
    { name: "viewFile", maxCount: 1 },
    { name: "file", maxCount: 1 }
  ]),
  async (req, res) => {
    const parsed = UploadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    const { downloadFile, viewFile } = extractUploadFiles(req);
    if (!downloadFile) return res.status(400).json({ error: "Missing download file" });
    let resolvedViewFile = viewFile;
    if (!resolvedViewFile && downloadFile.mimetype === "application/pdf") {
      // Keep old behavior for PDF-only uploads: use uploaded file as view document.
      resolvedViewFile = downloadFile;
    }
    if (resolvedViewFile && resolvedViewFile.mimetype !== "application/pdf") {
      return res.status(400).json({ error: "viewFile must be a PDF" });
    }
    const approvalRequired = parseBooleanFlag(parsed.data.approvalRequired, true);
    if (approvalRequired === null) {
      return res.status(400).json({ error: "approvalRequired must be true/false" });
    }

    let attributesJson: Record<string, unknown> | undefined;
    let approvalPolicyJson: Record<string, unknown> | undefined;
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
    if (parsed.data.approvalPolicyJson) {
      try {
        const parsedJson = JSON.parse(parsed.data.approvalPolicyJson);
        if (parsedJson && typeof parsedJson === "object" && !Array.isArray(parsedJson)) {
          approvalPolicyJson = parsedJson as Record<string, unknown>;
        } else {
          return res.status(400).json({ error: "approvalPolicyJson must be an object" });
        }
      } catch {
        return res.status(400).json({ error: "Invalid approvalPolicyJson" });
      }
    }
    const { file, fileVersion, supersededVersionIds } = await storeFileVersion({
      processId: parsed.data.processId,
      originalFilename: downloadFile.originalname,
      downloadBuffer: downloadFile.buffer,
      downloadMime: downloadFile.mimetype,
      viewBuffer: resolvedViewFile?.buffer ?? null,
      viewMime: resolvedViewFile?.mimetype ?? null,
      approvalRequired,
      approvalRule: parsed.data.approvalRule,
      approvalPolicyJson,
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
      validatedData: {
        downloadFilename: downloadFile.originalname,
        viewFilename: resolvedViewFile?.originalname ?? null,
        approvalRequired,
        attributesJson,
        approvalRule: parsed.data.approvalRule ?? ApprovalRule.ALL_APPROVE,
        approvalPolicyJson
      }
    });
    for (const supersededVersionId of supersededVersionIds) {
      await appendAuditEvent({
        eventType: AuditEventType.FILE_VERSION_UPLOADED,
        processId: parsed.data.processId,
        fileId: file.id,
        fileVersionId: supersededVersionId,
        tokenId: req.token?.id,
        roleAtTime: req.token?.roleAtTime ?? null,
        ip: req.ip,
        userAgent: req.get("user-agent"),
        validatedData: {
          supersededByVersionId: fileVersion.id,
          reason: "new version uploaded with same normalized filename"
        }
      });
    }
    if (supersededVersionIds.length > 0) {
      await prisma.token.updateMany({
        where: {
          processId: parsed.data.processId,
          expiry: { gt: new Date() }
        },
        data: {
          expiry: new Date()
        }
      });
    }
    await emitWebhook("file.version.uploaded", { processId: parsed.data.processId, fileId: file.id, fileVersionId: fileVersion.id });

    res.status(201).json({
      file,
      fileVersion: {
        ...fileVersion,
        approvalPolicyJson: parseJsonString(fileVersion.approvalPolicyJson),
        attributesJson: parseJsonString(fileVersion.attributesJson),
        hasViewFile: Boolean(fileVersion.viewStoragePath)
      }
    });
  }
);

filesRouter.get("/versions/:id/download", tokenAuth, requireAnyScope(["VIEW_PDF", "DOWNLOAD_PDF", "ADMIN"]), async (req, res) => {
  const version = await prisma.fileVersion.findUnique({
    where: { id: req.params.id },
    include: { file: { include: { process: { select: { id: true, customerNumber: true, uploaderId: true } } } } }
  });
  if (!version) return res.status(404).json({ error: "Not found" });
  const isAdmin = req.token?.scopes.includes("ADMIN");
  if (!canReadProcess(req.token, version.file.process)) return res.status(403).json({ error: "Forbidden" });
  if (!isAdmin && !version.isCurrent) {
    return res.status(410).json({ error: "File version superseded" });
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
  const downloadPath = version.downloadStoragePath || version.storagePath;
  const file = await fs.readFile(downloadPath);
  const downloadName = safeDownloadName(
    version.file.originalFilename || version.file.normalizedOriginalFilename,
    `document-v${version.versionNumber}`
  );
  res.setHeader("Content-Type", version.downloadMime || version.mime || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
  res.send(file);
});

filesRouter.get("/versions/:id/view", tokenAuth, requireAnyScope(["VIEW_PDF", "ADMIN"]), async (req, res) => {
  const version = await prisma.fileVersion.findUnique({
    where: { id: req.params.id },
    include: { file: { include: { process: { select: { id: true, customerNumber: true, uploaderId: true } } } } }
  });
  if (!version) return res.status(404).json({ error: "Not found" });
  const isAdmin = req.token?.scopes.includes("ADMIN");
  if (!canReadProcess(req.token, version.file.process)) return res.status(403).json({ error: "Forbidden" });
  if (!isAdmin && !version.isCurrent) {
    return res.status(410).json({ error: "File version superseded" });
  }
  const viewPath = version.viewStoragePath;
  if (!viewPath) {
    return res.status(404).json({ error: "No view file available for this document" });
  }
  await appendAuditEvent({
    eventType: AuditEventType.ACCESS_LOGGED,
    processId: version.file.processId,
    fileVersionId: version.id,
    tokenId: req.token?.id,
    roleAtTime: req.token?.roleAtTime ?? null,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    validatedData: { action: "fileVersion.view" }
  });
  const file = await fs.readFile(viewPath);
  res.setHeader("Content-Type", version.viewMime || "application/pdf");
  res.setHeader("Content-Disposition", "inline");
  res.send(file);
});

filesRouter.get("/versions/:id/annotations", tokenAuth, requireAnyScope(["VIEW_PDF", "ANNOTATE_PDF", "ADMIN"]), async (req, res) => {
  const version = await prisma.fileVersion.findUnique({
    where: { id: req.params.id },
    include: { file: { include: { process: { select: { id: true, customerNumber: true, uploaderId: true } } } } }
  });
  if (!version) return res.status(404).json({ error: "Not found" });
  const isAdmin = req.token?.scopes.includes("ADMIN");
  if (!canReadProcess(req.token, version.file.process)) return res.status(403).json({ error: "Forbidden" });
  if (!isAdmin && !version.isCurrent) {
    return res.status(410).json({ error: "File version superseded" });
  }
  if (!version.viewStoragePath) {
    return res.status(409).json({ error: "No view file available for annotations" });
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
  approvalRequired: z.boolean().optional(),
  approvalRule: z.nativeEnum(ApprovalRule).optional(),
  approvalPolicyJson: z.record(z.unknown()).optional(),
  attributesJson: z.record(z.unknown())
});

filesRouter.patch(
  "/versions/:id",
  tokenAuth,
  requireAnyScope(["ADMIN", "UPLOAD_PROCESS"]),
  validateBody(UpdateVersionSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof UpdateVersionSchema>;
    const updateData: {
      attributesJson: string;
      approvalRequired?: boolean;
      approvalRule?: ApprovalRule;
      approvalPolicyJson?: string;
    } = {
      attributesJson: JSON.stringify(body.attributesJson)
    };
    if (typeof body.approvalRequired === "boolean") {
      updateData.approvalRequired = body.approvalRequired;
    }
    if (body.approvalRule) {
      updateData.approvalRule = body.approvalRule;
    }
    if (body.approvalPolicyJson) {
      updateData.approvalPolicyJson = JSON.stringify(body.approvalPolicyJson);
    }
    const version = await prisma.fileVersion.update({
      where: { id: req.params.id },
      data: updateData
    });
    await appendAuditEvent({
      eventType: AuditEventType.FILE_VERSION_UPLOADED,
      fileVersionId: version.id,
      tokenId: req.token?.id,
      roleAtTime: req.token?.roleAtTime ?? null,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: {
        action: "fileVersion.update",
        attributesJson: body.attributesJson,
        approvalRule: body.approvalRule,
        approvalPolicyJson: body.approvalPolicyJson
      }
    });
    res.json({
      ...version,
      approvalPolicyJson: parseJsonString(version.approvalPolicyJson),
      attributesJson: parseJsonString(version.attributesJson)
    });
  }
);
