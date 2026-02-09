import { Router } from "express";
import { z } from "zod";
import { tokenAuth, requireAnyScope, requireScope } from "../middleware/auth.js";
import { validateBody, validateQuery } from "../utils/validation.js";
import { prisma } from "../db.js";
import { appendAuditEvent } from "../services/audit.js";
import { AuditEventType } from "@prisma/client";
import { env } from "../config.js";

export const uiRouter = Router();

function parseJsonString(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

uiRouter.get("/privacy", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Privacy</title>
</head>
<body>
  <h1>Privacy / Datenschutz</h1>
  <p>OpenApprove stores only necessary data: process metadata, file versions, audit events, timestamps, IP address, and user-agent for access logs.</p>
  <p>Emails are stored only for reviewer/approver invitations. Viewer/Uploader tokens are not emailed.</p>
  <p>No non-essential cookies are used in the MVP.</p>
  <hr />
  <p>OpenApprove speichert nur notwendige Daten: Prozessmetadaten, Dateiversionen, Audit-Events, Zeitstempel, IP-Adresse und User-Agent für Zugriffsprotokolle.</p>
  <p>E-Mail-Adressen werden nur für Einladungen an Reviewer/Approver gespeichert. Viewer/Uploader-Tokens werden nicht per E-Mail versendet.</p>
  <p>In der MVP-Version werden keine nicht notwendigen Cookies verwendet.</p>
</body>
</html>`);
});

uiRouter.get("/portal", (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const lang = typeof req.query.lang === "string" ? req.query.lang : "en";
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OpenApprove Portal</title>
  <style>
    body { font-family: 'Source Sans 3', sans-serif; margin: 0; padding: 24px; background: #f8fafc; color: #0f172a; }
    .card { background: #fff; border-radius: 10px; padding: 16px; margin-bottom: 12px; box-shadow: 0 6px 20px rgba(15, 23, 42, 0.06); }
    button { margin-right: 8px; }
    pre { background: #f1f5f9; padding: 8px; border-radius: 6px; }
  </style>
</head>
<body>
  <h1 id="title">OpenApprove Portal</h1>
  <div class="card">
    <p id="subtitle">Token-based portal views for customer and uploader.</p>
    <button id="listCustomer">Customer Processes</button>
    <button id="listMyUploads">My Uploads</button>
    <button id="listCompanyUploads">Company Uploads</button>
  </div>
  <div id="results"></div>
  <script>
    const TOKEN = "${token}";
    const LANG = "${lang}";
    const I18N = {
      en: {
        title: 'OpenApprove Portal',
        subtitle: 'Token-based portal views for customer and uploader.',
        customer: 'Customer Processes',
        my: 'My Uploads',
        company: 'Company Uploads'
      },
      de: {
        title: 'OpenApprove Portal',
        subtitle: 'Token-basierte Portalsichten für Kunde und Uploader.',
        customer: 'Kundenprozesse',
        my: 'Meine Uploads',
        company: 'Firmen-Uploads'
      }
    };
    const L = I18N[LANG] || I18N.en;
    document.getElementById('title').innerText = L.title;
    document.getElementById('subtitle').innerText = L.subtitle;
    document.getElementById('listCustomer').innerText = L.customer;
    document.getElementById('listMyUploads').innerText = L.my;
    document.getElementById('listCompanyUploads').innerText = L.company;
    async function load(path) {
      const res = await fetch(path + '?token=' + TOKEN);
      const data = await res.json();
      const el = document.getElementById('results');
      el.innerHTML = '';
      (data.data || []).forEach(item => {
        const div = document.createElement('div');
        div.className = 'card';
        div.innerHTML = '<strong>' + item.id + '</strong><pre>' + JSON.stringify(item, null, 2) + '</pre>';
        el.appendChild(div);
      });
    }
    document.getElementById('listCustomer').addEventListener('click', () => load('/api/portal/processes'));
    document.getElementById('listMyUploads').addEventListener('click', () => load('/api/portal/my-uploads'));
    document.getElementById('listCompanyUploads').addEventListener('click', () => load('/api/portal/company-uploads'));
  </script>
</body>
</html>`);
});

