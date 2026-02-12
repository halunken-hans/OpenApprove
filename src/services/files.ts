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
  uploadedByUploaderId?: string | null;
  uploadedByUploaderEmail?: string | null;
  uploadedByUploaderName?: string | null;
}) {
  const normalized = normalizeFilename(params.originalFilename);
  const downloadSha256 = sha256Hex(params.downloadBuffer);
  const hasViewFile = Boolean(params.viewBuffer && params.viewMime);
  const viewSha256 = hasViewFile ? sha256Hex(params.viewBuffer as Buffer) : null;
  return prisma.$transaction(async (tx) => {
    const process = await tx.process.findUnique({
      where: { id: params.processId },
      select: { id: true, uploaderId: true, uploaderEmail: true, uploaderName: true }
    });
    if (!process) {
      throw new Error(`Process not found: ${params.processId}`);
    }
    const effectiveUploaderId = params.uploadedByUploaderId ?? process.uploaderId;
    const effectiveUploaderEmail = params.uploadedByUploaderEmail ?? process.uploaderEmail ?? null;
    const effectiveUploaderName = params.uploadedByUploaderName ?? process.uploaderName ?? null;
    if (
      process.uploaderId !== effectiveUploaderId ||
      process.uploaderEmail !== effectiveUploaderEmail ||
      process.uploaderName !== effectiveUploaderName
    ) {
      await tx.process.update({
        where: { id: process.id },
        data: {
          uploaderId: effectiveUploaderId,
          uploaderEmail: effectiveUploaderEmail,
          uploaderName: effectiveUploaderName
        }
      });
    }

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
        uploadedByUploaderId: effectiveUploaderId,
        uploadedByUploaderEmail: effectiveUploaderEmail,
        uploadedByUploaderName: effectiveUploaderName,
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
