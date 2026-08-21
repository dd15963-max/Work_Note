import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const companyPortalSource = appSource.slice(
  appSource.indexOf("function CustomerCompanyPortal"),
  appSource.indexOf("function InternalContactPortal")
);
const companyEditorSource = appSource.slice(
  appSource.indexOf("function CompanyEditor"),
  appSource.indexOf("function SalesPortal")
);

describe("customer contact editor", () => {
  it("adds a regular customer contact without headquarters-owner fields", () => {
    expect(companyEditorSource).toContain(
      'contacts: [...contacts, { id: createId("contact_"), name: "", department: "", title: "", phone: "", email: "", memo: "" }]'
    );
    expect(companyEditorSource).not.toContain("본사 담당자 연결");
    expect(companyEditorSource).not.toContain("InternalOwnerSelect");
    expect(companyEditorSource).not.toContain("internalContacts");
  });

  it("does not show legacy headquarters-owner links on customer company cards", () => {
    expect(companyPortalSource).not.toContain("CustomerInternalOwners");
    expect(companyPortalSource).not.toContain("internalOwnerInlineSummary");
  });
});
