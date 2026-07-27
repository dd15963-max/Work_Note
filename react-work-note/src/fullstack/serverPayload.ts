import type { AnyRecord, WorkNoteData } from "./types";

function asArray(value: unknown): AnyRecord[] {
  return Array.isArray(value) ? value.filter((item): item is AnyRecord => Boolean(item) && typeof item === "object") : [];
}

function text(record: AnyRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function id(record: AnyRecord, fallback: string): string {
  return text(record, ["id"]) || fallback;
}

function dateKey(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function pushSchedule(
  target: AnyRecord[],
  sourceKind: string,
  sourceId: string,
  scheduleKind: string,
  date: string,
  title: string,
  sourceRowId = "",
  important = false
) {
  const normalizedDate = dateKey(date);
  if (!normalizedDate) return;
  target.push({
    id: [sourceKind, sourceId, sourceRowId, scheduleKind, normalizedDate].filter(Boolean).join(":"),
    sourceKind,
    sourceId,
    sourceRowId,
    scheduleKind,
    date: normalizedDate,
    title,
    isImportant: important
  });
}

function flag(value: unknown): boolean {
  return value === true || String(value || "").toLowerCase() === "true" || String(value || "") === "1";
}

function billingMethod(record: AnyRecord): string {
  return text(record, ["billingMethod", "paymentEvidenceType"]) || "세금계산서";
}

function isClosedTask(record: AnyRecord): boolean {
  const status = text(record, ["status", "progressStatus"]);
  return ["완료", "실패/종료", "종료", "처리 완료"].includes(status);
}

function dateRange(startValue: string, endValue: string, includeWeekends = false): string[] {
  const start = dateKey(startValue);
  const end = dateKey(endValue) || start;
  if (!start || !end) return [];
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const cursor = new Date(sy, sm - 1, sd);
  const finish = new Date(ey, em - 1, ed);
  const dates: string[] = [];
  while (cursor <= finish && dates.length < 3700) {
    if (includeWeekends || ![0, 6].includes(cursor.getDay())) {
      dates.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export function buildServerPayload(data: WorkNoteData): WorkNoteData & { taskSchedules: AnyRecord[] } {
  const taskSchedules: AnyRecord[] = [];
  asArray(data.notes).forEach((record, index) => {
    const sourceId = id(record, `equipment-${index}`);
    const title = text(record, ["company", "customer", "name"]) || "장비 영업";
    const important = flag(record.isImportant);
    pushSchedule(taskSchedules, "equipment_sales", sourceId, "contact", text(record, ["nextContactDate"]), `[영업] ${title} 연락`, "", important);
    pushSchedule(taskSchedules, "equipment_sales", sourceId, "meeting", text(record, ["meetingDate"]), `[영업] ${title} 미팅`, "", important);
    const method = billingMethod(record);
    if (method !== "불필요" && text(record, ["taxInvoiceStatus", "invoiceStatus"]) === "발행 예정") {
      pushSchedule(taskSchedules, "equipment_sales", sourceId, "tax_invoice", text(record, ["taxInvoiceIssueDate", "invoiceIssueDate"]), `[영업] ${title} ${method}`, "", important);
    }
  });
  asArray(data.materialSalesNotes).forEach((record, index) => {
    const sourceId = id(record, `material-${index}`);
    const title = text(record, ["company", "customer", "name"]) || "소재 영업";
    const important = flag(record.isImportant);
    pushSchedule(taskSchedules, "material_sales", sourceId, "inquiry", text(record, ["inquiryDate"]), `[영업] ${title} 문의`, "", important);
    const method = billingMethod(record);
    if (method !== "불필요" && text(record, ["taxInvoiceStatus", "invoiceStatus"]) === "발행 예정") {
      pushSchedule(taskSchedules, "material_sales", sourceId, "tax_invoice", text(record, ["taxInvoiceIssueDate", "invoiceIssueDate"]), `[영업] ${title} ${method}`, "", important);
    }
  });
  asArray(data.settlementTasks).forEach((record, index) => {
    const sourceId = id(record, `settlement-${index}`);
    const title = text(record, ["company", "title", "name"]) || "정산";
    const isAdvance = text(record, ["paymentType"]).includes("선금");
    asArray(record.paymentSchedule).forEach((row, rowIndex) => {
      const rowId = id(row, `${sourceId}-entry-${rowIndex}`);
      const status = text(row, ["status"]);
      const important = flag(record.isImportant) || flag(row.isImportant);
      const completed = isAdvance ? status === "처리 완료" : ["입금 완료", "처리 완료"].includes(status);
      if (!flag(row.isTaxInvoiceOnly) && !completed) {
        pushSchedule(taskSchedules, "settlement", sourceId, isAdvance ? "deduction" : "installment", text(row, ["dueDate"]), `[정산] ${title}`, rowId, important);
      }
      const method = billingMethod(row);
      if (method !== "불필요" && text(row, ["taxInvoiceStatus"]) === "발행 예정") {
        pushSchedule(taskSchedules, "settlement", sourceId, "tax_invoice", text(row, ["taxInvoicePlannedDate"]), `[정산] ${title} ${method}`, rowId, important);
      }
    });
  });
  ([['output', data.outputTasks], ['other', data.otherTasks]] as const).forEach(([kind, records]) => {
    asArray(records).forEach((record, index) => {
      if (isClosedTask(record)) return;
      const sourceId = id(record, `${kind}-${index}`);
      const title = text(record, ["title", "taskTitle", "name"]) || (kind === "output" ? "출력 업무" : "기타 업무");
      const important = flag(record.isImportant);
      dateRange(text(record, ["startDate", "dueStartDate"]), text(record, ["endDate", "dueEndDate", "deadline"]), flag(record.includeWeekends)).forEach((date) => {
        pushSchedule(taskSchedules, kind, sourceId, "work", date, `[${kind === "output" ? "출력" : "기타"}] ${title}`, "", important);
      });
      if (kind === "output") {
        const method = billingMethod(record);
        if (method !== "불필요" && text(record, ["taxInvoiceStatus", "invoiceStatus"]) === "발행 예정") {
          pushSchedule(taskSchedules, kind, sourceId, "tax_invoice", text(record, ["taxInvoiceIssueDate", "invoiceIssueDate"]), `[출력] ${title} ${method}`, "", important);
        }
      }
    });
  });
  return { ...data, taskSchedules };
}
