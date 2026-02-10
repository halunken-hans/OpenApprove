import { resolve } from "node:path";
import { type Response, Router } from "express";
import { z } from "zod";
import { tokenAuth, requireAnyScope, requireScope } from "../middleware/auth.js";
import { validateBody, validateQuery } from "../utils/validation.js";
import { prisma } from "../db.js";
import { appendAuditEvent } from "../services/audit.js";
import { AuditEventType } from "@prisma/client";
import { env } from "../config.js";
import { validateToken } from "../services/tokens.js";
import { parseJsonString, ensureFileVersionMutableForAnnotations } from "../ui/helpers.js";
import { buildSummaryResponse } from "../ui/summary.js";
import { getUiDictionary, resolveUiLang, type UiPage } from "../ui/i18n.js";

export const uiRouter = Router();

const publicDir = resolve(process.cwd(), "public");

type TokenErrorReason = "invalid" | "used" | "expired" | "superseded";

function redirectToTokenError(res: Response, reason: TokenErrorReason, lang: string) {
  const params = new URLSearchParams();
  params.set("reason", reason);
  params.set("lang", lang === "de" ? "de" : "en");
  return res.redirect(`/token-error.html?${params.toString()}`);
}

uiRouter.get("/privacy", (_req, res) => {
  res.sendFile(resolve(publicDir, "privacy.html"));
});

uiRouter.get("/portal", (_req, res) => {
  res.sendFile(resolve(publicDir, "portal.html"));
});

const UiI18nQuery = z.object({
  page: z.enum(["token", "portal", "tokenError"]),
  lang: z.string().optional()
});

uiRouter.get("/api/ui/i18n", validateQuery(UiI18nQuery), (req, res) => {
  const query = req.query as z.infer<typeof UiI18nQuery>;
  const lang = resolveUiLang(query.lang);
  res.json(getUiDictionary(query.page as UiPage, lang));
});

uiRouter.get("/", (_req, res) => {
  res.sendFile(resolve(publicDir, "index.html"));
});

uiRouter.get("/t/:token", async (req, res) => {
  const token = req.params.token;
  const lang = typeof req.query.lang === "string" ? req.query.lang : "en";

  const tokenResult = await validateToken(token);
  if (!tokenResult.ok) {
    let reason: TokenErrorReason = "invalid";
    if (tokenResult.reason === "USED") {
      reason = "used";
    } else if (tokenResult.reason === "EXPIRED") {
      if (tokenResult.token?.processId) {
        const newerVersionExists = await prisma.fileVersion.findFirst({
          where: {
            file: { processId: tokenResult.token.processId },
            createdAt: { gt: tokenResult.token.createdAt }
          },
          select: { id: true }
        });
        reason = newerVersionExists ? "superseded" : "expired";
      } else {
        reason = "expired";
      }
    }
    return redirectToTokenError(res, reason, lang);
  }

  if (tokenResult.token.processId) {
    const newerVersionExists = await prisma.fileVersion.findFirst({
      where: {
        file: { processId: tokenResult.token.processId },
        createdAt: { gt: tokenResult.token.createdAt }
      },
      select: { id: true }
    });
    if (newerVersionExists) {
      return redirectToTokenError(res, "superseded", lang);
    }
  }

  const params = new URLSearchParams();
  params.set("token", token);
  params.set("lang", lang === "de" ? "de" : "en");
  return res.redirect(`/token.html?${params.toString()}`);
});
const SummaryQuery = z.object({
  token: z.string().min(1).optional()
});

uiRouter.get(
  "/api/ui/summary",
  tokenAuth,
  requireAnyScope(["VIEW_PDF", "DOWNLOAD_PDF", "DECIDE", "CUSTOMER_PORTAL_VIEW", "ADMIN"]),
  validateQuery(SummaryQuery),
  async (req, res) => {
    if (!req.token?.processId) return res.status(403).json({ error: "Token is not bound to a process" });
    const summary = await buildSummaryResponse({
      id: req.token.id,
      processId: req.token.processId,
      participantId: req.token.participantId,
      scopes: req.token.scopes,
      roleAtTime: req.token.roleAtTime,
      expiry: req.token.expiry
    }, {
      ip: req.ip,
      userAgent: req.get("user-agent")
    });
    if (!summary) return res.status(404).json({ error: "Process not found" });
    res.json(summary);
  }
);

const AnnotationSchema = z.object({
  fileVersionId: z.string(),
  dataJson: z.record(z.unknown())
});

