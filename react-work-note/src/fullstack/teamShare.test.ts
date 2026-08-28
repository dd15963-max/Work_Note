import { describe, expect, it } from "vitest";
import {
  TEAM_SHEET_HEADERS,
  TEAM_SHEET_VISIBLE_HEADERS,
  equipmentSalesRow,
  formatSalesChannelForSheet,
  findSharedIdRows,
  parseSpreadsheetId,
  quoteSheetName,
  resolveTeamShareAssignee,
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
    expect(validateHeaderRow([[...TEAM_SHEET_VISIBLE_HEADERS]])).toBe("needs_shared_id");
    expect(validateHeaderRow([[...TEAM_SHEET_HEADERS]])).toBe("valid");
    expect(() => validateHeaderRow([["다른 헤더"]])).toThrow("시트 1행");
  });

  it("장비 영업 업무를 12개 표시 열과 숨김 sharedId 열로 매핑한다", () => {
    expect(equipmentSalesRow({
      id: "note-1",
      sharedId: "sales-uuid",
      company: "테스트 업체",
      contactName: "고객 담당자",
      contactPhone: "010-1234-5678",
      contactEmail: "customer@example.com",
      interest: "장비 A",
      salesChannel: "협력",
      partnerCompany: "테스트 협력사",
      partnerContactName: "박파트너",
      budgetAmount: "15000000",
      quoteStatus: "발송 완료",
      status: "미팅 예정",
      memo: "상세 상담 내용",
      updatedAt: "2026-08-21T01:02:03.000Z",
    }, "bsmin@carima.co.kr")).toEqual([
      "2026-08-21 10:02",
      "bsmin@carima.co.kr",
      "협력(테스트 협력사/박파트너)",
      "테스트 업체",
      "고객 담당자",
      "010-1234-5678",
      "customer@example.com",
      "장비 A",
      "15000000",
      "발송 완료",
      "미팅 예정",
      "상세 상담 내용",
      "sales-uuid",
    ]);
  });

  it("협력 정보가 없거나 직판이면 기존 구분값을 유지한다", () => {
    expect(formatSalesChannelForSheet({ id: "1", sharedId: "1", salesChannel: "협력" })).toBe("협력");
    expect(formatSalesChannelForSheet({ id: "2", sharedId: "2", salesChannel: "직판", partnerCompany: "무시할 협력사", partnerContactName: "담당자" })).toBe("직판");
    expect(formatSalesChannelForSheet({ id: "3", sharedId: "3" })).toBe("직판");
  });

  it("sharedId의 실제 행 번호를 찾고 중복도 감지할 수 있다", () => {
    expect(findSharedIdRows([["a"], ["target"], ["b"], ["target"]], "target"))
      .toEqual([3, 5]);
  });

  it("설정한 담당자 이름을 이메일보다 우선한다", () => {
    expect(resolveTeamShareAssignee("백상민", "bsmin@carima.co.kr", "owner@example.com"))
      .toBe("백상민");
    expect(resolveTeamShareAssignee("", "bsmin@carima.co.kr", "owner@example.com"))
      .toBe("bsmin@carima.co.kr");
  });
});
