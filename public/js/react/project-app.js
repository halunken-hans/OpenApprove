import { h, SharedHeader } from "./shared.js";
import { initProjectPage } from "./project-controller.js";
import { createLangHref, getLangFromCurrentUrl } from "./ui-utils.js";

const ReactApi = window.React;
const ReactDOMApi = window.ReactDOM;

if (!ReactApi || !ReactDOMApi) {
  throw new Error("React and ReactDOM are required but not loaded.");
}
const { useEffect } = ReactApi;

const initialLang = getLangFromCurrentUrl();

const projectMainHtml = `
  <div class="card error-card hidden" id="errorCard"></div>
  <div class="card hidden" id="loadingCard"></div>
  <div class="portal-link-row">
    <a id="portalLink" class="portal-link" href="#"></a>
  </div>
  <div class="summary-grid">
    <div class="card" id="processSummary"></div>
    <div class="card" id="projectRolesCard">
      <h2 id="projectRolesTitle" class="pane-title">Roles</h2>
      <div id="projectRolesList" class="role-list"></div>
    </div>
  </div>
  <div class="workspace">
    <div class="card">
      <h2 id="filesTitle" class="pane-title">Files</h2>
      <div id="fileList" class="file-list"></div>
    </div>
    <div class="card hidden" id="viewerCard">
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
          <div id="viewerUnavailable" class="viewer-unavailable hidden"></div>
        </div>
      </div>
    </div>
    <div class="card">
      <h2 id="annotationsTitle" class="pane-title">Annotations</h2>
      <div class="tools">
        <button data-tool="highlight">Highlight</button>
        <button data-tool="freehand">Freehand</button>
        <button data-tool="text">Text</button>
        <button data-tool="rect">Rectangle</button>
      </div>
      <div id="annotationsList" class="annotation-list"></div>
    </div>
    <div class="card">
      <h2 id="approvalTitle" class="pane-title">Approval</h2>
      <div class="action-block action-block-top">
        <div class="action-row">
          <button id="approveBtn">Approve</button>
          <button id="rejectBtn">Reject</button>
          <button id="downloadBtn">Download</button>
        </div>
      </div>
      <div id="approverList" class="role-list"></div>
    </div>
    <div class="card history-drawer" id="historyDrawer">
      <button type="button" class="history-drawer-handle" id="historyDrawerHandle" aria-label="Toggle history panel">
        <span id="historyDrawerLabel" class="history-drawer-label">History</span>
      </button>
      <div class="history-drawer-content">
        <h2 id="historyTitle" class="pane-title">History</h2>
        <div id="historyList" class="role-list history-list"></div>
      </div>
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
`;

function ProjectPage() {
  useEffect(() => {
    let destroyed = false;
    let disposeProjectController = null;

    async function boot() {
      try {
        await ensureProjectLibraries();
        if (destroyed) return;
        const cleanup = await initProjectPage();
        if (destroyed) {
          if (typeof cleanup === "function") cleanup();
          return;
        }
        disposeProjectController = typeof cleanup === "function" ? cleanup : null;
      } catch (err) {
        console.error(err);
      }
    }

    boot();

    return () => {
      destroyed = true;
      if (disposeProjectController) {
        disposeProjectController();
      }
    };
  }, []);

  return h(ReactApi.Fragment, null, [
    h(SharedHeader, {
      key: "header",
      title: "OpenApprove",
      lang: initialLang,
      langDeHref: createLangHref("de"),
      langEnHref: createLangHref("en"),
      loggedInValue: "-",
      customerValue: "-",
      expiryValue: "-"
    }),
    h("main", {
      key: "main",
      dangerouslySetInnerHTML: { __html: projectMainHtml }
    })
  ]);
}

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Missing #app root element for token page.");
}

ReactDOMApi.createRoot(rootElement).render(h(ProjectPage));

function loadLegacyScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load script: " + src));
    document.body.appendChild(script);
  });
}

async function ensureProjectLibraries() {
  if (typeof window.pdfjsLib === "undefined") {
    await loadLegacyScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
  }
  if (typeof window.fabric === "undefined") {
    await loadLegacyScript("https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.0/fabric.min.js");
  }
}
