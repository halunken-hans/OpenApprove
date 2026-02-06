import { Router } from "express";
import { z } from "zod";
import { tokenAuth, requireAnyScope } from "../middleware/auth.js";
import { validateQuery } from "../utils/validation.js";
import { prisma } from "../db.js";
import { verifyAuditChain } from "../services/audit.js";

export const auditRouter = Router();

const ExportQuery = z.object({
  processId: z.string().optional()
});

auditRouter.get(
  "/export",
  tokenAuth,
  requireAnyScope(["ADMIN"]),
  validateQuery(ExportQuery),
  async (req, res) => {
    const query = req.query as z.infer<typeof ExportQuery>;
    const events = await prisma.auditEvent.findMany({
      where: query.processId ? { processId: query.processId } : undefined,
      orderBy: { timestampUtc: "asc" }
    });
    res.setHeader("Content-Type", "application/x-ndjson");
    for (const event of events) {
      res.write(JSON.stringify(event) + "\n");
    }
    res.end();
  }
);

auditRouter.get(
  "/verify",
  tokenAuth,
  requireAnyScope(["ADMIN"]),
  validateQuery(ExportQuery),
  async (req, res) => {
    const query = req.query as z.infer<typeof ExportQuery>;
    const events = await prisma.auditEvent.findMany({
      where: query.processId ? { processId: query.processId } : undefined,
      orderBy: { timestampUtc: "asc" }
    });
    const payloads = events.map(event => ({
      prevHash: event.prevHash,
      eventHash: event.eventHash,
      payload: {
        timestampUtc: event.timestampUtc.toISOString(),
        eventType: event.eventType,
        processId: event.processId,
        cycleId: event.cycleId,
        fileId: event.fileId,
        fileVersionId: event.fileVersionId,
        tokenId: event.tokenId,
        roleAtTime: event.roleAtTime,
        customerNumber: event.customerNumber,
        uploaderId: event.uploaderId,
        ip: event.ip,
        userAgent: event.userAgent,
        validatedData: event.validatedData
      }
    }));
    const result = verifyAuditChain(payloads);
    res.json(result);
  }
);
