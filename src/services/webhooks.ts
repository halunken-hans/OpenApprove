import { prisma } from "../db.js";
import { Prisma } from "@prisma/client";
import { hmacSha256Hex } from "../utils/crypto.js";

export async function registerWebhook(input: { url: string; secret: string; events: string[] }) {
  return prisma.webhook.create({
    data: {
      url: input.url,
      secret: input.secret,
      events: input.events.join(",")
    }
  });
}

export async function emitWebhook(eventType: string, payload: unknown) {
  const hooks = await prisma.webhook.findMany({ where: { active: true } });
  for (const hook of hooks) {
    const events = hook.events.split(",").map(e => e.trim()).filter(Boolean);
    if (events.length > 0 && !events.includes(eventType)) continue;
    const body = JSON.stringify({ eventType, payload });
    const signature = hmacSha256Hex(hook.secret, body);
    let status = "FAILED";
    let responseCode: number | null = null;
    let error: string | null = null;
    try {
      const res = await fetch(hook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OpenApprove-Signature": signature
        },
        body
      });
      status = res.ok ? "DELIVERED" : "FAILED";
      responseCode = res.status;
    } catch (err) {
      error = err instanceof Error ? err.message : "unknown";
    }

    await prisma.webhookDelivery.create({
      data: {
        webhookId: hook.id,
        eventType,
        payload: payload as Prisma.InputJsonValue,
        signature,
        status,
        responseCode: responseCode ?? undefined,
        error: error ?? undefined,
        deliveredAt: status === "DELIVERED" ? new Date() : undefined
      }
    });
  }
}
