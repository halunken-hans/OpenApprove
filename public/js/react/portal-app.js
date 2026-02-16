import { h, SharedHeader } from "./shared.js";
import {
  createLangHref,
  formatDateDdMmYyyy,
  loadUiI18n,
  normalizeLang,
  statusCss,
  translateStatus
} from "./ui-utils.js";

const ReactApi = window.React;
const ReactDOMApi = window.ReactDOM;

if (!ReactApi || !ReactDOMApi) {
  throw new Error("React and ReactDOM are required but not loaded.");
}

const { useCallback, useEffect, useMemo, useRef, useState } = ReactApi;

const PAGE_SIZE = 50;

const LIST_CONFIGS = {
  allProjects: {
    key: "allProjects",
    endpoint: "/api/portal/processes",
    titleKey: "allProjectsTitle"
  },
  companyUploads: {
    key: "companyUploads",
    endpoint: "/api/portal/company-uploads",
    titleKey: "allUploadsTitle"
  },
  myProjects: {
    key: "myProjects",
    endpoint: "/api/portal/my-projects",
    titleKey: "myProjectsTitle"
  },
  myUploads: {
    key: "myUploads",
    endpoint: "/api/portal/my-uploads",
    titleKey: "myUploadsTitle"
  }
};

function createInitialListState() {
  return {
    page: 1,
    pages: 1,
    projectNumber: "",
    status: "",
    rows: [],
    loading: false
  };
}

function createAllInitialListState() {
  return {
    allProjects: createInitialListState(),
    companyUploads: createInitialListState(),
    myProjects: createInitialListState(),
    myUploads: createInitialListState()
  };
}

async function loadPortalContext() {
  const res = await fetch("/api/portal/context");
  const payload = await res.json().catch(() => ({}));
  return {
    ok: res.ok,
    status: res.status,
    payload
  };
}

function readTokenAndLang() {
  const params = new URLSearchParams(window.location.search);
  return {
    lang: normalizeLang(params.get("lang") || "en")
  };
}

function formatDateTime(isoValue, lang) {
  if (!isoValue) return "-";
  const dt = new Date(isoValue);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString(lang === "de" ? "de-DE" : "en-US");
}

function buildProjectUrl(lang, processId) {
  const params = new URLSearchParams();
  params.set("processId", processId);
  params.set("lang", lang);
  params.set("view", "project");
  return "/app.html?" + params.toString();
}

function ListCard({
  listKey,
  config,
  listState,
  filterState,
  t,
  lang,
  onFilterInputChange,
  onApply,
  onReset,
  onPrevPage,
  onNextPage
}) {
  const statusOptions = [
    { value: "", label: t("filterAllStatuses") },
    { value: "DRAFT", label: t("statusDraft") },
    { value: "IN_REVIEW", label: t("statusInReview") },
    { value: "PENDING", label: t("statusPending") },
    { value: "APPROVED", label: t("statusApproved") },
    { value: "REJECTED", label: t("statusRejected") }
  ];

  const rows = Array.isArray(listState.rows) ? listState.rows : [];

  return h("section", { className: "list-card" }, [
    h("h3", { key: "title", className: "list-title" }, t(config.titleKey)),
    h("div", { key: "filters", className: "filters" }, [
      h("input", {
        key: "project",
        type: "text",
        value: filterState.projectNumber,
        placeholder: t("filterProjectPlaceholder"),
        onChange: (event) => onFilterInputChange(listKey, "projectNumber", event.target.value)
      }),
      h(
        "select",
        {
          key: "status",
          value: filterState.status,
          onChange: (event) => onFilterInputChange(listKey, "status", event.target.value)
        },
        statusOptions.map((option) => h(
          "option",
          { key: option.value || "all", value: option.value },
          option.label
        ))
      ),
      h("div", { key: "actions", className: "filter-actions" }, [
        h(
          "button",
          {
            key: "apply",
            type: "button",
            onClick: () => onApply(listKey)
          },
          t("applyFilters")
        ),
        h(
          "button",
          {
            key: "reset",
            type: "button",
            className: "ghost",
            onClick: () => onReset(listKey)
          },
          t("resetFilters")
        )
      ])
    ]),
    h("div", { key: "body", className: "list-body" }, [
      listState.loading
        ? h("div", { key: "loading", className: "empty-state" }, t("loadingList"))
        : (rows.length === 0
          ? h("div", { key: "empty", className: "empty-state" }, t("noResults"))
          : rows.map((item) => h(
            "button",
            {
              key: item.id,
              type: "button",
              className: "project-item",
              onClick: () => {
                window.location.href = buildProjectUrl(lang, item.id);
              }
            },
            [
              h("div", { key: "head", className: "project-head" }, [
                h("span", { key: "name", className: "project-name" }, t("project") + " " + (item.projectNumber || "-")),
                h(
                  "span",
                  { key: "status", className: "status-pill " + statusCss(item.status) },
                  translateStatus(item.status, t)
                )
              ]),
              h("div", { key: "meta", className: "project-meta" }, [
                h("div", { key: "customer" }, t("customerLabel") + ": " + (item.customerNumber || "-")),
                h("div", { key: "created" }, t("createdAt") + ": " + formatDateTime(item.createdAt, lang))
              ])
            ]
          )))
    ]),
    h("div", { key: "pagination", className: "pagination" }, [
      h(
        "button",
        {
          key: "prev",
          type: "button",
          className: "ghost",
          disabled: listState.page <= 1,
          onClick: () => onPrevPage(listKey)
        },
        t("prevPage")
      ),
      h(
        "span",
        { key: "page" },
        t("pageLabel") + " " + String(listState.page) + " / " + String(listState.pages)
      ),
      h(
        "button",
        {
          key: "next",
          type: "button",
          className: "ghost",
          disabled: listState.page >= listState.pages,
          onClick: () => onNextPage(listKey)
        },
        t("nextPage")
      )
    ])
  ]);
}

