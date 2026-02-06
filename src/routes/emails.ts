import { Router } from "express";
import { z } from "zod";
import { tokenAuth } from "../middleware/auth.js";
import { validateBody } from "../utils/validation.js";
import { sendInviteEmail, sendReminderEmail, sendStatusEmail } from "../services/email.js";
import { canSendEmail } from "../services/tokens.js";
import { appendAuditEvent } from "../services/audit.js";
import { AuditEventType } from "@prisma/client";

export const emailsRouter = Router();

const InviteSchema = z.object({
  to: z.string().email(),
  locale: z.enum(["en", "de"]).default("en"),
  role: z.enum(["REVIEWER", "APPROVER"]),
  processId: z.string(),
  token: z.string()
});

emailsRouter.post(
  "/invite",
  tokenAuth,
  validateBody(InviteSchema),
  async (req, res) => {
    if (!req.token || !canSendEmail(req.token.scopes.join(","))) {
      return res.status(403).json({ error: "Email not allowed" });
    }
    const body = req.body as z.infer<typeof InviteSchema>;
    await sendInviteEmail(body.to, {
      locale: body.locale,
      role: body.role,
      processId: body.processId,
      token: body.token
    });
    await appendAuditEvent({
      eventType: AuditEventType.EMAIL_SENT,
      processId: body.processId,
      tokenId: req.token?.id,
      roleAtTime: req.token?.roleAtTime ?? null,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: { to: body.to, role: body.role }
    });
    res.json({ ok: true });
  }
);

const ReminderSchema = z.object({
  to: z.string().email(),
  locale: z.enum(["en", "de"]).default("en"),
  processId: z.string(),
  message: z.string().optional()
});

emailsRouter.post(
  "/reminder",
  tokenAuth,
  validateBody(ReminderSchema),
  async (req, res) => {
    if (!req.token || !canSendEmail(req.token.scopes.join(","))) {
      return res.status(403).json({ error: "Email not allowed" });
    }
    const body = req.body as z.infer<typeof ReminderSchema>;
    await sendReminderEmail(body.to, {
      locale: body.locale,
      processId: body.processId,
      message: body.message
    });
    await appendAuditEvent({
      eventType: AuditEventType.EMAIL_SENT,
      processId: body.processId,
      tokenId: req.token?.id,
      roleAtTime: req.token?.roleAtTime ?? null,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: { to: body.to, type: "reminder" }
    });
    res.json({ ok: true });
  }
);

const StatusSchema = z.object({
  to: z.string().email(),
  locale: z.enum(["en", "de"]).default("en"),
  processId: z.string(),
  status: z.string()
});

emailsRouter.post(
  "/status",
  tokenAuth,
  validateBody(StatusSchema),
  async (req, res) => {
    if (!req.token || !canSendEmail(req.token.scopes.join(","))) {
      return res.status(403).json({ error: "Email not allowed" });
    }
    const body = req.body as z.infer<typeof StatusSchema>;
    await sendStatusEmail(body.to, {
      locale: body.locale,
      processId: body.processId,
      status: body.status
    });
    await appendAuditEvent({
      eventType: AuditEventType.EMAIL_SENT,
      processId: body.processId,
      tokenId: req.token?.id,
      roleAtTime: req.token?.roleAtTime ?? null,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: { to: body.to, type: "status" }
    });
    res.json({ ok: true });
  }
);
