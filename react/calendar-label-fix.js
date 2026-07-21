(() => {
  const STORAGE_KEY = "salesNoteAppDataV1";
  const completedWords = ["완료", "종료", "실패", "취소"];
  const highPriorityWords = ["긴급", "높음", "중요"];
  const TAX_INVOICE_PENDING = "발행 예정";
  let scheduled = false;
  let applying = false;

  const clean = (value) => (value === null || value === undefined ? "" : String(value).trim());
  const firstText = (record, keys) => {
    if (!record || typeof record !== "object") return "";
    for (const key of keys) {
      const value = clean(record[key]);
      if (value) return value;
    }
    return "";
  };
  const asArray = (value) => Array.isArray(value) ? value.filter((item) => item && typeof item === "object" && !Array.isArray(item)) : [];
  const recordId = (record, index) => firstText(record, ["id", "uuid"]) || `record-${index}`;
  const companyName = (record) => firstText(record, ["company", "companyName", "name", "clientName", "relatedCompany", "customerName"]);
  const salesCustomer = (record) => companyName(record) || firstText(record, ["customer", "organization"]) || "고객 미정";
  const workTitle = (record, type) => {
    if (type === "settlement") return companyName(record) || firstText(record, ["title", "taskName"]) || "정산 업무";
    if (type === "output") return firstText(record, ["title", "taskName", "outputName"]) || companyName(record) || "출력 업무";
    return firstText(record, ["title", "taskName", "name"]) || companyName(record) || "기타 업무";
  };
  const otherTaskTitle = (record) => firstText(record, ["title", "taskName", "name"]) || "기타 업무";
  const outputAction = (record) => firstText(record, ["outputType"]) || firstText(record, ["title", "taskName", "outputName"]) || "출력";
  const labelWithCompany = (kind, company, action) => `[${kind}] ${clean(company) ? `${clean(company)}_` : ""}${clean(action) || `${kind} 업무`}`;
  const parseDateKey = (value) => {
    const text = clean(value);
    if (!text || text === "미정") return "";
    const match = text.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (!match) return "";
    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  };
  const toDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const parseDate = (value) => {
    const key = parseDateKey(value);
    if (!key) return new Date(0);
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day);
  };
  const getDateRangeKeys = (startKey, endKey, includeWeekends) => {
    const start = parseDate(startKey);
    const end = parseDate(endKey);
    if (start.getTime() <= 0 || end.getTime() <= 0 || end < start) return [];
    const days = [];
    for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
      const weekend = day.getDay() === 0 || day.getDay() === 6;
      if (includeWeekends || !weekend) days.push(toDateKey(day));
    }
    return days;
  };
  const isClosed = (status) => completedWords.some((word) => clean(status).includes(word));
  const priorityScore = (priority) => {
    const text = clean(priority);
    if (highPriorityWords.some((word) => text.includes(word))) return 3;
    if (text.includes("보통")) return 2;
    if (text.includes("낮")) return 1;
    return 0;
  };
  const formatDate = (value) => {
    const key = parseDateKey(value) || clean(value);
    return key ? key.replace(/-/g, ".") : "";
  };
  const deadlineText = (record) => {
    const start = formatDate(firstText(record, ["dueStartDate", "startDate"]));
    const end = formatDate(firstText(record, ["dueEndDate", "deadline", "dueDate", "endDate"]));
    return start && end && start !== end ? `${start} ~ ${end}` : end || start || "미정";
  };
  const normalizePaymentSchedule = (rows) => rows;
  const isSettlementRowCompleted = (row, isAdvance) => {
    const status = firstText(row, ["status"]);
    return isAdvance ? status.includes("차감 완료") || status.includes("처리 완료") : status.includes("입금 완료") || status.includes("처리 완료");
  };
  const setText = (element, value) => {
    if (element && element.textContent !== value) element.textContent = value;
  };
  const setAttr = (element, name, value) => {
    if (element && element.getAttribute(name) !== value) element.setAttribute(name, value);
  };
  const cssEscape = (value) => window.CSS?.escape ? CSS.escape(value) : String(value).replace(/['"\\]/g, "\\$&");
  const addItem = (items, record, index, dateValue, title, detail, type, status, priority, suffix = "", portal = type, sourceCollection = "") => {
    const date = parseDateKey(dateValue);
    if (!date) return;
    items.push({
      id: `${type}-${recordId(record, index)}-${suffix ? `${suffix}-` : ""}${date}-${items.length}`,
      recordKey: recordId(record, index),
      sourceCollection,
      date,
      title,
      detail: clean(detail),
      type,
      portal,
      status: clean(status),
      priority: clean(priority),
      isInvoice: suffix === "tax-invoice"
    });
  };
  const addRangeItems = (items, record, index, type, title, detail) => {
    const startKey = parseDateKey(firstText(record, ["startDate", "dueStartDate"])) || parseDateKey(firstText(record, ["dueEndDate", "deadline", "dueDate", "endDate"]));
    const endKey = parseDateKey(firstText(record, ["endDate", "dueEndDate", "deadline", "dueDate"])) || startKey;
    const status = firstText(record, ["status", "progressStatus"]);
    const priority = firstText(record, ["priority", "importance"]);
    if (!startKey || !endKey || endKey < startKey) {
      addItem(items, record, index, endKey || startKey, title, detail, type, status, priority);
      return;
    }
    getDateRangeKeys(startKey, endKey, Boolean(record.includeWeekends)).forEach((date, dayIndex) => {
      addItem(items, record, index, date, title, detail || deadlineText(record), type, status, priority, `range-${dayIndex}`);
    });
  };
  const loadData = () => {
    try {
      const data = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
      return data && typeof data === "object" ? data : {};
    } catch {
      return {};
    }
  };
  const addInvoiceItem = (items, record, index, sourceCollection, titlePrefix = "영업") => {
    const status = firstText(record, ["taxInvoiceStatus", "invoiceStatus"]);
    const date = firstText(record, ["taxInvoiceIssueDate", "invoiceIssueDate"]);
    if (status !== TAX_INVOICE_PENDING || !parseDateKey(date)) return;
    addItem(
      items,
      record,
      index,
      date,
      labelWithCompany(titlePrefix, salesCustomer(record), "세금계산서"),
      "세금계산서 발행 예정",
      "sales",
      status,
      firstText(record, ["priority", "importance"]),
      "tax-invoice",
      "sales",
      sourceCollection
    );
  };
  const collectItems = () => {
    const data = loadData();
    const items = [];
    asArray(data.notes).forEach((note, index) => {
      const company = salesCustomer(note);
      const status = firstText(note, ["status", "progressStatus"]);
      const priority = firstText(note, ["priority", "importance"]);
      addItem(items, note, index, firstText(note, ["nextContactDate"]), labelWithCompany("영업", company, "연락"), firstText(note, ["nextAction"]), "sales", status, priority, "", "sales", "notes");
      addItem(items, note, index, firstText(note, ["meetingDate"]), labelWithCompany("영업", company, "미팅"), firstText(note, ["nextAction"]), "sales", status, priority, "", "sales", "notes");
      addInvoiceItem(items, note, index, "notes", "영업");
    });
    asArray(data.materialSalesNotes).forEach((record, index) => {
      addInvoiceItem(items, record, index, "materialSalesNotes", "영업");
    });
    asArray(data.settlementTasks).forEach((task, index) => {
      if (isClosed(firstText(task, ["status", "progressStatus"]))) return;
      const status = firstText(task, ["status", "progressStatus"]);
      const priority = firstText(task, ["priority", "importance"]);
      const company = companyName(task) || workTitle(task, "settlement");
      const isAdvance = firstText(task, ["paymentType"]).includes("선금");
      const rows = normalizePaymentSchedule(asArray(task.paymentSchedule));
      rows.filter((row) => !isSettlementRowCompleted(row, isAdvance)).forEach((row, rowIndex) => {
        const rowStatus = firstText(row, ["status"]);
        const round = firstText(row, ["round"]);
        const item = firstText(row, ["item"]);
        const action = round ? `${round}회차` : item || (isAdvance ? "차감" : "결제");
        addItem(items, task, index, firstText(row, ["dueDate"]), labelWithCompany("정산", company, action), item || rowStatus, "settlement", rowStatus || status, priority, `pay-${recordId(row, rowIndex)}`);
      });
      if (!rows.length) {
        addItem(items, task, index, firstText(task, ["nextActionDate", "nextProcessDate", "nextDate", "dueDate", "dueEndDate", "endDate"]), labelWithCompany("정산", company, "처리"), firstText(task, ["nextAction"]), "settlement", status, priority);
      }
    });
    asArray(data.outputTasks).forEach((task, index) => {
      if (isClosed(firstText(task, ["status", "progressStatus"]))) return;
      addRangeItems(items, task, index, "output", labelWithCompany("출력", companyName(task), outputAction(task)), deadlineText(task));
    });
    asArray(data.otherTasks).forEach((task, index) => {
      if (isClosed(firstText(task, ["status", "progressStatus"]))) return;
      addRangeItems(items, task, index, "other", labelWithCompany("기타", companyName(task), otherTaskTitle(task)), deadlineText(task));
    });
    return items.sort((a, b) => a.date.localeCompare(b.date) || priorityScore(b.priority) - priorityScore(a.priority));
  };
  const currentQuery = () => clean(document.querySelector(".search-box input")?.value).toLowerCase();
  const matchesQuery = (item, query) => !query || JSON.stringify(item).toLowerCase().includes(query);
  const parseCalendarHeading = () => {
    const heading = clean(document.querySelector(".calendar-panel h2")?.textContent);
    const match = heading.match(/(\d{4})년\s*(\d{1,2})월/);
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]) - 1 };
  };
  const inferCellDates = (grid, cells) => {
    const base = parseCalendarHeading();
    if (!base) return [];
    if (!grid.classList.contains("week-mode")) {
      const first = new Date(base.year, base.month, 1);
      const start = new Date(first);
      start.setDate(first.getDate() - first.getDay());
      return cells.map((_, index) => {
        const day = new Date(start);
        day.setDate(start.getDate() + index);
        return toDateKey(day);
      });
    }
    const numbers = cells.map((cell) => Number(clean(cell.querySelector("strong")?.textContent)) || 1);
    const oneIndex = numbers.indexOf(1);
    return numbers.map((dayNumber, index) => {
      let month = base.month;
      let year = base.year;
      if (oneIndex > 0 && index < oneIndex) month -= 1;
      if (oneIndex === 0 && index > 0 && dayNumber < numbers[index - 1]) month += 1;
      if (month < 0) { month = 11; year -= 1; }
      if (month > 11) { month = 0; year += 1; }
      return toDateKey(new Date(year, month, dayNumber));
    });
  };
  const setNativeValue = (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const clearSearch = () => {
    const input = document.querySelector(".search-box input");
    if (input && input.value) setNativeValue(input, "");
  };
  const clickButtonContaining = (selector, textValue) => {
    const button = Array.from(document.querySelectorAll(selector)).find((item) => clean(item.textContent).includes(textValue));
    button?.click();
    return Boolean(button);
  };
  const resetSalesFilters = () => {
    document.querySelectorAll(".list-toolbar select").forEach((select) => {
      if (!(select instanceof HTMLSelectElement)) return;
      if (Array.from(select.options).some((option) => option.value === "all") && select.value !== "all") {
        setNativeValue(select, "all");
      }
    });
  };
  const findTarget = (item) => {
    const wantsMaterial = item.sourceCollection === "materialSalesNotes";
    const escaped = cssEscape(item.recordKey);
    if (wantsMaterial) return document.querySelector(`.material-sales-card[data-record-id='${escaped}']`);
    return document.querySelector(`.sales-row-group[data-record-id='${escaped}']`);
  };
  const focusTargetElement = (target, openDetail) => {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("is-focus-target");
    if (openDetail) {
      const row = target.querySelector("article.clickable-row") || target.querySelector(".table-row.clickable-row");
      row?.click();
    }
    window.setTimeout(() => target.classList.remove("is-focus-target"), 2400);
  };
  const openRuntimeItem = (item) => {
    clearSearch();
    clickButtonContaining(".portal-button", "영업");
    const wantsMaterial = item.sourceCollection === "materialSalesNotes";
    let attempts = 0;
    const tryOpen = () => {
      attempts += 1;
      clickButtonContaining(".sales-section-tabs button", wantsMaterial ? "소재/소모품" : "장비 영업건");
      clickButtonContaining(".memo-list-controls button", "전체");
      resetSalesFilters();
      const target = findTarget(item);
      if (target) {
        focusTargetElement(target, !wantsMaterial);
        return;
      }
      if (attempts < 30) window.setTimeout(tryOpen, 120);
    };
    window.setTimeout(tryOpen, 80);
  };
  const findRuntimeItemFromElement = (element) => {
    const id = element?.dataset?.runtimeItemId;
    if (!id) return null;
    return collectItems().find((item) => item.id === id) || null;
  };
  const createCalendarChip = (item) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `calendar-chip ${item.type} runtime-calendar-item runtime-invoice-item`;
    chip.textContent = item.title;
    chip.title = [item.title, item.detail].filter(Boolean).join(" ");
    chip.dataset.runtimeItemId = item.id;
    chip.dataset.recordKey = item.recordKey;
    chip.dataset.sourceCollection = item.sourceCollection;
    chip.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openRuntimeItem(item);
    });
    return chip;
  };
  const createTodayItem = (item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `schedule-list-item ${item.type} runtime-calendar-item runtime-invoice-item`;
    button.dataset.runtimeItemId = item.id;
    button.dataset.recordKey = item.recordKey;
    button.dataset.sourceCollection = item.sourceCollection;
    button.innerHTML = `
      <div>
        <strong></strong>
        <p></p>
      </div>
      <div class="stacked-meta">
        <span></span>
        <small></small>
      </div>
    `;
    setText(button.querySelector("strong"), item.title);
    setText(button.querySelector("p"), item.detail || "세금계산서 발행 예정");
    setText(button.querySelector(".stacked-meta span"), formatDate(item.date));
    setText(button.querySelector(".stacked-meta small"), item.status);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openRuntimeItem(item);
    });
    return button;
  };
  const clearRuntimeItems = () => {
    document.querySelectorAll(".runtime-calendar-item").forEach((element) => element.remove());
  };
  const applyLabels = () => {
    if (applying) return;
    applying = true;
    try {
      clearRuntimeItems();
      const query = currentQuery();
      const items = collectItems().filter((item) => matchesQuery(item, query));
      const invoiceItems = items.filter((item) => item.isInvoice);
      const grid = document.querySelector(".calendar-grid");
      if (grid) {
        const cells = Array.from(grid.querySelectorAll(".calendar-cell"));
        const dates = inferCellDates(grid, cells);
        cells.forEach((cell, index) => {
          const dateItems = items.filter((item) => item.date === dates[index] && !item.isInvoice);
          Array.from(cell.querySelectorAll(".calendar-chip:not(.runtime-calendar-item)")).forEach((chip, chipIndex) => {
            const item = dateItems[chipIndex];
            if (!item) return;
            setText(chip, item.title);
            setAttr(chip, "title", [item.title, item.detail].filter(Boolean).join(" "));
          });
          const wrapper = cell.querySelector(".calendar-items");
          if (!wrapper) return;
          invoiceItems
            .filter((item) => item.date === dates[index])
            .forEach((item) => wrapper.appendChild(createCalendarChip(item)));
        });
      }
      const todayKey = toDateKey(new Date());
      const todayBaseItems = items.filter((item) => item.date === todayKey && !item.isInvoice);
      const todayInvoiceItems = invoiceItems.filter((item) => item.date === todayKey);
      Array.from(document.querySelectorAll(".today-list .schedule-list-item:not(.runtime-calendar-item)")).forEach((button, index) => {
        const item = todayBaseItems[index];
        if (!item) return;
        setText(button.querySelector("strong"), item.title);
        setText(button.querySelector("p"), item.detail || "상세 내용 없음");
      });
      const todayList = document.querySelector(".today-list");
      if (todayList) {
        todayInvoiceItems.forEach((item) => todayList.appendChild(createTodayItem(item)));
        const count = todayBaseItems.length + todayInvoiceItems.length;
        const countElement = document.querySelector(".today-panel .section-title-row > span");
        if (countElement) setText(countElement, `${count}건`);
      }
    } finally {
      applying = false;
    }
  };
  const scheduleApply = () => {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(() => {
      scheduled = false;
      applyLabels();
    }, 30);
  };

  document.addEventListener("click", (event) => {
    const runtimeItem = event.target instanceof Element ? event.target.closest(".runtime-invoice-item") : null;
    if (!runtimeItem) return;
    const item = findRuntimeItemFromElement(runtimeItem) || {
      id: runtimeItem.dataset.runtimeItemId || "",
      recordKey: runtimeItem.dataset.recordKey || "",
      sourceCollection: runtimeItem.dataset.sourceCollection || "notes"
    };
    if (!item.recordKey) return;
    event.preventDefault();
    event.stopPropagation();
    openRuntimeItem(item);
  }, true);
  window.addEventListener("DOMContentLoaded", scheduleApply);
  window.addEventListener("storage", scheduleApply);
  window.setInterval(scheduleApply, 1200);
  new MutationObserver(scheduleApply).observe(document.documentElement, { childList: true, subtree: true });
})();
