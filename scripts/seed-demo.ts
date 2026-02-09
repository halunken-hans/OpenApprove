import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { ApprovalRule, ParticipantRole } from "@prisma/client";
import { prisma } from "../src/db.js";
import { env } from "../src/config.js";
import { createProcess } from "../src/services/processes.js";
import { storeFileVersion } from "../src/services/files.js";
import { configureCycles, startCycles } from "../src/services/approvals.js";
import { createToken } from "../src/services/tokens.js";

type SeedConfig = {
  customerNumber: string;
  projectNumber: string;
  uploaderId: string;
  uploaderEmail: string;
  uploaderDisplayName: string;
  filePaths: string[];
  approverEmails: string[];
  reviewerEmails: string[];
};

type SeedFile = {
  filename: string;
  buffer: Buffer;
};

function argValue(flag: string): string | undefined {
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === flag) {
      return process.argv[i + 1];
    }
  }
  return undefined;
}

function argValues(flag: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === flag && process.argv[i + 1]) {
      values.push(process.argv[i + 1]);
    }
  }
  return values;
}

function splitList(input?: string): string[] {
  if (!input) return [];
  return input
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getSeedConfig(): SeedConfig {
  const filesFromSingleFlag = argValues("--file");
  const filesFromListFlag = splitList(argValue("--files"));
  const filePaths = [...filesFromSingleFlag, ...filesFromListFlag].filter(Boolean);

  const approverEmails = argValues("--approvers").flatMap((value) => splitList(value));
  const reviewerEmails = argValues("--reviewers").flatMap((value) => splitList(value));

  return {
    customerNumber: argValue("--customer") ?? "D10000",
    projectNumber: argValue("--project") ?? "30001",
    uploaderId: argValue("--uploader") ?? "uploader-demo-001",
    uploaderEmail: argValue("--uploader-email") ?? "uploader@example.com",
    uploaderDisplayName: argValue("--uploader-name") ?? "Demo Uploader",
    filePaths,
    approverEmails: approverEmails.length > 0
      ? Array.from(new Set(approverEmails.map(normalizeEmail)))
      : ["approver@example.com"],
    reviewerEmails: Array.from(new Set(reviewerEmails.map(normalizeEmail)))
  };
}

async function buildFallbackPdfBuffer(projectNumber: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("OpenApprove Demo", { x: 50, y: 780, size: 24, font });
  page.drawText(`Project: ${projectNumber}`, { x: 50, y: 740, size: 14, font });
  page.drawText(`Generated: ${new Date().toISOString()}`, { x: 50, y: 720, size: 12, font });
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

async function loadPdfs(config: SeedConfig): Promise<SeedFile[]> {
  if (config.filePaths.length > 0) {
    const files: SeedFile[] = [];
    for (const filePath of config.filePaths) {
      const resolved = path.resolve(filePath);
      const buffer = await fs.readFile(resolved);
      files.push({ filename: path.basename(resolved), buffer });
    }
    return files;
  }
  const filename = `OpenApprove_${config.projectNumber}_demo.pdf`;
  const buffer = await buildFallbackPdfBuffer(config.projectNumber);
  return [{ filename, buffer }];
}

async function main() {
  const config = getSeedConfig();
  const pdfs = await loadPdfs(config);
  const approverSet = new Set(config.approverEmails.map(normalizeEmail));
  const reviewerEmails = config.reviewerEmails
    .map(normalizeEmail)
    .filter((email) => !approverSet.has(email));

  const processEntity = await createProcess({
    projectNumber: config.projectNumber,
    customerNumber: config.customerNumber,
    uploaderId: config.uploaderId,
    uploaderEmail: config.uploaderEmail,
    uploaderName: config.uploaderDisplayName,
    attributesJson: {
      channel: "demo-seed",
      language: "de",
      seededAt: new Date().toISOString()
    }
  });

  const uploadedFiles: Array<{
    fileId: string;
    fileVersionId: string;
    filename: string;
  }> = [];
  for (let i = 0; i < pdfs.length; i += 1) {
    const pdf = pdfs[i];
    const { file, fileVersion } = await storeFileVersion({
      processId: processEntity.id,
      originalFilename: pdf.filename,
      mime: "application/pdf",
      buffer: pdf.buffer,
      attributesJson: {
        variant: `demo-${i + 1}`,
        language: "de",
        printCondition: "proof"
      }
    });
    uploadedFiles.push({
      fileId: file.id,
      fileVersionId: fileVersion.id,
      filename: file.originalFilename || file.normalizedOriginalFilename
    });
  }

  await configureCycles(processEntity.id, [
    {
      order: 1,
      rule: ApprovalRule.ALL_APPROVE,
      participants: [
        ...config.approverEmails.map((email) => ({
          role: ParticipantRole.APPROVER,
          email,
          displayName: email
        })),
        ...reviewerEmails.map((email) => ({
          role: ParticipantRole.REVIEWER,
          email,
          displayName: email
        }))
      ]
    }
  ]);
  await startCycles(processEntity.id);

  const cycle = await prisma.approvalCycle.findFirst({
    where: { processId: processEntity.id, order: 1 }
  });
  if (!cycle) throw new Error("Failed to create demo approval cycle");
  const participants = await prisma.participant.findMany({
    where: { cycleId: cycle.id }
  });
  const participantByEmailRole = new Map<string, { id: string; role: ParticipantRole }>();
  for (const participant of participants) {
    if (!participant.email) continue;
    const key = `${participant.role}:${normalizeEmail(participant.email)}`;
    participantByEmailRole.set(key, { id: participant.id, role: participant.role });
  }

  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);
  const userSpecs = new Map<
    string,
    {
      email: string;
      roleLabels: string[];
      scopes: Set<string>;
      participantId?: string;
      uploaderId?: string;
      processId?: string;
      roleAtTime: string;
    }
  >();

  function ensureUser(email: string) {
    const key = normalizeEmail(email);
    const existing = userSpecs.get(key);
    if (existing) return existing;
    const created = {
      email: key,
      roleLabels: [],
      scopes: new Set<string>(["CUSTOMER_PORTAL_VIEW"]),
      roleAtTime: "VIEWER"
    };
    userSpecs.set(key, created);
    return created;
  }

  const uploaderUser = ensureUser(config.uploaderEmail);
  uploaderUser.roleLabels.push("UPLOADER");
  uploaderUser.uploaderId = config.uploaderId;
  uploaderUser.roleAtTime = "UPLOADER";

  for (const email of config.approverEmails) {
    const spec = ensureUser(email);
    spec.roleLabels.push("APPROVER");
    spec.scopes.add("VIEW_PDF");
    spec.scopes.add("DOWNLOAD_PDF");
    spec.scopes.add("ANNOTATE_PDF");
    spec.scopes.add("DECIDE");
    spec.scopes.add("INVITE_REVIEWER");
    spec.processId = processEntity.id;
    spec.roleAtTime = "APPROVER";
    const key = `${ParticipantRole.APPROVER}:${normalizeEmail(email)}`;
    const participant = participantByEmailRole.get(key);
    if (participant) spec.participantId = participant.id;
  }

  for (const email of reviewerEmails) {
    const spec = ensureUser(email);
    spec.roleLabels.push("REVIEWER");
    spec.scopes.add("VIEW_PDF");
    spec.scopes.add("DOWNLOAD_PDF");
    spec.scopes.add("ANNOTATE_PDF");
    spec.processId = processEntity.id;
    if (spec.roleAtTime !== "APPROVER") spec.roleAtTime = "REVIEWER";
    const key = `${ParticipantRole.REVIEWER}:${normalizeEmail(email)}`;
    const participant = participantByEmailRole.get(key);
    if (participant && !spec.participantId) spec.participantId = participant.id;
  }

  const issuedUserTokens: Array<{
    email: string;
    roles: string[];
    token: string;
    tokenId: string;
    scopes: string[];
    uiUrl?: string;
    portalUrl: string;
  }> = [];

  for (const spec of userSpecs.values()) {
    const scopes = Array.from(spec.scopes);
    const tokenPayload = await createToken({
      scopes,
      expiry: expiresAt,
      customerNumber: config.customerNumber,
      uploaderId: spec.uploaderId,
      processId: spec.processId,
      participantId: spec.participantId,
      roleAtTime: spec.roleAtTime
    });
    if (spec.participantId) {
      await prisma.participant.update({
        where: { id: spec.participantId },
        data: { tokenId: tokenPayload.token.id }
      });
    }
    const baseUrl = env.BASE_URL.replace(/\/$/, "");
    issuedUserTokens.push({
      email: spec.email,
      roles: Array.from(new Set(spec.roleLabels)),
      token: tokenPayload.raw,
      tokenId: tokenPayload.token.id,
      scopes,
      uiUrl: spec.processId ? `${baseUrl}/t/${tokenPayload.raw}?lang=de` : undefined,
      portalUrl: `${baseUrl}/portal?token=${tokenPayload.raw}&lang=de`
    });
  }

  const adminToken = await createToken({
    scopes: ["ADMIN", "UPLOAD_PROCESS"],
    expiry: expiresAt,
    roleAtTime: "ADMIN"
  });

  const baseUrl = env.BASE_URL.replace(/\/$/, "");

  console.log("");
  console.log("OpenApprove demo seed completed.");
  console.log(`Process ID: ${processEntity.id}`);
  console.log(`Project number: ${processEntity.projectNumber}`);
  console.log(`Customer number: ${processEntity.customerNumber}`);
  console.log(`Uploaded files: ${uploadedFiles.length}`);
  for (const file of uploadedFiles) {
    console.log(`- ${file.filename} | fileId=${file.fileId} | fileVersionId=${file.fileVersionId}`);
  }
  console.log("");
  console.log("User tokens and links:");
  for (const user of issuedUserTokens) {
    console.log(`- ${user.email} [${user.roles.join("+") || "VIEWER"}]`);
    console.log(`  Portal: ${user.portalUrl}`);
    if (user.uiUrl) {
      console.log(`  Role UI: ${user.uiUrl}`);
    }
    console.log(`  Token: ${user.token}`);
    console.log(`  Scopes: ${user.scopes.join(",")}`);
  }
  console.log("");
  console.log("Raw tokens:");
  console.log(`ADMIN: ${adminToken.raw}`);
  console.log("");
  console.log("Example auth header:");
  console.log(`Authorization: Bearer ${adminToken.raw}`);
  console.log("");
  console.log("CLI example:");
  console.log(
    `npm run seed:demo -- --customer D10000 --project 30001 --file "/abs/a.pdf" --file "/abs/b.pdf" --uploader-email "upload@customer.com" --approvers "a@customer.com,b@customer.com" --reviewers "r1@customer.com,r2@customer.com"`
  );
}

main()
  .catch((error) => {
    console.error("seed:demo failed");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
