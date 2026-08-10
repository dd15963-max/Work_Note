import { describe, expect, it } from "vitest";
import {
  chooseCanonicalFolder,
  evaluateCleanupCandidate,
  managedFolderKeys,
  memoFolderCollisionName,
  normalizeCompanyFolderKey,
  normalizeCompanyFolderName,
  rankCanonicalFolderCandidates,
  resolveManagedMemoIdentity,
  type AttachmentOwnerContext,
  type CanonicalFolderCandidate,
} from "../../../app/google-drive/organization";

type FolderFixture = CanonicalFolderCandidate & {
  fileIds?: string[];
};

function managedFolder(
  folderId: string,
  overrides: Partial<FolderFixture> = {},
): FolderFixture {
  return {
    folderId,
    name: "업체 미정",
    createdTime: "2026-01-01T00:00:00.000Z",
    healthyRegistry: false,
    managedByWorkNote: true,
    attachmentReferences: 0,
    fileIds: [],
    ...overrides,
  };
}

function context(companyName: string, memoId = "memo-a"): AttachmentOwnerContext {
  return {
    companyId: `company:${normalizeCompanyFolderKey(companyName)}`,
    companyName,
    companyKey: normalizeCompanyFolderKey(companyName),
    memoId,
    memoTitle: "견적",
    category: "기타",
  };
}

