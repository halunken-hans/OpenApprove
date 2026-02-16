import { Request, Response, NextFunction } from "express";
import { validateToken, markTokenUsed, parseScopes } from "../services/tokens.js";
import { prisma } from "../db.js";
import { SESSION_COOKIE_NAME, readSessionCookie, clearSessionCookie } from "../services/session.js";

export type TokenContext = {
  id: string;
  scopes: string[];
  processId?: string | null;
  participantId?: string | null;
  customerNumber?: string | null;
  uploaderId?: string | null;
  roleAtTime?: string | null;
  expiry: Date;
};

declare module "express-serve-static-core" {
  interface Request {
    token?: TokenContext;
    rawToken?: string;
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  const queryToken = typeof req.query.token === "string" ? req.query.token : null;
  return queryToken;
}

function getCookieValue(req: Request, name: string) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const entries = raw.split(";");
  for (const entry of entries) {
    const [k, ...rest] = entry.trim().split("=");
    if (k === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function hasNewerVersion(processId: string, createdAt: Date) {
  const newerVersionExists = await prisma.fileVersion.findFirst({
    where: {
      file: { processId },
      createdAt: { gt: createdAt }
    },
    select: { id: true }
  });
  return Boolean(newerVersionExists);
}

export async function tokenAuth(req: Request, res: Response, next: NextFunction) {
  const raw = extractToken(req);
  if (raw) {
    const result = await validateToken(raw);
    if (!result.ok) {
      if (result.reason === "EXPIRED") {
        if (result.token?.processId && (await hasNewerVersion(result.token.processId, result.token.createdAt))) {
          return res.status(401).json({
            code: "TOKEN_REPLACED",
            error: "Token invalidated because a newer file version was uploaded"
          });
        }
        return res.status(401).json({ code: "TOKEN_EXPIRED", error: "Token expired" });
      }
      if (result.reason === "USED") {
        return res.status(401).json({ code: "TOKEN_USED", error: "Token already used" });
      }
      return res.status(401).json({ code: "TOKEN_INVALID", error: "Invalid token" });
    }
    if (result.token.processId && (await hasNewerVersion(result.token.processId, result.token.createdAt))) {
      return res.status(401).json({
        code: "TOKEN_REPLACED",
        error: "Token invalidated because a newer file version was uploaded"
      });
    }
    if (result.token.oneTime && !result.token.lastUsedAt) {
      await markTokenUsed(result.token.id);
    }
    req.rawToken = raw;
    req.token = {
      id: result.token.id,
      scopes: parseScopes(result.token.scopes),
      processId: result.token.processId,
      participantId: result.token.participantId,
      customerNumber: result.token.customerNumber,
      uploaderId: result.token.uploaderId,
      roleAtTime: result.token.roleAtTime,
      expiry: result.token.expiry
    };
    return next();
  }

  const sessionRaw = getCookieValue(req, SESSION_COOKIE_NAME);
  const session = readSessionCookie(sessionRaw);
  if (!session) {
    clearSessionCookie(res);
    return res.status(401).json({ code: "TOKEN_MISSING", error: "Missing token" });
  }
  if (session.expiry.getTime() < Date.now()) {
    clearSessionCookie(res);
    return res.status(401).json({ code: "TOKEN_EXPIRED", error: "Token expired" });
  }
  if (session.processId && (await hasNewerVersion(session.processId, session.tokenCreatedAt))) {
    clearSessionCookie(res);
    return res.status(401).json({
      code: "TOKEN_REPLACED",
      error: "Token invalidated because a newer file version was uploaded"
    });
  }
  req.rawToken = undefined;
  req.token = {
    id: session.tokenId,
    scopes: session.scopes,
    processId: session.processId,
    participantId: session.participantId,
    customerNumber: session.customerNumber,
    uploaderId: session.uploaderId,
    roleAtTime: session.roleAtTime,
    expiry: session.expiry
  };
  return next();
}

export function requireScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const scopes = req.token?.scopes ?? [];
    if (!scopes.includes(scope)) {
      return res.status(403).json({ error: "Insufficient scope" });
    }
    return next();
  };
}

export function requireAnyScope(scopesRequired: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const scopes = req.token?.scopes ?? [];
    if (!scopesRequired.some(scope => scopes.includes(scope))) {
      return res.status(403).json({ error: "Insufficient scope" });
    }
    return next();
  };
}