uiRouter.post(
  "/api/ui/annotations",
  tokenAuth,
  requireScope("ANNOTATE_PDF"),
  validateBody(AnnotationSchema),
  async (req, res) => {
    if (!env.ANNOTATIONS_ENABLED) return res.status(403).json({ error: "Annotations disabled" });
    const body = req.body as z.infer<typeof AnnotationSchema>;
    const version = await prisma.fileVersion.findUnique({
      where: { id: body.fileVersionId },
      include: { file: true }
    });
    if (!version) return res.status(404).json({ error: "File version not found" });
    if (!version.isCurrent) return res.status(410).json({ error: "File version superseded" });
    if (req.token?.processId && req.token.processId !== version.file.processId) {
      return res.status(403).json({ error: "Token not bound to process" });
    }
    if (!(await ensureFileVersionMutableForAnnotations(version.file.processId, version.id))) {
      return res.status(409).json({ error: "File is finalized; annotations are locked" });
    }
    const annotation = await prisma.annotation.create({
      data: {
        fileVersionId: body.fileVersionId,
        tokenId: req.token?.id ?? null,
        dataJson: JSON.stringify(body.dataJson)
      }
    });
    await appendAuditEvent({
      eventType: AuditEventType.ANNOTATION_CREATED,
      fileVersionId: body.fileVersionId,
      tokenId: req.token?.id,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: { fileVersionId: body.fileVersionId }
    });
    res.status(201).json(annotation);
  }
);

const UpdateAnnotationSchema = z.object({
  dataJson: z.record(z.unknown())
});

uiRouter.patch(
  "/api/ui/annotations/:id",
  tokenAuth,
  requireScope("ANNOTATE_PDF"),
  validateBody(UpdateAnnotationSchema),
  async (req, res) => {
    if (!env.ANNOTATIONS_ENABLED) return res.status(403).json({ error: "Annotations disabled" });
    const body = req.body as z.infer<typeof UpdateAnnotationSchema>;
    const existing = await prisma.annotation.findUnique({
      where: { id: req.params.id },
      include: { fileVersion: { include: { file: true } } }
    });
    if (!existing) return res.status(404).json({ error: "Annotation not found" });
    if (!existing.fileVersion.isCurrent) return res.status(410).json({ error: "File version superseded" });
    if (req.token?.processId && req.token.processId !== existing.fileVersion.file.processId) {
      return res.status(403).json({ error: "Token not bound to process" });
    }
    if (!(await ensureFileVersionMutableForAnnotations(existing.fileVersion.file.processId, existing.fileVersion.id))) {
      return res.status(409).json({ error: "File is finalized; annotations are locked" });
    }
    const annotation = await prisma.annotation.update({
      where: { id: req.params.id },
      data: { dataJson: JSON.stringify(body.dataJson) }
    });
    await appendAuditEvent({
      eventType: AuditEventType.ANNOTATION_UPDATED,
      fileVersionId: annotation.fileVersionId,
      tokenId: req.token?.id,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: { annotationId: annotation.id }
    });
    res.json(annotation);
  }
);

uiRouter.delete(
  "/api/ui/annotations/:id",
  tokenAuth,
  requireScope("ANNOTATE_PDF"),
  async (req, res) => {
    if (!env.ANNOTATIONS_ENABLED) return res.status(403).json({ error: "Annotations disabled" });
    const existing = await prisma.annotation.findUnique({
      where: { id: req.params.id },
      include: { fileVersion: { include: { file: true } } }
    });
    if (!existing) return res.status(404).json({ error: "Annotation not found" });
    if (!existing.fileVersion.isCurrent) return res.status(410).json({ error: "File version superseded" });
    if (req.token?.processId && req.token.processId !== existing.fileVersion.file.processId) {
      return res.status(403).json({ error: "Token not bound to process" });
    }
    if (!(await ensureFileVersionMutableForAnnotations(existing.fileVersion.file.processId, existing.fileVersion.id))) {
      return res.status(409).json({ error: "File is finalized; annotations are locked" });
    }
    const annotation = await prisma.annotation.delete({ where: { id: req.params.id } });
    await appendAuditEvent({
      eventType: AuditEventType.ANNOTATION_DELETED,
      fileVersionId: annotation.fileVersionId,
      tokenId: req.token?.id,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: { annotationId: annotation.id }
    });
    res.json({ ok: true });
  }
);

const AnnotationQuery = z.object({
  fileVersionId: z.string()
});

uiRouter.get(
  "/api/ui/annotations",
  tokenAuth,
  requireAnyScope(["VIEW_PDF", "ANNOTATE_PDF"]),
  validateQuery(AnnotationQuery),
  async (req, res) => {
    const query = req.query as z.infer<typeof AnnotationQuery>;
    const version = await prisma.fileVersion.findUnique({
      where: { id: query.fileVersionId },
      include: { file: true }
    });
    if (!version) return res.status(404).json({ error: "File version not found" });
    if (!version.isCurrent) return res.status(410).json({ error: "File version superseded" });
    if (req.token?.processId && req.token.processId !== version.file.processId) {
      return res.status(403).json({ error: "Token not bound to process" });
    }
    const annotations = await prisma.annotation.findMany({ where: { fileVersionId: query.fileVersionId } });
    res.json(annotations.map(annotation => ({
      ...annotation,
      dataJson: parseJsonString(annotation.dataJson)
    })));
  }
);
