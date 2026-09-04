export type SalesBudgetInput = {
  budgetType?: unknown;
  budgetAmount?: unknown;
  budgetMinAmount?: unknown;
  budgetMaxAmount?: unknown;
};

const text = (value: unknown) => String(value ?? "").normalize("NFKC").trim();

function amount(value: string): number {
  const cleaned = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(cleaned)) {
    throw new Error("예산은 0 이상의 금액으로 입력해 주세요. 예: 5,000,000");
  }
  const number = Number(cleaned.replace(/,/g, ""));
  if (!Number.isFinite(number) || number > Number.MAX_SAFE_INTEGER) {
    throw new Error("예산 금액이 너무 큽니다.");
  }
  return number;
}

/** Shared by note saving and Sheets: never coerce an unknown/range budget to a number. */
export function normalizeSalesBudget(value: unknown): string {
  const source = text(value).replace(/[～〜]/g, "~");
  if (!source || source === "미정") return source;
  const parts = source.split("~");
  if (parts.length > 2 || parts.some((part) => !part.trim())) {
    throw new Error("예산 범위의 최소 금액과 최대 금액을 모두 입력해 주세요.");
  }
  const values = parts.map(amount);
  if (values.length === 2 && values[0] > values[1]) {
    throw new Error("예산의 최소 금액은 최대 금액보다 클 수 없습니다.");
  }
  return values.map((value) => value.toLocaleString("en-US", { maximumFractionDigits: 2 })).join("~");
}

export function prepareSalesBudget(value: unknown) {
  const source = text(value).replace(/[～〜]/g, "~");
  const parts = source.split("~");
  return {
    budgetType: source === "미정" ? "미정" : parts.length === 2 ? "범위" : "금액",
    budgetAmount: source === "미정" || parts.length === 2 ? "" : source,
    budgetMinAmount: parts.length === 2 ? parts[0].trim() : "",
    budgetMaxAmount: parts.length === 2 ? parts[1].trim() : "",
  };
}

export function saveSalesBudget(draft: SalesBudgetInput): string {
  if (draft.budgetType === "미정") return "미정";
  if (draft.budgetType === "범위") {
    const minimum = text(draft.budgetMinAmount);
    const maximum = text(draft.budgetMaxAmount);
    if (!minimum || !maximum) {
      throw new Error("예산 범위의 최소 금액과 최대 금액을 모두 입력해 주세요.");
    }
    return normalizeSalesBudget(`${minimum}~${maximum}`);
  }
  return normalizeSalesBudget(draft.budgetAmount);
}
