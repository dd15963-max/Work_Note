import { describe, expect, it } from "vitest";
import { calendarWorkTitle } from "./calendarWorkTitle";

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
});
