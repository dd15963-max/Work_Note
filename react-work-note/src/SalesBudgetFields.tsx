import type { AnyRecord } from "./fullstack/types";

export function SalesBudgetFields({ draft, setDraft }: {
  draft: AnyRecord;
  setDraft: (draft: AnyRecord) => void;
}) {
  const mode = String(draft.budgetType || "금액");
  const update = (key: string, value: string) => setDraft({ ...draft, [key]: value });
  const input = (key: string, label: string, placeholder: string) => (
    <label className="field">
      <span>{label}</span>
      <input type="text" inputMode="decimal" value={String(draft[key] ?? "")}
        onChange={(event) => update(key, event.target.value)} placeholder={placeholder} />
    </label>
  );

  return (
    <div className="form-grid wide-field" role="group" aria-label="예산 설정">
      <label className="field">
        <span>예산 설정</span>
        <select value={mode} onChange={(event) => update("budgetType", event.target.value)}>
          <option value="금액">금액</option>
          <option value="범위">범위</option>
          <option value="미정">미정</option>
        </select>
      </label>
      {mode === "금액" && input("budgetAmount", "예산 금액", "예: 5,000,000")}
      {mode === "범위" && <>
        <div className="selection-summary"><span>최소·최대 금액을 입력하세요. 시트에도 범위로 표시됩니다.</span></div>
        {input("budgetMinAmount", "최소 예산", "예: 5,000,000")}
        {input("budgetMaxAmount", "최대 예산", "예: 10,000,000")}
      </>}
      {mode === "미정" && <div className="selection-summary"><span>예산을 미정으로 저장하고 시트에도 ‘미정’으로 표시합니다.</span></div>}
    </div>
  );
}
