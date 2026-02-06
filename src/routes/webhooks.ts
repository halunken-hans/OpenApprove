import { Router } from "express";
import { z } from "zod";
import { tokenAuth, requireAnyScope } from "../middleware/auth.js";
import { validateBody } from "../utils/validation.js";
import { registerWebhook } from "../services/webhooks.js";
import { appendAuditEvent } from "../services/audit.js";
import { AuditEventType } from "@prisma/client";

export const webhooksRouter = Router();

const RegisterSchema = z.object({
  url: z.string().url(),
  secret: z.string().min(16),
  events: z.array(z.string().min(1)).default([])
});

webhooksRouter.post(
  "/",
  tokenAuth,
  requireAnyScope(["ADMIN"]),
  validateBody(RegisterSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof RegisterSchema>;
    const webhook = await registerWebhook(body);
    await appendAuditEvent({
      eventType: AuditEventType.WEBHOOK_REGISTERED,
      tokenId: req.token?.id,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: { url: body.url, events: body.events }
    });
    res.status(201).json(webhook);
  }
);
