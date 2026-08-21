import { describe, expect, it } from "vitest";
import {
  TEAM_SHEET_HEADERS,
  equipmentSalesRow,
  findSharedIdRows,
  parseSpreadsheetId,
  quoteSheetName,
  validateHeaderRow,
} from "../../../app/google-sheets/team-share-contract";

describe("Google Sheets 팀 공유 계약", () => {
  const spreadsheetId = "1I43menW9mxe5ip03EMr-gqxnyq3sgBYl_KupjrtP8tU";

  it("시트 URL과 ID에서 같은 spreadsheetId를 얻는다", () => {
    expect(parseSpreadsheetId(spreadsheetId)).toBe(spreadsheetId);
    expect(parseSpreadsheetId(
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?gid=1085792545#gid=1085792545`,
    )).toBe(spreadsheetId);
    expect(() => parseSpreadsheetId("not-a-sheet")).toThrow("Google Sheets 주소");
  });

  it("한글 및 작은따옴표가 있는 탭 이름을 안전한 A1 표기로 만든다", () => {
    expect(quoteSheetName("영업 리드 건 관리")).toBe("'영업 리드 건 관리'");
    expect(quoteSheetName("대표's 탭")).toBe("'대표''s 탭'");
  });

  it("빈 1행은 헤더 생성 대상으로 보고 정확한 헤더만 허용한다", () => {
    expect(validateHeaderRow(undefined)).toBe("empty");
    expect(validateHeaderRow([[]])).toBe("empty");
    expect(validateHeaderRow([[...TEAM_SHEET_HEADERS]])).toBe("valid");
    expect(() => validateHeaderRow([["다른 헤더"]])).toThrow("시트 1행");
  });

  it("장비 영업 업무를 고정된 9개 열로 매핑한다", () => {
    expect(equipmentSalesRow({
      id: "note-1",
      sharedId: "sales-uuid",
      company: "테스트 업체",
      nextAction: "견적 전달",
      interest: "장비 A",
      itemCategory: "3D 프린터",
      status: "미팅 예정",
      meetingDate: "2026-08-21",
      nextContactDate: "2026-08-28",
      updatedAt: "2026-08-21T01:02:03.000Z",
    }, "민수")).toEqual([
      "sales-uuid",
      "민수",
      "영업",
      "테스트 업체",
      "견적 전달",
      "미팅 예정",
      "2026-08-21",
      "2026-08-28",
      "2026-08-21T01:02:03.000Z",
    ]);
  });

  it("sharedId의 실제 행 번호를 찾고 중복도 감지할 수 있다", () => {
    expect(findSharedIdRows([["a"], ["target"], ["b"], ["target"]], "target"))
      .toEqual([3, 5]);
  });
});
