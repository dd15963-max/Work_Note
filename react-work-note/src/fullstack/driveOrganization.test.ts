import { describe, expect, it } from "vitest";
import {
  buildDrivePath,
  classifyDriveFile,
  cleanupFolderTypeOrder,
  evaluateCleanupCandidate,
  managedFolderKeys,
  resolveAttachmentOwnerContext,
  sanitizeDriveFolderName,
} from "../../../app/google-drive/organization";

const dataset = {
  companies: [
    { id: "company-hyundai", name: "현대모비스" },
    { id: "company-a", name: "A 업체" },
  ],
  notes: [
    {
      id: "memo-quote",
      companyId: "company-hyundai",
      company: "현대모비스",
      title: "그리퍼 샘플 출력 및 견적 요청",
    },
    {
      id: "memo-unknown",
      companyUnknown: true,
      title: "업체 확인 전 요청",
    },
    {
      id: "memo-empty",
      companyUnknown: true,
      createdAt: "2026-07-30T06:30:00.000Z",
    },
  ],
};

function context(
  ownerLocalId = "memo-quote",
  category: unknown = "자동 분류",
  fileName = "현대모비스_IML16K_견적서.pdf",
) {
  return resolveAttachmentOwnerContext({
    dataset,
    ownerKind: "sales",
    ownerLocalId,
    metadata: {},
    fileName,
    mimeType: "application/pdf",
    category,
    uploadedAt: "2026-07-30T06:30:00.000Z",
  });
}

