export const DEFAULT_TEAM_SHEET_NAME = "영업 리드 건 관리";
export const TEAM_SHEET_VISIBLE_HEADERS = [
  "타임라인",
  "담당자",
  "구분(직판, 협력)",
  "고객사 명",
  "고객사 담당자",
  "연락처",
  "이메일",
  "관심제품",
  "예산",
  "견적발송여부",
  "진행상태",
  "세부내용",
] as const;
export const TEAM_SHEET_HEADERS = [...TEAM_SHEET_VISIBLE_HEADERS, "sharedId"] as const;
export const TEAM_SHEET_ID_COLUMN = "M";

export type TeamShareSettings = {
  configured: boolean;
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheetName: string;
  displayName: string;
  verifiedAt: string;
  googleConnected: boolean;
  sheetsAuthorized: boolean;
  googleEmail: string;
};

export type EquipmentSalesShareNote = {
  id: string;
  sharedId: string;
  company?: unknown;
  companyUnknown?: unknown;
  contactName?: unknown;
  contactPhone?: unknown;
  contactEmail?: unknown;
  interest?: unknown;
  salesChannel?: unknown;
  partnerCompany?: unknown;
  partnerContactName?: unknown;
  budgetAmount?: unknown;
  quoteStatus?: unknown;
  status?: unknown;
  memo?: unknown;
  updatedAt?: unknown;
};

export function parseSpreadsheetId(value: string): string {
  const trimmed = String(value || "").trim();
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const id = urlMatch?.[1] || trimmed;
  if (!/^[a-zA-Z0-9_-]{20,}$/.test(id)) {
    throw new Error("Google Sheets 주소 또는 스프레드시트 ID를 확인해 주세요.");
  }
  return id;
}

export function quoteSheetName(sheetName: string): string {
  return `'${String(sheetName).replace(/'/g, "''")}'`;
}

export function validateHeaderRow(
  values: unknown[][] | undefined,
): "empty" | "needs_shared_id" | "valid" {
  const row = Array.isArray(values?.[0])
    ? values![0].map((value) => String(value ?? "").trim())
    : [];
  if (row.length === 0 || row.every((value) => !value)) return "empty";
  const visibleHeadersValid = TEAM_SHEET_VISIBLE_HEADERS.every(
    (header, index) => row[index] === header,
  );
  if (!visibleHeadersValid) {
    throw new Error(`시트 1행은 다음 헤더여야 합니다: ${TEAM_SHEET_VISIBLE_HEADERS.join(" | ")}`);
  }
  if (!row[12]) return "needs_shared_id";
  if (row[12] !== "sharedId") throw new Error("숨김 식별자 열(M1)은 sharedId여야 합니다.");
  return "valid";
}

export function findSharedIdRows(values: unknown[][] | undefined, sharedId: string): number[] {
  if (!Array.isArray(values)) return [];
  const rows: number[] = [];
  values.forEach((row, index) => {
    if (String(row?.[0] ?? "").trim() === sharedId) rows.push(index + 2);
  });
  return rows;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

export function resolveTeamShareAssignee(
  displayName: unknown,
  googleEmail: unknown,
  userEmail: unknown,
): string {
  return text(displayName) || text(googleEmail) || text(userEmail);
}

export function formatTimeline(value: unknown): string {
  const parsed = new Date(text(value));
  if (Number.isNaN(parsed.getTime())) return text(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(parsed);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}

export function formatSalesChannelForSheet(note: EquipmentSalesShareNote): string {
  const channel = text(note.salesChannel) || "직판";
  if (channel !== "협력") return channel;
  const partner = [text(note.partnerCompany), text(note.partnerContactName)].filter(Boolean).join("/");
  return partner ? `협력(${partner})` : channel;
}

export function equipmentSalesRow(
  note: EquipmentSalesShareNote,
  displayName: string,
): string[] {
  return [
    formatTimeline(note.updatedAt),
    text(displayName),
    formatSalesChannelForSheet(note),
    text(note.company) || (note.companyUnknown ? "미정" : ""),
    text(note.contactName),
    text(note.contactPhone),
    text(note.contactEmail),
    text(note.interest),
    text(note.budgetAmount),
    text(note.quoteStatus),
    text(note.status),
    text(note.memo),
    text(note.sharedId),
  ];
}
