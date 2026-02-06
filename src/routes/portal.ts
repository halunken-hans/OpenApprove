import { Router } from "express";
import { z } from "zod";
import { tokenAuth, requireScope } from "../middleware/auth.js";
import { validateQuery } from "../utils/validation.js";
import { prisma } from "../db.js";
import { appendAuditEvent } from "../services/audit.js";
import { AuditEventType } from "@prisma/client";

export const portalRouter = Router();

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional()
});

function minimalProcess(process: { id: string; customerNumber: string; createdAt: Date; status: string }) {
  return {
    id: process.id,
    customerNumber: process.customerNumber,
    createdAt: process.createdAt,
    status: process.status
  };
}

portalRouter.get(
  "/processes",
  tokenAuth,
  requireScope("CUSTOMER_PORTAL_VIEW"),
  validateQuery(ListQuery),
  async (req, res) => {
    const query = req.query as unknown as z.infer<typeof ListQuery>;
    if (!req.token?.customerNumber) return res.status(403).json({ error: "Missing customer binding" });
    const where = { customerNumber: req.token.customerNumber };
    const processes = await prisma.process.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: query.limit,
      skip: query.cursor ? 1 : 0,
      ...(query.cursor ? { cursor: { id: query.cursor } } : {})
    });
    await appendAuditEvent({
      eventType: AuditEventType.ACCESS_LOGGED,
      customerNumber: req.token.customerNumber,
      tokenId: req.token?.id,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: { action: "portal.processes" }
    });
    res.json({
      data: processes.map(minimalProcess),
      nextCursor: processes.length === query.limit ? processes[processes.length - 1].id : null
    });
  }
);

portalRouter.get(
  "/my-uploads",
  tokenAuth,
  requireScope("CUSTOMER_PORTAL_VIEW"),
  validateQuery(ListQuery),
  async (req, res) => {
    const query = req.query as unknown as z.infer<typeof ListQuery>;
    if (!req.token?.uploaderId) return res.status(403).json({ error: "Missing uploader binding" });
    const where = { uploaderId: req.token.uploaderId };
    const processes = await prisma.process.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: query.limit,
      skip: query.cursor ? 1 : 0,
      ...(query.cursor ? { cursor: { id: query.cursor } } : {})
    });
    await appendAuditEvent({
      eventType: AuditEventType.ACCESS_LOGGED,
      uploaderId: req.token.uploaderId,
      tokenId: req.token?.id,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: { action: "portal.myUploads" }
    });
    res.json({
      data: processes.map(minimalProcess),
      nextCursor: processes.length === query.limit ? processes[processes.length - 1].id : null
    });
  }
);

portalRouter.get(
  "/company-uploads",
  tokenAuth,
  requireScope("CUSTOMER_PORTAL_VIEW"),
  validateQuery(ListQuery),
  async (req, res) => {
    const query = req.query as unknown as z.infer<typeof ListQuery>;
    if (!req.token?.customerNumber) return res.status(403).json({ error: "Missing customer binding" });
    const where = { customerNumber: req.token.customerNumber };
    const processes = await prisma.process.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: query.limit,
      skip: query.cursor ? 1 : 0,
      ...(query.cursor ? { cursor: { id: query.cursor } } : {})
    });
    await appendAuditEvent({
      eventType: AuditEventType.ACCESS_LOGGED,
      customerNumber: req.token.customerNumber,
      tokenId: req.token?.id,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: { action: "portal.companyUploads" }
    });
    res.json({
      data: processes.map(minimalProcess),
      nextCursor: processes.length === query.limit ? processes[processes.length - 1].id : null
    });
  }
);
