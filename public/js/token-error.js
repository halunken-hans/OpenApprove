(async () => {
  const params = new URLSearchParams(window.location.search);
  const reason = params.get("reason") || "invalid";
  const langParam = params.get("lang") || "en";
  const lang = langParam === "de" ? "de" : "en";

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

  const dictionary = await loadUiI18n("tokenError", lang);
  const fallback = {
    invalid: "Invalid or expired token."
  };
  const text = dictionary[reason] || dictionary.invalid || fallback.invalid;

  document.documentElement.lang = lang;
  const target = document.getElementById("errorMessage");
  if (target) {
    target.textContent = text;
  }
})();
