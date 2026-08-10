import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SAFE_UPLOAD_CHUNK_BYTES,
  clearRemoteRuntime,
  initializeRemoteRuntime,
  retryRemoteAttachments,
  uploadSourceParts,
} from "./repository";
import {
  DRIVE_UPLOAD_CHUNK_SIZE,
  byteRangeForOffset,
  progressFromDriveResponse,
} from "../../../app/google-drive/resumable-protocol";
import {
  downloadWithPreservedSourceFallback,
} from "../../../app/google-drive/download-recovery";
import {
  classifyUploadError,
  sanitizeUploadDetail,
} from "../../../app/google-drive/upload-errors";
import {
  recoveryActionForErrorCode,
  selectAdoptableDriveFile,
} from "../../../app/google-drive/upload-recovery";

type LogicalSlice = {
  start: number;
  endExclusive: number;
  blob: LogicalChunkBlob;
};

class LogicalChunkBlob extends Blob {
  readonly logicalSize: number;
  streamCalls = 0;

  constructor(size: number, type: string) {
    // The backing Blob is deliberately empty: the test models size/ranges only.
    super([], { type });
    this.logicalSize = size;
  }

  override get size(): number {
    return this.logicalSize;
  }

  override arrayBuffer(): Promise<ArrayBuffer> {
    throw new Error("arrayBuffer must never be used by the large-file upload path");
  }

  override stream(): ReadableStream<Uint8Array<ArrayBuffer>> {
    this.streamCalls += 1;
    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      },
    });
  }
}

class LogicalFileBlob extends Blob {
  readonly logicalSize: number;
  readonly slices: LogicalSlice[] = [];

  constructor(size: number, type = "model/stl") {
    // No 153/164MiB fixture is allocated or committed.
    super([], { type });
    this.logicalSize = size;
  }

  override get size(): number {
    return this.logicalSize;
  }

  override arrayBuffer(): Promise<ArrayBuffer> {
    throw new Error("whole-file arrayBuffer must never be used");
  }

  override slice(start = 0, end = this.size, contentType = this.type): Blob {
    const boundedStart = Math.max(0, Math.min(this.size, start));
    const boundedEnd = Math.max(boundedStart, Math.min(this.size, end));
    const blob = new LogicalChunkBlob(boundedEnd - boundedStart, contentType);
    this.slices.push({ start: boundedStart, endExclusive: boundedEnd, blob });
    return blob;
  }
}

async function exerciseProductionSourceUpload(totalBytes: number) {
  const blob = new LogicalFileBlob(totalBytes);
  const forwardedBodies: LogicalChunkBlob[] = [];
  const contentRanges: string[] = [];
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.method).toBe("PUT");
    const body = init?.body;
    expect(body).toBe(blob.slices.at(-1)?.blob);
    expect(body).toBeInstanceOf(LogicalChunkBlob);
    const chunk = body as LogicalChunkBlob;
    forwardedBodies.push(chunk);

    // Model native fetch consuming the exact forwarded slice stream. The
    // arrayBuffer/FormData traps below fail if the path buffers instead.
    const reader = chunk.stream().getReader();
    expect((await reader.read()).value).toEqual(new Uint8Array([1]));
    expect((await reader.read()).done).toBe(true);

    const headers = new Headers(init?.headers);
    const contentRange = headers.get("Content-Range") || "";
    contentRanges.push(contentRange);
    const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange);
    if (!match) throw new Error(`invalid Content-Range: ${contentRange}`);
    const nextOffset = Number(match[2]) + 1;
    return Response.json({
      ok: true,
      sessionId: "logical-session",
      sourceStatus: nextOffset === totalBytes ? "available" : "uploading",
      nextOffset,
      processedBytes: nextOffset,
      totalBytes,
    });
  });

  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("FormData", class ForbiddenFormData {
    constructor() {
      throw new Error("FormData must never be used by the large-file upload path");
    }
  });

  const result = await uploadSourceParts(
    "logical-attachment",
    "large-part.stl",
    blob,
    {
      ok: true,
      sessionId: "logical-session",
      chunkSize: SAFE_UPLOAD_CHUNK_BYTES,
      nextOffset: 0,
      sourceStatus: "uploading",
      totalBytes,
    },
  );

  return { blob, contentRanges, fetchMock, forwardedBodies, result };
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key: string) { return values.get(key) ?? null; },
    key(index: number) { return [...values.keys()][index] ?? null; },
    removeItem(key: string) { values.delete(key); },
    setItem(key: string, value: string) { values.set(key, String(value)); },
  };
}