uiRouter.get("/t/:token", (req, res) => {
  const token = req.params.token;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OpenApprove</title>
  <style>
    body { font-family: 'Source Sans 3', sans-serif; margin: 0; padding: 0; background: #f4f5f7; color: #1b1f24; }
    header { background: #0f172a; color: #fff; padding: 16px 24px; }
    main { padding: 24px; }
    .card { background: #fff; border-radius: 12px; padding: 16px; margin-bottom: 16px; box-shadow: 0 6px 20px rgba(15, 23, 42, 0.08); }
    .files { display: grid; gap: 12px; }
    .file { display: flex; justify-content: space-between; align-items: center; }
    .actions button { margin-right: 8px; }
    #viewer { display: grid; grid-template-columns: 1fr 320px; gap: 16px; }
    #pdfCanvas { width: 100%; border: 1px solid #e2e8f0; }
    .tools button { display: block; margin-bottom: 8px; width: 100%; }
  </style>
</head>
<body>
  <header>
    <h1>OpenApprove</h1>
  </header>
  <main>
    <div class="card" id="processSummary"></div>
    <div class="card">
      <h2 id="filesTitle">Files</h2>
      <div class="files" id="fileList"></div>
    </div>
    <div class="card" id="decisionCard" style="display:none;">
      <h2 id="decisionTitle">Decision</h2>
      <textarea id="rejectReason" placeholder="Rejection reason"></textarea>
      <div>
        <button id="approveBtn">Approve</button>
        <button id="rejectBtn">Reject</button>
      </div>
    </div>
    <div class="card" id="viewerCard" style="display:none;">
      <h2 id="viewerTitle">Viewer</h2>
      <div id="viewer">
        <canvas id="pdfCanvas"></canvas>
        <div>
          <div class="tools">
            <button data-tool="highlight">Highlight</button>
            <button data-tool="freehand">Freehand</button>
            <button data-tool="text">Text</button>
            <button data-tool="rect">Rectangle</button>
          </div>
          <button id="saveAnnotations">Save Annotations</button>
        </div>
      </div>
    </div>
  </main>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.js" integrity="sha512-s5f7f9aWk2V9oZBVeu/qJx7bWf2l5sXQ3nTG5C9w1kpsw1S2K4A7ET7fY6hkeN9u0Hq3Y1XKp2VX1p1t1zK3mA==" crossorigin="anonymous"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.0/fabric.min.js" integrity="sha512-epbq8c3E5x3wixVJ9v4p5i7FjNbl6w7Tgk0J4FZk1Ms0CTGJb+JmE0iu6lq0hXrJ6KX8lQHSlk8uV3i9E0f+eA==" crossorigin="anonymous"></script>
  <script>
    const TOKEN = "${token}";
    const API_BASE = "${env.BASE_URL}";
    let currentVersionId = null;
    let pdfDoc = null;
    let fabricCanvas = null;
    const LANG = new URLSearchParams(location.search).get('lang') || 'en';
    const I18N = {
      en: {
        files: 'Files',
        decision: 'Decision',
        viewer: 'Viewer',
        approve: 'Approve',
        reject: 'Reject',
        rejectPlaceholder: 'Rejection reason',
        saveAnnotations: 'Save Annotations'
      },
      de: {
        files: 'Dateien',
        decision: 'Entscheidung',
        viewer: 'Ansicht',
        approve: 'Freigeben',
        reject: 'Ablehnen',
        rejectPlaceholder: 'Ablehnungsgrund',
        saveAnnotations: 'Anmerkungen speichern'
      }
    };

    const L = I18N[LANG] || I18N.en;
    document.getElementById('filesTitle').innerText = L.files;
    document.getElementById('decisionTitle').innerText = L.decision;
    document.getElementById('viewerTitle').innerText = L.viewer;
    document.getElementById('approveBtn').innerText = L.approve;
    document.getElementById('rejectBtn').innerText = L.reject;
    document.getElementById('rejectReason').placeholder = L.rejectPlaceholder;
    document.getElementById('saveAnnotations').innerText = L.saveAnnotations;

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    async function fetchSummary() {
      const res = await fetch('/api/ui/summary?token=' + TOKEN);
      const data = await res.json();
      if (data.error) {
        document.getElementById('processSummary').innerText = data.error;
        return;
      }
      document.getElementById('processSummary').innerHTML =
        '<h2>Process ' + escapeHtml(data.process.id) + '</h2>' +
        '<p>Status: ' + escapeHtml(data.process.status) + '</p>' +
        '<p>Customer: ' + escapeHtml(data.process.customerNumber) + '</p>' +
        '<pre>' + escapeHtml(JSON.stringify(data.process.attributesJson, null, 2)) + '</pre>';
      const fileList = document.getElementById('fileList');
      fileList.innerHTML = '';
      data.files.forEach(file => {
        file.versions.forEach(version => {
          const div = document.createElement('div');
          div.className = 'file';
          div.innerHTML =
            '<div>' +
              '<strong>' + escapeHtml(file.originalFilename) + '</strong> (v' + escapeHtml(version.versionNumber) + ')' +
              '<pre>' + escapeHtml(JSON.stringify(version.attributesJson, null, 2)) + '</pre>' +
            '</div>' +
            '<div class="actions">' +
              '<button data-id="' + version.id + '" class="viewBtn">View</button>' +
              '<button data-id="' + version.id + '" class="downloadBtn">Download</button>' +
            '</div>';
          fileList.appendChild(div);
        });
      });
      document.querySelectorAll('.viewBtn').forEach(btn => {
        btn.addEventListener('click', () => openViewer(btn.dataset.id));
      });
      document.querySelectorAll('.downloadBtn').forEach(btn => {
        btn.addEventListener('click', () => downloadFile(btn.dataset.id));
      });
      if (data.scopes.includes('DECIDE')) {
        document.getElementById('decisionCard').style.display = 'block';
      }
      window.__processId = data.process.id;
      window.__participantId = data.participantId;
    }

    async function downloadFile(versionId) {
      window.open('/api/files/versions/' + versionId + '/download?token=' + TOKEN, '_blank');
    }

    async function openViewer(versionId) {
      currentVersionId = versionId;
      document.getElementById('viewerCard').style.display = 'block';
      const pdfData = await fetch('/api/files/versions/' + versionId + '/download?token=' + TOKEN).then(r => r.arrayBuffer());
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js';
      pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;
      const page = await pdfDoc.getPage(1);
      const viewport = page.getViewport({ scale: 1.2 });
      const canvas = document.getElementById('pdfCanvas');
      const ctx = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({ canvasContext: ctx, viewport }).promise;
      if (!fabricCanvas) {
        fabricCanvas = new fabric.Canvas('pdfCanvas', { selection: false });
      }
    }

    document.getElementById('approveBtn').addEventListener('click', async () => {
      await fetch('/api/approvals/decide?token=' + TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processId: window.__processId, participantId: window.__participantId, decision: 'APPROVE', fileVersionId: currentVersionId })
      });
      fetchSummary();
    });

    document.getElementById('rejectBtn').addEventListener('click', async () => {
      const reason = document.getElementById('rejectReason').value;
      await fetch('/api/approvals/decide?token=' + TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processId: window.__processId, participantId: window.__participantId, decision: 'REJECT', reason, fileVersionId: currentVersionId })
      });
      fetchSummary();
    });

    document.getElementById('saveAnnotations').addEventListener('click', async () => {
      if (!fabricCanvas || !currentVersionId) return;
      const dataJson = fabricCanvas.toJSON();
      await fetch('/api/ui/annotations?token=' + TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileVersionId: currentVersionId, dataJson })
      });
    });

    document.querySelectorAll('.tools button').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!fabricCanvas) return;
        const tool = btn.dataset.tool;
        fabricCanvas.isDrawingMode = tool === 'freehand';
        if (tool === 'highlight') {
          const rect = new fabric.Rect({ left: 50, top: 50, width: 100, height: 30, fill: 'rgba(255, 235, 59, 0.4)' });
          fabricCanvas.add(rect);
        }
        if (tool === 'rect') {
          const rect = new fabric.Rect({ left: 80, top: 80, width: 140, height: 80, fill: 'rgba(59, 130, 246, 0.2)', stroke: '#1d4ed8', strokeWidth: 2 });
          fabricCanvas.add(rect);
        }
        if (tool === 'text') {
          const text = new fabric.IText('Note', { left: 120, top: 120, fontSize: 16, fill: '#0f172a' });
          fabricCanvas.add(text);
        }
      });
    });

    fetchSummary();
  </script>
