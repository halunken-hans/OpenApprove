import crypto from "node:crypto";
import type { CookieOptions, Response } from "express";
import type { Token } from "@prisma/client";
import { env } from "../config.js";
import { parseScopes } from "./tokens.js";

export const SESSION_COOKIE_NAME = "oa_session";

type SessionPayload = {
  tokenId: string;
  scopes: string[];
  processId: string | null;
  participantId: string | null;
  customerNumber: string | null;
  uploaderId: string | null;
  roleAtTime: string | null;
  expiry: string;
  tokenCreatedAt: string;
};

function signingSecret() {
  return `${env.WEBHOOK_SIGNING_SECRET}:session:v1`;
}

function sign(value: string) {
  return crypto.createHmac("sha256", signingSecret()).update(value).digest("base64url");
}

function encodePayload(payload: SessionPayload) {
  const json = JSON.stringify(payload);
  const encoded = Buffer.from(json, "utf8").toString("base64url");
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

function decodePayload(raw: string): SessionPayload | null {
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  const expected = sign(encoded);
  const left = Buffer.from(signature, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const json = Buffer.from(encoded, "base64url").toString("utf8");
    const payload = JSON.parse(json) as Partial<SessionPayload>;
    if (
      !payload ||
      typeof payload !== "object" ||
      typeof payload.tokenId !== "string" ||
      !Array.isArray(payload.scopes) ||
      typeof payload.expiry !== "string" ||
      typeof payload.tokenCreatedAt !== "string"
    ) {
      return null;
    }
    return {
      tokenId: payload.tokenId,
      scopes: payload.scopes.map((scope) => String(scope)),
      processId: payload.processId ?? null,
      participantId: payload.participantId ?? null,
      customerNumber: payload.customerNumber ?? null,
      uploaderId: payload.uploaderId ?? null,
      roleAtTime: payload.roleAtTime ?? null,
      expiry: payload.expiry,
      tokenCreatedAt: payload.tokenCreatedAt
    };
  } catch {
    return null;
  }
}

function cookieOptions(expiry: Date): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: env.BASE_URL.startsWith("https://"),
    expires: expiry,
    path: "/"
  };
}

export function setSessionCookie(res: Response, token: Pick<Token, "id" | "scopes" | "processId" | "participantId" | "customerNumber" | "uploaderId" | "roleAtTime" | "expiry" | "createdAt">) {
  const payload: SessionPayload = {
    tokenId: token.id,
    scopes: parseScopes(token.scopes),
    processId: token.processId,
    participantId: token.participantId,
    customerNumber: token.customerNumber,
    uploaderId: token.uploaderId,
    roleAtTime: token.roleAtTime,
    expiry: token.expiry.toISOString(),
    tokenCreatedAt: token.createdAt.toISOString()
  };
  const encoded = encodePayload(payload);
  res.cookie(SESSION_COOKIE_NAME, encoded, cookieOptions(token.expiry));
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    path: "/",
    sameSite: "lax",
    secure: env.BASE_URL.startsWith("https://")
  });
}

export function readSessionCookie(rawCookieValue: string | undefined | null) {
  if (!rawCookieValue) return null;
  const payload = decodePayload(rawCookieValue);
  if (!payload) return null;
  const expiry = new Date(payload.expiry);
  const tokenCreatedAt = new Date(payload.tokenCreatedAt);
  if (Number.isNaN(expiry.getTime()) || Number.isNaN(tokenCreatedAt.getTime())) return null;
  return {
    tokenId: payload.tokenId,
    scopes: payload.scopes,
    processId: payload.processId,
    participantId: payload.participantId,
    customerNumber: payload.customerNumber,
    uploaderId: payload.uploaderId,
    roleAtTime: payload.roleAtTime,
    expiry,
    tokenCreatedAt
  };
}
