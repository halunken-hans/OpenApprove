const ReactApi = window.React;

if (!ReactApi) {
  throw new Error("React is required but not loaded.");
}

export const h = ReactApi.createElement;
const { useState } = ReactApi;

export function SharedHeader({
  title = "OpenApprove",
  lang = "en",
  langDeHref = "#",
  langEnHref = "#",
  loggedInLabel = "",
  loggedInValue = "-",
  customerLabel = "",
  customerValue = "-",
  expiryLabel = "",
  expiryValue = "-",
  logoSrc = "/img/logo_openapprove.svg",
  logoAlt = "OpenApprove logo"
} = {}) {
  const [logoVisible, setLogoVisible] = useState(false);

  const imageClass = "brand-logo-image" + (logoVisible ? "" : " hidden");
  const fallbackClass = "brand-logo-fallback" + (logoVisible ? " hidden" : "");
  const langDeClass = "lang-btn" + (lang === "de" ? " active" : "");
  const langEnClass = "lang-btn" + (lang === "en" ? " active" : "");

  return h("header", { className: "oa-header" }, [
    h("div", { key: "brand", className: "brand-head" }, [
      h("div", { key: "logoSlot", className: "brand-logo-slot", "aria-hidden": "true" }, [
        h("img", {
          key: "logo",
          id: "brandLogoImage",
          className: imageClass,
          src: logoSrc,
          alt: logoAlt,
          onError: () => setLogoVisible(false),
          onLoad: () => setLogoVisible(true)
        }),
        h("span", { key: "fallback", id: "brandLogoFallback", className: fallbackClass }, "Logo")
      ]),
      h("h1", { key: "title", id: "title", className: "brand-title" }, title)
    ]),
    h("div", { key: "panel", className: "lang-panel" }, [
      h("div", { key: "switch", className: "lang-switch" }, [
        h("a", { key: "de", id: "langDe", className: langDeClass, href: langDeHref }, "DE"),
        h("a", { key: "en", id: "langEn", className: langEnClass, href: langEnHref }, "EN")
      ]),
      h("div", { key: "meta", className: "meta-grid" }, [
        h("div", { key: "row1", className: "meta-row" }, [
          h("span", { key: "label1", id: "loggedInLabel", className: "meta-label" }, loggedInLabel),
          h("span", { key: "value1", id: "actorLine", className: "meta-value" }, loggedInValue)
        ]),
        h("div", { key: "row2", className: "meta-row" }, [
          h("span", { key: "label2", id: "customerLabel", className: "meta-label" }, customerLabel),
          h("span", { key: "value2", id: "customerLine", className: "meta-value" }, customerValue)
        ]),
        h("div", { key: "row3", className: "meta-row" }, [
          h("span", { key: "label3", id: "expiryLabel", className: "meta-label" }, expiryLabel),
          h("span", { key: "value3", id: "tokenExpiryBadge", className: "meta-value" }, expiryValue)
        ])
      ])
    ])
  ]);
}