</body>
</html>`);
});

const SummaryQuery = z.object({
  token: z.string().min(1).optional()
});

uiRouter.get(
  "/api/ui/summary",
  tokenAuth,
  requireAnyScope(["VIEW_PDF", "DOWNLOAD_PDF", "DECIDE", "CUSTOMER_PORTAL_VIEW", "ADMIN"]),
  validateQuery(SummaryQuery),
  async (req, res) => {
    if (!req.token?.processId) return res.status(400).json({ error: "Token missing process binding" });
    const process = await prisma.process.findUnique({
      where: { id: req.token.processId },
      include: { files: { include: { versions: true } } }
    });
    if (!process) return res.status(404).json({ error: "Process not found" });
    await appendAuditEvent({
      eventType: AuditEventType.ACCESS_LOGGED,
      processId: process.id,
      tokenId: req.token?.id,
      roleAtTime: req.token?.roleAtTime ?? null,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: { action: "ui.summary" }
    });
    res.json({
      process: {
        id: process.id,
        customerNumber: process.customerNumber,
        status: process.status,
        attributesJson: parseJsonString(process.attributesJson)
      },
      participantId: req.token?.participantId ?? null,
      files: process.files.map(file => ({
        id: file.id,
        originalFilename: file.normalizedOriginalFilename,
        versions: file.versions.map(version => ({
          id: version.id,
          versionNumber: version.versionNumber,
          attributesJson: parseJsonString(version.attributesJson)
        }))
      })),
      scopes: req.token?.scopes ?? []
    });
  }
);

const AnnotationSchema = z.object({
  fileVersionId: z.string(),
  dataJson: z.record(z.unknown())
});

uiRouter.post(
  "/api/ui/annotations",
  tokenAuth,
  requireScope("ANNOTATE_PDF"),
  validateBody(AnnotationSchema),
  async (req, res) => {
    if (!env.ANNOTATIONS_ENABLED) return res.status(403).json({ error: "Annotations disabled" });
    const body = req.body as z.infer<typeof AnnotationSchema>;
    const version = await prisma.fileVersion.findUnique({
      where: { id: body.fileVersionId },
      include: { file: true }
    });
    if (!version) return res.status(404).json({ error: "File version not found" });
    if (req.token?.processId && req.token.processId !== version.file.processId) {
      return res.status(403).json({ error: "Token not bound to process" });
    }
    const annotation = await prisma.annotation.create({
      data: {
        fileVersionId: body.fileVersionId,
        tokenId: req.token?.id ?? null,
        dataJson: JSON.stringify(body.dataJson)
      }
    });
    await appendAuditEvent({
      eventType: AuditEventType.ANNOTATION_CREATED,
      fileVersionId: body.fileVersionId,
      tokenId: req.token?.id,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: { fileVersionId: body.fileVersionId }
    });
    res.status(201).json(annotation);
  }
);

const UpdateAnnotationSchema = z.object({
  dataJson: z.record(z.unknown())
});

uiRouter.patch(
  "/api/ui/annotations/:id",
  tokenAuth,
  requireScope("ANNOTATE_PDF"),
  validateBody(UpdateAnnotationSchema),
  async (req, res) => {
    if (!env.ANNOTATIONS_ENABLED) return res.status(403).json({ error: "Annotations disabled" });
    const body = req.body as z.infer<typeof UpdateAnnotationSchema>;
    const existing = await prisma.annotation.findUnique({
      where: { id: req.params.id },
      include: { fileVersion: { include: { file: true } } }
    });
    if (!existing) return res.status(404).json({ error: "Annotation not found" });
    if (req.token?.processId && req.token.processId !== existing.fileVersion.file.processId) {
      return res.status(403).json({ error: "Token not bound to process" });
    }
    const annotation = await prisma.annotation.update({
      where: { id: req.params.id },
      data: { dataJson: JSON.stringify(body.dataJson) }
    });
    await appendAuditEvent({
      eventType: AuditEventType.ANNOTATION_UPDATED,
      fileVersionId: annotation.fileVersionId,
      tokenId: req.token?.id,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: { annotationId: annotation.id }
    });
    res.json(annotation);
  }
);

uiRouter.delete(
  "/api/ui/annotations/:id",
  tokenAuth,
  requireScope("ANNOTATE_PDF"),
  async (req, res) => {
    if (!env.ANNOTATIONS_ENABLED) return res.status(403).json({ error: "Annotations disabled" });
    const existing = await prisma.annotation.findUnique({
      where: { id: req.params.id },
      include: { fileVersion: { include: { file: true } } }
    });
    if (!existing) return res.status(404).json({ error: "Annotation not found" });
    if (req.token?.processId && req.token.processId !== existing.fileVersion.file.processId) {
      return res.status(403).json({ error: "Token not bound to process" });
    }
    const annotation = await prisma.annotation.delete({ where: { id: req.params.id } });
    await appendAuditEvent({
      eventType: AuditEventType.ANNOTATION_DELETED,
      fileVersionId: annotation.fileVersionId,
      tokenId: req.token?.id,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      validatedData: { annotationId: annotation.id }
    });
    res.json({ ok: true });
  }
);

const AnnotationQuery = z.object({
  fileVersionId: z.string()
});

uiRouter.get(
  "/api/ui/annotations",
  tokenAuth,
  requireAnyScope(["VIEW_PDF", "ANNOTATE_PDF"]),
  validateQuery(AnnotationQuery),
  async (req, res) => {
    const query = req.query as z.infer<typeof AnnotationQuery>;
    const version = await prisma.fileVersion.findUnique({
      where: { id: query.fileVersionId },
      include: { file: true }
    });
    if (!version) return res.status(404).json({ error: "File version not found" });
    if (req.token?.processId && req.token.processId !== version.file.processId) {
      return res.status(403).json({ error: "Token not bound to process" });
    }
    const annotations = await prisma.annotation.findMany({ where: { fileVersionId: query.fileVersionId } });
    res.json(annotations.map(annotation => ({
      ...annotation,
      dataJson: parseJsonString(annotation.dataJson)
    })));
  }
);
