(() => {
  const STORAGE_KEY = "salesNoteAppDataV1";
  const MATERIAL_DELIVERY_WAITING = "출고대기";
  const MATERIAL_STATUS_ANCHOR = "납품 완료";
  const INVOICE_STATUSES = ["발행 완료", "발행 예정", "발행 취소", "재발행 완료"];
  const EXTRA_STATUSES = new Set(["발행 취소", "재발행 완료"]);
  const PATCH_DELAYS = [80, 220, 520, 950];

  const text = (value) => String(value ?? "").trim();
  const compact = (value) => text(value).replace(/\s+/g, " ");
  const lower = (value) => compact(value).toLowerCase();
  const asArray = (value) => Array.isArray(value) ? value : [];

  const readData = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  };

  const writeData = (data) => {
    const next = { ...data, updatedAt: new Date().toISOString() };
    const serialized = JSON.stringify(next);
    localStorage.setItem(STORAGE_KEY, serialized);
    try {
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: serialized }));
    } catch {
      const event = new Event("storage");
      event.key = STORAGE_KEY;
      window.dispatchEvent(event);
    }
  };

  const firstText = (record, keys) => {
    for (const key of keys) {
      const value = record?.[key];
      if (typeof value === "string" || typeof value === "number") {
        const result = text(value);
        if (result) return result;
      }
    }
    return "";
  };

  const recordId = (record, index) => firstText(record, ["id", "key", "uuid"]) || `runtime_${index}`;

  const companyText = (record) => firstText(record, [
    "company",
    "customer",
    "customerName",
    "companyName",
    "client",
    "organization",
    "institution"
  ]);

  const getLabelControl = (panel, labelText) => {
    const labels = Array.from(panel.querySelectorAll("label"));
    const found = labels.find((label) => compact(label.textContent).includes(labelText));
    return found?.querySelector("input, select, textarea") || null;
  };

  const controlValue = (panel, labelText) => text(getLabelControl(panel, labelText)?.value);

  const editorType = (panel) => {
    const panelText = panel.textContent || "";
    if (panelText.includes("MATERIAL / OTHER SALES") || panelText.includes("소재/소모품 영업건")) return "materialSalesNotes";
    if (panelText.includes("SALES NOTE") || panelText.includes("영업 메모")) return "notes";
    return "";
  };

  const editorSignature = (panel, type) => ({
    company: controlValue(panel, "고객/업체명"),
    contactName: controlValue(panel, "담당자"),
    contactPhone: controlValue(panel, "연락처"),
    contactEmail: controlValue(panel, "이메일"),
    interest: controlValue(panel, "관심 장비/소재"),
    expectedRevenueAmount: controlValue(panel, "예상 매출") || controlValue(panel, "예상매출"),
    revenueAmount: controlValue(panel, "종합 매출") || controlValue(panel, "매출"),
    status: type === "materialSalesNotes" ? controlValue(panel, "진행 상태") : "",
    itemNames: Array.from(panel.querySelectorAll(".material-item-row label"))
      .filter((label) => compact(label.textContent).includes("품목명"))
      .map((label) => text(label.querySelector("input")?.value))
      .filter(Boolean)
      .join(" ")
  });

  const scoreRecord = (record, signature, type) => {
    let score = 0;
    const recordCompany = lower(companyText(record));
    const sigCompany = lower(signature.company);
    const contactName = lower(firstText(record, ["contactName", "managerName", "person"]));
    const contactPhone = lower(firstText(record, ["contactPhone", "phone", "contact", "mobile"]));
    const contactEmail = lower(firstText(record, ["contactEmail", "email"]));

    if (recordCompany && sigCompany && (recordCompany === sigCompany || recordCompany.includes(sigCompany) || sigCompany.includes(recordCompany))) score += 8;
    if (contactName && lower(signature.contactName) && contactName === lower(signature.contactName)) score += 3;
    if (contactPhone && lower(signature.contactPhone) && contactPhone === lower(signature.contactPhone)) score += 3;
    if (contactEmail && lower(signature.contactEmail) && contactEmail === lower(signature.contactEmail)) score += 3;

    if (type === "notes") {
      const interest = lower(firstText(record, ["interest", "product", "item"]));
      if (interest && lower(signature.interest) && (interest.includes(lower(signature.interest)) || lower(signature.interest).includes(interest))) score += 3;
    }

    if (type === "materialSalesNotes") {
      const itemNames = lower(asArray(record.items).map((item) => firstText(item, ["name", "itemName"])).join(" "));
      if (itemNames && lower(signature.itemNames)) {
        const wanted = lower(signature.itemNames).split(" ").filter(Boolean);
        score += wanted.filter((name) => itemNames.includes(name)).length;
      }
    }

    return score;
  };

  const sortedCandidates = (records, signature, type) => records
    .map((record, index) => ({
      record,
      index,
      score: scoreRecord(record, signature, type),
      time: Date.parse(firstText(record, ["updatedAt", "createdAt", "lastModified"])) || 0
    }))
    .sort((a, b) => (b.score - a.score) || (b.time - a.time) || (b.index - a.index));

  const findRecordForEditor = (type, panel) => {
    const data = readData();
    const records = asArray(data[type]);
    if (!records.length) return null;
    const signature = editorSignature(panel, type);
    const candidates = sortedCandidates(records, signature, type);
    return candidates[0]?.record || null;
  };

  const invoiceValuesFromRecord = (record) => ({
    taxInvoiceIssueDate: firstText(record, ["taxInvoiceIssueDate", "invoiceIssueDate"]),
    taxInvoiceStatus: firstText(record, ["taxInvoiceStatus", "invoiceStatus"]) || "발행 예정",
    taxInvoiceCancelReason: firstText(record, ["taxInvoiceCancelReason", "invoiceCancelReason"]),
    taxInvoiceReissueDate: firstText(record, ["taxInvoiceReissueDate", "invoiceReissueDate"])
  });

  const toggleExtraFields = (wrapper) => {
    const status = wrapper.querySelector("[data-invoice-field='taxInvoiceStatus']")?.value || "";
    const extra = wrapper.querySelector(".invoice-runtime-extra");
    if (extra) extra.hidden = !EXTRA_STATUSES.has(status);
  };

  const createField = (labelText, control) => {
    const label = document.createElement("label");
    label.className = "invoice-runtime-field";
    const span = document.createElement("span");
    span.textContent = labelText;
    label.append(span, control);
    return label;
  };

  const createInvoicePanel = (values) => {
    const wrapper = document.createElement("section");
    wrapper.className = "invoice-runtime-panel wide-field";
    wrapper.dataset.invoiceRuntimePanel = "true";

    const title = document.createElement("div");
    title.className = "invoice-runtime-title";
    title.innerHTML = "<strong>세금계산서</strong><small>발행일과 발행 상태 관리</small>";

    const issueDate = document.createElement("input");
    issueDate.type = "date";
    issueDate.value = values.taxInvoiceIssueDate || "";
    issueDate.dataset.invoiceField = "taxInvoiceIssueDate";

    const status = document.createElement("select");
    status.dataset.invoiceField = "taxInvoiceStatus";
    INVOICE_STATUSES.forEach((item) => status.add(new Option(item, item)));
    status.value = INVOICE_STATUSES.includes(values.taxInvoiceStatus) ? values.taxInvoiceStatus : "발행 예정";

    const row = document.createElement("div");
    row.className = "invoice-runtime-row";
    row.append(createField("세금계산서 발행일", issueDate), createField("발행 상태", status));

    const cancelReason = document.createElement("input");
    cancelReason.type = "text";
    cancelReason.placeholder = "취소 사유";
    cancelReason.value = values.taxInvoiceCancelReason || "";
    cancelReason.dataset.invoiceField = "taxInvoiceCancelReason";

    const reissueDate = document.createElement("input");
    reissueDate.type = "date";
    reissueDate.value = values.taxInvoiceReissueDate || "";
    reissueDate.dataset.invoiceField = "taxInvoiceReissueDate";

    const extra = document.createElement("div");
    extra.className = "invoice-runtime-extra";
    extra.append(createField("취소 사유", cancelReason), createField("재발행 일자", reissueDate));

    wrapper.append(title, row, extra);
    status.addEventListener("change", () => toggleExtraFields(wrapper));
    toggleExtraFields(wrapper);
    return wrapper;
  };

  const readInvoiceFields = (panel) => {
    const get = (key) => text(panel.querySelector(`[data-invoice-field='${key}']`)?.value);
    return {
      taxInvoiceIssueDate: get("taxInvoiceIssueDate"),
      taxInvoiceStatus: get("taxInvoiceStatus") || "발행 예정",
      taxInvoiceCancelReason: get("taxInvoiceCancelReason"),
      taxInvoiceReissueDate: get("taxInvoiceReissueDate")
    };
  };

  const readMaterialStatus = (panel) => {
    if (editorType(panel) !== "materialSalesNotes") return "";
    return controlValue(panel, "진행 상태");
  };

  const patchRecord = (type, signature, fields, materialStatus) => {
    const data = readData();
    const records = asArray(data[type]);
    if (!records.length) return;

    const candidates = sortedCandidates(records, signature, type);
    const target = candidates[0];
    if (!target) return;

    const nextRecord = {
      ...target.record,
      ...fields,
      updatedAt: firstText(target.record, ["updatedAt"]) || new Date().toISOString()
    };
    if (type === "materialSalesNotes" && materialStatus === MATERIAL_DELIVERY_WAITING) {
      nextRecord.status = MATERIAL_DELIVERY_WAITING;
    }

    const nextRecords = records.map((record, index) => index === target.index ? nextRecord : record);
    writeData({ ...data, [type]: nextRecords });
  };

  const bindSavePatch = (panel) => {
    if (panel.dataset.invoiceSaveBound === "true") return;
    panel.dataset.invoiceSaveBound = "true";
    panel.addEventListener("click", (event) => {
      const button = event.target?.closest?.("button");
      if (!button || compact(button.textContent) !== "저장") return;
      const type = editorType(panel);
      if (!type) return;
      const signature = editorSignature(panel, type);
      const fields = readInvoiceFields(panel);
      const materialStatus = readMaterialStatus(panel);
      PATCH_DELAYS.forEach((delay) => window.setTimeout(() => patchRecord(type, signature, fields, materialStatus), delay));
    }, true);
  };

  const ensureInvoicePanel = (panel) => {
    const type = editorType(panel);
    if (!type) return;
    const grid = panel.querySelector(".form-grid");
    if (!grid) return;
    bindSavePatch(panel);
    if (grid.querySelector("[data-invoice-runtime-panel='true']")) {
      toggleExtraFields(grid.querySelector("[data-invoice-runtime-panel='true']"));
      return;
    }

    const record = findRecordForEditor(type, panel);
    const wrapper = createInvoicePanel(invoiceValuesFromRecord(record || {}));
    const beforeMemo = Array.from(grid.children).find((child) => compact(child.textContent).startsWith("상세 메모"));
    grid.insertBefore(wrapper, beforeMemo || null);
  };

  const addMaterialDeliveryWaitingOptions = () => {
    document.querySelectorAll("select").forEach((select) => {
      const options = Array.from(select.options).map((option) => option.value);
      if (!options.includes("검토 중") || !options.includes(MATERIAL_STATUS_ANCHOR) || options.includes(MATERIAL_DELIVERY_WAITING)) return;
      const anchor = Array.from(select.options).find((option) => option.value === MATERIAL_STATUS_ANCHOR);
      const option = new Option(MATERIAL_DELIVERY_WAITING, MATERIAL_DELIVERY_WAITING);
      select.insertBefore(option, anchor || null);
    });
  };

  const syncMaterialDeliveryWaitingDisplay = () => {
    const data = readData();
    const records = asArray(data.materialSalesNotes);
    if (!records.length) return;
    document.querySelectorAll(".material-sales-card[data-record-id]").forEach((card) => {
      const id = card.getAttribute("data-record-id");
      const index = Array.from(card.parentElement?.children || []).indexOf(card);
      const record = records.find((item, itemIndex) => recordId(item, itemIndex) === id) || records[index];
      if (!record || firstText(record, ["status"]) !== MATERIAL_DELIVERY_WAITING) return;
      const select = Array.from(card.querySelectorAll("select")).find((item) => Array.from(item.options).some((option) => option.value === MATERIAL_DELIVERY_WAITING));
      if (select) select.value = MATERIAL_DELIVERY_WAITING;
    });

    document.querySelectorAll(".editor-panel").forEach((panel) => {
      if (editorType(panel) !== "materialSalesNotes") return;
      const record = findRecordForEditor("materialSalesNotes", panel);
      if (!record || firstText(record, ["status"]) !== MATERIAL_DELIVERY_WAITING) return;
      const statusSelect = getLabelControl(panel, "진행 상태");
      if (statusSelect instanceof HTMLSelectElement) statusSelect.value = MATERIAL_DELIVERY_WAITING;
    });
  };

  const apply = () => {
    addMaterialDeliveryWaitingOptions();
    document.querySelectorAll(".editor-panel").forEach(ensureInvoicePanel);
    syncMaterialDeliveryWaitingDisplay();
  };

  const observer = new MutationObserver(() => window.requestAnimationFrame(apply));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("storage", () => window.requestAnimationFrame(apply));
  window.addEventListener("focus", apply);
  window.setInterval(apply, 1500);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply, { once: true });
  } else {
    apply();
  }
})();
