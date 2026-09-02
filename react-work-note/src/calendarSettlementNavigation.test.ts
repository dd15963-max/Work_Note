import { describe, expect, it } from "vitest";
import { collectScheduleItems, scheduleItemFocusTarget } from "./App";

function emptyData(overrides: Record<string, unknown> = {}) {
  return {
    version: "sites-work-note-v1",
    updatedAt: "2026-09-02T00:00:00.000Z",
    generalMemos: [],
    companies: [],
    internalContacts: [],
    notes: [],
    materialSalesNotes: [],
    settlementTasks: [],
    outputTasks: [],
    otherTasks: [],
    accounts: [],
    loadedAt: "2026-09-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("calendar settlement navigation", () => {
  it("keeps legacy settlement row IDs stable and opens the matching settlement editor", () => {
    const data = emptyData({
      settlementTasks: [{
        id: "settlement-1",
        company: "한국전기연구원",
        paymentType: "분할 결제",
        status: "예정",
        paymentSchedule: [{
          round: "1",
          dueDate: "2026-09-02",
          billingMethod: "세금계산서",
          taxInvoiceStatus: "발행 예정",
          taxInvoicePlannedDate: "2026-09-02",
        }],
      }],
    });

    const first = collectScheduleItems(data as never).filter((item) => item.type === "settlement");
    const second = collectScheduleItems(data as never).filter((item) => item.type === "settlement");
    const invoice = first.find((item) => item.taxInvoiceItemId);

    expect(first.map((item) => item.id)).toEqual(second.map((item) => item.id));
    expect(invoice).toMatchObject({
      sourceType: "settlement",
      sourceId: "settlement-1",
      taxInvoiceItemId: "record-0",
      settlementRowId: "record-0",
    });
    expect(scheduleItemFocusTarget(invoice!)).toMatchObject({
      portal: "settlement",
      id: "settlement-1",
      taxInvoiceItemId: "record-0",
      settlementRowId: "record-0",
      openEditor: true,
    });
  });

  it("keeps the existing sales, output, and other calendar destinations", () => {
    const items = collectScheduleItems(emptyData({
      notes: [{ id: "sales-1", nextContactDate: "2026-09-02" }],
      outputTasks: [{ id: "output-1", title: "출력", status: "진행 중", startDate: "2026-09-02", endDate: "2026-09-02" }],
      otherTasks: [{ id: "other-1", title: "기타", status: "진행 중", startDate: "2026-09-02", endDate: "2026-09-02" }],
    }) as never);

    expect(items.map((item) => scheduleItemFocusTarget(item))).toEqual(expect.arrayContaining([
      expect.objectContaining({ portal: "sales", id: "sales-1" }),
      expect.objectContaining({ portal: "output", id: "output-1" }),
      expect.objectContaining({ portal: "other", id: "other-1" }),
    ]));
  });

  it("hides an exact duplicate tax-invoice schedule and keeps the first navigable owner", () => {
    const items = collectScheduleItems(emptyData({
      notes: [{ id: "sales-primary", companyId: "company-1", company: "중복 고객사 정식명", billingMethod: "세금계산서", taxInvoiceStatus: "발행 예정", taxInvoiceIssueDate: "2026-09-02" }],
      materialSalesNotes: [{ id: "sales-duplicate", companyId: "company-1", company: "중복 고객사 별칭", billingMethod: "세금계산서", taxInvoiceStatus: "발행 예정", taxInvoiceIssueDate: "2026-09-02" }],
    }) as never);
    const taxItems = items.filter((item) => item.taxInvoiceItemId);

    expect(taxItems).toHaveLength(1);
    expect(scheduleItemFocusTarget(taxItems[0])).toMatchObject({
      portal: "sales",
      id: "sales-primary",
      salesKind: "equipment",
      openEditor: true,
    });
  });

  it("opens every planned tax-invoice schedule in its owning detail editor", () => {
    const items = collectScheduleItems(emptyData({
      notes: [{ id: "sales-tax", company: "장비 고객사", billingMethod: "세금계산서", taxInvoiceStatus: "발행 예정", taxInvoiceIssueDate: "2026-09-02" }],
      materialSalesNotes: [{ id: "material-tax", company: "소재 고객사", billingMethod: "세금계산서", taxInvoiceStatus: "발행 예정", taxInvoiceIssueDate: "2026-09-02" }],
      settlementTasks: [{
        id: "settlement-tax",
        company: "정산 고객사",
        paymentType: "분할 결제",
        status: "예정",
        paymentSchedule: [{ id: "payment-tax", billingMethod: "세금계산서", taxInvoiceStatus: "발행 예정", taxInvoicePlannedDate: "2026-09-02" }],
      }],
      outputTasks: [{ id: "output-tax", title: "출력 업무", status: "진행 중", billingMethod: "세금계산서", taxInvoiceStatus: "발행 예정", taxInvoiceIssueDate: "2026-09-02" }],
    }) as never);
    const taxItems = items.filter((item) => item.taxInvoiceItemId);
    const targets = taxItems.map((item) => scheduleItemFocusTarget(item));

    expect(taxItems.map((item) => item.sourceId)).toEqual(expect.arrayContaining([
      "sales-tax", "material-tax", "settlement-tax", "output-tax",
    ]));
    expect(targets).toEqual(expect.arrayContaining([
      expect.objectContaining({ portal: "sales", id: "sales-tax", openEditor: true }),
      expect.objectContaining({ portal: "sales", id: "material-tax", salesKind: "material", openEditor: true }),
      expect.objectContaining({ portal: "settlement", id: "settlement-tax", settlementRowId: "payment-tax", openEditor: true }),
      expect.objectContaining({ portal: "output", id: "output-tax", openEditor: true }),
    ]));
  });
});
