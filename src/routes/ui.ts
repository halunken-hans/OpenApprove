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
    .row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #e2e8f0; }
    .row:last-child { border-bottom: 0; }
    .pill { padding: 4px 10px; border-radius: 999px; background: #dcfce7; color: #166534; font-weight: 700; font-size: 0.85rem; }
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
  <div id="error" class="card" style="display:none; border:1px solid #ef4444; color:#991b1b;"></div>
  <div id="status" class="card" style="display:none;"></div>
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
    function showError(message) {
      const el = document.getElementById('error');
      el.style.display = 'block';
      el.textContent = message;
    }
    function setStatus(message) {
      const el = document.getElementById('status');
      if (!message) {
        el.style.display = 'none';
        el.textContent = '';
        return;
      }
      el.style.display = 'block';
      el.textContent = message;
    }
    async function load(path) {
      setStatus('Loading...');
      const res = await fetch(path + '?token=' + TOKEN);
      const data = await res.json().catch(() => ({}));
      const err = document.getElementById('error');
      err.style.display = 'none';
      const el = document.getElementById('results');
      el.innerHTML = '';
      if (!res.ok) {
        setStatus('');
        if (res.status === 401) return showError('Invalid or expired token.');
        if (res.status === 403) return showError('Permission denied for this portal view.');
        if (res.status === 404) return showError('Requested resource no longer exists.');
        return showError(data.error || 'Request failed.');
      }
      const rows = data.data || [];
      if (rows.length === 0) {
        setStatus('No entries found.');
        return;
      }
      setStatus('');
      const card = document.createElement('div');
      card.className = 'card';
      rows.forEach(item => {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML =
          '<div><strong>Project ' + (item.projectNumber || '-') + '</strong><div>Customer: ' + (item.customerNumber || '-') + '</div></div>' +
          '<div><div class=\"pill\">' + (item.status || '-') + '</div><div>' + new Date(item.createdAt).toLocaleString() + '</div></div>';
        card.appendChild(row);
      });
      el.appendChild(card);
    }
    document.getElementById('listCustomer').addEventListener('click', () => load('/api/portal/processes'));
    document.getElementById('listMyUploads').addEventListener('click', () => load('/api/portal/my-uploads'));
    document.getElementById('listCompanyUploads').addEventListener('click', () => load('/api/portal/company-uploads'));
  </script>
</body>
</html>`);
});

uiRouter.get("/", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OpenApprove</title>
  <style>
    :root {
      --bg: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
      --text: #0f172a;
      --muted: #334155;
      --surface: #ffffff;
      --accent: #0f766e;
      --border: #cbd5e1;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "IBM Plex Sans", sans-serif; color: var(--text); background: var(--bg); min-height: 100vh; }
    main { max-width: 880px; margin: 48px auto; padding: 0 20px; }
    .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 24px; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08); }
    h1 { margin: 0 0 10px; font-size: 2rem; letter-spacing: 0.02em; }
    p { margin: 0 0 14px; color: var(--muted); line-height: 1.5; }
    .claim { color: var(--accent); font-weight: 700; }
    code { background: #e2e8f0; padding: 2px 6px; border-radius: 6px; }
    ul { margin: 8px 0 0 20px; color: var(--muted); }
    a { color: var(--accent); }
  </style>
</head>
<body>
  <main>
    <section class="panel">
      <h1>OpenApprove</h1>
      <p class="claim">Token-based approval workflows with tamper-evident audit trails.</p>
      <p>OpenApprove is API-first. External systems create processes, upload/version files, run approval cycles, and query status via HTTP endpoints.</p>
      <p>To use the portal, open a token URL in this format:</p>
      <p><code>/t/&lt;token&gt;</code> or <code>/portal?token=&lt;token&gt;</code></p>
      <ul>
        <li>Reviewer/Approver tokens: review documents and decide.</li>
        <li>Viewer/Uploader tokens: customer and upload portal views.</li>
        <li>If token is invalid/expired or permissions are insufficient, the UI shows a clear error.</li>
      </ul>
      <p style="margin-top:14px;">Privacy details: <a href="/privacy">/privacy</a></p>
    </section>
  </main>
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
    :root {
      --bg: radial-gradient(circle at 10% 20%, #ecfeff 0%, #f1f5f9 40%, #e2e8f0 100%);
      --ink: #0f172a;
      --muted: #334155;
      --card: #ffffff;
      --primary: #0f766e;
      --primary-2: #115e59;
      --border: #cbd5e1;
    }
    body { font-family: 'Source Sans 3', sans-serif; margin: 0; padding: 0; background: var(--bg); color: var(--ink); min-height: 100vh; }
    header { background: linear-gradient(120deg, #0f172a 0%, #1e293b 100%); color: #fff; padding: 18px 24px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.25); }
    main { padding: 24px; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 16px; margin-bottom: 16px; box-shadow: 0 8px 22px rgba(15, 23, 42, 0.08); transition: transform 0.2s ease, box-shadow 0.2s ease; animation: fadeInUp 0.35s ease both; }
    .card:hover { transform: translateY(-2px); box-shadow: 0 14px 30px rgba(15, 23, 42, 0.14); }
    .files { display: grid; gap: 12px; }
    .file { display: flex; justify-content: space-between; align-items: center; }
    .actions button { margin-right: 8px; }
    button { cursor: pointer; border: 0; border-radius: 10px; background: var(--primary); color: #fff; padding: 8px 12px; font-weight: 600; transition: background 0.2s ease, transform 0.2s ease, opacity 0.2s ease; }
    button:hover { background: var(--primary-2); transform: translateY(-1px); }
    button:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
    textarea { width: 100%; min-height: 72px; border: 1px solid var(--border); border-radius: 10px; padding: 10px; margin-bottom: 10px; }
    #viewer { display: grid; grid-template-columns: 1fr 320px; gap: 16px; }
    #viewerStage { position: relative; border: 1px solid #e2e8f0; background: #fff; }
    #pdfLayer { width: 100%; display: block; }
    #annotationCanvas { position: absolute; left: 0; top: 0; }
    .tools button { display: block; margin-bottom: 8px; width: 100%; }
    .pager { margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
    #loadingCard { display: none; }
    .status-pill { display: inline-block; padding: 4px 10px; border-radius: 999px; background: #dcfce7; color: #166534; font-weight: 700; font-size: 0.85rem; }
    .project-number { font-size: 1.15rem; font-weight: 800; letter-spacing: 0.02em; }
    .file-meta { color: var(--muted); font-size: 0.9rem; }
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body>
  <header>
    <h1>OpenApprove</h1>
  </header>
  <main>
    <div class="card" id="errorCard" style="display:none; border:1px solid #ef4444; color:#991b1b;"></div>
    <div class="card" id="loadingCard"></div>
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
        <div id="viewerStage">
          <canvas id="pdfLayer"></canvas>
          <canvas id="annotationCanvas"></canvas>
        </div>
        <div>
          <div class="pager">
            <button id="prevPageBtn">Prev</button>
            <span id="pageInfo">Page 0 / 0</span>
            <button id="nextPageBtn">Next</button>
          </div>
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
    let currentPage = 1;
    let totalPages = 0;
    let currentPdfBuffer = null;
    let annotationDoc = { pages: {} };
    let activeAnnotationId = null;
    const LANG = new URLSearchParams(location.search).get('lang') || 'en';
    const I18N = {
      en: {
        files: 'Files',
        project: 'Project',
        customer: 'Customer',
        status: 'Status',
        decision: 'Decision',
        viewer: 'Viewer',
        approve: 'Approve',
        reject: 'Reject',
        rejectPlaceholder: 'Rejection reason',
        saveAnnotations: 'Save Annotations',
        loadingSummary: 'Loading process summary...',
        loadingPdf: 'Loading PDF...',
        noFiles: 'No files uploaded yet.',
        rejectReasonRequired: 'Please enter a rejection reason.',
        prev: 'Prev',
        next: 'Next',
        page: 'Page',
        version: 'Version',
        attrs: 'Attributes',
        invalidToken: 'Invalid, expired, or already-used token.',
        notFound: 'The process or document no longer exists.',
        forbidden: 'You do not have permission for this action.',
        genericError: 'Request failed. Please try again.',
        approved: 'Decision saved: approved.',
        rejected: 'Decision saved: rejected.',
        annotationsSaved: 'Annotations saved.'
      },
      de: {
        files: 'Dateien',
        project: 'Projekt',
        customer: 'Kunde',
        status: 'Status',
        decision: 'Entscheidung',
        viewer: 'Ansicht',
        approve: 'Freigeben',
        reject: 'Ablehnen',
        rejectPlaceholder: 'Ablehnungsgrund',
        saveAnnotations: 'Anmerkungen speichern',
        loadingSummary: 'Prozess wird geladen...',
        loadingPdf: 'PDF wird geladen...',
        noFiles: 'Es wurden noch keine Dateien hochgeladen.',
        rejectReasonRequired: 'Bitte einen Ablehnungsgrund eingeben.',
        prev: 'Zuruck',
        next: 'Weiter',
        page: 'Seite',
        version: 'Version',
        attrs: 'Attribute',
        invalidToken: 'Ungültiges, abgelaufenes oder bereits genutztes Token.',
        notFound: 'Der Prozess oder das Dokument existiert nicht mehr.',
        forbidden: 'Keine Berechtigung für diese Aktion.',
        genericError: 'Anfrage fehlgeschlagen. Bitte erneut versuchen.',
        approved: 'Entscheidung gespeichert: freigegeben.',
        rejected: 'Entscheidung gespeichert: abgelehnt.',
        annotationsSaved: 'Anmerkungen gespeichert.'
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
    document.getElementById('prevPageBtn').innerText = L.prev;
    document.getElementById('nextPageBtn').innerText = L.next;

    function showError(message) {
      const el = document.getElementById('errorCard');
      el.style.display = 'block';
      el.textContent = message;
    }

    function hideError() {
      const el = document.getElementById('errorCard');
      el.style.display = 'none';
      el.textContent = '';
    }

    function setLoading(message) {
      const el = document.getElementById('loadingCard');
      el.style.border = '';
      el.style.color = '';
      if (!message) {
        el.style.display = 'none';
        el.textContent = '';
        return;
      }
      el.style.display = 'block';
      el.textContent = message;
    }

    function showSuccess(message) {
      const el = document.getElementById('loadingCard');
      el.style.display = 'block';
      el.style.border = '1px solid #22c55e';
      el.style.color = '#166534';
      el.textContent = message;
    }

    function resolveErrorMessage(status, payload) {
      if (status === 401) return L.invalidToken;
      if (status === 403) return L.forbidden;
      if (status === 404) return L.notFound;
      if (payload && payload.error) return payload.error;
      return L.genericError;
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    async function fetchSummary() {
      setLoading(L.loadingSummary);
      const res = await fetch('/api/ui/summary?token=' + TOKEN);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoading('');
        showError(resolveErrorMessage(res.status, data));
        document.getElementById('processSummary').innerHTML = '';
        document.getElementById('fileList').innerHTML = '';
        return;
      }
      hideError();
      setLoading('');
      document.getElementById('processSummary').innerHTML =
        '<div class=\"project-number\">' + L.project + ' ' + escapeHtml(data.process.projectNumber || '-') + '</div>' +
        '<p>' + L.customer + ': ' + escapeHtml(data.process.customerNumber) + '</p>' +
        '<p>' + L.status + ': <span class=\"status-pill\">' + escapeHtml(data.process.status) + '</span></p>';
      const fileList = document.getElementById('fileList');
      fileList.innerHTML = '';
      const files = data.files || [];
      let firstVersionId = null;
      if (files.length === 0) {
        fileList.innerHTML = '<div>' + escapeHtml(L.noFiles) + '</div>';
      }
      files.forEach(file => {
        file.versions.forEach(version => {
          if (!firstVersionId) {
            firstVersionId = version.id;
          }
          const div = document.createElement('div');
          div.className = 'file';
          const attrs = version.attributesJson && typeof version.attributesJson === 'object'
            ? Object.entries(version.attributesJson).map(([k, v]) => escapeHtml(k) + ': ' + escapeHtml(v)).join(' | ')
            : '';
          div.innerHTML =
            '<div>' +
              '<strong>' + escapeHtml(file.originalFilename) + '</strong> ' +
              '<span class=\"file-meta\">(' + L.version + ' ' + escapeHtml(version.versionNumber) + ')</span>' +
              (attrs ? '<div class=\"file-meta\">' + L.attrs + ': ' + attrs + '</div>' : '') +
            '</div>' +
            '<div class="actions">' +
              '<button data-id="' + version.id + '" class="downloadBtn">Download</button>' +
            '</div>';
          fileList.appendChild(div);
        });
      });
      document.querySelectorAll('.downloadBtn').forEach(btn => {
        btn.addEventListener('click', () => downloadFile(btn.dataset.id));
      });
      if (!currentVersionId && firstVersionId) {
        await openViewer(firstVersionId);
      }
      if (data.scopes.includes('DECIDE')) {
        document.getElementById('decisionCard').style.display = 'block';
      }
      window.__processId = data.process.id;
      window.__participantId = data.participantId;
    }

    async function downloadFile(versionId) {
      const res = await fetch('/api/files/versions/' + versionId + '/download?token=' + TOKEN);
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        showError(resolveErrorMessage(res.status, payload));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    }

    async function openViewer(versionId) {
      currentVersionId = versionId;
      document.getElementById('viewerCard').style.display = 'block';
      setLoading(L.loadingPdf);
      const response = await fetch('/api/files/versions/' + versionId + '/download?token=' + TOKEN);
      if (!response.ok) {
        setLoading('');
        const payload = await response.json().catch(() => ({}));
        showError(resolveErrorMessage(response.status, payload));
        return;
      }
      hideError();
      activeAnnotationId = null;
      annotationDoc = { pages: {} };
      currentPdfBuffer = await response.arrayBuffer();
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js';
      pdfDoc = await pdfjsLib.getDocument({ data: currentPdfBuffer }).promise;
      await loadAnnotationsForVersion(versionId);
      totalPages = pdfDoc.numPages;
      currentPage = 1;
      await renderPage();
      setLoading('');
    }

    async function loadAnnotationsForVersion(versionId) {
      const res = await fetch('/api/ui/annotations?token=' + TOKEN + '&fileVersionId=' + versionId);
      const payload = await res.json().catch(() => []);
      if (!res.ok) {
        showError(resolveErrorMessage(res.status, payload));
        return;
      }
      if (!Array.isArray(payload) || payload.length === 0) return;
      payload.sort((a, b) => new Date(a.updatedAt || a.createdAt).getTime() - new Date(b.updatedAt || b.createdAt).getTime());
      const latest = payload[payload.length - 1];
      activeAnnotationId = latest.id;
      if (latest && latest.dataJson && latest.dataJson.pages && typeof latest.dataJson.pages === 'object') {
        annotationDoc = latest.dataJson;
      }
    }

    async function renderPage() {
      if (!pdfDoc) return;
      if (fabricCanvas) {
        annotationDoc.pages[String(currentPage)] = fabricCanvas.toJSON();
      }
      const page = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1.2 });
      const pdfCanvas = document.getElementById('pdfLayer');
      const annotationCanvas = document.getElementById('annotationCanvas');
      const ctx = pdfCanvas.getContext('2d');
      pdfCanvas.height = viewport.height;
      pdfCanvas.width = viewport.width;
      annotationCanvas.height = viewport.height;
      annotationCanvas.width = viewport.width;
      await page.render({ canvasContext: ctx, viewport }).promise;
      if (fabricCanvas) {
        fabricCanvas.dispose();
      }
      fabricCanvas = new fabric.Canvas('annotationCanvas', { selection: false });
      const pageData = annotationDoc.pages[String(currentPage)];
      if (pageData) {
        fabricCanvas.loadFromJSON(pageData, () => fabricCanvas.renderAll());
      }
      document.getElementById('pageInfo').textContent = L.page + ' ' + currentPage + ' / ' + totalPages;
      document.getElementById('prevPageBtn').disabled = currentPage <= 1;
      document.getElementById('nextPageBtn').disabled = currentPage >= totalPages;
    }

    document.getElementById('approveBtn').addEventListener('click', async () => {
      const res = await fetch('/api/approvals/decide?token=' + TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processId: window.__processId, participantId: window.__participantId, decision: 'APPROVE', fileVersionId: currentVersionId })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        showError(resolveErrorMessage(res.status, payload));
        return;
      }
      hideError();
      showSuccess(L.approved);
      fetchSummary();
    });

    document.getElementById('rejectBtn').addEventListener('click', async () => {
      const reason = document.getElementById('rejectReason').value;
      if (!reason || !reason.trim()) {
        showError(L.rejectReasonRequired);
        return;
      }
      const res = await fetch('/api/approvals/decide?token=' + TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processId: window.__processId, participantId: window.__participantId, decision: 'REJECT', reason, fileVersionId: currentVersionId })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        showError(resolveErrorMessage(res.status, payload));
        return;
      }
      hideError();
      showSuccess(L.rejected);
      fetchSummary();
    });

    document.getElementById('saveAnnotations').addEventListener('click', async () => {
      if (!fabricCanvas || !currentVersionId) return;
      annotationDoc.pages[String(currentPage)] = fabricCanvas.toJSON();
      const endpoint = activeAnnotationId ? '/api/ui/annotations/' + activeAnnotationId : '/api/ui/annotations';
      const method = activeAnnotationId ? 'PATCH' : 'POST';
      const body = activeAnnotationId
        ? { dataJson: annotationDoc }
        : { fileVersionId: currentVersionId, dataJson: annotationDoc };
      const res = await fetch(endpoint + '?token=' + TOKEN, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        showError(resolveErrorMessage(res.status, payload));
        return;
      }
      hideError();
      const payload = await res.json().catch(() => ({}));
      if (payload && payload.id) {
        activeAnnotationId = payload.id;
      }
      showSuccess(L.annotationsSaved);
    });

    document.getElementById('prevPageBtn').addEventListener('click', async () => {
      if (currentPage <= 1) return;
      currentPage -= 1;
      await renderPage();
    });

    document.getElementById('nextPageBtn').addEventListener('click', async () => {
      if (currentPage >= totalPages) return;
      currentPage += 1;
      await renderPage();
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
    if (!req.token?.processId) return res.status(403).json({ error: "Token is not bound to a process" });
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
        projectNumber: process.projectNumber,
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
