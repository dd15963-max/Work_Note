import { describe, expect, it } from "vitest";
import { calendarWorkTitle, outputCalendarTitle } from "./calendarWorkTitle";

describe("calendarWorkTitle", () => {
  it("uses the saved output task title instead of output type or memo", () => {
    expect(calendarWorkTitle({
      title: "IML16K 샘플 출력",
      outputType: "BMT",
      memo: "금요일 납품",
    }, "output")).toBe("IML16K 샘플 출력");
  });

  it("uses the saved other-task title with the same rule", () => {
    expect(calendarWorkTitle({ title: "전시회 준비", category: "내부" }, "other"))
      .toBe("전시회 준비");
  });

  it("uses a neutral fallback only for legacy records without a title", () => {
    expect(calendarWorkTitle({ outputType: "샘플 출력" }, "output")).toBe("출력 업무");
    expect(calendarWorkTitle({ category: "행정" }, "other")).toBe("기타 업무");
  });

  it("formats output calendar labels as related company and task title", () => {
    expect(outputCalendarTitle({ company: "현대자동차", title: "FR 사양 검토", outputType: "BMT" }))
      .toBe("[출력] 현대자동차 - FR 사양 검토");
    expect(outputCalendarTitle({ title: "FR 사양 검토", outputType: "BMT" }))
      .toBe("[출력] FR 사양 검토");
  });

  it("does not show a stale company when the task is marked company-unknown", () => {
    expect(outputCalendarTitle({ company: "과거 업체", companyUnknown: true, title: "샘플 출력" }))
      .toBe("[출력] 샘플 출력");
  });
});