describe("Google Drive canonical folder 필수 시나리오", () => {
  it("[1] 업체 미정 관리 폴더가 이미 있으면 canonical로 재사용한다", () => {
    const existing = managedFolder("unknown-existing", { healthyRegistry: true });

    expect(normalizeCompanyFolderName(" \n ")).toBe("업체 미정");
    expect(chooseCanonicalFolder([existing])).toBe(existing);
  });

  it("[2] 동시 입력의 업체 미정 표현은 하나의 production managed key로 수렴한다", async () => {
    const names = ["", "  ", "\n", "업체 미정", "  업체   미정\n"];
    const keys = await Promise.all(
      Array.from({ length: 12 }, async (_, index) =>
        managedFolderKeys(context(names[index % names.length])).company),
    );

    expect(new Set(keys)).toEqual(new Set(["company-name:업체 미정"]));
  });

  it("[3] 기존 업체 미정 후보에서 D1 canonical과 정리 대상을 선택한다", () => {
    const registered = managedFolder("registered", {
      healthyRegistry: true,
      createdTime: "2026-02-01T00:00:00.000Z",
    });
    const duplicate = managedFolder("duplicate", {
      attachmentReferences: 3,
      createdTime: "2025-01-01T00:00:00.000Z",
    });

    expect(chooseCanonicalFolder([duplicate, registered])).toBe(registered);
    expect(evaluateCleanupCandidate({
      isRoot: false,
      managedByWorkNote: duplicate.managedByWorkNote,
      registeredInDatabase: true,
      hasChildren: false,
      hasFiles: false,
      hasActiveOperation: false,
      referencedByAnotherMemo: false,
    })).toEqual({ eligible: true, reason: "" });
  });

  it("[4] 앞뒤·연속 공백과 줄바꿈만 다른 업체명을 동일 key로 병합한다", () => {
    const noisy = context("  현대   모비스\n", "memo-a");
    const clean = context("현대 모비스", "memo-b");

    expect(noisy.companyKey).toBe(clean.companyKey);
    expect(managedFolderKeys(noisy).company).toBe(managedFolderKeys(clean).company);
  });

  it("[5] 대소문자·NFKC·금지문자 표현만 다른 영문 업체 중복을 만들지 않는다", () => {
    expect(normalizeCompanyFolderKey(" ＡＣＭＥ／KOREA ")).toBe(
      normalizeCompanyFolderKey("acme-korea"),
    );
  });

  it("[6] 제목이 같아도 memoId가 다른 메모 폴더는 별도 identity와 suffix를 쓴다", () => {
    const first = resolveManagedMemoIdentity({
      appProperties: { memoId: "memo-first" },
    });
    const second = resolveManagedMemoIdentity({
      registryMemoIds: ["memo-second"],
    });

    expect(first.memoId).not.toBe(second.memoId);
    expect(memoFolderCollisionName("동일 제목", second.memoId, ["동일 제목"]))
      .toBe("동일 제목_memo-sec");
  });

  it("[7] 동일 memoId 후보는 하나의 canonical로 선택되고 fixture 파일 ID는 유지된다", () => {
    const identityFromRegistry = resolveManagedMemoIdentity({
      registryMemoIds: ["memo-same"],
      appProperties: { memoId: "memo-same" },
    });
    const identityFromAttachment = resolveManagedMemoIdentity({
      attachmentOwnerIds: ["memo-same"],
      appProperties: { ownerId: "memo-same" },
    });
    const canonical = managedFolder("memo-canonical", {
      healthyRegistry: true,
      fileIds: ["drive-file-a"],
    });
    const duplicate = managedFolder("memo-duplicate", {
      attachmentReferences: 2,
      fileIds: ["drive-file-b", "drive-file-c"],
    });

    expect(identityFromRegistry).toEqual({ memoId: "memo-same", conflict: false });
    expect(identityFromAttachment).toEqual(identityFromRegistry);
    expect(chooseCanonicalFolder([duplicate, canonical])).toBe(canonical);
    expect([...canonical.fileIds!, ...duplicate.fileIds!]).toEqual([
      "drive-file-a",
      "drive-file-b",
      "drive-file-c",
    ]);
  });

  it("[8] cleanup predicate는 어떤 종류든 child가 남은 관리 폴더를 제외한다", () => {
    const childTypes = [
      "application/pdf",
      "application/vnd.google-apps.document",
      "application/vnd.google-apps.shortcut",
    ];

    for (const childType of childTypes) {
      const result = evaluateCleanupCandidate({
        isRoot: false,
        managedByWorkNote: true,
        registeredInDatabase: true,
        hasChildren: true,
        hasFiles: childType === "application/pdf",
        hasActiveOperation: false,
        referencedByAnotherMemo: false,
      });
      expect(result, childType).toEqual({
        eligible: false,
        reason: "파일 또는 하위 폴더가 있음",
      });
    }
  });

  it("[9] 사용자가 직접 만든 동명 폴더는 cleanup 대상이 아니다", () => {
    expect(evaluateCleanupCandidate({
      isRoot: false,
      managedByWorkNote: false,
      registeredInDatabase: false,
      hasChildren: false,
      hasFiles: false,
      hasActiveOperation: false,
      referencedByAnotherMemo: false,
    })).toEqual({
      eligible: false,
      reason: "Work Note 관리 폴더로 확인되지 않음",
    });
  });

  it("[10] Work Note 루트는 어떤 경우에도 cleanup 대상이 아니다", () => {
    expect(evaluateCleanupCandidate({
      isRoot: true,
      managedByWorkNote: true,
      registeredInDatabase: true,
      hasChildren: false,
      hasFiles: false,
      hasActiveOperation: false,
      referencedByAnotherMemo: false,
    })).toEqual({ eligible: false, reason: "Work Note 루트 폴더" });
  });
});

describe("canonical 우선순위", () => {
  it("D1 > appProperties > 참조수 > createdTime 순서로 선택한다", () => {
    const candidates = [
      managedFolder("oldest", {
        managedByWorkNote: false,
        attachmentReferences: 1,
        createdTime: "2020-01-01T00:00:00.000Z",
      }),
      managedFolder("most-references", { attachmentReferences: 20 }),
      managedFolder("app-properties", { attachmentReferences: 0 }),
      managedFolder("d1", {
        healthyRegistry: true,
        managedByWorkNote: false,
        attachmentReferences: 0,
      }),
    ];

    expect(rankCanonicalFolderCandidates(candidates).map((item) => item.folderId))
      .toEqual(["d1", "most-references", "app-properties", "oldest"]);
  });
});
