import { Router } from "express";
import { z } from "zod";
import { tokenAuth, requireAnyScope } from "../middleware/auth.js";
import { validateBody } from "../utils/validation.js";
import { createToken } from "../services/tokens.js";
import { appendAuditEvent } from "../services/audit.js";
import { AuditEventType } from "@prisma/client";

export const tokensRouter = Router();

const CreateTokenSchema = z.object({
  scopes: z.array(z.string().min(1)),
  expiry: z.string().datetime(),
  oneTime: z.boolean().optional(),
  processId: z.string().optional(),
  participantId: z.string().optional(),
  customerNumber: z.string().optional(),
  uploaderId: z.string().optional(),
  roleAtTime: z.string().optional()
});

tokensRouter.post(
  "/",
  tokenAuth,
  requireAnyScope(["ADMIN"]),
  validateBody(CreateTokenSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof CreateTokenSchema>;
    const { token, raw } = await createToken({
      scopes: body.scopes,
      expiry: new Date(body.expiry),
      oneTime: body.oneTime,
      processId: body.processId,
      participantId: body.participantId,
      customerNumber: body.customerNumber,
      uploaderId: body.uploaderId,
      roleAtTime: body.roleAtTime
    });
    await appendAuditEvent({
      eventType: AuditEventType.TOKEN_CREATED,
      tokenId: token.id,
      roleAtTime: body.roleAtTime ?? null,
      customerNumber: body.customerNumber ?? null,
      uploaderId: body.uploaderId ?? null,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: { scopes: body.scopes, expiry: body.expiry, oneTime: body.oneTime }
    });
    res.status(201).json({ token: raw, tokenId: token.id, expiry: token.expiry });
  }
);
