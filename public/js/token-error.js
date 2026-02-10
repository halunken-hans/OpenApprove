const params = new URLSearchParams(window.location.search);
const reason = params.get("reason") || "invalid";
const langParam = params.get("lang") || "en";
const lang = langParam === "de" ? "de" : "en";

const messages = {
  en: {
    invalid: "Invalid or expired token.",
    used: "This token has already been used.",
    expired: "This token has expired.",
    superseded: "This link is no longer valid because a newer file version was uploaded."
  },
  de: {
    invalid: "Ung\u00fcltiges oder abgelaufenes Token.",
    used: "Dieses Token wurde bereits verwendet.",
    expired: "Dieses Token ist abgelaufen.",
    superseded: "Dieser Link ist nicht mehr g\u00fcltig, weil eine neuere Dateiversion hochgeladen wurde."
  }
};

const dictionary = messages[lang] || messages.en;
const text = dictionary[reason] || dictionary.invalid;
document.documentElement.lang = lang;
const target = document.getElementById("errorMessage");
if (target) {
  target.textContent = text;
}
