import { describe, expect, it } from "vitest";
import { generalMemoMatches, normalizeGeneralMemo, sortGeneralMemosByUpdatedAt } from "./generalMemo";

describe("general memo records", () => {
  it("normalizes a fast memo and keeps an optional company relation", () => {
    const memo = normalizeGeneralMemo(
      { title: "  금주 확인사항  ", content: "  장비 일정 확인  ", companyId: "company-1" },
      [{ id: "company-1", name: "예시테크" }],
      () => "memo-1",
      "2026-08-10T01:00:00.000Z",
    );
    expect(memo).toMatchObject({
      id: "memo-1",
      title: "금주 확인사항",
      content: "장비 일정 확인",
      companyId: "company-1",
      company: "예시테크",
      attachments: [],
    });
  });

  it("searches title, content, and company and sorts by recent update", () => {
    const records = [
      { id: "old", title: "SIMTOS", content: "아이디어", company: "", updatedAt: "2026-08-01T00:00:00.000Z" },
      { id: "new", title: "재료 확인", content: "수량 체크", company: "예시테크", updatedAt: "2026-08-09T00:00:00.000Z" },
    ];
    expect(records.filter((record) => generalMemoMatches(record, "예시테크"))).toHaveLength(1);
    expect(records.filter((record) => generalMemoMatches(record, "아이디어"))).toHaveLength(1);
    expect(sortGeneralMemosByUpdatedAt(records)[0].id).toBe("new");
  });
});
