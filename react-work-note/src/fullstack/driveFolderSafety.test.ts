import { describe, expect, it } from "vitest";
import {
  folderActivityBlocksCleanup,
  isCompanyAliasCandidateEligible,
} from "../../../app/google-drive/folder-safety";

describe("managed folder safety helpers", () => {
  it.each([
    ["active upload session", { activeUploadSession: true, activeAttachmentOperation: false, activeFolderLock: false }],
    ["active attachment operation", { activeUploadSession: false, activeAttachmentOperation: true, activeFolderLock: false }],
    ["active folder lock", { activeUploadSession: false, activeAttachmentOperation: false, activeFolderLock: true }],
  ])("blocks cleanup during %s", (_label, facts) => {
    expect(folderActivityBlocksCleanup(facts)).toBe(true);
  });

  it("allows cleanup activity gate only when every operation signal is inactive", () => {
    expect(folderActivityBlocksCleanup({
      activeUploadSession: false,
      activeAttachmentOperation: false,
      activeFolderLock: false,
    })).toBe(false);
  });

  it("rejects a company-name alias when Drive evidence belongs to another company id", () => {
    expect(isCompanyAliasCandidateEligible({
      aliasKey: "company-name:업체 미정",
      expectedCompanyId: "company-expected",
      expectedCompanyKey: "업체 미정",
      driveFolderName: "업체 미정",
      driveCompanyId: "company-other",
      driveCanonicalCompanyKey: "업체 미정",
    })).toBe(false);
  });
});
