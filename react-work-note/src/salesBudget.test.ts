import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeSalesBudget, prepareSalesBudget, saveSalesBudget } from "../../app/google-sheets/sales-budget";
import { equipmentSalesRow } from "../../app/google-sheets/team-share-contract";
import { SalesBudgetFields } from "./SalesBudgetFields";

describe("영업 예산 저장 및 시트 전송", () => {
  it.each([
    [undefined, ""], ["", ""], [0, "0"], [15000000, "15,000,000"],
    [" 5,000,000 ", "5,000,000"], ["미정", "미정"],
    ["5000000~10000000", "5,000,000~10,000,000"],
    ["5,000,000 ～ 10,000,000", "5,000,000~10,000,000"],
    ["0~1000", "0~1,000"], ["1000.25", "1,000.25"],
  ])("기존 값 및 새 예산 %s를 보존한다", (input, expected) => {
    expect(normalizeSalesBudget(input)).toBe(expected);
    const draft = prepareSalesBudget(input);
    const budgetAmount = saveSalesBudget(draft);
    expect(budgetAmount).toBe(expected);
    const saved = JSON.parse(JSON.stringify({ id: "note-1", sharedId: "sales-1", budgetAmount }));
    expect(saveSalesBudget(prepareSalesBudget(saved.budgetAmount))).toBe(expected);
    const row = equipmentSalesRow(saved, "백상민");
    expect(row).toHaveLength(13);
    expect(row[8]).toBe(expected);
    expect(row[12]).toBe("sales-1");
  });

  it.each(["100~50", "100~", "~200", "1~2~3", "-1", "NaN", "Infinity", "5,00", "=SUM(A1)", "9007199254740992"])(
    "잘못된 예산 %s는 빈칸으로 바꾸지 않고 거부한다", (value) => {
      expect(() => normalizeSalesBudget(value)).toThrow();
    },
  );

  it("범위 입력 양쪽과 순서를 확인한다", () => {
    expect(() => saveSalesBudget({ budgetType: "범위", budgetMinAmount: "5,000,000" })).toThrow("모두 입력");
    expect(() => saveSalesBudget({ budgetType: "범위", budgetMinAmount: "10", budgetMaxAmount: "5" })).toThrow("클 수 없습니다");
  });

  it("예산 유형을 바꿔도 이전 유형의 값이 시트에 섞이지 않는다", () => {
    const draft = { budgetType: "범위", budgetAmount: "100", budgetMinAmount: "5000000", budgetMaxAmount: "10000000" };
    expect(saveSalesBudget(draft)).toBe("5,000,000~10,000,000");
    expect(saveSalesBudget({ ...draft, budgetType: "미정" })).toBe("미정");
    expect(saveSalesBudget({ ...draft, budgetType: "금액" })).toBe("100");
    expect(saveSalesBudget({ budgetAmount: "15000000" })).toBe("15,000,000");
  });

  it("유형에 필요한 입력란만 렌더링한다", () => {
    const render = (value: string) => renderToStaticMarkup(createElement(SalesBudgetFields, {
      draft: prepareSalesBudget(value), setDraft: () => {},
    }));
    expect(render("5000000")).toContain("예산 금액");
    expect(render("5000000")).not.toContain("최소 예산");
    expect(render("5000000~10000000")).toContain("최소 예산");
    expect(render("5000000~10000000")).toContain("최대 예산");
    expect(render("미정")).not.toContain("<input");
  });

  it("편집·저장에 예산 전용 처리를 연결하고 시트 추가·갱신 모두 RAW 값을 사용한다", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    expect(source).toContain("<SalesBudgetFields draft={draft} setDraft={setDraft} />");
    expect(source).toContain("...prepareSalesBudget(note.budgetAmount)");
    expect(source).toContain("budgetAmount: saveSalesBudget(draft)");
    expect(source).not.toContain('budgetAmount: normalizeAmountString(firstText(draft, ["budgetAmount"]))');
    const server = readFileSync(new URL("../../app/google-sheets/team-share.ts", import.meta.url), "utf8");
    expect(server).toContain("?valueInputOption=RAW");
    expect(server).toContain(":append?valueInputOption=RAW");
  });
});
