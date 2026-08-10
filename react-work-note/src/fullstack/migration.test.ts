import { describe, expect, it } from "vitest";
import { countWorkNoteData } from "./migration";
import type { WorkNoteData } from "./types";

function emptyData(): WorkNoteData {
  return {
    version: "react-work-note-v1",
    updatedAt: "2026-07-27T00:00:00.000Z",
    generalMemos: [],
    companies: [],
    internalContacts: [],
    notes: [],
    materialSalesNotes: [],
    settlementTasks: [],
    outputTasks: [],
    otherTasks: [],
    accounts: []
  };
}

describe("migration attachment counts", () => {
  it("counts only unique attachment ids referenced by current records", () => {
    const data = emptyData();
    data.notes = [{ id: "sales-1", attachments: [{ id: "file-a" }, { id: "file-a" }] }];
    data.outputTasks = [{ id: "output-1", attachments: [{ id: "file-b" }, { name: "legacy-without-id.pdf" }] }];

    const counts = countWorkNoteData(data);

    expect(counts.attachments).toBe(2);
    expect(counts.equipmentSales).toBe(1);
    expect(counts.outputTasks).toBe(1);
  });
});