function PortalPage() {
  const { lang } = useMemo(() => readTokenAndLang(), []);
  const [dictionary, setDictionary] = useState({});
  const [globalError, setGlobalError] = useState("");
  const [context, setContext] = useState(null);
  const [lists, setLists] = useState(createAllInitialListState);
  const [filters, setFilters] = useState({
    allProjects: { projectNumber: "", status: "" },
    companyUploads: { projectNumber: "", status: "" },
    myProjects: { projectNumber: "", status: "" },
    myUploads: { projectNumber: "", status: "" }
  });
  const listsRef = useRef(lists);
  useEffect(() => {
    listsRef.current = lists;
  }, [lists]);
  const dictionaryRef = useRef(dictionary);
  useEffect(() => {
    dictionaryRef.current = dictionary;
  }, [dictionary]);

  const t = useCallback((key) => {
    const value = dictionary[key];
    return typeof value === "string" ? value : key;
  }, [dictionary]);

  const updateListState = useCallback((listKey, patch) => {
    setLists((prev) => ({
      ...prev,
      [listKey]: {
        ...prev[listKey],
        ...patch
      }
    }));
  }, []);

  const loadList = useCallback(async (listKey, stateOverride) => {
    const config = LIST_CONFIGS[listKey];
    if (!config) return;

    const currentState = stateOverride || listsRef.current[listKey];
    updateListState(listKey, { loading: true });

    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("page", String(currentState.page));
    if (currentState.projectNumber) params.set("projectNumber", currentState.projectNumber);
    if (currentState.status) params.set("status", currentState.status);

    const res = await fetch(config.endpoint + "?" + params.toString());
    const payload = await res.json().catch(() => ({}));
    const lookupText = (key) => {
      const value = dictionaryRef.current?.[key];
      return typeof value === "string" ? value : key;
    };

    if (!res.ok) {
      if (res.status === 401) {
        setGlobalError(lookupText("invalidToken"));
      }

      updateListState(listKey, {
        loading: false,
        rows: [],
        page: 1,
        pages: 1
      });
      return;
    }

    const rows = Array.isArray(payload.data) ? payload.data : [];
    const page = Number(payload.page || 1);
    const pages = Number(payload.pages || 1);

    updateListState(listKey, {
      loading: false,
      rows,
      page,
      pages
    });
  }, [updateListState]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const loadedDictionary = await loadUiI18n("portal", lang);
      if (cancelled) return;
      setDictionary(loadedDictionary);

      const loadedContext = await loadPortalContext();
      if (cancelled) return;
      if (!loadedContext.ok) {
        if (loadedContext.status === 401) {
          setGlobalError(typeof loadedDictionary.invalidToken === "string" ? loadedDictionary.invalidToken : "invalidToken");
        } else if (loadedContext.status === 403) {
          setGlobalError(typeof loadedDictionary.deniedPortal === "string" ? loadedDictionary.deniedPortal : "deniedPortal");
        } else if (loadedContext.status === 404) {
          setGlobalError(typeof loadedDictionary.missingResource === "string" ? loadedDictionary.missingResource : "missingResource");
        } else {
          setGlobalError(typeof loadedDictionary.requestFailed === "string" ? loadedDictionary.requestFailed : "requestFailed");
        }
        return;
      }

      setContext(loadedContext.payload);
      setGlobalError("");
      await Promise.all(Object.keys(LIST_CONFIGS).map((key) => loadList(key)));
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [lang, loadList]);

  const onFilterInputChange = useCallback((listKey, field, value) => {
    setFilters((prev) => ({
      ...prev,
      [listKey]: {
        ...prev[listKey],
        [field]: value
      }
    }));
  }, []);

  const onApply = useCallback((listKey) => {
    const currentFilter = filters[listKey];
    const nextState = {
      ...listsRef.current[listKey],
      page: 1,
      projectNumber: (currentFilter.projectNumber || "").trim(),
      status: currentFilter.status || ""
    };
    updateListState(listKey, nextState);
    void loadList(listKey, nextState);
  }, [filters, loadList, updateListState]);

  const onReset = useCallback((listKey) => {
    const resetFilter = { projectNumber: "", status: "" };
    setFilters((prev) => ({ ...prev, [listKey]: resetFilter }));
    const nextState = {
      ...listsRef.current[listKey],
      page: 1,
      projectNumber: "",
      status: ""
    };
    updateListState(listKey, nextState);
    void loadList(listKey, nextState);
  }, [loadList, updateListState]);

  const onPrevPage = useCallback((listKey) => {
    const current = listsRef.current[listKey];
    if (current.page <= 1) return;
    const nextState = { ...current, page: current.page - 1 };
    updateListState(listKey, nextState);
    void loadList(listKey, nextState);
  }, [loadList, updateListState]);

  const onNextPage = useCallback((listKey) => {
    const current = listsRef.current[listKey];
    if (current.page >= current.pages) return;
    const nextState = { ...current, page: current.page + 1 };
    updateListState(listKey, nextState);
    void loadList(listKey, nextState);
  }, [loadList, updateListState]);

  const langDeHref = createLangHref("de");
  const langEnHref = createLangHref("en");

  return h(ReactApi.Fragment, null, [
    h(SharedHeader, {
      key: "header",
      title: t("title"),
      lang,
      langDeHref,
      langEnHref,
      loggedInLabel: t("loggedInAs") + ":",
      loggedInValue: context?.actorEmail || "-",
      customerLabel: t("customerIdLabel") + ":",
      customerValue: context?.customerNumber || "-",
      expiryLabel: t("linkValidUntil") + ":",
      expiryValue: formatDateDdMmYyyy(context?.expiry)
    }),
    h("main", { key: "main" }, [
      h(
        "div",
        {
          key: "globalError",
          className: "global-error" + (globalError ? "" : " hidden")
        },
        globalError
      ),
      h("div", { key: "groups", className: "portal-groups" }, [
        h("section", { key: "groupCompany", className: "group-card" }, [
          h(
            "h2",
            { key: "title", className: "group-title" },
            t("groupCompany") + (context?.customerNumber ? " (" + context.customerNumber + ")" : "")
          ),
          h("div", { key: "lists", className: "group-lists" }, [
            h(ListCard, {
              key: "allProjects",
              listKey: "allProjects",
              config: LIST_CONFIGS.allProjects,
              listState: lists.allProjects,
              filterState: filters.allProjects,
              t,
              lang,
              onFilterInputChange,
              onApply,
              onReset,
              onPrevPage,
              onNextPage
            }),
            h(ListCard, {
              key: "companyUploads",
              listKey: "companyUploads",
              config: LIST_CONFIGS.companyUploads,
              listState: lists.companyUploads,
              filterState: filters.companyUploads,
              t,
              lang,
              onFilterInputChange,
              onApply,
              onReset,
              onPrevPage,
              onNextPage
            })
          ])
        ]),
        h("section", { key: "groupWork", className: "group-card" }, [
          h("h2", { key: "title", className: "group-title" }, t("groupWork")),
          h("div", { key: "lists", className: "group-lists" }, [
            h(ListCard, {
              key: "myProjects",
              listKey: "myProjects",
              config: LIST_CONFIGS.myProjects,
              listState: lists.myProjects,
              filterState: filters.myProjects,
              t,
              lang,
              onFilterInputChange,
              onApply,
              onReset,
              onPrevPage,
              onNextPage
            }),
            h(ListCard, {
              key: "myUploads",
              listKey: "myUploads",
              config: LIST_CONFIGS.myUploads,
              listState: lists.myUploads,
              filterState: filters.myUploads,
              t,
              lang,
              onFilterInputChange,
              onApply,
              onReset,
              onPrevPage,
              onNextPage
            })
          ])
        ])
      ])
    ])
  ]);
}

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Missing #app root element for portal page.");
}

ReactDOMApi.createRoot(rootElement).render(h(PortalPage));
