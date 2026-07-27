import { describe, expect, it } from "vitest";
import { buildServerPayload } from "./serverPayload";
import type { WorkNoteData } from "./types";

function emptyData(overrides: Partial<WorkNoteData> = {}): WorkNoteData {
  return {
    version: "react-work-note-v1",
    updatedAt: "2026-07-27T00:00:00.000Z",
    companies: [],
    internalContacts: [],
    notes: [],
    materialSalesNotes: [],
    settlementTasks: [],
    outputTasks: [],
    otherTasks: [],
    accounts: [],
    ...overrides
  };
}

describe("buildServerPayload", () => {
  it("keeps stable source IDs for sales contact, meeting, and planned billing schedules", () => {
    const payload = buildServerPayload(emptyData({
      notes: [{
        id: "sales-1",
        company: "모나미",
        nextContactDate: "2026-07-27",
        meetingDate: "2026-07-28",
        billingMethod: "카드결제",
        taxInvoiceStatus: "발행 예정",
        taxInvoiceIssueDate: "2026-07-29",
        isImportant: true
      }]
    }));

    expect(payload.taskSchedules.map((item) => item.id)).toEqual([
      "equipment_sales:sales-1:contact:2026-07-27",
      "equipment_sales:sales-1:meeting:2026-07-28",
      "equipment_sales:sales-1:tax_invoice:2026-07-29"
    ]);
    expect(payload.taskSchedules[2]).toMatchObject({ sourceId: "sales-1", scheduleKind: "tax_invoice", title: "[영업] 모나미 카드결제", isImportant: true });
  });

  it("does not create billing schedules unless the status is planned", () => {
    const payload = buildServerPayload(emptyData({
      materialSalesNotes: [{ id: "material-1", company: "테스트", taxInvoiceStatus: "발행 완료", taxInvoiceIssueDate: "2026-07-27" }]
    }));
    expect(payload.taskSchedules).toHaveLength(0);
  });

  it("excludes weekends by default and includes them only when requested", () => {
    const base = { id: "output-1", title: "샘플 출력", status: "진행 중", startDate: "2026-07-24", endDate: "2026-07-27" };
    const weekdays = buildServerPayload(emptyData({ outputTasks: [base] })).taskSchedules;
    const allDays = buildServerPayload(emptyData({ outputTasks: [{ ...base, includeWeekends: true }] })).taskSchedules;
    expect(weekdays.map((item) => item.date)).toEqual(["2026-07-24", "2026-07-27"]);
    expect(allDays.map((item) => item.date)).toEqual(["2026-07-24", "2026-07-25", "2026-07-26", "2026-07-27"]);
  });

  it("does not emit work schedules for completed output and other tasks", () => {
    const payload = buildServerPayload(emptyData({
      outputTasks: [{ id: "output-done", title: "완료 출력", status: "완료", startDate: "2026-07-27", endDate: "2026-07-27" }],
      otherTasks: [{ id: "other-done", title: "완료 기타", status: "처리 완료", startDate: "2026-07-27", endDate: "2026-07-27" }]
    }));
    expect(payload.taskSchedules).toHaveLength(0);
  });

  it("keeps tax-only settlement rows out of payment schedules while preserving exact row navigation", () => {
    const payload = buildServerPayload(emptyData({
      settlementTasks: [{
        id: "settlement-1",
        company: "울산대학교 병원",
        paymentType: "분할 결제",
        paymentSchedule: [
          { id: "row-tax", isTaxInvoiceOnly: true, dueDate: "2026-07-27", billingMethod: "세금계산서", taxInvoiceStatus: "발행 예정", taxInvoicePlannedDate: "2026-07-30" },
          { id: "row-paid", status: "입금 완료", dueDate: "2026-07-28" },
          { id: "row-open", status: "예정", dueDate: "2026-07-29" }
        ]
      }]
    }));

    expect(payload.taskSchedules).toHaveLength(2);
    expect(payload.taskSchedules).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: "settlement-1", sourceRowId: "row-tax", scheduleKind: "tax_invoice", date: "2026-07-30" }),
      expect.objectContaining({ sourceId: "settlement-1", sourceRowId: "row-open", scheduleKind: "installment", date: "2026-07-29" })
    ]));
  });
});