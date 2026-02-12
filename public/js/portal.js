(async () => {
  const queryParams = new URLSearchParams(window.location.search);
  const token = queryParams.get("token") || "";
  const rawLang = queryParams.get("lang") || "en";
  const lang = rawLang === "de" ? "de" : "en";
  const SECURITY_BANNER_STORAGE_KEY = "oa_security_banner_dismissed_v1";

  async function loadUiI18n(page, selectedLang) {
    try {
      const res = await fetch(
        "/api/ui/i18n?page=" + encodeURIComponent(page) + "&lang=" + encodeURIComponent(selectedLang)
      );
      if (!res.ok) return {};
      const payload = await res.json().catch(() => ({}));
      return payload && typeof payload === "object" ? payload : {};
    } catch (_err) {
      return {};
    }
  }

  const dictionary = await loadUiI18n("portal", lang);
  const L = new Proxy(dictionary, {
    get(target, prop) {
      if (typeof prop !== "string") return undefined;
      const value = target[prop];
      return typeof value === "string" ? value : prop;
    }
  });

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function statusCss(status) {
    return "status-" + String(status || "PENDING").toLowerCase();
  }

  function translateStatus(status) {
    const value = String(status || "PENDING").toUpperCase();
    if (value === "DRAFT") return L.statusDraft;
    if (value === "IN_REVIEW") return L.statusInReview;
    if (value === "PENDING") return L.statusPending;
    if (value === "APPROVED") return L.statusApproved;
    if (value === "REJECTED") return L.statusRejected;
    if (value === "NO_APPROVAL") return L.statusNoApproval;
    return value;
  }

  function translateRole(value) {
    const role = String(value || "").toUpperCase();
    if (role === "APPROVER") return L.roleApprover;
    if (role === "REVIEWER") return L.roleReviewer;
    if (role === "UPLOADER") return L.roleUploader;
    if (role === "VIEWER") return L.roleViewer;
    if (role === "ADMIN") return L.roleAdmin;
    return role || L.roleUnknown;
  }

  function formatDate(isoValue) {
    if (!isoValue) return "-";
    const dt = new Date(isoValue);
    if (Number.isNaN(dt.getTime())) return "-";
    return dt.toLocaleString(lang === "de" ? "de-DE" : "en-US");
  }

  function formatDateDdMmYyyy(isoValue) {
    if (!isoValue) return "-";
    const dt = new Date(isoValue);
    if (Number.isNaN(dt.getTime())) return "-";
    return dt.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function showGlobalError(message) {
    const el = document.getElementById("globalError");
    el.classList.remove("hidden");
    el.textContent = message;
  }

  function hideGlobalError() {
    const el = document.getElementById("globalError");
    el.classList.add("hidden");
    el.textContent = "";
  }

  function withLang(selectedLang) {
    const params = new URLSearchParams(window.location.search);
    params.set("lang", selectedLang);
    return window.location.pathname + "?" + params.toString();
  }

  function initHeaderUi() {
    document.getElementById("title").innerText = L.title;
    document.getElementById("loggedInLabel").innerText = L.loggedInAs + ":";
    document.getElementById("customerLabel").innerText = L.customerIdLabel + ":";
    document.getElementById("expiryLabel").innerText = L.linkValidUntil + ":";
    document.getElementById("actorLine").innerText = "-";
    document.getElementById("customerLine").innerText = "-";
    document.getElementById("tokenExpiryBadge").innerText = "-";
    const securityBannerText = document.getElementById("securityBannerText");
    const securityBannerClose = document.getElementById("securityBannerClose");
    const securityBanner = document.getElementById("securityBanner");
    if (securityBannerText) securityBannerText.innerText = L.securityWarning;
    if (securityBannerClose) {
      securityBannerClose.setAttribute("aria-label", L.closeWarning);
      securityBannerClose.addEventListener("click", () => {
        if (securityBanner) securityBanner.classList.add("hidden");
        try {
          localStorage.setItem(SECURITY_BANNER_STORAGE_KEY, "1");
        } catch (_err) {}
      });
    }
    try {
      if (localStorage.getItem(SECURITY_BANNER_STORAGE_KEY) === "1" && securityBanner) {
        securityBanner.classList.add("hidden");
      }
    } catch (_err) {}
    const brandLogoImage = document.getElementById("brandLogoImage");
    const brandLogoFallback = document.getElementById("brandLogoFallback");
    if (brandLogoImage) {
      const showFallback = () => {
        brandLogoImage.classList.add("hidden");
        if (brandLogoFallback) brandLogoFallback.classList.remove("hidden");
      };
      const showLogo = () => {
        brandLogoImage.classList.remove("hidden");
        if (brandLogoFallback) brandLogoFallback.classList.add("hidden");
      };
      brandLogoImage.addEventListener("error", showFallback);
      brandLogoImage.addEventListener("load", () => {
        if (brandLogoImage.naturalWidth > 0) showLogo();
        else showFallback();
      });
      if (brandLogoImage.complete) {
        if (brandLogoImage.naturalWidth > 0) showLogo();
        else showFallback();
      }
    }
    const langDe = document.getElementById("langDe");
    const langEn = document.getElementById("langEn");
    langDe.href = withLang("de");
    langEn.href = withLang("en");
    if (lang === "de") langDe.classList.add("active");
    if (lang === "en") langEn.classList.add("active");
  }

  async function loadPortalContext() {
    const res = await fetch("/api/portal/context?token=" + encodeURIComponent(token));
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return payload;
  }

  const listConfigs = {
    allProjects: {
      endpoint: "/api/portal/processes",
      titleEl: "titleAllProjects",
      listEl: "listAllProjects",
      projectInputEl: "projectFilterAllProjects",
      statusInputEl: "statusFilterAllProjects",
      applyBtnEl: "applyAllProjects",
      resetBtnEl: "resetAllProjects",
      prevBtnEl: "prevAllProjects",
      nextBtnEl: "nextAllProjects",
      pageEl: "pageAllProjects",
      titleLabel: () => L.allProjectsTitle
    },
    companyUploads: {
      endpoint: "/api/portal/company-uploads",
      titleEl: "titleCompanyUploads",
      listEl: "listCompanyUploads",
      projectInputEl: "projectFilterCompanyUploads",
      statusInputEl: "statusFilterCompanyUploads",
      applyBtnEl: "applyCompanyUploads",
      resetBtnEl: "resetCompanyUploads",
      prevBtnEl: "prevCompanyUploads",
      nextBtnEl: "nextCompanyUploads",
      pageEl: "pageCompanyUploads",
      titleLabel: () => L.allUploadsTitle
    },
    myProjects: {
      endpoint: "/api/portal/my-projects",
      titleEl: "titleMyProjects",
      listEl: "listMyProjects",
      projectInputEl: "projectFilterMyProjects",
      statusInputEl: "statusFilterMyProjects",
      applyBtnEl: "applyMyProjects",
      resetBtnEl: "resetMyProjects",
      prevBtnEl: "prevMyProjects",
      nextBtnEl: "nextMyProjects",
      pageEl: "pageMyProjects",
      titleLabel: () => L.myProjectsTitle
    },
    myUploads: {
      endpoint: "/api/portal/my-uploads",
      titleEl: "titleMyUploads",
      listEl: "listMyUploads",
      projectInputEl: "projectFilterMyUploads",
      statusInputEl: "statusFilterMyUploads",
      applyBtnEl: "applyMyUploads",
      resetBtnEl: "resetMyUploads",
      prevBtnEl: "prevMyUploads",
      nextBtnEl: "nextMyUploads",
      pageEl: "pageMyUploads",
      titleLabel: () => L.myUploadsTitle
    }
  };

  const listState = {};
  Object.keys(listConfigs).forEach((key) => {
    listState[key] = {
      page: 1,
      pages: 1,
      projectNumber: "",
      status: ""
    };
  });

  function statusOptionsHtml() {
    return (
      '<option value="">' + escapeHtml(L.filterAllStatuses) + "</option>" +
      '<option value="DRAFT">' + escapeHtml(L.statusDraft) + "</option>" +
      '<option value="IN_REVIEW">' + escapeHtml(L.statusInReview) + "</option>" +
      '<option value="APPROVED">' + escapeHtml(L.statusApproved) + "</option>" +
      '<option value="REJECTED">' + escapeHtml(L.statusRejected) + "</option>"
    );
  }

  function renderListHeader() {
    document.getElementById("groupCompanyTitle").innerText = L.groupCompany;
    document.getElementById("groupWorkTitle").innerText = L.groupWork;
    Object.entries(listConfigs).forEach(([key, cfg]) => {
      document.getElementById(cfg.titleEl).innerText = cfg.titleLabel();
      const projectInput = document.getElementById(cfg.projectInputEl);
      projectInput.placeholder = L.filterProjectPlaceholder;
      const statusInput = document.getElementById(cfg.statusInputEl);
      statusInput.innerHTML = statusOptionsHtml();
      document.getElementById(cfg.applyBtnEl).innerText = L.applyFilters;
      document.getElementById(cfg.resetBtnEl).innerText = L.resetFilters;
      document.getElementById(cfg.prevBtnEl).innerText = L.prevPage;
      document.getElementById(cfg.nextBtnEl).innerText = L.nextPage;
      document.getElementById(cfg.pageEl).innerText = L.pageLabel + " 1 / 1";

      document.getElementById(cfg.applyBtnEl).addEventListener("click", () => {
        listState[key].projectNumber = projectInput.value.trim();
        listState[key].status = statusInput.value;
        listState[key].page = 1;
        loadList(key);
      });

      document.getElementById(cfg.resetBtnEl).addEventListener("click", () => {
        projectInput.value = "";
        statusInput.value = "";
        listState[key].projectNumber = "";
        listState[key].status = "";
        listState[key].page = 1;
        loadList(key);
      });

      document.getElementById(cfg.prevBtnEl).addEventListener("click", () => {
        if (listState[key].page <= 1) return;
        listState[key].page -= 1;
        loadList(key);
      });

      document.getElementById(cfg.nextBtnEl).addEventListener("click", () => {
        if (listState[key].page >= listState[key].pages) return;
        listState[key].page += 1;
        loadList(key);
      });
    });
  }

  function renderNoResults(listElId, message) {
    const listEl = document.getElementById(listElId);
    listEl.innerHTML = '<div class="empty-state">' + escapeHtml(message) + "</div>";
  }

  function renderRows(listElId, rows) {
    const listEl = document.getElementById(listElId);
    listEl.innerHTML = "";
    rows.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "project-item";
      btn.innerHTML =
        '<div class="project-head">' +
        '<span class="project-name">' + escapeHtml(L.project + " " + (item.projectNumber || "-")) + "</span>" +
        '<span class="status-pill ' + statusCss(item.status) + '">' + escapeHtml(translateStatus(item.status)) + "</span>" +
        "</div>" +
        '<div class="project-meta">' +
        "<div>" + escapeHtml(L.customerLabel + ": " + (item.customerNumber || "-")) + "</div>" +
        "<div>" + escapeHtml(L.createdAt + ": " + formatDate(item.createdAt)) + "</div>" +
        "</div>";
      btn.addEventListener("click", () => {
        const params = new URLSearchParams();
        params.set("token", token);
        params.set("processId", item.id);
        params.set("lang", lang);
        window.location.href = "/token.html?" + params.toString();
      });
      listEl.appendChild(btn);
    });
  }

  async function loadList(key) {
    const cfg = listConfigs[key];
    const state = listState[key];
    const listEl = document.getElementById(cfg.listEl);
    listEl.innerHTML = '<div class="empty-state">' + escapeHtml(L.loadingList) + "</div>";
    const params = new URLSearchParams();
    params.set("token", token);
    params.set("limit", "50");
    params.set("page", String(state.page));
    if (state.projectNumber) params.set("projectNumber", state.projectNumber);
    if (state.status) params.set("status", state.status);
    const res = await fetch(cfg.endpoint + "?" + params.toString());
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 401) {
        showGlobalError(L.invalidToken);
        renderNoResults(cfg.listEl, L.noResults);
      } else if (res.status === 403 || res.status === 404) {
        renderNoResults(cfg.listEl, L.noResults);
      } else {
        renderNoResults(cfg.listEl, L.requestFailed);
      }
      document.getElementById(cfg.pageEl).innerText = L.pageLabel + " 1 / 1";
      document.getElementById(cfg.prevBtnEl).disabled = true;
      document.getElementById(cfg.nextBtnEl).disabled = true;
      return;
    }

    const rows = Array.isArray(payload.data) ? payload.data : [];
    const page = Number(payload.page || 1);
    const pages = Number(payload.pages || 1);
    state.page = page;
    state.pages = pages;
    if (rows.length === 0) renderNoResults(cfg.listEl, L.noResults);
    else renderRows(cfg.listEl, rows);
    document.getElementById(cfg.pageEl).innerText = L.pageLabel + " " + page + " / " + pages;
    document.getElementById(cfg.prevBtnEl).disabled = page <= 1;
    document.getElementById(cfg.nextBtnEl).disabled = page >= pages;
  }

  initHeaderUi();
  renderListHeader();

  if (!token) {
    showGlobalError(L.missingToken);
    Object.keys(listConfigs).forEach((key) => {
      renderNoResults(listConfigs[key].listEl, L.noResults);
    });
    return;
  }

  hideGlobalError();
  const context = await loadPortalContext();
  if (!context) {
    showGlobalError(L.invalidToken);
    Object.keys(listConfigs).forEach((key) => {
      renderNoResults(listConfigs[key].listEl, L.noResults);
    });
    return;
  }

  const actorEmail = context.actorEmail || "-";
  const customerNumber = context.customerNumber || "-";
  document.getElementById("actorLine").innerText = actorEmail;
  document.getElementById("customerLine").innerText = customerNumber;
  document.getElementById("groupCompanyTitle").innerText = L.groupCompany + " (" + customerNumber + ")";
  document.getElementById("groupWorkTitle").innerText = L.groupWork;
  document.getElementById("tokenExpiryBadge").innerText = formatDateDdMmYyyy(context.expiry);

  await Promise.all(Object.keys(listConfigs).map((key) => loadList(key)));
})();
