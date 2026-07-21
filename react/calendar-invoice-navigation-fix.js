(() => {
  const STORAGE_KEY = "salesNoteAppDataV1";
  const clean = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
  const cssEscape = (value) => window.CSS?.escape ? CSS.escape(value) : String(value).replace(/['"\\]/g, "\\$&");
  let lastHandledAt = 0;

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
    const escaped = cssEscape(recordKey || "");
    if (sourceCollection === "materialSalesNotes") {
      return [`.material-sales-card[data-record-id='${escaped}']`];
    }
    return [`.sales-row-group[data-record-id='${escaped}']`];
  };

  const bodyContainsCompany = (element, company) => {
    const normalized = clean(company).toLowerCase();
    if (!normalized) return false;
    const body = clean(element.textContent).toLowerCase();
    return body.includes(normalized) || normalized.includes(body.slice(0, Math.min(body.length, normalized.length)));
  };

  const findByCompanyInDom = (sourceCollection, company) => {
    if (!company) return null;
    const selectors = sourceCollection === "materialSalesNotes"
      ? [".material-sales-card[data-record-id]"]
      : [".sales-row-group[data-record-id]"];
    for (const selector of selectors) {
      const target = Array.from(document.querySelectorAll(selector)).find((element) => bodyContainsCompany(element, company));
      if (target) return target;
    }
    return null;
  };

  const findAnyByCompanyInSales = (company) => {
    if (!company) return null;
    const selectors = [".sales-row-group[data-record-id]", ".material-sales-card[data-record-id]"];
    for (const selector of selectors) {
      const target = Array.from(document.querySelectorAll(selector)).find((element) => bodyContainsCompany(element, company));
      if (target) return target;
    }
    return null;
  };

  const findTarget = (sourceCollection, recordKey, company) => {
    if (recordKey) {
      for (const selector of candidateSelectors(sourceCollection, recordKey)) {
        const target = document.querySelector(selector);
        if (target) return target;
      }
    }
    return findByCompanyInDom(sourceCollection, company) || findAnyByCompanyInSales(company);
  };

  const focusTarget = (target) => {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("is-focus-target");
    const row = target.querySelector("article.clickable-row") || target.querySelector(".table-row.clickable-row");
    if (row instanceof HTMLElement) window.setTimeout(() => row.click(), 120);
    window.setTimeout(() => target.classList.remove("is-focus-target"), 2800);
  };

  const navigateInvoiceItem = (element) => {
    const rawTitle = clean(element.textContent || element.getAttribute("title"));
    const title = rawTitle.includes("세금계산서") ? rawTitle : clean(element.getAttribute("title") || rawTitle);
    const company = parseCompanyFromTitle(title);
    const guessedSource = element.dataset.sourceCollection || "notes";
    let sourceCollection = guessedSource;
    let recordKey = element.dataset.recordKey || "";
    if (!recordKey || recordKey.startsWith("record-")) {
      recordKey = findRecordIdByCompany(sourceCollection, company) || recordKey;
    }

    clearSearch();
    clickButtonContaining(".portal-button", "영업");

    let attempts = 0;
    const tryNavigate = () => {
      attempts += 1;
      clickButtonContaining(".memo-list-controls button", "전체");
      resetSalesFilters();

      if (attempts < 16) {
        clickButtonContaining(".sales-section-tabs button", sourceCollection === "materialSalesNotes" ? "소재/소모품" : "장비 영업건");
      } else {
        sourceCollection = sourceCollection === "materialSalesNotes" ? "notes" : "materialSalesNotes";
        clickButtonContaining(".sales-section-tabs button", sourceCollection === "materialSalesNotes" ? "소재/소모품" : "장비 영업건");
      }

      if (attempts === 6 && company) setSearch(company);
      const target = findTarget(sourceCollection, recordKey, company);
      if (target) {
        focusTarget(target);
        return;
      }
      if (attempts < 50) window.setTimeout(tryNavigate, 120);
    };

    window.setTimeout(tryNavigate, 60);
  };

  const isInvoiceCalendarElement = (element) => {
    if (!element) return false;
    if (element.closest?.(".runtime-invoice-item")) return true;
    const chip = element.closest?.(".calendar-chip, .schedule-list-item");
    if (!chip) return false;
    const label = clean(chip.textContent || chip.getAttribute("title"));
    return label.includes("세금계산서");
  };

  const handleIntent = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!isInvoiceCalendarElement(target)) return;
    const now = Date.now();
    if (now - lastHandledAt < 400) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }
    lastHandledAt = now;
    const itemElement = target.closest(".runtime-invoice-item") || target.closest(".calendar-chip, .schedule-list-item");
    if (!itemElement) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    navigateInvoiceItem(itemElement);
  };

  ["pointerdown", "mousedown", "touchstart", "click"].forEach((eventName) => {
    document.addEventListener(eventName, handleIntent, true);
  });
})();
