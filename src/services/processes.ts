import { prisma } from "../db.js";

export async function createProcess(input: {
  projectNumber: string;
  customerNumber: string;
  attributesJson?: Record<string, unknown>;
  uploaderId: string;
  uploaderEmail?: string | null;
  uploaderName?: string | null;
}) {
  const existing = await prisma.process.findFirst({
    where: {
      customerNumber: input.customerNumber,
      projectNumber: input.projectNumber
    }
  });
  if (existing) {
    return existing;
  }

  return prisma.process.create({
    data: {
      projectNumber: input.projectNumber,
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
