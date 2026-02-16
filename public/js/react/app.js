const queryParams = new URLSearchParams(window.location.search);

async function exchangeTokenFromUrlIfPresent() {
  const token = queryParams.get("token");
  if (!token) return false;
  const view = (queryParams.get("view") || "").toLowerCase();
  const lang = (queryParams.get("lang") || "en").toLowerCase();
  const processId = queryParams.get("processId") || "";
  const res = await fetch("/api/session/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      lang,
      view: view === "portal" ? "portal" : "project",
      processId: processId || undefined
    })
  });
  const payload = await res.json().catch(() => ({}));
  if (res.ok && payload && typeof payload.redirect === "string") {
    window.location.replace(payload.redirect);
    return true;
  }
  const reason = payload && typeof payload.reason === "string" ? payload.reason : "invalid";
  const params = new URLSearchParams();
  params.set("reason", reason);
  params.set("lang", lang === "de" ? "de" : "en");
  window.location.replace("/token-error.html?" + params.toString());
  return true;
}

function resolveMode() {
  const explicit = (queryParams.get("view") || "").toLowerCase();
  if (explicit === "portal") return "portal";
  if (explicit === "project") return "project";
  if (explicit === "token") return "token";
  if (window.location.pathname === "/portal") return "portal";
  return "project";
}

function applyStylesheet(mode) {
  const stylesheet = document.getElementById("pageStylesheet");
  if (!stylesheet) return;
  stylesheet.href = mode === "portal" ? "/css/portal.css" : "/css/project.css";
}

const exchanged = await exchangeTokenFromUrlIfPresent();
if (!exchanged) {
  const mode = resolveMode();
  applyStylesheet(mode);

  if (mode === "portal") {
    await import("./portal-app.js");
  } else {
    await import("./project-app.js");
  }
}
