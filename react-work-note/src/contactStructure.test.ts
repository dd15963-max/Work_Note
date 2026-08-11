import { describe, expect, it } from "vitest";
import {
  collectRelatedContactOptions,
  migrateCompanyContactStructure,
  normalizeCompanyType,
  resolveRelatedContacts,
} from "./contactStructure";
import type { WorkNoteData } from "./fullstack/types";

function data(overrides: Partial<WorkNoteData> = {}): WorkNoteData {
  return {
    version: "test",
    updatedAt: "",
    generalMemos: [],
    companies: [],
    internalContacts: [],
    notes: [],
    materialSalesNotes: [],
    settlementTasks: [],
    outputTasks: [],
    otherTasks: [],
    accounts: [],
    ...overrides,
  };
}

describe("company and related contact structure", () => {
  it("keeps legacy customers and creates a stable headquarters company without deleting data", () => {
    const migrated = migrateCompanyContactStructure(data({
      companies: [{ id: "customer-1", name: "현대모비스", contacts: [{ id: "customer-contact", name: "김주환" }] }],
      internalContacts: [{ id: "internal-1", name: "한동훈", title: "차장" }],
    }));

    expect(normalizeCompanyType(migrated.companies[0])).toBe("customer");
    expect(migrated.companies[0].contacts).toEqual([expect.objectContaining({ id: "customer-contact", name: "김주환" })]);
    expect(migrated.companies).toContainEqual(expect.objectContaining({ id: "company_headquarters_default", companyType: "headquarters" }));
    expect(migrated.internalContacts[0]).toEqual(expect.objectContaining({
      id: "internal-1",
      companyId: "company_headquarters_default",
      companyType: "headquarters",
      name: "한동훈",
    }));
  });

  it("indexes only headquarters and partner people for reusable related-contact selection", () => {
    const current = data({
      companies: [
        { id: "customer-1", name: "고객사", companyType: "customer", contacts: [{ id: "customer-contact", name: "고객 담당자" }] },
        { id: "partner-1", name: "ABC테크", companyType: "partner", contacts: [
          { id: "partner-contact", name: "홍길동", title: "과장", phone: "010" },
          { id: "self-contact", name: "나", isSelf: true },
        ] },
      ],
      internalContacts: [{ id: "internal-1", name: "한동훈", title: "차장" }],
    });

    expect(collectRelatedContactOptions(current)).toEqual([
      expect.objectContaining({ id: "internal-1", companyType: "headquarters", name: "한동훈" }),
      expect.objectContaining({ id: "partner-contact", companyType: "partner", companyName: "ABC테크", name: "홍길동" }),
    ]);
  });

  it("migrates a matching legacy generic assignee to IDs and resolves later contact edits", () => {
    const migrated = migrateCompanyContactStructure(data({
      companies: [{ id: "partner-1", name: "ABC테크", companyType: "partner", contacts: [{ id: "partner-contact", name: "홍길동", title: "과장" }] }],
      otherTasks: [{ id: "task-1", title: "검토", owner: "홍길동" }],
    }));
    expect(migrated.otherTasks[0].relatedContactIds).toEqual(["partner-contact"]);

    const edited = {
      ...migrated,
      companies: migrated.companies.map((company) => company.id === "partner-1"
        ? { ...company, contacts: [{ id: "partner-contact", name: "홍길동", title: "부장", email: "new@example.com" }] }
        : company),
    };
    expect(resolveRelatedContacts(edited.otherTasks[0], edited)).toEqual([
      expect.objectContaining({ id: "partner-contact", position: "부장", email: "new@example.com" }),
    ]);
    expect(edited.otherTasks[0]).not.toHaveProperty("relatedContactEmail");
  });
});
