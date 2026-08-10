import { describe, expect, it } from "vitest";
import { resolveAttachmentOwnerContext } from "../../../app/google-drive/organization";

describe("general memo Drive organization", () => {
  it("uses the linked company and memo title without changing the Drive structure", () => {
    const context = resolveAttachmentOwnerContext({
      dataset: {
        companies: [{ id: "company-1", name: "Example Tech" }],
        generalMemos: [{ id: "memo-1", title: "Weekly note", companyId: "company-1" }],
      },
      ownerKind: "memo",
      ownerLocalId: "memo-1",
      fileName: "check.pdf",
      category: "Other",
    });

    expect(context).toMatchObject({
      companyName: "Example Tech",
      memoId: "memo-1",
      memoTitle: "Weekly note",
    });
  });

  it("keeps an unlinked memo under the existing unknown-company convention", () => {
    const context = resolveAttachmentOwnerContext({
      dataset: { generalMemos: [{ id: "memo-2", title: "General idea" }] },
      ownerKind: "memo",
      ownerLocalId: "memo-2",
      fileName: "idea.txt",
    });

    expect(context.companyName).toBe("\uC5C5\uCCB4 \uBBF8\uC815");
    expect(context.memoTitle).toBe("General idea");
  });
});
