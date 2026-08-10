import { UploadProtocolError } from "./upload-errors";

export const GOOGLE_UPLOAD_GRANULARITY = 256 * 1024;
export const DRIVE_UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024;
export const MAX_UPLOAD_RETRY_COUNT = 5;

export type ByteRange = {
  start: number;
  end: number;
  length: number;
  total: number;
  partNumber: number;
  final: boolean;
};

export type ResumableProgress = {
  complete: boolean;
  confirmedBytes: number;
  totalBytes: number;
  metadata?: Record<string, unknown>;
};

export function assertSafeChunkSize(chunkSize = DRIVE_UPLOAD_CHUNK_SIZE): number {
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0 || chunkSize % GOOGLE_UPLOAD_GRANULARITY !== 0) {
    throw new UploadProtocolError("INVALID_FILE_METADATA", "Drive 청크 크기는 256KiB의 배수여야 합니다.", {
      stage: "upload_init",
    });
  }
  return chunkSize;
}

export function byteRangeForOffset(total: number, start: number, chunkSize = DRIVE_UPLOAD_CHUNK_SIZE): ByteRange {
  assertSafeChunkSize(chunkSize);
  if (!Number.isSafeInteger(total) || total <= 0 || !Number.isSafeInteger(start) || start < 0 || start >= total) {
    throw new UploadProtocolError("INVALID_CONTENT_RANGE", "파일 조각의 시작 위치가 올바르지 않습니다.", {
      stage: "chunk_range",
      status: 409,
    });
  }
  const end = Math.min(total - 1, start + chunkSize - 1);
  return {
    start,
    end,
    length: end - start + 1,
    total,
    partNumber: Math.floor(start / chunkSize) + 1,
    final: end === total - 1,
  };
}

export function formatContentRange(range: Pick<ByteRange, "start" | "end" | "total">): string {
  return `bytes ${range.start}-${range.end}/${range.total}`;
}

export function formatStatusProbeRange(total: number): string {
  if (!Number.isSafeInteger(total) || total <= 0) {
    throw new UploadProtocolError("INVALID_FILE_METADATA", "파일 크기가 올바르지 않습니다.", {
      stage: "drive_status",
    });
  }
  return `bytes */${total}`;
}

export function parseContentRange(value: string | null): Omit<ByteRange, "partNumber" | "final"> {
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+)$/i.exec(String(value || "").trim());
  if (!match) {
    throw new UploadProtocolError("INVALID_CONTENT_RANGE", "Content-Range 형식이 올바르지 않습니다.", {
      stage: "source_chunk",
      status: 400,
    });
  }
  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = Number(match[3]);
  if (![start, end, total].every(Number.isSafeInteger) || start < 0 || end < start || end >= total) {
    throw new UploadProtocolError("INVALID_CONTENT_RANGE", "Content-Range 범위가 올바르지 않습니다.", {
      stage: "source_chunk",
      status: 400,
    });
  }
  return { start, end, total, length: end - start + 1 };
}

export function parseDriveConfirmedBytes(rangeHeader: string | null): number {
  if (!rangeHeader) return 0;
  const match = /^bytes=(\d+)-(\d+)$/i.exec(rangeHeader.trim());
  if (!match) {
    throw new UploadProtocolError("FILE_STREAM_ERROR", "Google Drive가 잘못된 업로드 범위를 반환했습니다.", {
      stage: "drive_status",
      retryable: true,
      status: 503,
    });
  }
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start !== 0 || !Number.isSafeInteger(end) || end < 0) {
    throw new UploadProtocolError("FILE_STREAM_ERROR", "Google Drive 업로드 진행 범위를 확인하지 못했습니다.", {
      stage: "drive_status",
      retryable: true,
      status: 503,
    });
  }
  return end + 1;
}

export function progressFromDriveResponse(
  status: number,
  rangeHeader: string | null,
  totalBytes: number,
  metadata?: Record<string, unknown>,
): ResumableProgress {
  if (status === 200 || status === 201) {
    return { complete: true, confirmedBytes: totalBytes, totalBytes, metadata };
  }
  if (status === 308) {
    const confirmedBytes = parseDriveConfirmedBytes(rangeHeader);
    if (confirmedBytes > totalBytes) {
      throw new UploadProtocolError("FILE_SIZE_MISMATCH", "Drive가 원본보다 큰 범위를 반환했습니다.", {
        stage: "drive_status",
        retryable: true,
        status: 409,
      });
    }
    return { complete: false, confirmedBytes, totalBytes };
  }
  if (status === 404 || status === 410) {
    throw new UploadProtocolError("UPLOAD_SESSION_EXPIRED", undefined, {
      stage: "drive_session",
      status: 409,
      retryable: true,
    });
  }
  throw new UploadProtocolError("FILE_STREAM_ERROR", `예상하지 못한 Drive 업로드 응답입니다. (${status})`, {
    stage: "drive_chunk",
    retryable: status === 429 || status >= 500,
    status: status >= 400 ? status : 503,
  });
}

export function retryDelayMs(
  attempt: number,
  retryAfter: string | null = null,
  randomValue = 0.5,
): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(60_000, Math.round(seconds * 1000));
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.max(0, Math.min(60_000, at - Date.now()));
  }
  const boundedAttempt = Math.max(0, Math.min(MAX_UPLOAD_RETRY_COUNT, Math.floor(attempt)));
  const base = Math.min(30_000, 500 * 2 ** boundedAttempt);
  const jitter = Math.max(0, Math.min(1, randomValue)) * Math.min(1000, base / 2);
  return Math.round(base + jitter);
}

export function isRetryableDriveStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500 && status <= 599;
}

export function uploadProgressPercent(processedBytes: number, totalBytes: number): number {
  if (!totalBytes) return 0;
  return Math.max(0, Math.min(100, Math.round((processedBytes / totalBytes) * 100)));
}
