import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { collectScheduleItems, scheduleItemFocusTarget } from "./App";

function emptyData(overrides: Record<string, unknown> = {}) {
  return {
    version: "sites-work-note-v1",
    updatedAt: "2026-09-02T00:00:00.000Z",
    generalMemos: [], companies: [], internalContacts: [], notes: [], materialSalesNotes: [],
    settlementTasks: [], outputTasks: [], otherTasks: [], accounts: [],
    loadedAt: "2026-09-02T00:00:00.000Z",
    ...overrides,
  };
}

const plannedInvoice = {
  billingMethod: "세금계산서",
  taxInvoiceStatus: "발행 예정",
  taxInvoiceIssueDate: "2026-09-02",
};

function taxItems(data: Record<string, unknown>) {
  return collectScheduleItems(data as never).filter((item) => item.taxInvoiceItemId);
}

describe("calendar tax-invoice generation", () => {
  it("creates one navigable equipment-sales invoice item", () => {
    const items = taxItems(emptyData({ notes: [{ id: "equipment-1", company: "장비 고객사", ...plannedInvoice }] }));
    expect(items).toHaveLength(1);
    expect(scheduleItemFocusTarget(items[0])).toMatchObject({ portal: "sales", id: "equipment-1", salesKind: "equipment", openEditor: true });
  });

  it("creates one navigable material-sales invoice item", () => {
    const items = taxItems(emptyData({ materialSalesNotes: [{ id: "material-1", company: "소재 고객사", ...plannedInvoice }] }));
    expect(items).toHaveLength(1);
    expect(scheduleItemFocusTarget(items[0])).toMatchObject({ portal: "sales", id: "material-1", salesKind: "material", openEditor: true });
  });

  it("creates one navigable output invoice item", () => {
    const items = taxItems(emptyData({ outputTasks: [{ id: "output-1", title: "출력 업무", status: "진행 중", ...plannedInvoice }] }));
    expect(items).toHaveLength(1);
    expect(scheduleItemFocusTarget(items[0])).toMatchObject({ portal: "output", id: "output-1", openEditor: true });
  });

  it("creates one navigable settlement invoice item", () => {
    const items = taxItems(emptyData({ settlementTasks: [{
      id: "settlement-1", company: "정산 고객사", paymentType: "일시 결제", status: "예정",
      paymentSchedule: [{ id: "settlement-row-1", billingMethod: "세금계산서", taxInvoiceStatus: "발행 예정", taxInvoicePlannedDate: "2026-09-02" }],
    }] }));
    expect(items).toHaveLength(1);
    expect(scheduleItemFocusTarget(items[0])).toMatchObject({ portal: "settlement", id: "settlement-1", taxInvoiceItemId: "settlement-row-1", settlementRowId: "settlement-row-1", openEditor: true });
  });

  it("opens a tax-invoice-only settlement payment row by parent and row IDs", () => {
    const items = taxItems(emptyData({ settlementTasks: [{
      id: "settlement-2", company: "정산 고객사", paymentType: "분할 결제", status: "예정",
      paymentSchedule: [{ id: "tax-only-row", isTaxInvoiceOnly: true, billingMethod: "세금계산서", taxInvoiceStatus: "발행 예정", taxInvoicePlannedDate: "2026-09-02" }],
    }] }));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ sourceId: "settlement-2", taxInvoiceItemId: "tax-only-row", settlementRowId: "tax-only-row" });
  });

  it("does not load the legacy DOM generator or consume stored taskSchedules", () => {
    const liveLayoutSource = readFileSync(new URL("../../app/layout.tsx", import.meta.url), "utf8");
    const staticIndexSource = readFileSync(new URL("../../react/index.html", import.meta.url), "utf8");
    const items = taxItems(emptyData({
      notes: [{ id: "sales-1", company: "원본 업무", ...plannedInvoice }],
      taskSchedules: [{ id: "ghost", date: "2026-09-02", scheduleKind: "tax_invoice", title: "이동 불가 복제 일정" }],
    }));
    expect(liveLayoutSource).not.toContain("calendar-label-fix.js");
    expect(staticIndexSource).not.toContain("calendar-label-fix.js");
    expect(existsSync(new URL("../../public/calendar-label-fix.js", import.meta.url))).toBe(false);
    expect(existsSync(new URL("../../react/calendar-label-fix.js", import.meta.url))).toBe(false);
    expect(existsSync(new URL("../public/calendar-label-fix.js", import.meta.url))).toBe(false);
    expect(items).toHaveLength(1);
    expect(items[0].sourceId).toBe("sales-1");
  });

  it("keeps distinct tasks with the same company, date, and billing method", () => {
    const items = taxItems(emptyData({
      notes: [{ id: "equipment-distinct", companyId: "company-1", company: "동일 업체", ...plannedInvoice }],
      materialSalesNotes: [{ id: "material-distinct", companyId: "company-1", company: "동일 업체", ...plannedInvoice }],
    }));
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.sourceId)).toEqual(["equipment-distinct", "material-distinct"]);
    expect(items.map((item) => scheduleItemFocusTarget(item))).toEqual([
      expect.objectContaining({ id: "equipment-distinct", salesKind: "equipment", openEditor: true }),
      expect.objectContaining({ id: "material-distinct", salesKind: "material", openEditor: true }),
    ]);
  });
});
