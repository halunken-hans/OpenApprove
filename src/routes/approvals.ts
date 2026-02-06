import { Router } from "express";
import { z } from "zod";
import { tokenAuth, requireAnyScope } from "../middleware/auth.js";
import { validateBody } from "../utils/validation.js";
import { configureCycles, recordDecision, startCycles } from "../services/approvals.js";
import { prisma } from "../db.js";
import { appendAuditEvent } from "../services/audit.js";
import { AuditEventType, ApprovalRule, DecisionType, ParticipantRole, ParticipantStatus } from "@prisma/client";
import { createToken } from "../services/tokens.js";
import { sendInviteEmail } from "../services/email.js";
import { handoffRoleUpdate } from "../services/inviteLogic.js";
import { emitWebhook } from "../services/webhooks.js";

export const approvalsRouter = Router();

const CycleSchema = z.object({
  order: z.number().int().min(1),
  rule: z.nativeEnum(ApprovalRule),
  participants: z.array(z.object({
    role: z.nativeEnum(ParticipantRole),
    email: z.string().email().optional(),
    displayName: z.string().optional()
  }))
});

const ConfigureSchema = z.object({
  processId: z.string(),
  cycles: z.array(CycleSchema)
});

approvalsRouter.post(
  "/cycles",
  tokenAuth,
  requireAnyScope(["ADMIN"]),
  validateBody(ConfigureSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof ConfigureSchema>;
    await configureCycles(body.processId, body.cycles);
    await appendAuditEvent({
      eventType: AuditEventType.CYCLE_CONFIGURED,
      processId: body.processId,
      tokenId: req.token?.id,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: body
    });
    await emitWebhook("cycle.configured", { processId: body.processId });
    res.json({ ok: true });
  }
);

const StartSchema = z.object({
  processId: z.string()
});

approvalsRouter.post(
  "/start",
  tokenAuth,
  requireAnyScope(["ADMIN"]),
  validateBody(StartSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof StartSchema>;
    const process = await startCycles(body.processId);
    await appendAuditEvent({
      eventType: AuditEventType.CYCLE_STARTED,
      processId: process.id,
      tokenId: req.token?.id,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: body
    });
    await emitWebhook("cycle.started", { processId: process.id });
    res.json(process);
  }
);

const DecisionSchema = z.object({
  processId: z.string(),
  participantId: z.string(),
  decision: z.nativeEnum(DecisionType),
  reason: z.string().optional(),
  fileVersionId: z.string().optional()
});

approvalsRouter.post(
  "/decide",
  tokenAuth,
  requireAnyScope(["DECIDE"]),
  validateBody(DecisionSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof DecisionSchema>;
    if (req.token?.processId && req.token.processId !== body.processId) {
      return res.status(403).json({ error: "Token not bound to process" });
    }
    if (req.token?.participantId && req.token.participantId !== body.participantId) {
      return res.status(403).json({ error: "Token not bound to participant" });
    }
    if (body.decision === DecisionType.REJECT && !body.reason) {
      return res.status(400).json({ error: "Rejection reason required" });
    }
    const result = await recordDecision({
      processId: body.processId,
      participantId: body.participantId,
      decision: body.decision,
      reason: body.reason,
      fileVersionId: body.fileVersionId
    });
    await appendAuditEvent({
      eventType: body.decision === DecisionType.REJECT ? AuditEventType.REJECTION_RECORDED : AuditEventType.DECISION_RECORDED,
      processId: body.processId,
      tokenId: req.token?.id,
      roleAtTime: req.token?.roleAtTime ?? null,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: body
    });
    await emitWebhook("decision.recorded", { processId: body.processId, decision: body.decision });
    res.json(result);
  }
);

const InviteSchema = z.object({
  processId: z.string(),
  cycleId: z.string(),
  approverParticipantId: z.string(),
  email: z.string().email(),
  displayName: z.string().optional(),
  locale: z.enum(["en", "de"]).default("en"),
  handoffRole: z.boolean().default(false)
});

approvalsRouter.post(
  "/invite",
  tokenAuth,
  requireAnyScope(["INVITE_REVIEWER"]),
  validateBody(InviteSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof InviteSchema>;
    const approver = await prisma.participant.findUnique({ where: { id: body.approverParticipantId } });
    if (!approver) return res.status(404).json({ error: "Approver not found" });

    const reviewer = await prisma.participant.create({
      data: {
        cycleId: body.cycleId,
        role: ParticipantRole.REVIEWER,
        email: body.email,
        displayName: body.displayName ?? null
      }
    });

    if (body.handoffRole) {
      const update = handoffRoleUpdate();
      await prisma.participant.update({
        where: { id: approver.id },
        data: { role: update.role, status: update.status }
      });
    }

    const tokenPayload = await createToken({
      scopes: ["VIEW_PDF", "DOWNLOAD_PDF"],
      expiry: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
      roleAtTime: "REVIEWER"
    });

    await prisma.participant.update({
      where: { id: reviewer.id },
      data: { tokenId: tokenPayload.token.id }
    });

    await sendInviteEmail(body.email, {
      locale: body.locale,
      role: "REVIEWER",
      processId: body.processId,
      token: tokenPayload.raw
    });

    await appendAuditEvent({
      eventType: AuditEventType.ROLE_CHANGED,
      processId: body.processId,
      cycleId: body.cycleId,
      tokenId: req.token?.id,
      roleAtTime: req.token?.roleAtTime ?? null,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: { invitee: body.email, handoffRole: body.handoffRole }
    });
    await emitWebhook("reviewer.invited", { processId: body.processId, email: body.email, handoffRole: body.handoffRole });

    res.json({ reviewerId: reviewer.id, tokenId: tokenPayload.token.id });
  }
);
