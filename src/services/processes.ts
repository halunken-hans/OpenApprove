import { prisma } from "../db.js";

export async function createProcess(input: {
  customerNumber: string;
  attributesJson?: Record<string, unknown>;
  uploaderId: string;
  uploaderEmail?: string | null;
  uploaderName?: string | null;
}) {
  return prisma.process.create({
    data: {
      customerNumber: input.customerNumber,
      attributesJson: JSON.stringify(input.attributesJson ?? {}),
      uploaderId: input.uploaderId,
      uploaderEmail: input.uploaderEmail ?? null,
      uploaderName: input.uploaderName ?? null
    }
  });
}

export async function updateProcessAttributes(processId: string, attributesJson: Record<string, unknown>) {
  return prisma.process.update({
    where: { id: processId },
    data: { attributesJson: JSON.stringify(attributesJson) }
  });
}
