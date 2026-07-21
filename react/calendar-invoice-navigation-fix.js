(() => {
  const STORAGE_KEY = "salesNoteAppDataV1";
  const clean = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
  const cssEscape = (value) => window.CSS?.escape ? CSS.escape(value) : String(value).replace(/['"\\]/g, "\\$&");

  const setNativeValue = (element, value) => {
    if (!element) return;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const clickButtonContaining = (selector, textValue) => {
    const target = Array.from(document.querySelectorAll(selector)).find((button) => clean(button.textContent).includes(textValue));
    if (target instanceof HTMLElement) {
      target.click();
      return true;
    }
    return false;
  };

  const clearSearch = () => {
    const input = document.querySelector(".search-box input");
    if (input instanceof HTMLInputElement && input.value) setNativeValue(input, "");
  };

  const setSearch = (value) => {
    const input = document.querySelector(".search-box input");
    if (input instanceof HTMLInputElement && value && input.value !== value) setNativeValue(input, value);
  };

  const resetSalesFilters = () => {
    document.querySelectorAll(".list-toolbar select").forEach((select) => {
      if (!(select instanceof HTMLSelectElement)) return;
      if (Array.from(select.options).some((option) => option.value === "all")) setNativeValue(select, "all");
    });
  };

  const parseCompanyFromTitle = (title) => {
    const text = clean(title);
    const afterKind = text.replace(/^\[[^\]]+\]\s*/, "");
    const company = afterKind.split("_세금계산서")[0] || afterKind.split("_")[0] || "";
    return clean(company);
  };

  const readData = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  };

  const firstText = (record, keys) => {
    for (const key of keys) {
      const value = clean(record?.[key]);
      if (value) return value;
    }
    return "";
  };

  const recordId = (record, index) => firstText(record, ["id", "uuid"]) || `record-${index}`;
  const companyName = (record) => firstText(record, ["company", "companyName", "name", "clientName", "relatedCompany", "customerName", "customer", "organization"]);

  const findRecordIdByCompany = (sourceCollection, company) => {
    if (!company) return "";
    const data = readData();
    const records = Array.isArray(data[sourceCollection]) ? data[sourceCollection] : [];
    const normalizedCompany = clean(company).toLowerCase();
    const match = records
      .map((record, index) => ({ record, index, name: companyName(record).toLowerCase() }))
      .find(({ name }) => name && (name.includes(normalizedCompany) || normalizedCompany.includes(name)));
    return match ? recordId(match.record, match.index) : "";
  };

  const candidateSelectors = (sourceCollection, recordKey) => {
    const escaped = cssEscape(recordKey);
    if (sourceCollection === "materialSalesNotes") {
      return [`.material-sales-card[data-record-id='${escaped}']`];
    }
    return [`.sales-row-group[data-record-id='${escaped}']`];
  };

  const findByCompanyInDom = (sourceCollection, company) => {
    if (!company) return null;
    const selector = sourceCollection === "materialSalesNotes" ? ".material-sales-card[data-record-id]" : ".sales-row-group[data-record-id]";
    const normalized = clean(company).toLowerCase();
    return Array.from(document.querySelectorAll(selector)).find((element) => {
      const body = clean(element.textContent).toLowerCase();
      return body.includes(normalized) || normalized.includes(body.slice(0, Math.min(body.length, normalized.length)));
    }) || null;
  };

  const findTarget = (sourceCollection, recordKey, company) => {
    for (const selector of candidateSelectors(sourceCollection, recordKey)) {
      const target = document.querySelector(selector);
      if (target) return target;
    }
    return findByCompanyInDom(sourceCollection, company);
  };

  const focusTarget = (target, sourceCollection) => {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("is-focus-target");
    if (sourceCollection !== "materialSalesNotes") {
      const row = target.querySelector("article.clickable-row") || target.querySelector(".table-row.clickable-row");
      if (row instanceof HTMLElement) window.setTimeout(() => row.click(), 80);
    }
    window.setTimeout(() => target.classList.remove("is-focus-target"), 2600);
  };

  const navigateInvoiceItem = (element) => {
    const title = clean(element.textContent || element.getAttribute("title"));
    const sourceCollection = element.dataset.sourceCollection || "notes";
    const company = parseCompanyFromTitle(title);
    let recordKey = element.dataset.recordKey || "";
    if (!recordKey || recordKey.startsWith("record-")) {
      recordKey = findRecordIdByCompany(sourceCollection, company) || recordKey;
    }

    clearSearch();
    clickButtonContaining(".portal-button", "영업");

    let attempts = 0;
    const tryNavigate = () => {
      attempts += 1;
      clickButtonContaining(".sales-section-tabs button", sourceCollection === "materialSalesNotes" ? "소재/소모품" : "장비 영업건");
      clickButtonContaining(".memo-list-controls button", "전체");
      resetSalesFilters();

      const target = findTarget(sourceCollection, recordKey, company);
      if (target) {
        focusTarget(target, sourceCollection);
        return;
      }

      if (attempts === 8 && company) setSearch(company);
      if (attempts < 40) window.setTimeout(tryNavigate, 120);
    };

    window.setTimeout(tryNavigate, 80);
  };

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest(".runtime-invoice-item") : null;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    navigateInvoiceItem(target);
  }, true);
})();
