import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { summarizeOperationRows } from "../../../app/google-drive/status-contract";
import { clearRemoteRuntime, flushPendingAttachments, initializeRemoteRuntime } from "./repository";

const rootSource = readFileSync(new URL("./FullstackRoot.tsx", import.meta.url), "utf8");
const repositorySource = readFileSync(new URL("./repository.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("./migration.ts", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../../../app/api/workspace/route.ts", import.meta.url), "utf8");
const organizeSource = readFileSync(new URL("../../../app/api/google-drive/organize/route.ts", import.meta.url), "utf8");
const statusSource = readFileSync(new URL("../../../app/api/google-drive/status/route.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

describe("Work Note performance policy", () => {
  it("opens after dataset recovery and flushes attachment retries in the background", () => {
    expect(rootSource).toContain("await flushPendingDataset();");
    expect(rootSource).toContain('if (state !== "ready") return;');
    expect(rootSource).toContain("void flushPendingAttachments()");
    expect(repositorySource).toContain("const remote = await getRemoteAttachmentMetadata(id);");
    expect(repositorySource).toContain("isFullySynchronizedAttachment(remote)");
  });

  it("clears stale pending IDs without re-uploading files already synchronized", async () => {
    const values = new Map([["workNotePendingAttachmentSyncV1", JSON.stringify(["synced-file"])]]);
    const localStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: () => null,
      get length() { return values.size; },
    } as Storage;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("/api/files?id=synced-file&metadata=1");
      return Response.json({
        id: "synced-file", syncStatus: "synced", driveFileId: "drive-file",
        sourceStatus: "available", sourceAvailable: true,
      });
    });
    vi.stubGlobal("window", {
      localStorage, addEventListener: vi.fn(),
      setTimeout, clearTimeout,
    });
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", fetchMock);
    try {
      initializeRemoteRuntime({ id: "user-1", email: "user@example.com" });
      await flushPendingAttachments();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem("workNotePendingAttachmentSyncV1")).toBeNull();
    } finally {
      clearRemoteRuntime();
      vi.unstubAllGlobals();
    }
  });

  it("skips files that are already safely synchronized during migration", () => {
    expect(migrationSource).toContain("refreshRemoteAttachments([...attachmentReferences.keys()])");
    expect(migrationSource).toContain("isFullySynchronizedRemoteAttachment(remote)");
    expect(migrationSource).toContain("clearPendingAttachmentSync(id)");
  });

  it("separates dataset persistence from deferred Drive organization", () => {
    const putStart = workspaceSource.indexOf("export async function PUT");
    const postStart = workspaceSource.indexOf("export async function POST", putStart);
    const putSource = workspaceSource.slice(putStart, postStart);
    expect(putSource).not.toContain("synchronizeAttachmentFoldersForDataset");
    expect(repositorySource).toContain("scheduleDriveDatasetOrganization();");
    expect(organizeSource).toContain('action === "sync-dataset"');
  });

  it("loads expensive Drive quota details on demand and aggregates operation history", () => {
    expect(rootSource).toContain("getGoogleDriveStatus(includeQuota)");
    expect(statusSource).toContain('searchParams.get("includeQuota") === "1"');
    expect(statusSource).toContain("COUNT(*) AS count");
    expect(statusSource).toContain("GROUP BY operation_type, status");
    expect(summarizeOperationRows([{ operation_type: "duplicate_folder_merge_batch", status: "completed", updated_at: "2026-08-21", count: 12 }]).mergeCompletedCount).toBe(12);
  });

  it("throttles synchronous full-data snapshots while preserving destructive backups", () => {
    expect(appSource).toContain("REACT_AUTOSNAPSHOT_INTERVAL_MS = 5 * 60 * 1000");
    expect(appSource).toContain("const forceSnapshot = /삭제|교체|초기화|병합|가져오기/.test(reason)");
    expect(appSource).not.toContain("JSON.parse(raw);");
  });
});
