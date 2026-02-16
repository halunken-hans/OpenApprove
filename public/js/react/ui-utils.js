export function normalizeLang(rawLang) {
  return rawLang === "de" ? "de" : "en";
}

export function createLangHref(selectedLang, pathname = window.location.pathname, search = window.location.search) {
  const params = new URLSearchParams(search);
  params.set("lang", normalizeLang(selectedLang));
  const query = params.toString();
  return pathname + (query ? "?" + query : "");
}

export function getLangFromCurrentUrl() {
  const params = new URLSearchParams(window.location.search);
  return normalizeLang(params.get("lang") || "en");
}

export async function loadUiI18n(page, lang) {
  try {
    const res = await fetch("/api/ui/i18n?page=" + encodeURIComponent(page) + "&lang=" + encodeURIComponent(lang));
    if (!res.ok) return {};
    const payload = await res.json().catch(() => ({}));
    return payload && typeof payload === "object" ? payload : {};
  } catch (_err) {
    return {};
  }
}

export function statusCss(status) {
  return "status-" + String(status || "PENDING").toLowerCase();
}

export function translateStatus(status, t) {
  const value = String(status || "PENDING").toUpperCase();
  if (value === "DRAFT") return t("statusDraft");
  if (value === "IN_REVIEW") return t("statusInReview");
  if (value === "PENDING") return t("statusPending");
  if (value === "APPROVED") return t("statusApproved");
  if (value === "REJECTED") return t("statusRejected");
  if (value === "NO_APPROVAL") return t("statusNoApproval");
  return value;
}

export function formatDateDdMmYyyy(isoValue) {
  if (!isoValue) return "-";
  const dt = new Date(isoValue);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
