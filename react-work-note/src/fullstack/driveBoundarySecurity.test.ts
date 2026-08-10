import { describe, expect, it } from "vitest";
import {
  sanitizeBoundaryRecord,
  sanitizeBoundaryText,
} from "./boundarySanitizer";
import { buildServerPayload } from "./serverPayload";
import type { WorkNoteData } from "./types";
import {
  legacyUploadDisposition,
  normalizeAttachmentStatus,
} from "../../../app/google-drive/status-contract";
import { driveParentChangeForDestination } from "../../../app/google-drive/upload-adoption";
import { sanitizeUploadDetail } from "../../../app/google-drive/upload-errors";

function emptyData(overrides: Partial<WorkNoteData> = {}): WorkNoteData {
  return {
    version: "react-work-note-v1",
    updatedAt: "2026-08-03T00:00:00.000Z",
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

describe("public attachment boundary", () => {
  it("recursively removes storage, source, session, token, secret, authorization, and blob aliases", () => {
    const safe = sanitizeBoundaryRecord({
      id: "attachment-1",
      storageKey: "r2-key",
      source_storage_key: "work-note-staging/source",
      encrypted_drive_session_uri: "ciphertext",
      driveSessionUri: "https://www.googleapis.com/upload/drive/v3/files?upload_id=secret",
      operationToken: "operation-secret",
      client_secret: "client-secret",
      Authorization: "Bearer abc.def",
      blob: { bytes: true },
      nested: [{ sourceKey: "nested-key", fileName: "safe.pdf" }],
    });

    expect(safe).toEqual({ id: "attachment-1", nested: [{ fileName: "safe.pdf" }] });
  });

  it("scrubs staging keys and resumable URLs embedded in boundary text", () => {
    const safe = sanitizeBoundaryText(
      "source work-note-staging/session-123 https://www.googleapis.com/upload/drive/v3/files?upload_id=secret",
    );
    expect(safe).not.toContain("work-note-staging/session-123");
    expect(safe).not.toContain("upload_id=secret");
  });

  it("sanitizes stale imported attachment metadata before building a server payload", () => {
    const payload = buildServerPayload(emptyData({
      notes: [{
        id: "note-1",
        attachments: [{
          id: "attachment-1",
          fileName: "safe.pdf",
          storage_key: "legacy-r2-key",
          sourceStorageKey: "work-note-staging/source",
          sessionUri: "resumable-secret",
          refreshToken: "oauth-secret",
          blob: { stale: true },
        }],
      }],
    }));
    const attachment = (payload.notes[0].attachments as Array<Record<string, unknown>>)[0];
    expect(attachment).toEqual({ id: "attachment-1", fileName: "safe.pdf" });
  });
});

describe("legacy status and Drive parent contracts", () => {
  it.each([
    ["\uB3D9\uAE30\uD654 \uC644\uB8CC", "synced"],
    ["\uC5C5\uB85C\uB4DC \uC911", "uploading"],
    ["\uC7AC\uC2DC\uB3C4 \uD544\uC694", "retry_required"],
    ["\uC5F0\uACB0 \uD544\uC694", "reconnect_required"],
  ])("normalizes legacy status %s", (legacy, expected) => {
    expect(normalizeAttachmentStatus(legacy)).toBe(expected);
  });

  it("reuses a persisted operation for retry and reconnect states but replaces synced files", () => {
    expect(legacyUploadDisposition({
      storageProvider: "google_drive",
      driveFileId: "drive-1",
      syncStatus: "\uC5F0\uACB0 \uD544\uC694",
      uploadStatus: "failed",
      operationToken: "operation-1",
    })).toMatchObject({ status: "reconnect_required", reuseOperationToken: true });
    expect(legacyUploadDisposition({
      storageProvider: "google_drive",
      driveFileId: "drive-1",
      syncStatus: "\uB3D9\uAE30\uD654 \uC644\uB8CC",
      uploadStatus: "completed",
      operationToken: "old-operation",
    })).toMatchObject({ status: "synced", replacingExistingDriveFile: true, reuseOperationToken: false });
  });

  it("moves an existing file only when its actual parent differs from the destination", () => {
    expect(driveParentChangeForDestination(["old-folder"], "canonical-folder")).toEqual({
      addParent: "canonical-folder",
      removeParent: "old-folder",
    });
    expect(driveParentChangeForDestination(["canonical-folder"], "canonical-folder")).toBeNull();
  });
});

describe("upload error redaction", () => {
  it("redacts staging object keys, multipart ids, session URIs, and authorization tokens", () => {
    const detail = sanitizeUploadDetail({
      source: "work-note-staging/session-123",
      r2_upload_id: "multipart-secret",
      operation_token: "operation-secret",
      source_key: "legacy-r2-source-key",
      source_storage_key: "legacy-r2-storage-key",
      sessionUri: "https://www.googleapis.com/upload/drive/v3/files?upload_id=drive-secret",
      Authorization: "Bearer abc.def",
    });
    expect(detail).not.toContain("session-123");
    expect(detail).not.toContain("multipart-secret");
    expect(detail).not.toContain("operation-secret");
    expect(detail).not.toContain("legacy-r2-source-key");
    expect(detail).not.toContain("legacy-r2-storage-key");
    expect(detail).not.toContain("drive-secret");
    expect(detail).not.toContain("abc.def");
  });
});
