import { Router } from "express";
import { z } from "zod";
import { tokenAuth, requireScope } from "../middleware/auth.js";
import { validateQuery } from "../utils/validation.js";
import { prisma } from "../db.js";
import { appendAuditEvent } from "../services/audit.js";
import { AuditEventType, ProcessStatus, type Prisma } from "@prisma/client";

export const portalRouter = Router();

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(50),
  page: z.coerce.number().int().min(1).default(1),
  projectNumber: z.string().trim().optional(),
  status: z.nativeEnum(ProcessStatus).optional()
});

function minimalProcess(process: {
  id: string;
  projectNumber: string;
  customerNumber: string;
  createdAt: Date;
  status: string;
}) {
  return {
    id: process.id,
    projectNumber: process.projectNumber,
    customerNumber: process.customerNumber,
    createdAt: process.createdAt,
    status: process.status
  };
}

function buildProjectFilter(query: z.infer<typeof ListQuery>) {
  const and: Prisma.ProcessWhereInput[] = [];
  if (query.projectNumber) {
    and.push({
      projectNumber: {
        contains: query.projectNumber
      }
    });
  }
  if (query.status) {
    and.push({ status: query.status });
  }
  return and.length > 0 ? { AND: and } : {};
}

async function listProcesses(where: Prisma.ProcessWhereInput, query: z.infer<typeof ListQuery>) {
  const total = await prisma.process.count({ where });
  const pages = Math.max(1, Math.ceil(total / query.limit));
  const page = Math.min(query.page, pages);
  const skip = (page - 1) * query.limit;
  const processes = await prisma.process.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit,
    skip
  });
  return {
    data: processes.map(minimalProcess),
    page,
    pages,
    total
  };
}

async function resolveActorIdentity(token: {
  participantId?: string | null;
  uploaderId?: string | null;
  customerNumber?: string | null;
}) {
  let actorEmail: string | null = null;
  let actorDisplayName: string | null = null;
  if (token.participantId) {
    const participant = await prisma.participant.findUnique({
      where: { id: token.participantId },
      select: { email: true, displayName: true }
    });
    actorEmail = participant?.email ?? null;
    actorDisplayName = participant?.displayName ?? null;
  }
  if (!actorEmail && token.uploaderId) {
    const uploaderProcess = await prisma.process.findFirst({
      where: {
        uploaderId: token.uploaderId,
        ...(token.customerNumber ? { customerNumber: token.customerNumber } : {})
      },
      orderBy: { createdAt: "desc" },
      select: { uploaderEmail: true, uploaderName: true }
    });
    actorEmail = uploaderProcess?.uploaderEmail ?? null;
    actorDisplayName = uploaderProcess?.uploaderName ?? null;
  }
  return {
    actorEmail: actorEmail ? actorEmail.trim().toLowerCase() : null,
    actorDisplayName
  };
}

portalRouter.get(
  "/context",
  tokenAuth,
  requireScope("CUSTOMER_PORTAL_VIEW"),
  async (req, res) => {
    const identity = await resolveActorIdentity({
      participantId: req.token?.participantId,
      uploaderId: req.token?.uploaderId,
      customerNumber: req.token?.customerNumber
    });
    res.json({
      actorEmail: identity.actorEmail,
      actorDisplayName: identity.actorDisplayName,
      roleAtTime: req.token?.roleAtTime ?? null,
      customerNumber: req.token?.customerNumber ?? null,
      expiry: req.token?.expiry ?? null
    });
  }
);

portalRouter.get(
  "/processes",
  tokenAuth,
  requireScope("CUSTOMER_PORTAL_VIEW"),
  validateQuery(ListQuery),
  async (req, res) => {
    const query = req.query as unknown as z.infer<typeof ListQuery>;
    if (!req.token?.customerNumber) {
      return res.json({ data: [], page: 1, pages: 1, total: 0 });
    }
    const where: Prisma.ProcessWhereInput = {
      customerNumber: req.token.customerNumber,
      ...buildProjectFilter(query)
    };
    const payload = await listProcesses(where, query);
    await appendAuditEvent({
      eventType: AuditEventType.ACCESS_LOGGED,
      customerNumber: req.token.customerNumber,
      tokenId: req.token?.id,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: { action: "portal.processes" }
    });
    res.json(payload);
  }
);

portalRouter.get(
  "/my-uploads",
  tokenAuth,
  requireScope("CUSTOMER_PORTAL_VIEW"),
  validateQuery(ListQuery),
  async (req, res) => {
    const query = req.query as unknown as z.infer<typeof ListQuery>;
    if (!req.token?.uploaderId) {
      return res.json({ data: [], page: 1, pages: 1, total: 0 });
    }
    const where: Prisma.ProcessWhereInput = {
      uploaderId: req.token.uploaderId,
      ...buildProjectFilter(query)
    };
    const payload = await listProcesses(where, query);
    await appendAuditEvent({
      eventType: AuditEventType.ACCESS_LOGGED,
      uploaderId: req.token.uploaderId,
      tokenId: req.token?.id,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: { action: "portal.myUploads" }
    });
    res.json(payload);
  }
);

portalRouter.get(
  "/company-uploads",
  tokenAuth,
  requireScope("CUSTOMER_PORTAL_VIEW"),
  validateQuery(ListQuery),
  async (req, res) => {
    const query = req.query as unknown as z.infer<typeof ListQuery>;
    if (!req.token?.customerNumber) {
      return res.json({ data: [], page: 1, pages: 1, total: 0 });
    }
    const where: Prisma.ProcessWhereInput = {
      customerNumber: req.token.customerNumber,
      ...buildProjectFilter(query)
    };
    const payload = await listProcesses(where, query);
    await appendAuditEvent({
      eventType: AuditEventType.ACCESS_LOGGED,
      customerNumber: req.token.customerNumber,
      tokenId: req.token?.id,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: { action: "portal.companyUploads" }
    });
    res.json(payload);
  }
);

portalRouter.get(
  "/my-projects",
  tokenAuth,
  requireScope("CUSTOMER_PORTAL_VIEW"),
  validateQuery(ListQuery),
  async (req, res) => {
    const query = req.query as unknown as z.infer<typeof ListQuery>;
    const identity = await resolveActorIdentity({
      participantId: req.token?.participantId,
      uploaderId: req.token?.uploaderId,
      customerNumber: req.token?.customerNumber
    });
    const roleMembershipFilters: Prisma.ProcessWhereInput[] = [];
    if (identity.actorEmail) {
      roleMembershipFilters.push({ uploaderEmail: identity.actorEmail });
      roleMembershipFilters.push({
        cycles: {
          some: {
            participants: {
              some: {
                email: identity.actorEmail
              }
            }
          }
        }
      });
    }
    if (req.token?.uploaderId) {
      roleMembershipFilters.push({ uploaderId: req.token.uploaderId });
    }
    if (roleMembershipFilters.length === 0) {
      return res.json({ data: [], page: 1, pages: 1, total: 0 });
    }
    const where: Prisma.ProcessWhereInput = {
      ...buildProjectFilter(query),
      OR: roleMembershipFilters
    };
    if (req.token?.customerNumber) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        { customerNumber: req.token.customerNumber }
      ];
    }
    const payload = await listProcesses(where, query);
    await appendAuditEvent({
      eventType: AuditEventType.ACCESS_LOGGED,
      customerNumber: req.token?.customerNumber ?? null,
      uploaderId: req.token?.uploaderId ?? null,
      tokenId: req.token?.id,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: { action: "portal.myProjects" }
    });
    res.json(payload);
  }
);
