import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db.js";
import { sha256Hex } from "../utils/crypto.js";
import { env } from "../config.js";

export function normalizeFilename(name: string) {
  return name.trim().toLowerCase();
}

export async function storeFileVersion(params: {
  processId: string;
  originalFilename: string;
  buffer: Buffer;
  mime: string;
  attributesJson?: Record<string, unknown>;
}) {
  const normalized = normalizeFilename(params.originalFilename);
  const existingFile = await prisma.file.findFirst({
    where: { processId: params.processId, normalizedOriginalFilename: normalized }
  });
  const file = existingFile
    ? existingFile
    : await prisma.file.create({
        data: {
          processId: params.processId,
          originalFilename: params.originalFilename,
          normalizedOriginalFilename: normalized
        }
      });

  const lastVersion = await prisma.fileVersion.findFirst({
    where: { fileId: file.id },
    orderBy: { versionNumber: "desc" }
  });
  const versionNumber = nextVersionNumber(lastVersion?.versionNumber);
  const sha256 = sha256Hex(params.buffer);
  const storageDir = path.resolve(env.STORAGE_DIR, file.id);
  await fs.mkdir(storageDir, { recursive: true });
  const storagePath = path.join(storageDir, `${versionNumber}.bin`);
  await fs.writeFile(storagePath, params.buffer);

  const fileVersion = await prisma.fileVersion.create({
    data: {
      fileId: file.id,
      versionNumber,
      sha256,
      size: params.buffer.length,
      mime: params.mime,
      storagePath,
      attributesJson: JSON.stringify(params.attributesJson ?? {})
    }
  });

  return { file, fileVersion };
}

export function nextVersionNumber(lastVersionNumber?: number | null) {
  return (lastVersionNumber ?? 0) + 1;
}
