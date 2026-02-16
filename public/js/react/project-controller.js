import {
  formatDateDdMmYyyy,
  loadUiI18n,
  normalizeLang,
  statusCss,
  translateStatus
} from "./ui-utils.js";

export async function initProjectPage() {
  const queryParams = new URLSearchParams(window.location.search);
  const TARGET_PROCESS_ID = queryParams.get('processId') || '';
  const LANG = normalizeLang(queryParams.get('lang') || 'en');
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
  let annotationDirty = false;
  let currentScopes = [];
  let currentVersionStatus = 'PENDING';
  let currentVersionApprovalRequired = true;
  let currentVersionHasViewFile = true;
  let versionMetaById = {};
  let currentRoleAtTime = '';
  let currentActorEmail = '';
  let currentParticipantId = '';
  let currentProcessId = '';
  let destroyed = false;
  const cleanupFns = [];

  function registerCleanup(fn) {
    cleanupFns.push(fn);
  }

  function bindEvent(el, event, handler, options) {
    if (!el) return;
    el.addEventListener(event, handler, options);
    registerCleanup(() => {
      el.removeEventListener(event, handler, options);
    });
  }

  function disposeController() {
    destroyed = true;
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    if (fabricCanvas) {
      fabricCanvas.dispose();
      fabricCanvas = null;
    }
    while (cleanupFns.length > 0) {
      const fn = cleanupFns.pop();
      try {
        fn();
      } catch (_err) {
        // ignore cleanup errors
      }
    }
  }

  const L = new Proxy(await loadUiI18n('token', LANG), {
    get(target, prop) {
      if (typeof prop !== 'string') return undefined;
      const value = target[prop];
      return typeof value === 'string' ? value : prop;
    }
  });
  document.getElementById('filesTitle').innerText = L.files;
  document.getElementById('annotationsTitle').innerText = L.annotations;
  document.getElementById('approvalTitle').innerText = L.approval;
  document.getElementById('projectRolesTitle').innerText = L.roles;
  document.getElementById('historyTitle').innerText = L.history;
  document.getElementById('historyDrawerLabel').innerText = L.history;
  document.getElementById('viewerTitle').innerText = L.viewer;
  document.getElementById('loggedInLabel').innerText = L.loggedInAs + ':';
  document.getElementById('customerLabel').innerText = L.customerIdLabel + ':';
  document.getElementById('expiryLabel').innerText = L.linkValidUntil + ':';
  document.getElementById('actorLine').innerText = '-';
  document.getElementById('customerLine').innerText = '-';
  document.getElementById('tokenExpiryBadge').innerText = '-';
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
  const portalLink = document.getElementById('portalLink');
  if (portalLink) {
    const portalParams = new URLSearchParams();
    portalParams.set('lang', LANG);
    portalParams.set('view', 'portal');
    portalLink.href = '/app.html?' + portalParams.toString();
    portalLink.innerText = L.openPortalLink;
  }
  const historyDrawer = document.getElementById('historyDrawer');
  const historyDrawerHandle = document.getElementById('historyDrawerHandle');
  if (historyDrawer && historyDrawerHandle) {
    bindEvent(historyDrawerHandle, 'click', () => {
      historyDrawer.classList.toggle('is-open');
    });
  }

  const translateStatusLabel = (status) => translateStatus(status, (key) => L[key]);

  function canRoleAnnotate() {
    return (currentRoleAtTime === 'APPROVER' || currentRoleAtTime === 'REVIEWER') && Boolean(currentParticipantId);
  }

  function canAnnotateCurrentState() {
    return (
      currentScopes.includes('ANNOTATE_PDF') &&
      canRoleAnnotate() &&
      currentVersionApprovalRequired &&
      currentVersionHasViewFile &&
      currentVersionStatus === 'PENDING'
    );
  }

  function canViewCurrentVersion() {
    return currentScopes.includes('VIEW_PDF') || currentScopes.includes('ADMIN');
  }

  function canDownloadCurrentVersion() {
    return currentScopes.includes('DOWNLOAD_PDF') || canViewCurrentVersion();
  }

  function formatDateTime(isoValue) {
    if (!isoValue) return '-';
    const dt = new Date(isoValue);
    if (Number.isNaN(dt.getTime())) return '-';
    const pad = (n) => String(n).padStart(2, '0');
    return pad(dt.getDate()) + '.' + pad(dt.getMonth() + 1) + '.' + dt.getFullYear() + ' ' +
      pad(dt.getHours()) + ':' + pad(dt.getMinutes()) + ':' + pad(dt.getSeconds());
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
    if (payload && payload.code === 'TOKEN_REPLACED') return L.replacedToken;
    if (payload && payload.error === 'Approval not required for this file') return L.noApprovalRequiredInfo;
    if (payload && payload.error === 'No view file available for this document') return L.noViewFile;
    if (payload && payload.error === 'No view file available for annotations') return L.noViewForAnnotations;
    if (status === 401) return L.invalidToken;
    if (status === 403) return L.forbidden;
    if (status === 404) return L.notFound;
    if (status === 410) return L.superseded;
    if (payload && payload.error === 'Decision already recorded for this file') return L.alreadyDecided;
    if (payload && payload.error) return payload.error;
    return L.genericError;
  }

  function setViewerUnavailable(message, hint) {
    const unavailable = document.getElementById('viewerUnavailable');
    const pdfCanvas = document.getElementById('pdfLayer');
    const annotationCanvas = document.getElementById('annotationCanvas');
    if (pdfCanvas) {
      pdfCanvas.width = 0;
      pdfCanvas.height = 0;
      pdfCanvas.style.width = '0';
      pdfCanvas.style.height = '0';
    }
    if (annotationCanvas) {
      annotationCanvas.width = 0;
      annotationCanvas.height = 0;
      annotationCanvas.style.width = '0';
      annotationCanvas.style.height = '0';
    }
    if (unavailable) {
      unavailable.classList.remove('hidden');
      unavailable.innerHTML =
        '<div class="viewer-unavailable-title">' + escapeHtml(message) + '</div>' +
        '<div class="viewer-unavailable-hint">' + escapeHtml(hint || '') + '</div>';
    }
  }

  function clearViewerUnavailable() {
    const unavailable = document.getElementById('viewerUnavailable');
    if (unavailable) {
      unavailable.classList.add('hidden');
      unavailable.innerHTML = '';
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeIdentity(value) {
    return String(value || '').trim().toLowerCase();
  }

  function renderPendingNames(entries, emptyLabel) {
    const currentActor = normalizeIdentity(currentActorEmail);
    const list = Array.isArray(entries) ? entries.filter(Boolean).map((entry) => String(entry)) : [];
    if (list.length === 0) {
      return '<div class="pending-approver-list">' +
        '<div class="pending-name-line" title="' + escapeHtml(emptyLabel) + '">' + escapeHtml(emptyLabel) + '</div>' +
        '</div>';
    }
    return '<div class="pending-approver-list">' +
      list
        .map((entry) => {
          const isCurrent = currentActor && normalizeIdentity(entry) === currentActor;
          const rowClass = 'pending-name-line' + (isCurrent ? ' pending-name-current' : '');
          return '<div class="' + rowClass + '" title="' + escapeHtml(entry) + '">' + escapeHtml(entry) + '</div>';
        })
        .join('') +
      '</div>';
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
    const approvalRoot = document.getElementById('approverList');
    const projectRoot = document.getElementById('projectRolesList');
    approvalRoot.innerHTML = '';
    projectRoot.innerHTML = '';
    const roles = data.roles || {};
    const uploader = roles.uploader || null;
    const approvers = Array.isArray(roles.approvers) ? roles.approvers : [];
    const reviewers = Array.isArray(roles.reviewers) ? roles.reviewers : [];
    const decisionsByVersion = roles.decisionsByVersion || {};
    const decisionsForCurrentVersion = Array.isArray(decisionsByVersion[currentVersionId])
      ? decisionsByVersion[currentVersionId]
      : [];
    const decisionMap = new Map();
    decisionsForCurrentVersion
      .slice()
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .forEach((entry) => {
        if (entry && entry.participantId) {
          decisionMap.set(entry.participantId, entry.decision || '');
        }
      });
    const ruleForVersion = data.approvalRuleByVersion && data.approvalRuleByVersion[currentVersionId]
      ? data.approvalRuleByVersion[currentVersionId]
      : data.approvalRule;
    const versionMeta = versionMetaById[currentVersionId] || {};
    const isApprovalRequired = versionMeta.approvalRequired !== false;
    const ruleInfo = !isApprovalRequired
      ? L.noApprovalRequiredInfo
      : (ruleForVersion === 'ANY_APPROVE' ? L.ruleAnyApproveInfo : L.ruleAllApproveInfo);
    const currentActor = normalizeIdentity(currentActorEmail);

    function isCurrentEntry(entry) {
      if (!entry) return false;
      if (currentParticipantId && entry.id && String(entry.id) === String(currentParticipantId)) {
        return true;
      }
      const identity = normalizeIdentity(entry.email || entry.displayName || entry.label || entry.id);
      return Boolean(currentActor && identity && currentActor === identity);
    }

    function appendRoleBlock(root, title, entries, options = {}) {
      const block = document.createElement('div');
      block.className = 'role-block';
      let rows = '';
      if (options.kind === 'approvers') {
        rows += '<div class="approver-rule-box">' + escapeHtml(ruleInfo) + '</div>';
        if (entries.length > 0) {
          rows += entries
            .map((entry) => {
              const participantId = entry.id || '';
              const decision = decisionMap.get(participantId) || '';
              const isApproved = decision === 'APPROVE';
              const isRejected = decision === 'REJECT';
              const isFinalized = currentVersionStatus !== 'PENDING';
              const isNone = !isApproved && !isRejected && isFinalized;
              const stateClass = !isApprovalRequired
                ? 'decision-icon-none'
                : (isApproved
                ? 'decision-icon-approved'
                : (isRejected ? 'decision-icon-rejected' : (isNone ? 'decision-icon-none' : 'decision-icon-wait')));
              const stateLabel = !isApprovalRequired
                ? ''
                : (isApproved
                ? L.decisionApproved
                : (isRejected ? L.decisionRejected : (isNone ? '' : L.decisionWait)));
              const label = entry.displayName || entry.email || entry.id || '-';
              const rowClass = 'role-entry role-entry-with-icon' + (isCurrentEntry(entry) ? ' role-entry-current' : '');
              return '<div class="' + rowClass + '">' +
                '<span class="decision-icon ' + stateClass + '"' + (stateLabel ? (' title="' + escapeHtml(stateLabel) + '"') : '') + '></span>' +
                '<span class="role-entry-ellipsis" title="' + escapeHtml(label) + '">' + escapeHtml(label) + '</span>' +
                '</div>';
            })
            .join('');
        } else {
          rows += '<div class="role-entry role-entry-ellipsis" title="' + escapeHtml(L.noRoles) + '">' + escapeHtml(L.noRoles) + '</div>';
        }
      } else {
        rows = entries.length > 0
          ? entries
            .map((entry) => {
              const label = entry.label || entry.email || entry.displayName || entry.id || '-';
              const rowClass = 'role-entry role-entry-ellipsis' + (isCurrentEntry(entry) ? ' role-entry-current' : '');
              return '<div class="' + rowClass + '" title="' + escapeHtml(label) + '">' + escapeHtml(label) + '</div>';
            })
            .join('')
          : '<div class="role-entry role-entry-ellipsis" title="' + escapeHtml(L.noRoles) + '">' + escapeHtml(L.noRoles) + '</div>';
      }
      block.innerHTML = '<h3>' + escapeHtml(title) + '</h3>' + rows;
      root.appendChild(block);
    }

    appendRoleBlock(
      projectRoot,
      L.uploader,
      uploader
        ? [{
          id: uploader.id || '',
          email: uploader.email || '',
          displayName: uploader.displayName || '',
          label: uploader.email || uploader.displayName || uploader.uploaderId || '-'
        }]
        : []
    );
    appendRoleBlock(
      projectRoot,
      L.approvers,
      approvers.map((item) => ({
        id: item.id || '',
        email: item.email || '',
        displayName: item.displayName || '',
        label: item.displayName || item.email || item.id || '-'
      }))
    );
    appendRoleBlock(
      projectRoot,
      L.reviewers,
      reviewers.map((item) => ({
        id: item.id || '',
        email: item.email || '',
        displayName: item.displayName || '',
        label: item.displayName || item.email || item.id || '-'
      }))
    );

    appendRoleBlock(
      approvalRoot,
      L.approvers,
      approvers,
      { kind: 'approvers' }
    );
  }

  function renderHistory(data) {
    const root = document.getElementById('historyList');
    root.innerHTML = '';
    const roles = data.roles || {};
    const historyByFile = roles.historyByFile || {};
    const versionToFileId = data.versionToFileId || {};
    const participants = data.roles && data.roles.participants
      ? data.roles.participants
      : (data.roles && data.roles.allParticipants) || [];
    const fileId = currentVersionId ? versionToFileId[currentVersionId] : null;
    const historyEntries = fileId && Array.isArray(historyByFile[fileId]) ? historyByFile[fileId] : [];
    const actorCache = new Map();
    function resolveActor(entry) {
      if (entry.by && entry.by !== 'unknown') return entry.by;
      const cached = actorCache.get(entry.participantId || entry.tokenId);
      if (cached) return cached;
      if (entry.participantId) {
        const participant = participants.find((p) => p.id === entry.participantId);
        if (participant) {
          const name = participant.displayName || participant.email || participant.id;
          actorCache.set(entry.participantId, name);
          return name;
        }
      }
      if (entry.tokenId && data.roles && data.roles.participantByTokenId) {
        const hit = data.roles.participantByTokenId[entry.tokenId];
        if (hit) {
          const name = hit.displayName || hit.email || 'unknown';
          actorCache.set(entry.tokenId, name);
          return name;
        }
      }
      return entry.by || 'unknown';
    }
    const history = document.createElement('div');
    history.className = 'role-block';
    let historyHtml = '<h3>' + escapeHtml(L.history) + '</h3>';
    if (historyEntries.length === 0) {
      historyHtml += '<div class="role-entry">' + escapeHtml(L.noHistory) + '</div>';
    } else {
      const formatActionLabel = (entry) => {
        if (entry.kind === 'upload') return L.historyActionUpload;
        if (entry.kind === 'annotation') return L.historyActionAnnotation;
        if (entry.decision === 'APPROVE') return L.historyActionApprove;
        if (entry.decision === 'REJECT') return L.historyActionReject;
        if (entry.decision) return String(entry.decision);
        if (entry.kind) return String(entry.kind);
        return '-';
      };
      const formatVersionLabel = (entry) => {
        if (entry.versionNumber == null) return '-';
        return L.version + ' ' + String(entry.versionNumber);
      };
      const sorted = historyEntries.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      historyHtml += sorted
        .map((entry) => {
          const actor = resolveActor(entry) || '-';
          const version = formatVersionLabel(entry);
          let action = formatActionLabel(entry);
          if (entry.reason) {
            action += ' (' + L.historyReasonLabel + ': ' + String(entry.reason) + ')';
          }
          return (
            '<div class="history-entry">' +
            '<div class="history-line">' + escapeHtml(L.historyFieldVersion + ': ' + version) + '</div>' +
            '<div class="history-line">' + escapeHtml(L.historyFieldAction + ': ' + action) + '</div>' +
            '<div class="history-line">' + escapeHtml(L.historyFieldUser + ': ' + actor) + '</div>' +
            '<div class="history-line">' + escapeHtml(L.historyFieldWhen + ': ' + formatDateTime(entry.createdAt)) + '</div>' +
            '</div>'
          );
        })
        .join('');
    }
    history.innerHTML = historyHtml;
    root.appendChild(history);
  }

  async function fetchSummary() {
    if (destroyed) return;
    setLoading(L.loadingSummary);
    const summaryParams = new URLSearchParams();
    if (TARGET_PROCESS_ID) {
      summaryParams.set('processId', TARGET_PROCESS_ID);
    }
    const res = await fetch('/api/ui/summary?' + summaryParams.toString());
    if (destroyed) return;
    const data = await res.json().catch(() => ({}));
    if (destroyed) return;
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
    currentActorEmail = actor.email ? String(actor.email).trim() : '';
    currentParticipantId = data.participantId || '';
    currentProcessId = data.process.id || '';
    const actorEmail = currentActorEmail || '-';
    document.getElementById('actorLine').innerText = actorEmail;
    document.getElementById('customerLine').innerText = data.process.customerNumber || '-';
    document.getElementById('tokenExpiryBadge').innerText = formatDateDdMmYyyy(actor.expiry);
    const waitingFiles = Array.isArray(data.waitingFiles) ? data.waitingFiles : [];
    const waitingText = waitingFiles.length > 0
      ? L.waitingFiles
      : L.noPendingDocuments;
    document.getElementById('processSummary').innerHTML =
      '<div class="project-number">' + L.project + ' ' + escapeHtml(data.process.projectNumber || '-') + '</div>' +
      '<p>' + L.customer + ': ' + escapeHtml(data.process.customerNumber) + '</p>' +
      '<p>' + L.status + ': <span class="status-pill ' + statusCss(data.process.status) + '">' + escapeHtml(translateStatusLabel(data.process.status)) + '</span></p>' +
      '<p>' + escapeHtml(waitingText) + '</p>';
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';
    const files = data.files || [];
    versionMetaById = {};
    files.forEach((file) => {
      (file.versions || []).forEach((version) => {
        versionMetaById[version.id] = {
          approvalRequired: version.approvalRequired !== false,
          hasViewFile: Boolean(version.hasViewFile),
          viewMime: version.viewMime || '',
          downloadMime: version.downloadMime || ''
        };
      });
    });
    const firstVersionId = files.flatMap((item) => item.versions)[0]?.id || null;
    const needsInitialOpen = !currentVersionId && !!firstVersionId;
    if (needsInitialOpen) {
      currentVersionId = firstVersionId;
    }
    if (files.length === 0) {
      fileList.innerHTML = '<div>' + escapeHtml(L.noFiles) + '</div>';
    }
    files.forEach(file => {
      file.versions.forEach(version => {
        if (version.id === currentVersionId) {
          currentVersionStatus = version.status || 'PENDING';
          currentVersionApprovalRequired = version.approvalRequired !== false;
          currentVersionHasViewFile = Boolean(version.hasViewFile);
        }
        const div = document.createElement('button');
        div.type = 'button';
        div.className = 'file-item' + (version.id === currentVersionId ? ' active' : '');
        const pendingNames = ((data.pendingApproversByVersion && data.pendingApproversByVersion[version.id]) || []);
        const pendingHtml = pendingNames.length > 0
          ? ('<div class="file-sub pending-label">' + L.pendingApprovals + ':</div>' +
            '<div class="file-sub">' + renderPendingNames(pendingNames, '-') + '</div>')
          : '';
        div.innerHTML =
          '<div class="file-main">' + escapeHtml(file.originalFilename) + ' (v' + escapeHtml(version.versionNumber) + ')</div>' +
          '<div class="file-sub"><span class="file-label">' + escapeHtml(L.uploadedAt) + ':</span> ' + escapeHtml(formatDateTime(version.createdAt)) + '</div>' +
          '<div class="file-sub"><span class="file-label">' + escapeHtml(L.fileStatus) + ':</span> <span class="status-text ' + statusCss(version.status || 'PENDING') + '">' + escapeHtml(translateStatusLabel(version.status || 'PENDING')) + '</span></div>' +
          pendingHtml;
        div.addEventListener('click', async () => {
          currentVersionStatus = version.status || 'PENDING';
          currentVersionApprovalRequired = version.approvalRequired !== false;
          currentVersionHasViewFile = Boolean(version.hasViewFile);
          await openViewer(version.id);
          await fetchSummary();
        });
        fileList.appendChild(div);
      });
    });
    if (needsInitialOpen && firstVersionId) {
      const firstVersion = files.flatMap((item) => item.versions).find((v) => v.id === firstVersionId);
      currentVersionStatus = (firstVersion && firstVersion.status) || 'PENDING';
      currentVersionApprovalRequired = !(firstVersion && firstVersion.approvalRequired === false);
      currentVersionHasViewFile = Boolean(firstVersion && firstVersion.hasViewFile);
      await openViewer(firstVersionId);
    }
    const docStatusEl = document.getElementById('docStatus');
    docStatusEl.innerText = L.statusBig + ': ' + translateStatusLabel(currentVersionStatus || 'PENDING');
    docStatusEl.className = 'doc-status status-text ' + statusCss(currentVersionStatus || 'PENDING');
    renderRoles(data);
    renderHistory(data);
    currentScopes = Array.isArray(data.scopes) ? data.scopes : [];
    currentRoleAtTime = data.actor && data.actor.roleAtTime ? String(data.actor.roleAtTime) : '';
    const actorDecisions = ((data.roles && data.roles.decisionsByVersion && data.roles.decisionsByVersion[currentVersionId]) || [])
      .filter((entry) => entry && entry.participantId && entry.participantId === currentParticipantId);
    const actorAlreadyDecided = actorDecisions.length > 0;
    const isPendingVersion = currentVersionStatus === 'PENDING';
    const canDecide = currentScopes.includes('DECIDE') && Boolean(currentParticipantId) && isPendingVersion && !actorAlreadyDecided && currentVersionApprovalRequired;
    const canAnnotate = canAnnotateCurrentState();
    document.getElementById('approveBtn').disabled = !canDecide;
    document.getElementById('rejectBtn').disabled = !canDecide;
    document.getElementById('downloadBtn').disabled = !currentVersionId || !canDownloadCurrentVersion();
    document.querySelectorAll('.tools button').forEach((btn) => {
      btn.style.display = canAnnotate ? 'block' : 'none';
    });
  }

  async function downloadFile(versionId) {
    if (destroyed) return;
    const res = await fetch('/api/files/versions/' + versionId + '/download');
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
    if (destroyed) return;
    currentVersionId = versionId;
    document.getElementById('viewerCard').style.display = 'block';
    const docStatusEl = document.getElementById('docStatus');
    docStatusEl.innerText = L.statusBig + ': ' + translateStatusLabel(currentVersionStatus || 'PENDING');
    docStatusEl.className = 'doc-status status-text ' + statusCss(currentVersionStatus || 'PENDING');
    if (fabricCanvas) {
      fabricCanvas.dispose();
      fabricCanvas = null;
    }
    pdfDoc = null;
    clearViewerUnavailable();
    if (!canViewCurrentVersion()) {
      setViewerUnavailable(L.noPdfViewPermission, L.noPdfViewPermissionHint);
      currentPage = 0;
      totalPages = 0;
      document.getElementById('pageInfo').textContent = L.page + ' 0 / 0';
      document.getElementById('prevPageBtn').disabled = true;
      document.getElementById('nextPageBtn').disabled = true;
      annotationDoc = { pages: {} };
      activeAnnotationId = null;
      annotationDirty = false;
      refreshAnnotationList();
      setLoading('');
      hideError();
      return;
    }
    if (!currentVersionHasViewFile) {
      setViewerUnavailable(L.noViewFile, L.noViewFileHint);
      currentPage = 0;
      totalPages = 0;
      document.getElementById('pageInfo').textContent = L.page + ' 0 / 0';
      document.getElementById('prevPageBtn').disabled = true;
      document.getElementById('nextPageBtn').disabled = true;
      annotationDoc = { pages: {} };
      activeAnnotationId = null;
      annotationDirty = false;
      refreshAnnotationList();
      setLoading('');
      hideError();
      return;
    }
    setLoading(L.loadingPdf);
    const response = await fetch('/api/files/versions/' + versionId + '/view');
    if (destroyed) return;
    if (!response.ok) {
      setLoading('');
      const payload = await response.json().catch(() => ({}));
      if (response.status === 403) {
        setViewerUnavailable(L.noPdfViewPermission, L.noPdfViewPermissionHint);
        hideError();
        refreshAnnotationList();
        return;
      }
      if (payload && payload.error === 'No view file available for this document') {
        setViewerUnavailable(L.noViewFile, L.noViewFileHint);
        hideError();
        refreshAnnotationList();
        return;
      }
      showError(resolveErrorMessage(response.status, payload));
      return;
    }
    hideError();
    activeAnnotationId = null;
    annotationDoc = { pages: {} };
    annotationDirty = false;
    currentPdfBuffer = await response.arrayBuffer();
    if (destroyed) return;
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
    if (destroyed) return;
    const res = await fetch('/api/ui/annotations?fileVersionId=' + versionId);
    const payload = await res.json().catch(() => []);
    if (destroyed) return;
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
    if (destroyed) return;
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
    if (destroyed) return;
    if (fabricCanvas) {
      fabricCanvas.dispose();
    }
    fabricCanvas = new fabric.Canvas('annotationCanvas', { selection: true });
    const canAnnotate = canAnnotateCurrentState();
    fabricCanvas.selection = canAnnotate;
    fabricCanvas.skipTargetFind = !canAnnotate;
    fabricCanvas.isDrawingMode = false;
    fabricCanvas.on('path:created', () => {
      annotationDirty = true;
      refreshAnnotationList();
      queueAutoSave();
    });
    fabricCanvas.on('object:modified', () => {
      annotationDirty = true;
      refreshAnnotationList();
      queueAutoSave();
    });
    fabricCanvas.on('object:added', () => {
      if (suppressAutosave) return;
      annotationDirty = true;
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
        (canAnnotateCurrentState())
        ? '<button type="button" data-idx="' + idx + '" class="remove-annotation-btn">' + escapeHtml(L.remove) + '</button>'
        : '';
      row.innerHTML =
        '<div><strong>#' + (idx + 1) + '</strong> <span class="annotation-meta">' + escapeHtml(type) + '</span></div>' +
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
          annotationDirty = true;
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
    if (destroyed) return false;
    if (!canAnnotateCurrentState()) return false;
    if (!annotationDirty) return false;
    if (!fabricCanvas || !currentVersionId) return false;
    annotationDoc.pages[String(currentPage)] = sanitizeAnnotationObject(fabricCanvas.toJSON());
    annotationDoc = sanitizeAnnotationObject(annotationDoc);
    const endpoint = activeAnnotationId ? '/api/ui/annotations/' + activeAnnotationId : '/api/ui/annotations';
    const method = activeAnnotationId ? 'PATCH' : 'POST';
    const body = activeAnnotationId
      ? { dataJson: annotationDoc }
      : { fileVersionId: currentVersionId, dataJson: annotationDoc };
    const res = await fetch(endpoint, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (destroyed) return false;
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      showError(resolveErrorMessage(res.status, payload));
      if (payload && payload.error === 'Decision already recorded for this file') {
        await fetchSummary();
      }
      return false;
    }
    const payload = await res.json().catch(() => ({}));
    if (payload && payload.id) {
      activeAnnotationId = payload.id;
    }
    annotationDirty = false;
    return true;
  }

  async function submitDecision(decision, reason) {
    if (destroyed) return false;
    if (!currentVersionId) {
      showError(L.noDocumentSelected);
      return false;
    }
    await persistAnnotations();
    const res = await fetch('/api/approvals/decide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        processId: currentProcessId,
        participantId: currentParticipantId,
        decision,
        reason,
        fileVersionId: currentVersionId
      })
    });
    if (destroyed) return false;
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

  const approveBtn = document.getElementById('approveBtn');
  const rejectBtn = document.getElementById('rejectBtn');
  const approveCancelBtn = document.getElementById('approveCancelBtn');
  const rejectCancelBtn = document.getElementById('rejectCancelBtn');
  const approveConfirmBtn = document.getElementById('approveConfirmBtn');
  const rejectConfirmBtn = document.getElementById('rejectConfirmBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const prevPageBtn = document.getElementById('prevPageBtn');
  const nextPageBtn = document.getElementById('nextPageBtn');
  const rejectReasonInput = document.getElementById('rejectReasonInput');

  bindEvent(approveBtn, 'click', async () => {
    openModal('confirmApproveModal');
  });

  bindEvent(rejectBtn, 'click', async () => {
    if (rejectReasonInput) {
      rejectReasonInput.value = '';
    }
    openModal('confirmRejectModal');
  });

  bindEvent(approveCancelBtn, 'click', () => closeModal('confirmApproveModal'));
  bindEvent(rejectCancelBtn, 'click', () => closeModal('confirmRejectModal'));
  bindEvent(approveConfirmBtn, 'click', async () => {
    closeModal('confirmApproveModal');
    await submitDecision('APPROVE');
  });
  bindEvent(rejectConfirmBtn, 'click', async () => {
    const reason = rejectReasonInput ? rejectReasonInput.value : '';
    if (!reason || !reason.trim()) {
      showError(L.rejectReasonRequired);
      return;
    }
    closeModal('confirmRejectModal');
    await submitDecision('REJECT', reason.trim());
  });

  bindEvent(downloadBtn, 'click', async () => {
    if (!currentVersionId) return;
    await downloadFile(currentVersionId);
  });

  bindEvent(prevPageBtn, 'click', async () => {
    if (currentPage <= 1) return;
    currentPage -= 1;
    await renderPage();
  });

  bindEvent(nextPageBtn, 'click', async () => {
    if (currentPage >= totalPages) return;
    currentPage += 1;
    await renderPage();
  });

  document.querySelectorAll('.tools button').forEach(btn => {
    bindEvent(btn, 'click', () => {
      if (!fabricCanvas) return;
      if (!canAnnotateCurrentState()) return;
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

  void fetchSummary();

  return disposeController;
}
