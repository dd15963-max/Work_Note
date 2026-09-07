import { describe, expect, it } from "vitest";
import { collectDriveExplorerFiles, drivePathBreadcrumbs, listDriveFolderContents } from "./driveExplorer";
import type { WorkNoteData } from "./types";

function emptyData(): WorkNoteData {
  return {
    version: "1",
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
  };
}

describe("Drive folder explorer", () => {
  it("collects only Drive-synced attachments, including nested task rows", () => {
    const data = emptyData();
    data.generalMemos.push({
      id: "memo-1",
      title: "회의 메모",
      attachments: [{
        id: "file-1",
        fileName: "회의록.pdf",
        fileSize: 2048,
        driveFileId: "drive-1",
        drivePath: "Work Note/메모/회의 메모/기타/회의록.pdf",
        driveWebViewLink: "https://drive.google.com/file/d/drive-1/view",
      }, {
        id: "local-only",
        fileName: "대기중.pdf",
        syncStatus: "pending",
      }],
    });
    data.settlementTasks.push({
      id: "settlement-1",
      title: "9월 정산",
      paymentRows: [{
        id: "row-1",
        attachments: [{
          id: "file-2",
          fileName: "계산서.xlsx",
          driveFileId: "drive-2",
          drivePath: "Work Note/정산/9월 정산/계산서.xlsx",
        }],
      }],
    });

    const files = collectDriveExplorerFiles(data);
    expect(files).toHaveLength(2);
    expect(files.find((file) => file.id === "file-1")?.folderPath)
      .toBe("Work Note/메모/회의 메모/기타");
    expect(files.find((file) => file.id === "file-2")?.sourceLabel).toBe("정산");
    expect(files.some((file) => file.id === "local-only")).toBe(false);
  });

  it("lists immediate folders without collapsing distinct files", () => {
    const files = [
      { id: "1", fileName: "a.pdf", fileSize: 0, folderPath: "Work Note/영업/A", driveFileId: "1", driveWebViewLink: "", lastSyncedAt: "", sourceLabel: "영업", ownerTitle: "A" },
      { id: "2", fileName: "b.pdf", fileSize: 0, folderPath: "Work Note/영업/B", driveFileId: "2", driveWebViewLink: "", lastSyncedAt: "", sourceLabel: "영업", ownerTitle: "B" },
      { id: "3", fileName: "c.pdf", fileSize: 0, folderPath: "Work Note/출력", driveFileId: "3", driveWebViewLink: "", lastSyncedAt: "", sourceLabel: "출력", ownerTitle: "C" },
    ];

    const root = listDriveFolderContents(files, "");
    expect(root.folders).toEqual([{ name: "Work Note", path: "Work Note", fileCount: 3 }]);

    const workNote = listDriveFolderContents(files, "Work Note");
    expect(workNote.folders.map((folder) => [folder.name, folder.fileCount]))
      .toEqual([["영업", 2], ["출력", 1]]);

    const searched = listDriveFolderContents(files, "", "b.pdf");
    expect(searched.files.map((file) => file.id)).toEqual(["2"]);
  });

  it("builds clickable breadcrumb paths", () => {
    expect(drivePathBreadcrumbs("Work Note/영업/A")).toEqual([
      { name: "Work Note", path: "Work Note" },
      { name: "영업", path: "Work Note/영업" },
      { name: "A", path: "Work Note/영업/A" },
    ]);
  });
});
