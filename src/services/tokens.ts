import { prisma } from "../db.js";
import { randomToken, sha256Hex } from "../utils/crypto.js";

export type TokenInput = {
  scopes: string[];
  expiry: Date;
  oneTime?: boolean;
  processId?: string;
  participantId?: string;
  customerNumber?: string;
  uploaderId?: string;
  roleAtTime?: string;
};

export async function createToken(input: TokenInput) {
  const raw = randomToken(32);
  const tokenHash = sha256Hex(raw);
  const token = await prisma.token.create({
    data: {
      tokenHash,
      scopes: input.scopes.join(","),
      expiry: input.expiry,
      oneTime: input.oneTime ?? false,
      processId: input.processId ?? null,
      participantId: input.participantId ?? null,
      customerNumber: input.customerNumber ?? null,
      uploaderId: input.uploaderId ?? null,
      roleAtTime: input.roleAtTime ?? null
    }
  });
  return { token, raw };
}

export function isTokenUsable(token: { expiry: Date; oneTime: boolean; lastUsedAt: Date | null }, now = new Date()) {
  if (token.expiry.getTime() < now.getTime()) return { ok: false, reason: "EXPIRED" } as const;
  if (token.oneTime && token.lastUsedAt) return { ok: false, reason: "USED" } as const;
  return { ok: true } as const;
}

export async function validateToken(raw: string) {
  const tokenHash = sha256Hex(raw);
  const token = await prisma.token.findUnique({ where: { tokenHash } });
  if (!token) return { ok: false, reason: "NOT_FOUND" } as const;
  const usable = isTokenUsable(token);
  if (!usable.ok) return { ok: false, reason: usable.reason, token } as const;
  return { ok: true, token } as const;
}

export async function markTokenUsed(tokenId: string) {
  return prisma.token.update({
    where: { id: tokenId },
    data: { lastUsedAt: new Date() }
  });
}

export function parseScopes(scopeString: string): string[] {
  return scopeString.split(",").map(s => s.trim()).filter(Boolean);
}

export function hasScope(scopeString: string, scope: string): boolean {
  return parseScopes(scopeString).includes(scope);
}

export function canSendEmail(scopeString: string): boolean {
  const scopes = parseScopes(scopeString);
  return scopes.includes("DECIDE") || scopes.includes("INVITE_REVIEWER");
}
