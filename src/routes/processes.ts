import { Router } from "express";
import { z } from "zod";
import { tokenAuth, requireAnyScope } from "../middleware/auth.js";
import { validateBody } from "../utils/validation.js";
import { createProcess, updateProcessAttributes } from "../services/processes.js";
import { prisma } from "../db.js";
import { appendAuditEvent } from "../services/audit.js";
import { emitWebhook } from "../services/webhooks.js";
import { AuditEventType } from "@prisma/client";

export const processesRouter = Router();

function parseJsonString(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

const CreateProcessSchema = z.object({
  projectNumber: z.string().min(1),
  customerNumber: z.string().min(1),
  attributesJson: z.record(z.unknown()).optional(),
  uploaderId: z.string().min(1),
  uploaderEmail: z.string().email().optional(),
  uploaderDisplayName: z.string().optional()
});

processesRouter.post(
  "/",
  tokenAuth,
  requireAnyScope(["ADMIN", "UPLOAD_PROCESS"]),
  validateBody(CreateProcessSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof CreateProcessSchema>;
    const process = await createProcess({
      projectNumber: body.projectNumber,
      customerNumber: body.customerNumber,
      attributesJson: body.attributesJson,
      uploaderId: body.uploaderId,
      uploaderEmail: body.uploaderEmail ?? null,
      uploaderName: body.uploaderDisplayName ?? null
    });
    await appendAuditEvent({
      eventType: AuditEventType.PROCESS_CREATED,
      processId: process.id,
      tokenId: req.token?.id,
      roleAtTime: req.token?.roleAtTime ?? null,
      customerNumber: process.customerNumber,
      uploaderId: process.uploaderId,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: body
    });
    await emitWebhook("process.created", {
      processId: process.id,
      projectNumber: process.projectNumber,
      customerNumber: process.customerNumber
    });
    res.status(201).json(process);
  }
);

const UpdateProcessSchema = z.object({
  attributesJson: z.record(z.unknown())
});

processesRouter.patch(
  "/:id",
  tokenAuth,
  requireAnyScope(["ADMIN", "UPLOAD_PROCESS"]),
  validateBody(UpdateProcessSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof UpdateProcessSchema>;
    const process = await updateProcessAttributes(req.params.id, body.attributesJson);
    await appendAuditEvent({
      eventType: AuditEventType.PROCESS_UPDATED,
      processId: process.id,
      tokenId: req.token?.id,
      roleAtTime: req.token?.roleAtTime ?? null,
      customerNumber: process.customerNumber,
      uploaderId: process.uploaderId,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: body
    });
    await emitWebhook("process.updated", { processId: process.id });
    res.json(process);
  }
);

processesRouter.get("/:id", tokenAuth, requireAnyScope(["ADMIN", "CUSTOMER_PORTAL_VIEW", "UPLOAD_PROCESS"]), async (req, res) => {
  const process = await prisma.process.findUnique({
    where: { id: req.params.id },
    include: {
      files: { include: { versions: { where: { isCurrent: true }, orderBy: { versionNumber: "desc" } } } },
      cycles: { include: { participants: true } }
    }
  });
  if (!process) return res.status(404).json({ error: "Not found" });
  if (!req.token?.scopes.includes("ADMIN")) {
    const customerOk = req.token?.customerNumber && req.token.customerNumber === process.customerNumber;
    const uploaderOk = req.token?.uploaderId && req.token.uploaderId === process.uploaderId;
    if (!customerOk && !uploaderOk) {
      return res.status(403).json({ error: "Forbidden" });
    }
  }
  await appendAuditEvent({
    eventType: AuditEventType.ACCESS_LOGGED,
    processId: process.id,
    tokenId: req.token?.id,
    roleAtTime: req.token?.roleAtTime ?? null,
    customerNumber: process.customerNumber,
    uploaderId: process.uploaderId,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    validatedData: { action: "process.read" }
  });
  const isPortal = req.token?.scopes.includes("CUSTOMER_PORTAL_VIEW") && !req.token?.scopes.includes("ADMIN");
  if (isPortal) {
    return res.json({
      id: process.id,
      projectNumber: process.projectNumber,
      customerNumber: process.customerNumber,
      status: process.status,
      createdAt: process.createdAt,
      files: process.files.map(file => ({
        id: file.id,
        originalFilename: file.originalFilename || file.normalizedOriginalFilename,
        versions: file.versions.map(version => ({
          id: version.id,
          versionNumber: version.versionNumber,
          approvalRequired: version.approvalRequired,
          approvalRule: version.approvalRule,
          hasViewFile: Boolean(version.viewStoragePath),
          viewMime: version.viewMime,
          downloadMime: version.downloadMime || version.mime,
          approvalPolicyJson: parseJsonString(version.approvalPolicyJson),
          attributesJson: parseJsonString(version.attributesJson)
        }))
      })),
      attributesJson: parseJsonString(process.attributesJson)
    });
  }
  res.json({
    ...process,
    attributesJson: parseJsonString(process.attributesJson),
    files: process.files.map(file => ({
      ...file,
      originalFilename: file.originalFilename || file.normalizedOriginalFilename,
      versions: file.versions.map(version => ({
        ...version,
        approvalRequired: version.approvalRequired,
        hasViewFile: Boolean(version.viewStoragePath),
        viewMime: version.viewMime,
        downloadMime: version.downloadMime || version.mime,
        approvalPolicyJson: parseJsonString(version.approvalPolicyJson),
        attributesJson: parseJsonString(version.attributesJson)
      }))
    }))
  });
});

processesRouter.delete(
  "/:id",
  tokenAuth,
  requireAnyScope(["ADMIN"]),
  async (req, res) => {
    const process = await prisma.process.delete({ where: { id: req.params.id } });
    await appendAuditEvent({
      eventType: AuditEventType.PROCESS_UPDATED,
      processId: process.id,
      tokenId: req.token?.id,
      roleAtTime: req.token?.roleAtTime ?? null,
      customerNumber: process.customerNumber,
      uploaderId: process.uploaderId,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: { action: "process.delete" }
    });
    await emitWebhook("process.deleted", { processId: process.id });
    res.json({ ok: true });
  }
);