describe("Google Drive Work Note 폴더 구조", () => {
  it("1. 업체가 지정된 메모를 업체/메모/분류 경로로 만든다", () => {
    expect(buildDrivePath(context(), "현대모비스_IML16K_견적서.pdf"))
      .toBe("Work Note/현대모비스/그리퍼 샘플 출력 및 견적 요청/견적서/현대모비스_IML16K_견적서.pdf");
  });

  it("2. 업체 미정 메모는 업체 미정 폴더를 사용한다", () => {
    expect(context("memo-unknown", "기타", "note.txt").companyName).toBe("업체 미정");
  });

  it("3. 제목 없는 메모는 결정적인 제목 미정 폴더명을 사용한다", () => {
    expect(context("memo-empty", "기타", "note.txt").memoTitle).toBe("장비 영업");
  });

  it("4. 메모 제목 변경은 같은 메모 키를 유지하고 경로만 바꾼다", () => {
    const before = context();
    const after = resolveAttachmentOwnerContext({
      dataset: { ...dataset, notes: [{ ...dataset.notes[0], title: "변경된 제목" }] },
      ownerKind: "sales",
      ownerLocalId: "memo-quote",
      fileName: "견적서.pdf",
      category: "견적서",
    });
    expect(managedFolderKeys(after).memo).toBe(managedFolderKeys(before).memo);
    expect(after.memoTitle).toBe("변경된 제목");
  });

  it("5. 업체 미정에서 지정 업체로 변경해도 메모 키는 유지된다", () => {
    const before = context("memo-unknown", "기타", "note.txt");
    const after = resolveAttachmentOwnerContext({
      dataset: { ...dataset, notes: [{ id: "memo-unknown", companyId: "company-a", company: "A 업체", title: "업체 확인 전 요청" }] },
      ownerKind: "sales",
      ownerLocalId: "memo-unknown",
      fileName: "note.txt",
      category: "기타",
    });
    expect(before.companyName).toBe("업체 미정");
    expect(after.companyName).toBe("A 업체");
    expect(managedFolderKeys(after).memo).toBe(managedFolderKeys(before).memo);
  });

  it("6. 기타에서 견적서로 변경하면 분류 키와 경로가 바뀐다", () => {
    const before = context("memo-quote", "기타", "document.pdf");
    const after = context("memo-quote", "견적서", "document.pdf");
    expect(managedFolderKeys(before).category).not.toBe(managedFolderKeys(after).category);
    expect(buildDrivePath(after)).toContain("/견적서");
  });

  it("7. 정리 순서는 파일 종류→메모→업체다", () => {
    expect(["company", "category", "memo"].sort((a, b) => cleanupFolderTypeOrder(a) - cleanupFolderTypeOrder(b)))
      .toEqual(["category", "memo", "company"]);
  });

  it("8. 마지막 파일이 빠진 Work Note 관리 빈 메모 폴더는 정리 대상이다", () => {
    expect(evaluateCleanupCandidate({
      isRoot: false,
      managedByWorkNote: true,
      registeredInDatabase: true,
      hasChildren: false,
      hasFiles: false,
      hasActiveOperation: false,
      referencedByAnotherMemo: false,
    }).eligible).toBe(true);
  });

  it("9. 마지막 메모가 빠진 Work Note 관리 빈 업체 폴더도 정리 대상이다", () => {
    expect(evaluateCleanupCandidate({
      isRoot: false,
      managedByWorkNote: true,
      registeredInDatabase: true,
      hasChildren: false,
      hasFiles: false,
      hasActiveOperation: false,
      referencedByAnotherMemo: false,
    }).eligible).toBe(true);
  });

  it("10. Work Note 루트는 절대 정리하지 않는다", () => {
    expect(evaluateCleanupCandidate({
      isRoot: true,
      managedByWorkNote: true,
      registeredInDatabase: true,
      hasChildren: false,
      hasFiles: false,
      hasActiveOperation: false,
      referencedByAnotherMemo: false,
    }).eligible).toBe(false);
  });

  it("11. 사용자가 만든 미등록 폴더는 보호한다", () => {
    expect(evaluateCleanupCandidate({
      isRoot: false,
      managedByWorkNote: false,
      registeredInDatabase: false,
      hasChildren: false,
      hasFiles: false,
      hasActiveOperation: false,
      referencedByAnotherMemo: false,
    }).eligible).toBe(false);
  });

  it("12. 파일이나 하위 폴더가 있으면 정리하지 않는다", () => {
    expect(evaluateCleanupCandidate({
      isRoot: false,
      managedByWorkNote: true,
      registeredInDatabase: true,
      hasChildren: true,
      hasFiles: false,
      hasActiveOperation: false,
      referencedByAnotherMemo: false,
    }).eligible).toBe(false);
  });

  it("13. 동시 업로드는 동일한 관리 키를 사용한다", () => {
    expect(managedFolderKeys(context())).toEqual(managedFolderKeys(context()));
  });

  it("14. 동일 제목의 서로 다른 메모는 서로 다른 메모 키를 사용한다", () => {
    const first = context();
    const second = resolveAttachmentOwnerContext({
      dataset: { ...dataset, notes: [{ id: "memo-2", company: "현대모비스", title: first.memoTitle }] },
      ownerKind: "sales",
      ownerLocalId: "memo-2",
      fileName: "견적서.pdf",
      category: "견적서",
    });
    expect(managedFolderKeys(first).memo).not.toBe(managedFolderKeys(second).memo);
  });

  it("15. 같은 파일을 다시 판단해도 목표 경로와 키가 동일하다", () => {
    expect(buildDrivePath(context(), "견적서.pdf")).toBe(buildDrivePath(context(), "견적서.pdf"));
    expect(managedFolderKeys(context())).toEqual(managedFolderKeys(context()));
  });

  it("16. 업로드·이동 중인 폴더는 정리하지 않는다", () => {
    expect(evaluateCleanupCandidate({
      isRoot: false,
      managedByWorkNote: true,
      registeredInDatabase: true,
      hasChildren: false,
      hasFiles: false,
      hasActiveOperation: true,
      referencedByAnotherMemo: false,
    }).eligible).toBe(false);
  });

  it("17. 실패 후 이미 휴지통인 폴더는 반복 처리하지 않는다", () => {
    expect(evaluateCleanupCandidate({
      isRoot: false,
      managedByWorkNote: true,
      registeredInDatabase: true,
      hasChildren: false,
      hasFiles: false,
      hasActiveOperation: false,
      referencedByAnotherMemo: false,
      alreadyTrashed: true,
    }).eligible).toBe(false);
  });

  it("18. 폴더명 위험 문자와 줄바꿈을 안전하게 정리한다", () => {
    expect(sanitizeDriveFolderName("  A/B\\C: D\n  E  ")).toBe("A-B-C- D E");
  });
});

describe("파일 종류 자동 분류", () => {
  it.each([
    ["sample.stl", "application/octet-stream", "도면·3D파일"],
    ["result.jpg", "image/jpeg", "이미지"],
    ["quotation_final.pdf", "application/pdf", "견적서"],
    ["거래명세_7월.pdf", "application/pdf", "거래명세서"],
    ["tax invoice.pdf", "application/pdf", "세금계산서"],
    ["PO-2026.pdf", "application/pdf", "발주서"],
    ["delivery-check.pdf", "application/pdf", "납품서류"],
    ["contract.pdf", "application/pdf", "계약서"],
    ["shipping_invoice.pdf", "application/pdf", "발송서류"],
    ["Rigid_Black_TDS.pdf", "application/pdf", "기술자료"],
    ["unknown.bin", "application/octet-stream", "기타"],
  ])("%s → %s", (fileName, mimeType, expected) => {
    expect(classifyDriveFile("", fileName, mimeType)).toBe(expected);
  });

  it("사용자 지정 분류가 확장자보다 우선한다", () => {
    expect(classifyDriveFile("견적서", "model.stl", "application/octet-stream")).toBe("견적서");
  });
});
