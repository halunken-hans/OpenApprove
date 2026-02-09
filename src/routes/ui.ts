import { Router } from "express";
import { z } from "zod";
import { tokenAuth, requireAnyScope, requireScope } from "../middleware/auth.js";
import { validateBody, validateQuery } from "../utils/validation.js";
import { prisma } from "../db.js";
import { appendAuditEvent } from "../services/audit.js";
import { calculateProcessApprovalSnapshot } from "../services/approvals.js";
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

async function ensureFileVersionMutableForAnnotations(processId: string, fileVersionId: string) {
  const snapshot = await calculateProcessApprovalSnapshot(processId);
  const status = snapshot.fileStatuses[fileVersionId] ?? "PENDING";
  return status === "PENDING";
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
    header { background: linear-gradient(120deg, #0f172a 0%, #1e293b 100%); color: #fff; padding: 18px 24px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.25); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    main { padding: 24px; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 16px; margin-bottom: 16px; box-shadow: 0 8px 22px rgba(15, 23, 42, 0.08); transition: transform 0.2s ease, box-shadow 0.2s ease; animation: fadeInUp 0.35s ease both; }
    .card:hover { transform: translateY(-2px); box-shadow: 0 14px 30px rgba(15, 23, 42, 0.14); }
    .workspace { display: grid; grid-template-columns: 280px minmax(420px, 1fr) 320px 320px; gap: 16px; align-items: start; }
    .pane-title { margin: 0 0 12px; font-size: 1.1rem; }
    .file-list { display: grid; gap: 8px; max-height: 70vh; overflow: auto; }
    .file-item { border: 1px solid var(--border); border-radius: 10px; padding: 10px; cursor: pointer; transition: border-color 0.2s ease, background 0.2s ease; width: 100%; text-align: left; background: #fff; color: var(--ink); }
    .file-item:hover { border-color: var(--primary); background: #f8fffe; }
    .file-item.active { border-color: var(--primary); background: #ecfeff; }
    .file-main { font-weight: 700; }
    .file-sub { color: var(--muted); font-size: 0.85rem; margin-top: 4px; }
    .doc-status { font-size: 1rem; font-weight: 800; color: #0f766e; margin: 0 0 10px; }
    .annotation-list { display: grid; gap: 8px; max-height: 36vh; overflow: auto; margin-bottom: 12px; }
    .annotation-item { border: 1px solid var(--border); border-radius: 10px; padding: 8px; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .annotation-meta { font-size: 0.85rem; color: var(--muted); }
    .role-list { display: grid; gap: 10px; }
    .role-block { border: 1px solid var(--border); border-radius: 10px; padding: 10px; }
    .role-block h3 { margin: 0 0 8px; font-size: 0.95rem; }
    .role-entry { font-size: 0.9rem; color: var(--muted); margin: 4px 0; }
    .history-entry { border-bottom: 1px solid #e2e8f0; padding: 6px 0; font-size: 0.85rem; }
    .history-entry:last-child { border-bottom: 0; }
    .action-block { border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 12px; }
    .action-row { display: flex; gap: 8px; flex-wrap: wrap; }
    button { cursor: pointer; border: 0; border-radius: 10px; background: var(--primary); color: #fff; padding: 8px 12px; font-weight: 600; transition: background 0.2s ease, transform 0.2s ease, opacity 0.2s ease; }
    button:hover { background: var(--primary-2); transform: translateY(-1px); }
    button:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
    textarea { width: 100%; min-height: 72px; border: 1px solid var(--border); border-radius: 10px; padding: 10px; margin-bottom: 10px; }
    #viewer { display: block; }
    #viewerStage { position: relative; border: 1px solid #e2e8f0; background: #fff; overflow: auto; width: fit-content; max-width: 100%; }
    #pdfLayer { display: block; max-width: 100%; position: relative; z-index: 1; }
    #annotationCanvas { position: absolute; left: 0; top: 0; z-index: 2; }
    .tools button { display: block; margin-bottom: 8px; width: 100%; }
    .pager { margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
    #loadingCard { display: none; }
    .status-pill { display: inline-block; padding: 4px 10px; border-radius: 999px; background: #dcfce7; color: #166534; font-weight: 700; font-size: 0.85rem; }
    .project-number { font-size: 1.15rem; font-weight: 800; letter-spacing: 0.02em; }
    .file-meta { color: var(--muted); font-size: 0.9rem; }
    .lang-switch { display: flex; gap: 8px; }
    .lang-btn { color: #fff; background: transparent; border: 1px solid rgba(255,255,255,0.35); border-radius: 8px; padding: 4px 8px; text-decoration: none; font-size: 0.85rem; }
    .lang-btn.active { background: rgba(255,255,255,0.2); }
    .modal-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); display: none; align-items: center; justify-content: center; z-index: 50; }
    .modal-backdrop.open { display: flex; }
    .modal-card { background: #fff; border-radius: 12px; width: min(460px, calc(100vw - 32px)); padding: 16px; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.25); }
    .modal-title { margin: 0 0 12px; font-size: 1.1rem; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .btn-ghost { background: #e2e8f0; color: #0f172a; }
    @media (max-width: 1200px) {
      .workspace { grid-template-columns: 1fr; }
    }
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1 style="margin:0;">OpenApprove</h1>
      <div id="actorBadge" style="font-size:0.9rem; opacity:0.9; margin-top:4px;"></div>
      <div id="tokenExpiryBadge" style="font-size:0.85rem; opacity:0.85; margin-top:2px;"></div>
    </div>
    <div class="lang-switch">
      <a id="langDe" class="lang-btn" href="#">DE</a>
      <a id="langEn" class="lang-btn" href="#">EN</a>
    </div>
  </header>
  <main>
    <div class="card" id="errorCard" style="display:none; border:1px solid #ef4444; color:#991b1b;"></div>
    <div class="card" id="loadingCard"></div>
    <div class="card" id="processSummary"></div>
    <div class="workspace">
      <div class="card">
        <h2 id="filesTitle" class="pane-title">Files</h2>
        <div id="fileList" class="file-list"></div>
      </div>
      <div class="card" id="viewerCard" style="display:none;">
        <h2 id="viewerTitle" class="pane-title">Viewer</h2>
        <div id="docStatus" class="doc-status"></div>
        <div class="pager">
          <button id="prevPageBtn">Prev</button>
          <span id="pageInfo">Page 0 / 0</span>
          <button id="nextPageBtn">Next</button>
        </div>
        <div id="viewer">
          <div id="viewerStage">
            <canvas id="pdfLayer"></canvas>
            <canvas id="annotationCanvas"></canvas>
          </div>
        </div>
      </div>
      <div class="card">
        <h2 id="annotationsTitle" class="pane-title">Annotations</h2>
        <div id="annotationsList" class="annotation-list"></div>
        <div class="tools">
          <button data-tool="highlight">Highlight</button>
          <button data-tool="freehand">Freehand</button>
          <button data-tool="text">Text</button>
          <button data-tool="rect">Rectangle</button>
        </div>
        <div class="action-block">
          <div class="action-row">
            <button id="approveBtn">Approve</button>
            <button id="rejectBtn">Reject</button>
            <button id="downloadBtn">Download</button>
          </div>
        </div>
      </div>
      <div class="card">
        <h2 id="rolesTitle" class="pane-title">Roles</h2>
        <div id="roleList" class="role-list"></div>
      </div>
    </div>
    <div id="confirmApproveModal" class="modal-backdrop">
      <div class="modal-card">
        <h3 id="confirmApproveTitle" class="modal-title">Confirm approval</h3>
        <div class="modal-actions">
          <button id="approveCancelBtn" class="btn-ghost">Cancel</button>
          <button id="approveConfirmBtn">Confirm</button>
        </div>
      </div>
    </div>
    <div id="confirmRejectModal" class="modal-backdrop">
      <div class="modal-card">
        <h3 id="confirmRejectTitle" class="modal-title">Confirm rejection</h3>
        <textarea id="rejectReasonInput" placeholder="Rejection reason"></textarea>
        <div class="modal-actions">
          <button id="rejectCancelBtn" class="btn-ghost">Cancel</button>
          <button id="rejectConfirmBtn">Confirm reject</button>
        </div>
      </div>
    </div>
  </main>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js" crossorigin="anonymous"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.0/fabric.min.js" crossorigin="anonymous"></script>
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
    let autosaveTimer = null;
    let suppressAutosave = false;
    let currentScopes = [];
    let currentVersionStatus = 'PENDING';
    let currentRoleAtTime = '';
    let tokenExpiryMs = null;
    let tokenExpiryTimer = null;
    const LANG = new URLSearchParams(location.search).get('lang') || 'en';
    const I18N = {
      en: {
        files: 'Files',
        annotations: 'Annotations',
        roles: 'Roles',
        project: 'Project',
        customer: 'Customer',
        status: 'Status',
        fileStatus: 'Status',
        decision: 'Decision',
        viewer: 'Viewer',
        uploader: 'Uploader',
        approvers: 'Approvers',
        reviewers: 'Reviewers',
        decisionHistory: 'Decision history',
        noHistory: 'No decisions for this file version yet.',
        noRoles: 'No roles configured.',
        waitingFiles: 'Waiting for approval on file(s):',
        allApproved: 'All files are approved.',
        statusBig: 'Document status',
        loggedInAs: 'You are logged in as',
        inRole: 'in role',
        tokenExpiresIn: 'Token valid for',
        tokenExpired: 'Token expired',
        roleUnknown: 'UNKNOWN',
        noDocumentSelected: 'No document version selected.',
        approve: 'Approve',
        reject: 'Reject',
        rejectPlaceholder: 'Rejection reason',
        confirmApproveTitle: 'Approve this document version?',
        confirmRejectTitle: 'Reject this document version?',
        confirmAction: 'Confirm',
        cancelAction: 'Cancel',
        confirmRejectAction: 'Confirm reject',
        saveAnnotations: 'Save Annotations',
        loadingSummary: 'Loading process summary...',
        loadingPdf: 'Loading PDF...',
        noFiles: 'No files uploaded yet.',
        rejectReasonRequired: 'Please enter a rejection reason.',
        prev: 'Prev',
        next: 'Next',
        page: 'Page',
        version: 'Version',
        readOnly: 'This token is read-only for decisions.',
        pageEmpty: 'No annotations on this page.',
        remove: 'Remove',
        download: 'Download',
        pdfLoadFailed: 'PDF viewer libraries could not be loaded.',
        invalidToken: 'Invalid, expired, or already-used token.',
        notFound: 'The process or document no longer exists.',
        forbidden: 'You do not have permission for this action.',
        genericError: 'Request failed. Please try again.',
        approved: 'Decision saved: approved.',
        approvedPending: 'Decision saved. Waiting for other required approvals.',
        rejected: 'Decision saved: rejected.',
        annotationsSaved: 'Annotations saved.'
      },
      de: {
        files: 'Dateien',
        annotations: 'Anmerkungen',
        roles: 'Rollen',
        project: 'Projekt',
        customer: 'Kunde',
        status: 'Status',
        fileStatus: 'Status',
        decision: 'Entscheidung',
        viewer: 'Ansicht',
        uploader: 'Uploader',
        approvers: 'Approver',
        reviewers: 'Reviewer',
        decisionHistory: 'Entscheidungsverlauf',
        noHistory: 'Noch keine Entscheidungen fur diese Dateiversion.',
        noRoles: 'Keine Rollen konfiguriert.',
        waitingFiles: 'Wartet auf Freigabe fur Datei(en):',
        allApproved: 'Alle Dateien sind freigegeben.',
        statusBig: 'Dokumentstatus',
        loggedInAs: 'Angemeldet als',
        inRole: 'in Rolle',
        tokenExpiresIn: 'Token gultig fur',
        tokenExpired: 'Token abgelaufen',
        roleUnknown: 'UNBEKANNT',
        noDocumentSelected: 'Keine Dokumentversion ausgewahlt.',
        approve: 'Freigeben',
        reject: 'Ablehnen',
        rejectPlaceholder: 'Ablehnungsgrund',
        confirmApproveTitle: 'Diese Dokumentversion freigeben?',
        confirmRejectTitle: 'Diese Dokumentversion ablehnen?',
        confirmAction: 'Bestatigen',
        cancelAction: 'Abbrechen',
        confirmRejectAction: 'Ablehnung bestatigen',
        saveAnnotations: 'Anmerkungen speichern',
        loadingSummary: 'Prozess wird geladen...',
        loadingPdf: 'PDF wird geladen...',
        noFiles: 'Es wurden noch keine Dateien hochgeladen.',
        rejectReasonRequired: 'Bitte einen Ablehnungsgrund eingeben.',
        prev: 'Zuruck',
        next: 'Weiter',
        page: 'Seite',
        version: 'Version',
        readOnly: 'Dieses Token ist nur lesend fur Entscheidungen.',
        pageEmpty: 'Keine Annotationen auf dieser Seite.',
        remove: 'Entfernen',
        download: 'Download',
        pdfLoadFailed: 'PDF-Bibliotheken konnten nicht geladen werden.',
        invalidToken: 'Ungültiges, abgelaufenes oder bereits genutztes Token.',
        notFound: 'Der Prozess oder das Dokument existiert nicht mehr.',
        forbidden: 'Keine Berechtigung für diese Aktion.',
        genericError: 'Anfrage fehlgeschlagen. Bitte erneut versuchen.',
        approved: 'Entscheidung gespeichert: freigegeben.',
        approvedPending: 'Entscheidung gespeichert. Wartet auf weitere erforderliche Freigaben.',
        rejected: 'Entscheidung gespeichert: abgelehnt.',
        annotationsSaved: 'Anmerkungen gespeichert.'
      }
    };

    const L = I18N[LANG] || I18N.en;
    document.getElementById('filesTitle').innerText = L.files;
    document.getElementById('annotationsTitle').innerText = L.annotations;
    document.getElementById('rolesTitle').innerText = L.roles;
    document.getElementById('viewerTitle').innerText = L.viewer;
    document.getElementById('approveBtn').innerText = L.approve;
    document.getElementById('rejectBtn').innerText = L.reject;
    document.getElementById('downloadBtn').innerText = L.download;
    document.getElementById('rejectReasonInput').placeholder = L.rejectPlaceholder;
    document.getElementById('prevPageBtn').innerText = L.prev;
    document.getElementById('nextPageBtn').innerText = L.next;
    document.getElementById('confirmApproveTitle').innerText = L.confirmApproveTitle;
    document.getElementById('confirmRejectTitle').innerText = L.confirmRejectTitle;
    document.getElementById('approveCancelBtn').innerText = L.cancelAction;
    document.getElementById('rejectCancelBtn').innerText = L.cancelAction;
    document.getElementById('approveConfirmBtn').innerText = L.confirmAction;
    document.getElementById('rejectConfirmBtn').innerText = L.confirmRejectAction;

    const langDe = document.getElementById('langDe');
    const langEn = document.getElementById('langEn');
    const withLang = (lang) => {
      const params = new URLSearchParams(window.location.search);
      params.set('lang', lang);
      return window.location.pathname + '?' + params.toString();
    };
    langDe.href = withLang('de');
    langEn.href = withLang('en');
    if (LANG === 'de') langDe.classList.add('active');
    if (LANG === 'en') langEn.classList.add('active');

    function formatRemaining(ms) {
      if (ms <= 0) return L.tokenExpired;
      const totalSeconds = Math.floor(ms / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      if (days > 0) return days + 'd ' + hours + 'h ' + minutes + 'm';
      if (hours > 0) return hours + 'h ' + minutes + 'm';
      if (minutes > 0) return minutes + 'm ' + seconds + 's';
      return seconds + 's';
    }

    function renderTokenExpiry() {
      const el = document.getElementById('tokenExpiryBadge');
      if (!tokenExpiryMs) {
        el.innerText = '';
        return;
      }
      el.innerText = L.tokenExpiresIn + ': ' + formatRemaining(tokenExpiryMs - Date.now());
    }

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

    function sanitizeAnnotationObject(obj) {
      if (obj === 'alphabetical') return 'alphabetic';
      if (!obj || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(sanitizeAnnotationObject);
      const out = {};
      Object.keys(obj).forEach((key) => {
        const value = obj[key];
        if (key === 'textBaseline' && value === 'alphabetical') {
          out[key] = 'alphabetic';
        } else if (value === 'alphabetical') {
          out[key] = 'alphabetic';
        } else {
          out[key] = sanitizeAnnotationObject(value);
        }
      });
      return out;
    }

    function queueAutoSave() {
      if (suppressAutosave) return;
      if (!currentVersionId) return;
      if (autosaveTimer) clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(async () => {
        const saved = await persistAnnotations();
        if (saved) {
          showSuccess(L.annotationsSaved);
        }
      }, 650);
    }

    function renderRoles(data) {
      const root = document.getElementById('roleList');
      root.innerHTML = '';
      const roles = data.roles || {};
      const uploader = roles.uploader || null;
      const approvers = Array.isArray(roles.approvers) ? roles.approvers : [];
      const reviewers = Array.isArray(roles.reviewers) ? roles.reviewers : [];
      const decisionsByVersion = roles.decisionsByVersion || {};
      const decisionEntries = decisionsByVersion[currentVersionId] || [];

      function appendRoleBlock(title, entries) {
        const block = document.createElement('div');
        block.className = 'role-block';
        const rows = entries.length > 0
          ? entries.map((entry) => '<div class="role-entry">' + escapeHtml(entry) + '</div>').join('')
          : '<div class="role-entry">' + escapeHtml(L.noRoles) + '</div>';
        block.innerHTML = '<h3>' + escapeHtml(title) + '</h3>' + rows;
        root.appendChild(block);
      }

      appendRoleBlock(
        L.uploader,
        uploader
          ? [uploader.email || uploader.displayName || uploader.uploaderId || '-']
          : []
      );
      appendRoleBlock(
        L.approvers,
        approvers.map((item) => item.displayName || item.email || item.id)
      );
      appendRoleBlock(
        L.reviewers,
        reviewers.map((item) => item.displayName || item.email || item.id)
      );

      const history = document.createElement('div');
      history.className = 'role-block';
      let historyHtml = '<h3>' + escapeHtml(L.decisionHistory) + '</h3>';
      if (decisionEntries.length === 0) {
        historyHtml += '<div class="role-entry">' + escapeHtml(L.noHistory) + '</div>';
      } else {
        historyHtml += decisionEntries
          .map((entry) =>
            '<div class="history-entry"><strong>' + escapeHtml(entry.decision) + '</strong> - ' +
            escapeHtml(entry.by || '-') +
            (entry.reason ? '<div class="role-entry">' + escapeHtml(entry.reason) + '</div>' : '') +
            '<div class="role-entry">' + escapeHtml(new Date(entry.createdAt).toLocaleString()) + '</div>' +
            '</div>'
          )
          .join('');
      }
      history.innerHTML = historyHtml;
      root.appendChild(history);
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
      const actor = data.actor || {};
      const actorEmail = actor.email || '-';
      const actorRole = actor.roleAtTime || L.roleUnknown;
      document.getElementById('actorBadge').innerText =
        L.loggedInAs + ': ' + actorEmail + ' ' + L.inRole + ' "' + actorRole + '"';
      tokenExpiryMs = actor.expiry ? Date.parse(actor.expiry) : null;
      renderTokenExpiry();
      if (!tokenExpiryTimer) {
        tokenExpiryTimer = setInterval(renderTokenExpiry, 1000);
      }
      const waitingFiles = Array.isArray(data.waitingFiles) ? data.waitingFiles : [];
      const waitingText = waitingFiles.length > 0
        ? (L.waitingFiles + ' ' + waitingFiles.map((item) => item.filename).join(', '))
        : L.allApproved;
      document.getElementById('processSummary').innerHTML =
        '<div class=\"project-number\">' + L.project + ' ' + escapeHtml(data.process.projectNumber || '-') + '</div>' +
        '<p>' + L.customer + ': ' + escapeHtml(data.process.customerNumber) + '</p>' +
        '<p>' + L.status + ': <span class=\"status-pill\">' + escapeHtml(data.process.status) + '</span></p>' +
        '<p>' + escapeHtml(waitingText) + '</p>';
      const fileList = document.getElementById('fileList');
      fileList.innerHTML = '';
      const files = data.files || [];
      let firstVersionId = null;
      if (files.length === 0) {
        fileList.innerHTML = '<div>' + escapeHtml(L.noFiles) + '</div>';
      }
      files.forEach(file => {
        file.versions.forEach(version => {
          if (version.id === currentVersionId) {
            currentVersionStatus = version.status || 'PENDING';
          }
          if (!firstVersionId) {
            firstVersionId = version.id;
          }
          const div = document.createElement('button');
          div.type = 'button';
          div.className = 'file-item' + (version.id === currentVersionId ? ' active' : '');
          div.innerHTML =
            '<div class=\"file-main\">' + escapeHtml(file.originalFilename) + '</div>' +
            '<div class=\"file-sub\">' + L.version + ' ' + escapeHtml(version.versionNumber) + '</div>' +
            '<div class=\"file-sub\">' + L.fileStatus + ': ' + escapeHtml(version.status || 'PENDING') + '</div>';
          div.addEventListener('click', async () => {
            currentVersionStatus = version.status || 'PENDING';
            await openViewer(version.id);
            await fetchSummary();
          });
          fileList.appendChild(div);
        });
      });
      if (!currentVersionId && firstVersionId) {
        const firstVersion = files.flatMap((item) => item.versions).find((v) => v.id === firstVersionId);
        currentVersionStatus = (firstVersion && firstVersion.status) || 'PENDING';
        await openViewer(firstVersionId);
      }
      document.getElementById('docStatus').innerText = L.statusBig + ': ' + (currentVersionStatus || 'PENDING');
      renderRoles(data);
      currentScopes = Array.isArray(data.scopes) ? data.scopes : [];
      currentRoleAtTime = data.actor && data.actor.roleAtTime ? String(data.actor.roleAtTime) : '';
      const isPendingVersion = currentVersionStatus === 'PENDING';
      const canDecide = currentScopes.includes('DECIDE') && isPendingVersion;
      const canAnnotate = currentScopes.includes('ANNOTATE_PDF') && currentRoleAtTime === 'APPROVER' && isPendingVersion;
      document.getElementById('approveBtn').disabled = !canDecide;
      document.getElementById('rejectBtn').disabled = !canDecide;
      document.getElementById('downloadBtn').disabled = !currentVersionId;
      document.querySelectorAll('.tools button').forEach((btn) => {
        btn.style.display = canAnnotate ? 'block' : 'none';
      });
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
      document.getElementById('docStatus').innerText = L.statusBig + ': ' + (currentVersionStatus || 'PENDING');
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
      if (typeof pdfjsLib === 'undefined' || typeof fabric === 'undefined') {
        showError(L.pdfLoadFailed);
        return;
      }
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
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
        annotationDoc = sanitizeAnnotationObject(latest.dataJson);
      }
    }

    async function renderPage() {
      if (!pdfDoc) return;
      if (fabricCanvas) {
        annotationDoc.pages[String(currentPage)] = sanitizeAnnotationObject(fabricCanvas.toJSON());
      }
      const page = await pdfDoc.getPage(currentPage);
      const baseViewport = page.getViewport({ scale: 1 });
      const dpr = window.devicePixelRatio || 1;
      const stage = document.getElementById('viewerStage');
      const host = stage.parentElement;
      const availableWidth = Math.max(320, (host ? host.clientWidth : baseViewport.width) - 8);
      const cssScale = Math.min(1, availableWidth / baseViewport.width);
      const cssViewport = page.getViewport({ scale: cssScale });
      const renderViewport = page.getViewport({ scale: cssScale * dpr });
      const pdfCanvas = document.getElementById('pdfLayer');
      const annotationCanvas = document.getElementById('annotationCanvas');
      const ctx = pdfCanvas.getContext('2d');
      pdfCanvas.height = Math.floor(renderViewport.height);
      pdfCanvas.width = Math.floor(renderViewport.width);
      pdfCanvas.style.width = Math.floor(cssViewport.width) + 'px';
      pdfCanvas.style.height = Math.floor(cssViewport.height) + 'px';
      annotationCanvas.height = Math.floor(cssViewport.height);
      annotationCanvas.width = Math.floor(cssViewport.width);
      annotationCanvas.style.width = Math.floor(cssViewport.width) + 'px';
      annotationCanvas.style.height = Math.floor(cssViewport.height) + 'px';
      await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;
      if (fabricCanvas) {
        fabricCanvas.dispose();
      }
      fabricCanvas = new fabric.Canvas('annotationCanvas', { selection: true });
      const canAnnotate =
        currentScopes.includes('ANNOTATE_PDF') &&
        currentRoleAtTime === 'APPROVER' &&
        currentVersionStatus === 'PENDING';
      fabricCanvas.selection = canAnnotate;
      fabricCanvas.skipTargetFind = !canAnnotate;
      fabricCanvas.isDrawingMode = false;
      fabricCanvas.on('path:created', () => {
        refreshAnnotationList();
        queueAutoSave();
      });
      fabricCanvas.on('object:modified', () => {
        refreshAnnotationList();
        queueAutoSave();
      });
      fabricCanvas.on('object:added', () => {
        if (suppressAutosave) return;
        refreshAnnotationList();
        queueAutoSave();
      });
      const pageData = annotationDoc.pages[String(currentPage)];
      if (pageData) {
        suppressAutosave = true;
        fabricCanvas.loadFromJSON(sanitizeAnnotationObject(pageData), () => {
          fabricCanvas.renderAll();
          suppressAutosave = false;
          refreshAnnotationList();
        });
      } else {
        suppressAutosave = false;
      }
      refreshAnnotationList();
      document.getElementById('pageInfo').textContent = L.page + ' ' + currentPage + ' / ' + totalPages;
      document.getElementById('prevPageBtn').disabled = currentPage <= 1;
      document.getElementById('nextPageBtn').disabled = currentPage >= totalPages;
    }

    function refreshAnnotationList() {
      const list = document.getElementById('annotationsList');
      list.innerHTML = '';
      if (!fabricCanvas) {
        list.innerHTML = '<div class="annotation-meta">' + escapeHtml(L.pageEmpty) + '</div>';
        return;
      }
      const items = fabricCanvas.getObjects();
      if (items.length === 0) {
        list.innerHTML = '<div class="annotation-meta">' + escapeHtml(L.pageEmpty) + '</div>';
        return;
      }
      items.forEach((obj, idx) => {
        const row = document.createElement('div');
        row.className = 'annotation-item';
        const type = obj.type || 'object';
        const removeButton =
          (currentScopes.includes('ANNOTATE_PDF') &&
            currentRoleAtTime === 'APPROVER' &&
            currentVersionStatus === 'PENDING')
          ? '<button type=\"button\" data-idx=\"' + idx + '\" class=\"remove-annotation-btn\">' + escapeHtml(L.remove) + '</button>'
          : '';
        row.innerHTML =
          '<div><strong>#' + (idx + 1) + '</strong> <span class=\"annotation-meta\">' + escapeHtml(type) + '</span></div>' +
          removeButton;
        list.appendChild(row);
      });
      document.querySelectorAll('.remove-annotation-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.idx);
          const objs = fabricCanvas.getObjects();
          if (Number.isInteger(idx) && objs[idx]) {
            fabricCanvas.remove(objs[idx]);
            fabricCanvas.requestRenderAll();
            refreshAnnotationList();
            queueAutoSave();
          }
        });
      });
    }

    function openModal(id) {
      document.getElementById(id).classList.add('open');
    }

    function closeModal(id) {
      document.getElementById(id).classList.remove('open');
    }

    async function persistAnnotations() {
      if (!(currentScopes.includes('ANNOTATE_PDF') && currentRoleAtTime === 'APPROVER' && currentVersionStatus === 'PENDING')) return false;
      if (!fabricCanvas || !currentVersionId) return false;
      annotationDoc.pages[String(currentPage)] = sanitizeAnnotationObject(fabricCanvas.toJSON());
      annotationDoc = sanitizeAnnotationObject(annotationDoc);
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
        return false;
      }
      const payload = await res.json().catch(() => ({}));
      if (payload && payload.id) {
        activeAnnotationId = payload.id;
      }
      return true;
    }

    async function submitDecision(decision, reason) {
      if (!currentVersionId) {
        showError(L.noDocumentSelected);
        return false;
      }
      await persistAnnotations();
      const res = await fetch('/api/approvals/decide?token=' + TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          processId: window.__processId,
          participantId: window.__participantId,
          decision,
          reason,
          fileVersionId: currentVersionId
        })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        showError(resolveErrorMessage(res.status, payload));
        return false;
      }
      const payload = await res.json().catch(() => ({}));
      hideError();
      if (decision === 'APPROVE' && payload && payload.status === 'IN_REVIEW') {
        showSuccess(L.approvedPending);
      } else {
        showSuccess(decision === 'APPROVE' ? L.approved : L.rejected);
      }
      await fetchSummary();
      return true;
    }

    document.getElementById('approveBtn').addEventListener('click', async () => {
      openModal('confirmApproveModal');
    });

    document.getElementById('rejectBtn').addEventListener('click', async () => {
      document.getElementById('rejectReasonInput').value = '';
      openModal('confirmRejectModal');
    });

    document.getElementById('approveCancelBtn').addEventListener('click', () => closeModal('confirmApproveModal'));
    document.getElementById('rejectCancelBtn').addEventListener('click', () => closeModal('confirmRejectModal'));
    document.getElementById('approveConfirmBtn').addEventListener('click', async () => {
      closeModal('confirmApproveModal');
      await submitDecision('APPROVE');
    });
    document.getElementById('rejectConfirmBtn').addEventListener('click', async () => {
      const reason = document.getElementById('rejectReasonInput').value;
      if (!reason || !reason.trim()) {
        showError(L.rejectReasonRequired);
        return;
      }
      closeModal('confirmRejectModal');
      await submitDecision('REJECT', reason.trim());
    });

    document.getElementById('downloadBtn').addEventListener('click', async () => {
      if (!currentVersionId) return;
      await downloadFile(currentVersionId);
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
        if (!(currentScopes.includes('ANNOTATE_PDF') && currentRoleAtTime === 'APPROVER' && currentVersionStatus === 'PENDING')) return;
        const tool = btn.dataset.tool;
        fabricCanvas.isDrawingMode = tool === 'freehand';
        if (tool === 'highlight') {
          const rect = new fabric.Rect({ left: 50, top: 50, width: 100, height: 30, fill: 'rgba(255, 235, 59, 0.4)' });
          fabricCanvas.add(rect);
          refreshAnnotationList();
          queueAutoSave();
        }
        if (tool === 'rect') {
          const rect = new fabric.Rect({ left: 80, top: 80, width: 140, height: 80, fill: 'rgba(59, 130, 246, 0.2)', stroke: '#1d4ed8', strokeWidth: 2 });
          fabricCanvas.add(rect);
          refreshAnnotationList();
          queueAutoSave();
        }
        if (tool === 'text') {
          const text = new fabric.IText('Note', { left: 120, top: 120, fontSize: 16, fill: '#0f172a', textBaseline: 'alphabetic' });
          fabricCanvas.add(text);
          refreshAnnotationList();
          queueAutoSave();
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
      include: {
        files: { include: { versions: true } },
        cycles: { include: { participants: true } },
        decisions: {
          include: { participant: true },
          orderBy: { createdAt: "asc" }
        }
      }
    });
    if (!process) return res.status(404).json({ error: "Process not found" });
    const snapshot = await calculateProcessApprovalSnapshot(process.id);
    if (process.status !== snapshot.processStatus) {
      await prisma.process.update({
        where: { id: process.id },
        data: { status: snapshot.processStatus }
      });
    }

    const fileVersionToFilename = new Map<string, string>();
    process.files.forEach((file) => {
      file.versions.forEach((version) => {
        fileVersionToFilename.set(version.id, file.originalFilename || file.normalizedOriginalFilename);
      });
    });

    const waitingFiles = Object.entries(snapshot.fileStatuses)
      .filter(([, status]) => status === "PENDING")
      .map(([versionId]) => ({
        fileVersionId: versionId,
        filename: fileVersionToFilename.get(versionId) ?? "unknown"
      }));

    const participants = process.cycles.flatMap((cycle) => cycle.participants);
    const approvers = participants.filter((participant) => participant.role === "APPROVER");
    const reviewers = participants.filter((participant) => participant.role === "REVIEWER");
    let actorEmail: string | null = null;
    if (req.token?.participantId) {
      const actorParticipant = participants.find((participant) => participant.id === req.token?.participantId);
      actorEmail = actorParticipant?.email ?? null;
    } else if (req.token?.uploaderId && req.token.uploaderId === process.uploaderId) {
      actorEmail = process.uploaderEmail ?? null;
    }
    const decisionsByVersion: Record<string, Array<{ decision: string; reason: string | null; by: string; createdAt: Date }>> = {};
    for (const decision of process.decisions) {
      if (!decision.fileVersionId) continue;
      if (!decisionsByVersion[decision.fileVersionId]) {
        decisionsByVersion[decision.fileVersionId] = [];
      }
      decisionsByVersion[decision.fileVersionId].push({
        decision: decision.decision,
        reason: decision.reason,
        by: decision.participant.displayName || decision.participant.email || decision.participant.id,
        createdAt: decision.createdAt
      });
    }

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
        status: snapshot.processStatus,
        attributesJson: parseJsonString(process.attributesJson)
      },
      participantId: req.token?.participantId ?? null,
      actor: {
        email: actorEmail,
        roleAtTime: req.token?.roleAtTime ?? null,
        expiry: req.token?.expiry ?? null
      },
      waitingFiles,
      files: process.files.map(file => ({
        id: file.id,
        originalFilename: file.originalFilename || file.normalizedOriginalFilename,
        versions: file.versions.map(version => ({
          id: version.id,
          versionNumber: version.versionNumber,
          status: snapshot.fileStatuses[version.id] ?? "PENDING"
        }))
      })),
      roles: {
        uploader: {
          uploaderId: process.uploaderId,
          email: process.uploaderEmail,
          displayName: process.uploaderName
        },
        approvers: approvers.map((participant) => ({
          id: participant.id,
          email: participant.email,
          displayName: participant.displayName
        })),
        reviewers: reviewers.map((participant) => ({
          id: participant.id,
          email: participant.email,
          displayName: participant.displayName
        })),
        decisionsByVersion
      },
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
    if (!(await ensureFileVersionMutableForAnnotations(version.file.processId, version.id))) {
      return res.status(409).json({ error: "File is finalized; annotations are locked" });
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
    if (!(await ensureFileVersionMutableForAnnotations(existing.fileVersion.file.processId, existing.fileVersion.id))) {
      return res.status(409).json({ error: "File is finalized; annotations are locked" });
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
    if (!(await ensureFileVersionMutableForAnnotations(existing.fileVersion.file.processId, existing.fileVersion.id))) {
      return res.status(409).json({ error: "File is finalized; annotations are locked" });
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
