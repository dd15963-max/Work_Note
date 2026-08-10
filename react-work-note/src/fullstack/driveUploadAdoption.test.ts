import { describe, expect, it } from "vitest";
import { decideDriveFileAdoption } from "../../../app/google-drive/upload-adoption";

describe("Drive upload adoption guard", () => {
  it("[17] 서로 다른 폴더의 exact 후보가 둘이면 production decision은 create를 반환하지 않는다", () => {
    const files = ["one", "two"].map((id, index) => ({
      id,
      size: "164",
      parents: [`folder-${index + 1}`],
      appProperties: {
        managedBy: "work-note",
        attachmentId: "attachment-1",
        operationToken: "operation-1",
      },
    }));

    const decision = decideDriveFileAdoption(files, {
      attachmentId: "attachment-1",
      operationToken: "operation-1",
      totalBytes: 164,
    });

    expect(decision).toEqual({ kind: "duplicate", candidates: files });
  });
});