async function installRemoteRepositoryRuntime(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("window", {
    localStorage: createMemoryStorage(),
    addEventListener: vi.fn(),
    setTimeout: globalThis.setTimeout,
  });
  initializeRemoteRuntime({ id: "test-user", email: "test@example.com" });
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  if (typeof window !== "undefined") clearRemoteRuntime();
  vi.unstubAllGlobals();
});

describe("Google Drive large-file recovery", () => {
  it("[11] 153MiB logical Blob은 production slice/PUT 경로에서 20개 이하-8MiB stream으로 전달된다", async () => {
    const total = 153 * 1024 * 1024;
    const execution = await exerciseProductionSourceUpload(total);

    expect(execution.blob.slices).toHaveLength(20);
    expect(execution.fetchMock).toHaveBeenCalledTimes(20);
    expect(execution.blob.slices[0]).toMatchObject({
      start: 0,
      endExclusive: SAFE_UPLOAD_CHUNK_BYTES,
    });
    expect(Math.max(...execution.blob.slices.map((slice) => slice.blob.size)))
      .toBeLessThanOrEqual(SAFE_UPLOAD_CHUNK_BYTES);
    expect(execution.forwardedBodies.every((body) => body.streamCalls === 1)).toBe(true);
    expect(execution.contentRanges.at(-1)).toBe(
      `bytes ${152 * 1024 * 1024}-${total - 1}/${total}`,
    );
    expect(execution.result.sourceStatus).toBe("available");
  });

  it("[12] 164MiB logical STL은 production callsite에서 21개 청크와 4MiB 마지막 slice를 전달한다", async () => {
    const total = 164 * 1024 * 1024;
    const execution = await exerciseProductionSourceUpload(total);
    const finalSlice = execution.blob.slices.at(-1);

    expect(execution.blob.slices).toHaveLength(21);
    expect(execution.fetchMock).toHaveBeenCalledTimes(21);
    expect(finalSlice).toMatchObject({
      start: 160 * 1024 * 1024,
      endExclusive: total,
    });
    expect(finalSlice?.blob.size).toBe(4 * 1024 * 1024);
    expect(execution.forwardedBodies.at(-1)).toBe(finalSlice?.blob);
    expect(execution.forwardedBodies.every((body) => body.streamCalls === 1)).toBe(true);
  });

  it("[13] 308 Range 응답 후 확인된 다음 범위부터 재개한다", () => {
    const confirmed = 7 * DRIVE_UPLOAD_CHUNK_SIZE;
    const progress = progressFromDriveResponse(
      308,
      `bytes=0-${confirmed - 1}`,
      164 * 1024 * 1024,
    );
    expect(progress.complete).toBe(false);
    expect(progress.confirmedBytes).toBe(confirmed);
    expect(byteRangeForOffset(progress.totalBytes, progress.confirmedBytes).start).toBe(confirmed);
  });

  it("[14] Worker 메모리 오류를 안전한 한국어 복구 안내로 분류한다", () => {
    const failure = classifyUploadError(new Error("Memory limit would be exceeded before EOF."), "request_parse");
    expect(failure.code).toBe("WORKER_MEMORY_LIMIT");
    expect(failure.userMessage).toContain("분할 업로드");
    expect(failure.autoRecoverable).toBe(true);
    expect(recoveryActionForErrorCode(failure.code)).toBe("use_chunk_upload");
  });

  it("401은 토큰 갱신 대상으로, 갱신 불가는 재연결 대상으로 분리한다", () => {
    const expired = classifyUploadError({ status: 401, message: "Unauthorized" }, "drive_chunk");
    const invalidGrant = classifyUploadError({ status: 400, message: "invalid_grant refresh failed" }, "token_refresh");
    expect(expired.code).toBe("GOOGLE_AUTH_EXPIRED");
    expect(recoveryActionForErrorCode(expired.code)).toBe("refresh_token");
    expect(invalidGrant.code).toBe("DRIVE_RECONNECT_REQUIRED");
    expect(recoveryActionForErrorCode(invalidGrant.code)).toBe("reconnect_drive");

    const revoked = classifyUploadError(
      { status: 400, message: "GoogleDriveHttpError: Token has been expired or revoked." },
      "token_refresh",
    );
    expect(revoked.code).toBe("DRIVE_RECONNECT_REQUIRED");
    expect(revoked.userActionRequired).toBe(true);
  });

  it("폴더 404는 canonical 폴더 복구 후 재시도 대상으로 분류한다", () => {
    const failure = classifyUploadError({ status: 404, message: "destination folder not found" }, "folder_resolve");
    expect(failure.code).toBe("DRIVE_FOLDER_NOT_FOUND");
    expect(failure.autoRecoverable).toBe(true);
    expect(recoveryActionForErrorCode(failure.code)).toBe("rebuild_folder");
  });

  it("동일 operationToken의 완료 파일 하나만 adopt하여 중복 생성을 막는다", () => {
    const files = [
      { id: "old", size: "100", appProperties: { managedBy: "work-note", attachmentId: "a1", operationToken: "old" } },
      { id: "done", size: "164", appProperties: { managedBy: "work-note", attachmentId: "a1", operationToken: "op1" } },
      { id: "other", size: "164", appProperties: { managedBy: "work-note", attachmentId: "a2", operationToken: "op1" } },
    ];
    expect(selectAdoptableDriveFile(files, {
      attachmentId: "a1",
      operationToken: "op1",
      totalBytes: 164,
    })?.id).toBe("done");
    expect(selectAdoptableDriveFile([...files, { ...files[1], id: "duplicate" }], {
      attachmentId: "a1",
      operationToken: "op1",
      totalBytes: 164,
    })).toBeNull();
  });

  it("[18] Drive 실패 뒤 실제 fallback coordinator가 available R2 원본을 반환한다", async () => {
    const drive = vi.fn(async () => {
      throw new Error("Drive temporary failure");
    });
    const preservedR2 = vi.fn(async () => ({
      storage: "r2",
      key: "work-note-staging/session-1",
    }));

    const downloaded = await downloadWithPreservedSourceFallback({
      loadPrimary: drive,
      sourceAvailable: true,
      loadPreservedSource: preservedR2,
    });

    expect(downloaded).toEqual({
      storage: "r2",
      key: "work-note-staging/session-1",
    });
    expect(drive).toHaveBeenCalledOnce();
    expect(preservedR2).toHaveBeenCalledOnce();
  });

  it("[19] 저장 공간 및 권한 오류는 자동 재시도하지 않고 사용자 조치를 요구한다", () => {
    const quota = classifyUploadError({ status: 403, reason: "storageQuotaExceeded", message: "storage quota" }, "drive_chunk");
    const permission = classifyUploadError({ status: 403, reason: "insufficientPermissions", message: "permission denied" }, "drive_chunk");
    for (const failure of [quota, permission]) {
      expect(failure.autoRecoverable).toBe(false);
      expect(failure.userActionRequired).toBe(true);
      expect(recoveryActionForErrorCode(failure.code)).toBe("user_action");
    }
  });

  it("[20] production 일괄 재시도는 정상 synced 파일을 실제 retry endpoint에서 제외한다", async () => {
    let retryMetadataReads = 0;
    const retryRequests: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/files?id=synced&metadata=1") {
        return Response.json({
          id: "synced",
          fileName: "already-synced.stl",
          fileSize: 1,
          syncStatus: "synced",
          driveFileId: "drive-synced",
        });
      }
      if (url === "/api/files?id=retry&metadata=1") {
        retryMetadataReads += 1;
        return Response.json({
          id: "retry",
          fileName: "retry.stl",
          fileSize: 1,
          syncStatus: retryMetadataReads === 1 ? "retry_required" : "synced",
          driveFileId: retryMetadataReads === 1 ? "" : "drive-retry",
          uploadSessionId: "retry-session",
          sourceStatus: "available",
        });
      }
      if (url === "/api/files/upload?action=retry") {
        retryRequests.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
        return Response.json({
          ok: true,
          sessionId: "retry-session",
          status: "synced",
          sourceStatus: "available",
          totalBytes: 1,
          processedBytes: 1,
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    await installRemoteRepositoryRuntime(fetchMock);

    const result = await retryRemoteAttachments(["synced", "retry", "synced"]);

    expect(result).toMatchObject({ succeeded: 1, failed: 0, skipped: 1 });
    expect(retryRequests).toEqual([{
      sessionId: "retry-session",
      attachmentId: "retry",
    }]);
    expect(retryRequests.some((request) => request.attachmentId === "synced")).toBe(false);
  });

  it("보안 로그에서 토큰과 Drive upload URI를 제거한다", () => {
    const detail = sanitizeUploadDetail(
      "Authorization: Bearer abc.def https://www.googleapis.com/upload/drive/v3/files?upload_id=secret",
    );
    expect(detail).not.toContain("abc.def");
    expect(detail).not.toContain("upload_id=secret");
  });
});
