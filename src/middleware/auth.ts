import { Request, Response, NextFunction } from "express";
import { validateToken, markTokenUsed, parseScopes } from "../services/tokens.js";

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

export async function tokenAuth(req: Request, res: Response, next: NextFunction) {
  const raw = extractToken(req);
  if (!raw) return res.status(401).json({ code: "TOKEN_MISSING", error: "Missing token" });
  const result = await validateToken(raw);
  if (!result.ok) {
    if (result.reason === "EXPIRED") {
      return res.status(401).json({ code: "TOKEN_EXPIRED", error: "Token expired" });
    }
    if (result.reason === "USED") {
      return res.status(401).json({ code: "TOKEN_USED", error: "Token already used" });
    }
    return res.status(401).json({ code: "TOKEN_INVALID", error: "Invalid token" });
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
