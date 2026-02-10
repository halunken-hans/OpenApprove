(async () => {
  const queryParams = new URLSearchParams(window.location.search);
  const token = queryParams.get("token") || "";
  const rawLang = queryParams.get("lang") || "en";
  const lang = rawLang === "de" ? "de" : "en";

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

  document.getElementById("title").innerText = L.title;
  document.getElementById("subtitle").innerText = L.subtitle;
  document.getElementById("listCustomer").innerText = L.customer;
  document.getElementById("listMyUploads").innerText = L.my;
  document.getElementById("listCompanyUploads").innerText = L.company;

  function showError(message) {
    const el = document.getElementById("error");
    el.style.display = "block";
    el.textContent = message;
  }

  function setStatus(message) {
    const el = document.getElementById("status");
    if (!message) {
      el.style.display = "none";
      el.textContent = "";
      return;
    }
    el.style.display = "block";
    el.textContent = message;
  }

  async function load(path) {
    if (!token) {
      setStatus("");
      showError(L.missingToken);
      return;
    }

    setStatus(L.loading);
    const res = await fetch(path + "?token=" + encodeURIComponent(token));
    const data = await res.json().catch(() => ({}));
    const err = document.getElementById("error");
    err.style.display = "none";
    const el = document.getElementById("results");
    el.innerHTML = "";

    if (!res.ok) {
      setStatus("");
      if (res.status === 401) return showError(L.invalidToken);
      if (res.status === 403) return showError(L.deniedPortal);
      if (res.status === 404) return showError(L.missingResource);
      return showError(data.error || L.requestFailed);
    }

    const rows = Array.isArray(data.data) ? data.data : [];
    if (rows.length === 0) {
      setStatus(L.noEntries);
      return;
    }

    setStatus("");
    const card = document.createElement("div");
    card.className = "card";
    rows.forEach((item) => {
      const row = document.createElement("div");
      row.className = "row";
      const createdAt = item && item.createdAt ? new Date(item.createdAt).toLocaleString() : "-";
      row.innerHTML =
        "<div><strong>" +
        L.project +
        " " +
        (item.projectNumber || "-") +
        "</strong><div>" +
        L.customerLabel +
        ": " +
        (item.customerNumber || "-") +
        "</div></div>" +
        "<div><div class=\"pill\">" +
        (item.status || "-") +
        "</div><div>" +
        createdAt +
        "</div></div>";
      card.appendChild(row);
    });
    el.appendChild(card);
  }

  document.getElementById("listCustomer").addEventListener("click", () => load("/api/portal/processes"));
  document.getElementById("listMyUploads").addEventListener("click", () => load("/api/portal/my-uploads"));
  document.getElementById("listCompanyUploads").addEventListener("click", () => load("/api/portal/company-uploads"));

  if (!token) {
    showError(L.missingToken);
  }
})();
