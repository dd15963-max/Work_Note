export type GeneralMemoRecord = Record<string, unknown>;

function text(record: GeneralMemoRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
}

export function generalMemoTitle(record: GeneralMemoRecord): string {
  return text(record, ["title", "subject", "name"]) || "제목 없는 메모";
}

export function generalMemoBody(record: GeneralMemoRecord): string {
  return text(record, ["content", "body", "memo", "description"]);
}

export function generalMemoCompanyName(record: GeneralMemoRecord): string {
  return text(record, ["company", "companyName", "relatedCompany"]);
}

export function generalMemoMatches(record: GeneralMemoRecord, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase("ko");
  if (!normalized) return true;
  return [generalMemoTitle(record), generalMemoBody(record), generalMemoCompanyName(record)]
    .some((value) => value.toLocaleLowerCase("ko").includes(normalized));
}

export function sortGeneralMemosByUpdatedAt(records: GeneralMemoRecord[]): GeneralMemoRecord[] {
  return [...records].sort((left, right) => {
    const leftUpdated = text(left, ["updatedAt", "createdAt"]);
    const rightUpdated = text(right, ["updatedAt", "createdAt"]);
    return rightUpdated.localeCompare(leftUpdated);
  });
}

export function normalizeGeneralMemo(
  draft: GeneralMemoRecord,
  companies: GeneralMemoRecord[],
  createId: () => string,
  now: string,
): GeneralMemoRecord {
  const companyId = text(draft, ["companyId", "relatedCompanyId"]);
  const company = companyId ? companies.find((item) => text(item, ["id"]) === companyId) : undefined;
  return {
    ...draft,
    id: text(draft, ["id"]) || createId(),
    title: text(draft, ["title"]),
    content: String(draft.content ?? draft.body ?? draft.memo ?? "").trim(),
    companyId: companyId && company ? companyId : "",
    company: company ? text(company, ["name", "companyName", "company", "clientName"]) : "",
    attachments: Array.isArray(draft.attachments) ? draft.attachments : [],
    createdAt: text(draft, ["createdAt"]) || now,
    updatedAt: now,
  };
}
