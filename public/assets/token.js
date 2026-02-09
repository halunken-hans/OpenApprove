    const queryParams = new URLSearchParams(window.location.search);
    const TOKEN = queryParams.get('token') || '';
    const rawLang = queryParams.get('lang') || 'en';
    const LANG = rawLang === 'de' ? 'de' : 'en';
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
    let currentRoleAtTime = '';
    const I18N = {
      en: {
        files: 'Files',
        annotations: 'Annotations',
        approvalAndAnnotations: 'Approval, Roles & Annotations',
        approval: 'Approval',
        roles: 'Roles',
        project: 'Project',
        customer: 'Customer',
        status: 'Status',
        fileStatus: 'Status',
        statusDraft: 'DRAFT',
        statusInReview: 'IN REVIEW',
        statusPending: 'PENDING',
        statusApproved: 'APPROVED',
        statusRejected: 'REJECTED',
        decision: 'Decision',
        viewer: 'Viewer',
        uploader: 'Uploader',
        approvers: 'Approvers',
        reviewers: 'Reviewers',
        history: 'History',
        noHistory: 'No history for this file version yet.',
        noRoles: 'No roles configured.',
        pendingApprovals: 'Pending approvers',
        noPendingApprovals: 'No pending approvals for this file.',
        waitingFiles: 'Waiting for approval on file(s):',
        approvalRuleLabel: 'Approval rule',
        ruleAllApproveInfo: 'All approvers must approve.',
        ruleAnyApproveInfo: 'Only one approver may approve this file.',
        allApproved: 'All files are approved.',
        uploadedAt: 'Uploaded',
        statusBig: 'Document status',
        loggedInAs: 'You are logged in as',
        roleLabel: 'Role',
        linkValidUntil: 'Link valid until',
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
        missingToken: 'Missing token in URL.',
        replacedToken: 'This link is no longer valid because a newer file version was uploaded.',
        notFound: 'The process or document no longer exists.',
        superseded: 'This file version was replaced by a newer upload.',
        forbidden: 'You do not have permission for this action.',
        genericError: 'Request failed. Please try again.',
        approved: 'Decision saved: approved.',
        approvedPending: 'Decision saved. Waiting for other required approvals.',
        alreadyDecided: 'You already decided for this file. Waiting for other required approvals.',
        rejected: 'Decision saved: rejected.',
        annotationsSaved: 'Annotations saved.',
        historyUploadPrefix: 'File version',
        historyUploadedBy: 'uploaded by',
        historyAt: 'at',
        historyAnnotationAdded: 'Annotation added by'
      },
      de: {
        files: 'Dateien',
        annotations: 'Anmerkungen',
        approvalAndAnnotations: 'Freigabe, Rollen & Anmerkungen',
        approval: 'Freigabe',
        roles: 'Rollen',
        project: 'Projekt',
        customer: 'Kunde',
        status: 'Status',
        fileStatus: 'Status',
        statusDraft: 'ENTWURF',
        statusInReview: 'IN PRÜFUNG',
        statusPending: 'AUSSTEHEND',
        statusApproved: 'FREIGEGEBEN',
        statusRejected: 'ABGELEHNT',
        decision: 'Entscheidung',
        viewer: 'Ansicht',
        uploader: 'Hochladender',
        approvers: 'Freigebende',
        reviewers: 'Prüfer',
        history: 'Verlauf',
        noHistory: 'Noch kein Verlauf für diese Dateiversion.',
        noRoles: 'Keine Rollen konfiguriert.',
        pendingApprovals: 'Ausstehende Freigebende',
        noPendingApprovals: 'Keine ausstehenden Freigaben für diese Datei.',
        waitingFiles: 'Wartet auf Freigabe für Datei(en):',
        approvalRuleLabel: 'Freigaberegel',
        ruleAllApproveInfo: 'Alle Freigebende müssen freigeben.',
        ruleAnyApproveInfo: 'Nur ein Freigebender muss freigeben.',
        allApproved: 'Alle Dateien sind freigegeben.',
        uploadedAt: 'Hochgeladen',
        statusBig: 'Dokumentstatus',
        loggedInAs: 'Angemeldet als',
        roleLabel: 'Rolle',
        linkValidUntil: 'Link gültig bis',
        roleUnknown: 'UNBEKANNT',
        noDocumentSelected: 'Keine Dokumentversion ausgewählt.',
        approve: 'Freigeben',
        reject: 'Ablehnen',
        rejectPlaceholder: 'Ablehnungsgrund',
        confirmApproveTitle: 'Diese Dokumentversion freigeben?',
        confirmRejectTitle: 'Diese Dokumentversion ablehnen?',
        confirmAction: 'Bestätigen',
        cancelAction: 'Abbrechen',
        confirmRejectAction: 'Ablehnung bestatigen',
        saveAnnotations: 'Anmerkungen speichern',
        loadingSummary: 'Prozess wird geladen...',
        loadingPdf: 'PDF wird geladen...',
        noFiles: 'Es wurden noch keine Dateien hochgeladen.',
        rejectReasonRequired: 'Bitte einen Ablehnungsgrund eingeben.',
        prev: 'Zurück',
        next: 'Weiter',
        page: 'Seite',
        version: 'Version',
        readOnly: 'Dieses Token ist nur lesend für Entscheidungen.',
        pageEmpty: 'Keine Annotationen auf dieser Seite.',
        remove: 'Entfernen',
        download: 'Download',
        pdfLoadFailed: 'PDF-Bibliotheken könnten nicht geladen werden.',
        invalidToken: 'Ungültiges, abgelaufenes oder bereits genutztes Token.',
        missingToken: 'Token in URL fehlt.',
        replacedToken: 'Dieser Link ist nicht mehr gültig, weil eine neuere Dateiversion hochgeladen wurde.',
        notFound: 'Der Prozess oder das Dokument existiert nicht mehr.',
        superseded: 'Diese Dateiversion wurde durch einen neueren Upload ersetzt.',
        forbidden: 'Keine Berechtigung für diese Aktion.',
        genericError: 'Anfrage fehlgeschlagen. Bitte erneut versuchen.',
        approved: 'Entscheidung gespeichert: freigegeben.',
        approvedPending: 'Entscheidung gespeichert. Wartet auf weitere erforderliche Freigaben.',
        alreadyDecided: 'Für diese Datei wurde bereits entschieden. Wartet auf weitere erforderliche Freigaben.',
        rejected: 'Entscheidung gespeichert: abgelehnt.',
        annotationsSaved: 'Anmerkungen gespeichert.',
        historyUploadPrefix: 'Dateiversion',
        historyUploadedBy: 'hochgeladen von',
        historyAt: 'am',
        historyAnnotationAdded: 'Annotation hinzugefügt von'
      }
    };

    const L = I18N[LANG] || I18N.en;
    document.getElementById('filesTitle').innerText = L.files;
    document.getElementById('approvalAnnotationsTitle').innerText = L.approvalAndAnnotations;
    document.getElementById('approvalSubTitle').innerText = L.approval;
    document.getElementById('rolesSubTitle').innerText = L.roles;
    document.getElementById('annotationsSubTitle').innerText = L.annotations;
    document.getElementById('historyTitle').innerText = L.history;
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

    function statusCss(status) {
      return 'status-' + String(status || 'PENDING').toLowerCase();
    }

    function translateStatus(status) {
      const value = String(status || 'PENDING').toUpperCase();
      if (value === 'DRAFT') return L.statusDraft;
      if (value === 'IN_REVIEW') return L.statusInReview;
      if (value === 'PENDING') return L.statusPending;
      if (value === 'APPROVED') return L.statusApproved;
      if (value === 'REJECTED') return L.statusRejected;
      return value;
    }

    function formatDateDdMmYyyy(isoValue) {
      if (!isoValue) return '-';
      const dt = new Date(isoValue);
      if (Number.isNaN(dt.getTime())) return '-';
      return dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
      if (status === 401) return L.invalidToken;
      if (status === 403) return L.forbidden;
      if (status === 404) return L.notFound;
      if (status === 410) return L.superseded;
      if (payload && payload.error === 'Decision already recorded for this file') return L.alreadyDecided;
      if (payload && payload.error) return payload.error;
      return L.genericError;
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
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
        const formatVersionMeta = (entry) => {
          if (entry.versionNumber == null) return '';
          return '<div class="role-entry">' + escapeHtml(L.version + ' ' + String(entry.versionNumber)) + '</div>';
        };
        const formatDecisionLabel = (decision) => {
          if (decision === 'APPROVE') return LANG === 'de' ? 'FREIGABE' : 'APPROVE';
          if (decision === 'REJECT') return LANG === 'de' ? 'ABLEHNUNG' : 'REJECT';
          return String(decision || '');
        };
        const sorted = historyEntries.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        historyHtml += sorted
          .map((entry) => {
            if (entry.kind === 'upload') {
              return (
                '<div class="history-entry">' +
                escapeHtml(L.historyUploadPrefix + ' ' + (entry.versionNumber || '-')) + ' ' +
                escapeHtml(L.historyUploadedBy) + ' ' +
                escapeHtml(entry.by || '-') + ' ' +
                escapeHtml(L.historyAt) + ' ' +
                escapeHtml(formatDateTime(entry.createdAt)) +
                formatVersionMeta(entry) +
                '</div>'
              );
            }
            if (entry.kind === 'annotation') {
              return (
                '<div class="history-entry">' +
                escapeHtml(L.historyAnnotationAdded) + ' ' +
                escapeHtml(resolveActor(entry) || '-') + ' ' +
                escapeHtml(L.historyAt) + ' ' +
                escapeHtml(formatDateTime(entry.createdAt)) +
                formatVersionMeta(entry) +
                '</div>'
              );
            }
            return (
              '<div class="history-entry"><span class="decision-badge ' +
              (entry.decision === 'REJECT' ? 'status-rejected' : 'status-approved') +
              '">' + escapeHtml(formatDecisionLabel(entry.decision)) + '</span>' +
              ' - ' +
              escapeHtml(resolveActor(entry) || '-') +
              (entry.reason ? '<div class="role-entry">' + escapeHtml(entry.reason) + '</div>' : '') +
              formatVersionMeta(entry) +
              '<div class="role-entry">' + escapeHtml(formatDateTime(entry.createdAt)) + '</div>' +
              '</div>'
            );
          })
          .join('');
      }
      history.innerHTML = historyHtml;
      root.appendChild(history);
    }

    function renderPendingApprovals(data) {
      const pendingByVersion = (data && data.pendingApproversByVersion) || {};
      const pending = Array.isArray(pendingByVersion[currentVersionId]) ? pendingByVersion[currentVersionId] : [];
      const panel = document.getElementById('pendingApprovalsPanel');
      if (!panel) return;
      if (!currentVersionId) {
        panel.style.display = 'none';
        panel.innerHTML = '';
        return;
      }
      panel.style.display = 'block';
      const ruleForVersion = data.approvalRuleByVersion && data.approvalRuleByVersion[currentVersionId]
        ? data.approvalRuleByVersion[currentVersionId]
        : data.approvalRule;
      const ruleInfo = ruleForVersion === 'ANY_APPROVE' ? L.ruleAnyApproveInfo : L.ruleAllApproveInfo;
      if (pending.length === 0) {
        panel.innerHTML =
          '<strong>' + escapeHtml(ruleInfo) + '</strong>' +
          '<div class="pending-line">' + escapeHtml(L.pendingApprovals) + ': ' + escapeHtml(L.noPendingApprovals) + '</div>';
        return;
      }
      panel.innerHTML =
        '<strong>' + escapeHtml(ruleInfo) + '</strong>' +
        '<div class="pending-line"><strong>' + escapeHtml(L.pendingApprovals) + '</strong></div>' +
        '<ul>' +
        pending.map((entry) => '<li>' + escapeHtml(entry) + '</li>').join('') +
        '</ul>';
    }

    async function fetchSummary() {
      if (!TOKEN) {
        setLoading('');
        showError(L.missingToken);
        document.getElementById('processSummary').innerHTML = '';
        document.getElementById('fileList').innerHTML = '';
        return;
      }
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
      document.getElementById('actorLine').innerText = L.loggedInAs + ': ' + actorEmail;
      document.getElementById('roleLine').innerText = L.roleLabel + ': ' + actorRole;
      document.getElementById('tokenExpiryBadge').innerText =
        L.linkValidUntil + ' ' + formatDateDdMmYyyy(actor.expiry);
      const waitingFiles = Array.isArray(data.waitingFiles) ? data.waitingFiles : [];
      const waitingText = waitingFiles.length > 0
        ? (L.waitingFiles + ' ' + waitingFiles.map((item) => item.filename).join(', '))
        : L.allApproved;
      document.getElementById('processSummary').innerHTML =
        '<div class="project-number">' + L.project + ' ' + escapeHtml(data.process.projectNumber || '-') + '</div>' +
        '<p>' + L.customer + ': ' + escapeHtml(data.process.customerNumber) + '</p>' +
        '<p>' + L.status + ': <span class="status-pill ' + statusCss(data.process.status) + '">' + escapeHtml(translateStatus(data.process.status)) + '</span></p>' +
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
          const ruleForVersion = data.approvalRuleByVersion && data.approvalRuleByVersion[version.id]
            ? data.approvalRuleByVersion[version.id]
            : data.approvalRule;
          const ruleInfo = ruleForVersion === 'ANY_APPROVE' ? L.ruleAnyApproveInfo : L.ruleAllApproveInfo;
          div.innerHTML =
            '<div class="file-main">' + escapeHtml(file.originalFilename) + '</div>' +
            '<div class="file-sub">' + L.version + ' ' + escapeHtml(version.versionNumber) + '</div>' +
            '<div class="file-sub">' + L.uploadedAt + ': ' + escapeHtml(formatDateTime(version.createdAt)) + '</div>' +
            '<div class="file-sub">' + escapeHtml(ruleInfo) + '</div>' +
            '<div class="file-sub">' + L.fileStatus + ': <span class="status-text ' + statusCss(version.status || 'PENDING') + '">' + escapeHtml(translateStatus(version.status || 'PENDING')) + '</span></div>' +
            '<div class="file-sub">' + L.pendingApprovals + ': ' + escapeHtml(((data.pendingApproversByVersion && data.pendingApproversByVersion[version.id]) || []).join(', ') || '-') + '</div>';
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
      const docStatusEl = document.getElementById('docStatus');
      docStatusEl.innerText = L.statusBig + ': ' + translateStatus(currentVersionStatus || 'PENDING');
      docStatusEl.className = 'doc-status status-text ' + statusCss(currentVersionStatus || 'PENDING');
      renderRoles(data);
      renderHistory(data);
      renderPendingApprovals(data);
      window.__processId = data.process.id;
      window.__participantId = data.participantId;
      currentScopes = Array.isArray(data.scopes) ? data.scopes : [];
      currentRoleAtTime = data.actor && data.actor.roleAtTime ? String(data.actor.roleAtTime) : '';
      const actorDecisions = ((data.roles && data.roles.decisionsByVersion && data.roles.decisionsByVersion[currentVersionId]) || [])
        .filter((entry) => entry && entry.participantId && entry.participantId === window.__participantId);
      const actorAlreadyDecided = actorDecisions.length > 0;
      const isPendingVersion = currentVersionStatus === 'PENDING';
      const canDecide = currentScopes.includes('DECIDE') && isPendingVersion && !actorAlreadyDecided;
      const canAnnotate = currentScopes.includes('ANNOTATE_PDF') && currentRoleAtTime === 'APPROVER' && isPendingVersion;
      document.getElementById('approveBtn').disabled = !canDecide;
      document.getElementById('rejectBtn').disabled = !canDecide;
      document.getElementById('downloadBtn').disabled = !currentVersionId;
      document.querySelectorAll('.tools button').forEach((btn) => {
        btn.style.display = canAnnotate ? 'block' : 'none';
      });
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
      const docStatusEl = document.getElementById('docStatus');
      docStatusEl.innerText = L.statusBig + ': ' + translateStatus(currentVersionStatus || 'PENDING');
      docStatusEl.className = 'doc-status status-text ' + statusCss(currentVersionStatus || 'PENDING');
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
      annotationDirty = false;
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
          (currentScopes.includes('ANNOTATE_PDF') &&
            currentRoleAtTime === 'APPROVER' &&
            currentVersionStatus === 'PENDING')
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
      if (!(currentScopes.includes('ANNOTATE_PDF') && currentRoleAtTime === 'APPROVER' && currentVersionStatus === 'PENDING')) return false;
      if (!annotationDirty) return false;
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
