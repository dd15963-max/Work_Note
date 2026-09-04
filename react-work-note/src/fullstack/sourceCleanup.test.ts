import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { releaseVerifiedSource } from "../../../app/google-drive/source-cleanup-policy";

const eligible = { provider: "google_drive", syncStatus: "synced", driveFileId: "drive-file", fileSize: 1234 };
function operations() {
  return {
    driveMetadata: vi.fn(async () => ({ id: "drive-file", size: "1234", trashed: false })),
    stillEligible: vi.fn(async () => true),
    sourceHead: vi.fn(async (): Promise<{ size: number } | null> => ({ size: 1234 })),
    deleteSource: vi.fn(async () => undefined),
    markReleased: vi.fn(async () => undefined),
  };
}

describe("verified temporary site source cleanup", () => {
  it("deletes only after Drive verification and a fresh persisted-state check", async () => {
    const op = operations();
    expect(await releaseVerifiedSource(eligible, op)).toEqual({ status: "released", bytes: 1234 });
    expect(op.driveMetadata.mock.invocationCallOrder[0]).toBeLessThan(op.deleteSource.mock.invocationCallOrder[0]);
    expect(op.stillEligible.mock.invocationCallOrder[0]).toBeLessThan(op.deleteSource.mock.invocationCallOrder[0]);
    expect(op.deleteSource.mock.invocationCallOrder[0]).toBeLessThan(op.markReleased.mock.invocationCallOrder[0]);
  });

  it.each(["pending", "uploading", "failed", "retry_required", "reconnect_required"])("retains %s uploads", async (syncStatus) => {
    const op = operations();
    expect((await releaseVerifiedSource({ ...eligible, syncStatus }, op)).status).toBe("skipped");
    expect(op.driveMetadata).not.toHaveBeenCalled();
    expect(op.deleteSource).not.toHaveBeenCalled();
  });

  it.each(["completed", "동기화 완료"])("also handles older completed status %s", async (syncStatus) => {
    expect((await releaseVerifiedSource({ ...eligible, syncStatus }, operations())).status).toBe("released");
  });

  it("retains site-only files and files without a verified size or Drive ID", async () => {
    for (const input of [{ ...eligible, provider: "site_storage" }, { ...eligible, driveFileId: "" }, { ...eligible, fileSize: 0 }]) {
      const op = operations();
      expect((await releaseVerifiedSource(input, op)).status).toBe("skipped");
      expect(op.deleteSource).not.toHaveBeenCalled();
    }
  });

  it.each([
    { id: "different", size: "1234", trashed: false },
    { id: "drive-file", size: "1234", trashed: true },
    { id: "drive-file", size: "1235", trashed: false },
    { id: "drive-file", size: undefined, trashed: false },
  ])("retains files whose Drive metadata is not an exact match: %j", async (metadata) => {
    const op = { ...operations(), driveMetadata: vi.fn(async () => metadata) };
    expect((await releaseVerifiedSource(eligible, op)).status).toBe("skipped");
    expect(op.deleteSource).not.toHaveBeenCalled();
  });

  it("retains the source when Drive is missing, offline, or requires reconnecting", async () => {
    const op = operations();
    op.driveMetadata.mockRejectedValue(new Error("expired or missing"));
    expect((await releaseVerifiedSource(eligible, op)).status).toBe("failed");
    expect(op.deleteSource).not.toHaveBeenCalled();
    expect(op.markReleased).not.toHaveBeenCalled();
  });

  it("protects changed/shared sources and active uploads", async () => {
    const op = operations();
    op.stillEligible.mockResolvedValue(false);
    expect((await releaseVerifiedSource(eligible, op)).status).toBe("skipped");
    expect(op.deleteSource).not.toHaveBeenCalled();
  });

  it("does not remove a source whose size differs from the saved file", async () => {
    const op = operations();
    op.sourceHead.mockResolvedValue({ size: 9876 });
    expect((await releaseVerifiedSource(eligible, op)).status).toBe("skipped");
    expect(op.deleteSource).not.toHaveBeenCalled();
  });

  it("keeps metadata available when R2 deletion fails, and permits a cleanup-only retry", async () => {
    const op = operations();
    op.deleteSource.mockRejectedValueOnce(new Error("R2 unavailable"));
    expect((await releaseVerifiedSource(eligible, op)).status).toBe("failed");
    expect(op.markReleased).not.toHaveBeenCalled();
    expect((await releaseVerifiedSource(eligible, op)).status).toBe("released");
  });

  it("repairs metadata after a crash between deletion and metadata update without deleting twice", async () => {
    const op = operations();
    op.markReleased.mockRejectedValueOnce(new Error("DB unavailable"));
    expect((await releaseVerifiedSource(eligible, op)).status).toBe("failed");
    op.sourceHead.mockResolvedValue(null);
    expect(await releaseVerifiedSource(eligible, op)).toEqual({ status: "released", bytes: 0 });
    expect(op.deleteSource).toHaveBeenCalledOnce();
  });

  it("wires cleanup after committed upload completion and preserves Drive-only retries", () => {
    const upload = readFileSync(new URL("../../../app/api/files/upload/route.ts", import.meta.url), "utf8");
    const finalize = upload.slice(upload.indexOf("async function finalizeDriveUpload("), upload.indexOf("async function initializeDrive("));
    expect(finalize.indexOf("await database().batch([")).toBeLessThan(finalize.indexOf("await releaseSyncedSource("));
    const retry = upload.slice(upload.indexOf("async function retryUpload("), upload.indexOf("async function abortUpload("));
    expect(retry.indexOf('if (session.status === "synced")')).toBeLessThan(retry.indexOf("fileBucket().head"));
    const repository = readFileSync(new URL("./repository.ts", import.meta.url), "utf8");
    expect(repository).toContain('session.status === "synced" || session.sourceStatus === "available"');
    expect(repository).toContain("sourceAvailable: remote?.sourceAvailable ?? false");
    const cleanup = readFileSync(new URL("../../../app/google-drive/source-cleanup.ts", import.meta.url), "utf8");
    expect(cleanup).not.toContain("trashDriveFile");
    expect(cleanup).toContain("AND NOT (user_email = ? AND local_id = ?)");
    expect(cleanup).toContain("status NOT IN ('synced', 'aborted')");
    const route = readFileSync(new URL("../../../app/api/google-drive/source-cleanup/route.ts", import.meta.url), "utf8");
    expect(route).toContain("getSiteUser()");
    expect(route).toContain("payload.confirmed !== true");
    expect(route).toContain("user_email = ? AND deleted_at IS NULL");
    expect(route).toContain("ORDER BY local_id LIMIT 6");
  });
});
