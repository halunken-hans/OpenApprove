import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db.js";
import { sha256Hex } from "../utils/crypto.js";
import { env } from "../config.js";
import { ApprovalRule } from "@prisma/client";

export function normalizeFilename(name: string) {
  return name.trim().toLowerCase();
}

export async function storeFileVersion(params: {
  processId: string;
  originalFilename: string;
  buffer: Buffer;
  mime: string;
  approvalRule?: ApprovalRule;
  approvalPolicyJson?: Record<string, unknown>;
  attributesJson?: Record<string, unknown>;
}) {
  const normalized = normalizeFilename(params.originalFilename);
  const sha256 = sha256Hex(params.buffer);
  return prisma.$transaction(async (tx) => {
    const existingFile = await tx.file.findFirst({
      where: { processId: params.processId, normalizedOriginalFilename: normalized }
    });
    const file = existingFile
      ? existingFile
      : await tx.file.create({
          data: {
            processId: params.processId,
            originalFilename: params.originalFilename,
            normalizedOriginalFilename: normalized
          }
        });

    const lastVersion = await tx.fileVersion.findFirst({
      where: { fileId: file.id },
      orderBy: { versionNumber: "desc" }
    });
    const versionNumber = nextVersionNumber(lastVersion?.versionNumber);
    const storageDir = path.resolve(env.STORAGE_DIR, file.id);
    await fs.mkdir(storageDir, { recursive: true });
    const storagePath = path.join(storageDir, `${versionNumber}.bin`);
    await fs.writeFile(storagePath, params.buffer);

    const fileVersion = await tx.fileVersion.create({
      data: {
        fileId: file.id,
        versionNumber,
        sha256,
        size: params.buffer.length,
        mime: params.mime,
        storagePath,
        approvalRule: params.approvalRule ?? ApprovalRule.ALL_APPROVE,
        approvalPolicyJson: JSON.stringify(params.approvalPolicyJson ?? {}),
        attributesJson: JSON.stringify(params.attributesJson ?? {}),
        isCurrent: true
      }
    });

    const previousActive = await tx.fileVersion.findMany({
      where: {
        fileId: file.id,
        isCurrent: true,
        id: { not: fileVersion.id }
      },
      select: { id: true }
    });

    if (previousActive.length > 0) {
      await tx.fileVersion.updateMany({
        where: {
          fileId: file.id,
          isCurrent: true,
          id: { not: fileVersion.id }
        },
        data: {
          isCurrent: false,
          supersededAt: new Date(),
          supersededByVersionId: fileVersion.id
        }
      });
    }

    return { file, fileVersion, supersededVersionIds: previousActive.map((item) => item.id) };
  });
}

export function nextVersionNumber(lastVersionNumber?: number | null) {
  return (lastVersionNumber ?? 0) + 1;
}
