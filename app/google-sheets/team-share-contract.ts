export const DEFAULT_TEAM_SHEET_NAME = "영업 리드 건 관리";
export const TEAM_SHEET_HEADERS = [
  "sharedId",
  "담당자",
  "업무 유형",
  "업체",
  "업무 제목",
  "상태",
  "시작일",
  "종료일",
  "최종 수정일",
] as const;

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
  nextAction?: unknown;
  interest?: unknown;
  itemCategory?: unknown;
  status?: unknown;
  meetingDate?: unknown;
  nextContactDate?: unknown;
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

export function validateHeaderRow(values: unknown[][] | undefined): "empty" | "valid" {
  const row = Array.isArray(values?.[0]) ? values![0].map((value) => String(value ?? "").trim()) : [];
  if (row.length === 0 || row.every((value) => !value)) return "empty";
  const valid = TEAM_SHEET_HEADERS.every((header, index) => row[index] === header);
  if (!valid) {
    throw new Error(`시트 1행은 다음 헤더여야 합니다: ${TEAM_SHEET_HEADERS.join(" | ")}`);
  }
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

export function equipmentSalesRow(
  note: EquipmentSalesShareNote,
  displayName: string,
): string[] {
  return [
    text(note.sharedId),
    text(displayName),
    "영업",
    text(note.company) || (note.companyUnknown ? "미정" : ""),
    text(note.nextAction) || text(note.interest) || text(note.itemCategory) || "영업 업무",
    text(note.status),
    text(note.meetingDate),
    text(note.nextContactDate),
    text(note.updatedAt),
  ];
}
