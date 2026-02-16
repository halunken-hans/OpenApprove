import { resolve } from "node:path";
import { type Request, type Response, Router } from "express";
import { z } from "zod";
import { tokenAuth, requireAnyScope, requireScope } from "../middleware/auth.js";
import { validateBody, validateQuery } from "../utils/validation.js";
import { prisma } from "../db.js";
import { appendAuditEvent } from "../services/audit.js";
import { AuditEventType, type Token } from "@prisma/client";
import { env } from "../config.js";
import { validateToken } from "../services/tokens.js";
import { ensureFileVersionMutableForAnnotations } from "../ui/helpers.js";
import { buildSummaryResponse } from "../ui/summary.js";
import { getUiDictionary, resolveUiLang, type UiPage } from "../ui/i18n.js";
import { canAccessCustomer, canAccessMyUploads } from "../services/permissions.js";
import { clearSessionCookie, setSessionCookie } from "../services/session.js";
import { parseJsonString } from "../utils/json.js";

export const uiRouter = Router();

const publicDir = resolve(process.cwd(), "public");

type TokenErrorReason = "invalid" | "used" | "expired" | "superseded";

function redirectToTokenError(res: Response, reason: TokenErrorReason, lang: string) {
  const params = new URLSearchParams();
  params.set("reason", reason);
  params.set("lang", lang === "de" ? "de" : "en");
  return res.redirect(`/token-error.html?${params.toString()}`);
}

async function resolveTokenErrorReason(rawToken: string): Promise<{ reason: TokenErrorReason; token?: Token }> {
  const tokenResult = await validateToken(rawToken);
  if (!tokenResult.ok) {
    if (tokenResult.reason === "USED") {
      return { reason: "used" };
    }
    if (tokenResult.reason === "EXPIRED") {
      if (tokenResult.token?.processId) {
        const newerVersionExists = await prisma.fileVersion.findFirst({
          where: {
            file: { processId: tokenResult.token.processId },
            createdAt: { gt: tokenResult.token.createdAt }
          },
          select: { id: true }
        });
        return { reason: newerVersionExists ? "superseded" : "expired" };
      }
      return { reason: "expired" };
    }
    return { reason: "invalid" };
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
      return { reason: "superseded" };
    }
  }
  return { reason: "invalid", token: tokenResult.token };
}

uiRouter.get("/portal", async (req, res) => {
  const rawToken = typeof req.query.token === "string" ? req.query.token : "";
  const lang = typeof req.query.lang === "string" ? req.query.lang : "en";
  const portalParams = new URLSearchParams();
  portalParams.set("lang", lang === "de" ? "de" : "en");
  portalParams.set("view", "portal");
  if (rawToken) {
    const resolved = await resolveTokenErrorReason(rawToken);
    if (!resolved.token) {
      clearSessionCookie(res);
      return redirectToTokenError(res, resolved.reason, lang);
    }
    setSessionCookie(res, resolved.token);
    return res.redirect(`/app.html?${portalParams.toString()}`);
  }
  return res.redirect(`/app.html?${portalParams.toString()}`);
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

async function openProjectFromToken(req: Request<{ token: string }>, res: Response) {
  const token = req.params.token;
  const lang = typeof req.query.lang === "string" ? req.query.lang : "en";

  const resolved = await resolveTokenErrorReason(token);
  if (!resolved.token) {
    clearSessionCookie(res);
    return redirectToTokenError(res, resolved.reason, lang);
  }
  setSessionCookie(res, resolved.token);

  const params = new URLSearchParams();
  params.set("lang", lang === "de" ? "de" : "en");
  params.set("view", "project");
  return res.redirect(`/app.html?${params.toString()}`);
}

uiRouter.get("/t/:token", openProjectFromToken);
uiRouter.get("/project/:token", openProjectFromToken);

const SessionExchangeSchema = z.object({
  token: z.string().min(1),
  lang: z.string().optional(),
  view: z.enum(["token", "project", "portal"]).optional(),
  processId: z.string().optional()
});

uiRouter.post("/api/session/exchange", validateBody(SessionExchangeSchema), async (req, res) => {
  const body = req.body as z.infer<typeof SessionExchangeSchema>;
  const resolved = await resolveTokenErrorReason(body.token);
  if (!resolved.token) {
    clearSessionCookie(res);
    const codeByReason: Record<TokenErrorReason, string> = {
      invalid: "TOKEN_INVALID",
      used: "TOKEN_USED",
      expired: "TOKEN_EXPIRED",
      superseded: "TOKEN_REPLACED"
    };
    return res.status(401).json({ code: codeByReason[resolved.reason], reason: resolved.reason });
  }
  setSessionCookie(res, resolved.token);
  const params = new URLSearchParams();
  if (body.lang) params.set("lang", body.lang === "de" ? "de" : "en");
  if (body.view) {
    const normalizedView = body.view === "token" ? "project" : body.view;
    params.set("view", normalizedView);
  }
  if (body.processId) params.set("processId", body.processId);
  return res.json({
    ok: true,
    redirect: "/app.html?" + params.toString()
  });
});
const SummaryQuery = z.object({
  token: z.string().min(1).optional(),
  processId: z.string().optional()
});

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

uiRouter.get(
  "/api/ui/summary",
  tokenAuth,
  requireAnyScope(["VIEW_PDF", "DOWNLOAD_PDF", "DECIDE", "CUSTOMER_PORTAL_VIEW", "ADMIN"]),
  validateQuery(SummaryQuery),
  async (req, res) => {
    if (!req.token) return res.status(401).json({ error: "Missing token" });
    const query = req.query as z.infer<typeof SummaryQuery>;
    const requestedProcessId = query.processId?.trim() ? query.processId.trim() : null;
    const targetProcessId = requestedProcessId ?? req.token.processId ?? null;
    if (!targetProcessId) return res.status(403).json({ error: "Token is not bound to a process" });
    const targetProcess = await prisma.process.findUnique({
      where: { id: targetProcessId },
      select: { id: true, customerNumber: true, uploaderId: true }
    });
    if (!targetProcess) return res.status(404).json({ error: "Process not found" });
    if (!canReadProcess(req.token, targetProcess)) return res.status(403).json({ error: "Forbidden" });
    const summary = await buildSummaryResponse({
      id: req.token.id,
      processId: targetProcessId,
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
    if (!version.viewStoragePath) return res.status(409).json({ error: "No view file available for annotations" });
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
    if (!existing.fileVersion.viewStoragePath) return res.status(409).json({ error: "No view file available for annotations" });
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
    if (!existing.fileVersion.viewStoragePath) return res.status(409).json({ error: "No view file available for annotations" });
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
      include: { file: { include: { process: { select: { id: true, customerNumber: true, uploaderId: true } } } } }
    });
    if (!version) return res.status(404).json({ error: "File version not found" });
    if (!version.isCurrent) return res.status(410).json({ error: "File version superseded" });
    if (!version.viewStoragePath) return res.status(409).json({ error: "No view file available for annotations" });
    if (!canReadProcess(req.token, version.file.process)) return res.status(403).json({ error: "Forbidden" });
    const annotations = await prisma.annotation.findMany({ where: { fileVersionId: query.fileVersionId } });
    res.json(annotations.map(annotation => ({
      ...annotation,
      dataJson: parseJsonString(annotation.dataJson)
    })));
  }
);
