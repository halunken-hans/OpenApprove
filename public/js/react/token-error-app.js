import { loadUiI18n, normalizeLang } from "./ui-utils.js";

(async () => {
  const params = new URLSearchParams(window.location.search);
  const reason = params.get("reason") || "invalid";
  const lang = normalizeLang(params.get("lang") || "en");

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
