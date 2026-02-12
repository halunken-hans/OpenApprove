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
  downloadBuffer: Buffer;
  downloadMime: string;
  viewBuffer?: Buffer | null;
  viewMime?: string | null;
  approvalRequired?: boolean;
  approvalRule?: ApprovalRule;
  approvalPolicyJson?: Record<string, unknown>;
  attributesJson?: Record<string, unknown>;
}) {
  const normalized = normalizeFilename(params.originalFilename);
  const downloadSha256 = sha256Hex(params.downloadBuffer);
  const hasViewFile = Boolean(params.viewBuffer && params.viewMime);
  const viewSha256 = hasViewFile ? sha256Hex(params.viewBuffer as Buffer) : null;
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
    const downloadStoragePath = path.join(storageDir, `${versionNumber}.download.bin`);
    await fs.writeFile(downloadStoragePath, params.downloadBuffer);
    let viewStoragePath: string | null = null;
    if (hasViewFile) {
      viewStoragePath = path.join(storageDir, `${versionNumber}.view.bin`);
      await fs.writeFile(viewStoragePath, params.viewBuffer as Buffer);
    }

    const fileVersion = await tx.fileVersion.create({
      data: {
        fileId: file.id,
        versionNumber,
        // Legacy single-file fields kept for compatibility; these mirror download values.
        sha256: downloadSha256,
        size: params.downloadBuffer.length,
        mime: params.downloadMime,
        storagePath: downloadStoragePath,
        downloadSha256,
        downloadSize: params.downloadBuffer.length,
        downloadMime: params.downloadMime,
        downloadStoragePath,
        viewSha256,
        viewSize: hasViewFile ? (params.viewBuffer as Buffer).length : null,
        viewMime: hasViewFile ? (params.viewMime as string) : null,
        viewStoragePath,
        approvalRequired: params.approvalRequired ?? true,
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
