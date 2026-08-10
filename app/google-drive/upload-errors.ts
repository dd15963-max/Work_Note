export const UPLOAD_ERROR_CODES = [
  "WORKER_MEMORY_LIMIT",
  "FILE_STREAM_ERROR",
  "INVALID_CONTENT_RANGE",
  "FILE_SIZE_MISMATCH",
  "GOOGLE_AUTH_EXPIRED",
  "DRIVE_RECONNECT_REQUIRED",
  "DRIVE_NOT_CONNECTED",
  "DRIVE_PERMISSION_DENIED",
  "DRIVE_FOLDER_NOT_FOUND",
  "DRIVE_STORAGE_QUOTA",
  "DRIVE_API_QUOTA",
  "DRIVE_SERVER_ERROR",
  "NETWORK_TIMEOUT",
  "UPLOAD_SESSION_EXPIRED",
  "DUPLICATE_OPERATION",
  "R2_SOURCE_MISSING",
  "R2_UPLOAD_EXPIRED",
  "INVALID_FILE_METADATA",
  "UNKNOWN_UPLOAD_ERROR",
] as const;

export type UploadErrorCode = (typeof UPLOAD_ERROR_CODES)[number];

export type UploadFailure = {
  code: UploadErrorCode;
  userMessage: string;
  technicalDetail: string;
  stage: string;
  retryable: boolean;
  autoRecoverable: boolean;
  userActionRequired: boolean;
  httpStatus: number;
};

type ErrorLike = {
  message?: unknown;
  name?: unknown;
  status?: unknown;
  code?: unknown;
  reason?: unknown;
  retryable?: unknown;
};

const USER_MESSAGES: Record<UploadErrorCode, string> = {
  WORKER_MEMORY_LIMIT: "파일 크기가 커서 기존 저장 방식의 메모리 한도를 초과했습니다. 원본은 안전하게 보관되며 분할 업로드로 다시 시도할 수 있습니다.",
  FILE_STREAM_ERROR: "파일을 분할 전송하는 중 연결이 끊겼습니다. 확인된 위치부터 다시 시도합니다.",
  INVALID_CONTENT_RANGE: "업로드할 파일 조각의 위치 정보가 올바르지 않습니다.",
  FILE_SIZE_MISMATCH: "저장된 파일 크기가 원본과 일치하지 않습니다. 원본을 확인한 뒤 다시 시도해 주세요.",
  GOOGLE_AUTH_EXPIRED: "Google Drive 인증을 갱신하는 중 문제가 발생했습니다.",
  DRIVE_RECONNECT_REQUIRED: "Google Drive 연결이 만료되었습니다. 계정을 다시 연결해 주세요.",
  DRIVE_NOT_CONNECTED: "먼저 Google Drive 연결을 완료해 주세요.",
  DRIVE_PERMISSION_DENIED: "Google Drive에 파일을 저장할 권한이 없습니다. 연결 권한을 다시 확인해 주세요.",
  DRIVE_FOLDER_NOT_FOUND: "저장할 Google Drive 폴더를 찾지 못했습니다. 폴더 구조를 복구한 뒤 다시 시도합니다.",
  DRIVE_STORAGE_QUOTA: "Google Drive 저장 공간이 부족합니다. 저장 공간을 확보한 뒤 다시 시도해 주세요.",
  DRIVE_API_QUOTA: "Google Drive 요청이 일시적으로 많습니다. 잠시 후 자동으로 다시 시도합니다.",
  DRIVE_SERVER_ERROR: "Google Drive 서비스에 일시적인 문제가 있습니다. 잠시 후 다시 시도합니다.",
  NETWORK_TIMEOUT: "네트워크 연결이 지연되었습니다. 업로드된 범위를 확인한 뒤 다시 시도합니다.",
  UPLOAD_SESSION_EXPIRED: "Google Drive 업로드 세션이 만료되었습니다. 기존 완료 파일을 확인한 뒤 새 세션으로 이어서 저장합니다.",
  DUPLICATE_OPERATION: "같은 파일의 저장 작업이 이미 진행 중입니다. 기존 작업 상태를 불러옵니다.",
  R2_SOURCE_MISSING: "안전 보관된 원본 파일을 찾지 못했습니다. 이 기기의 원본을 다시 선택해 주세요.",
  R2_UPLOAD_EXPIRED: "원본 보관 세션이 만료되었습니다. 이 기기의 원본부터 다시 전송해 주세요.",
  INVALID_FILE_METADATA: "파일 이름이나 크기 정보가 올바르지 않습니다.",
  UNKNOWN_UPLOAD_ERROR: "Google Drive 저장 중 알 수 없는 오류가 발생했습니다. 원본은 삭제되지 않았습니다.",
};

const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /([?&](?:upload_id|access_token|refresh_token|client_secret|code)=)[^&\s]+/gi,
  /"(?:access_token|refresh_token|client_secret|encrypted_drive_session_uri|drive_session_uri|driveSessionUri|sessionUri|operationToken|operation_token|r2_upload_id|uploadId|source_key|sourceKey|source_storage_key|sourceStorageKey|storage_key|storageKey|authorization|Authorization)"\s*:\s*"[^"]*"/gi,
  new RegExp("https://www\\.googleapis\\.com/upload/drive/[^\\s\"']+", "gi"),
  /work-note-staging\/[A-Za-z0-9._~+/-]+/gi,
  /((?:r2[_ -]?upload[_ -]?id|multipart[_ -]?upload[_ -]?id|upload[_ -]?id)\s*[:=]\s*["']?)[^,\s"'}]+/gi,
  /((?:authorization|[A-Za-z0-9_-]*token|[A-Za-z0-9_-]*secret)\s*[:=]\s*["']?)[^,\s"'}]+/gi,
];

export function sanitizeUploadDetail(value: unknown): string {
  let detail = value instanceof Error
    ? `${value.name}: ${value.message}`
    : typeof value === "string"
      ? value
      : (() => {
          try { return JSON.stringify(value); } catch { return String(value); }
        })();
  for (const pattern of SECRET_PATTERNS) {
    detail = detail.replace(pattern, (match, prefix: string | undefined) =>
      typeof prefix === "string" ? `${prefix}[REDACTED]` : "[REDACTED]");
  }
  return detail.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").slice(0, 1600);
}

function asErrorLike(error: unknown): ErrorLike {
  return error && typeof error === "object" ? error as ErrorLike : { message: String(error) };
}

function includesAny(value: string, values: RegExp[]): boolean {
  return values.some((pattern) => pattern.test(value));
}

export class UploadProtocolError extends Error {
  readonly uploadCode: UploadErrorCode;
  readonly stage: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(
    uploadCode: UploadErrorCode,
    message = USER_MESSAGES[uploadCode],
    options: { stage?: string; status?: number; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "UploadProtocolError";
    this.uploadCode = uploadCode;
    this.stage = options.stage || "unknown";
    this.status = options.status || 400;
    this.retryable = options.retryable ?? false;
  }
}

export function classifyUploadError(error: unknown, fallbackStage = "unknown"): UploadFailure {
  const source = asErrorLike(error);
  const rawMessage = String(source.message || error || "");
  const reason = String(source.reason || "");
  const rawCode = String(source.code || "");
  const status = Number(source.status || 0);
  const haystack = `${rawCode} ${reason} ${rawMessage}`;
  const protocol = error instanceof UploadProtocolError ? error : null;
  let code: UploadErrorCode = protocol?.uploadCode || "UNKNOWN_UPLOAD_ERROR";
  let retryable = protocol?.retryable ?? false;
  let autoRecoverable = false;
  let userActionRequired = false;
  let httpStatus = protocol?.status || (status >= 400 && status < 600 ? status : 500);

  if (!protocol) {
    if (/Memory limit would be exceeded|exceeded memory|memory limit/i.test(haystack)) {
      code = "WORKER_MEMORY_LIMIT"; retryable = true; autoRecoverable = true; httpStatus = 503;
    } else if (/INVALID_CONTENT_RANGE|content.?range|range mismatch/i.test(haystack)) {
      code = "INVALID_CONTENT_RANGE"; httpStatus = 409;
    } else if (/FILE_SIZE_MISMATCH|size mismatch|파일 크기.*일치/i.test(haystack)) {
      code = "FILE_SIZE_MISMATCH"; retryable = true; autoRecoverable = true; httpStatus = 409;
    } else if (/R2_SOURCE_MISSING|원본 파일을 찾을 수 없|NoSuchKey/i.test(haystack)) {
      code = "R2_SOURCE_MISSING"; userActionRequired = true; httpStatus = 404;
    } else if (/NoSuchUpload|R2_UPLOAD_EXPIRED/i.test(haystack)) {
      code = "R2_UPLOAD_EXPIRED"; retryable = true; userActionRequired = true; httpStatus = 410;
    } else if (/UPLOAD_SESSION_EXPIRED|upload session.*expired/i.test(haystack) || [404, 410].includes(status) && /session|upload/i.test(fallbackStage)) {
      code = "UPLOAD_SESSION_EXPIRED"; retryable = true; autoRecoverable = true; httpStatus = 409;
    } else if (/DRIVE_NOT_CONNECTED|Google Drive 연결이 필요/i.test(haystack)) {
      code = "DRIVE_NOT_CONNECTED"; userActionRequired = true; httpStatus = 409;
    } else if (status === 401 || /invalid_grant|unauthorized|auth.*expired|token (?:has been )?expired|expired or revoked|token.*revoked/i.test(haystack)) {
      code = /refresh|invalid_grant|expired or revoked|token.*revoked/i.test(haystack) ? "DRIVE_RECONNECT_REQUIRED" : "GOOGLE_AUTH_EXPIRED";
      retryable = code === "GOOGLE_AUTH_EXPIRED";
      autoRecoverable = retryable;
      userActionRequired = !retryable;
      httpStatus = 401;
    } else if (status === 403 && includesAny(haystack, [/storageQuotaExceeded/i, /storage.*quota/i, /저장 공간/i])) {
      code = "DRIVE_STORAGE_QUOTA"; userActionRequired = true; httpStatus = 507;
    } else if ((status === 403 || status === 429) && includesAny(haystack, [/rateLimit/i, /quota/i, /userRateLimitExceeded/i, /dailyLimitExceeded/i])) {
      code = "DRIVE_API_QUOTA"; retryable = true; autoRecoverable = true; httpStatus = 429;
    } else if (status === 403 || /insufficientPermissions|permission denied|권한/i.test(haystack)) {
      code = "DRIVE_PERMISSION_DENIED"; userActionRequired = true; httpStatus = 403;
    } else if (status === 404 && /folder|폴더/i.test(`${fallbackStage} ${haystack}`)) {
      code = "DRIVE_FOLDER_NOT_FOUND"; retryable = true; autoRecoverable = true; httpStatus = 409;
    } else if (status === 429) {
      code = "DRIVE_API_QUOTA"; retryable = true; autoRecoverable = true; httpStatus = 429;
    } else if (status >= 500 && status <= 599) {
      code = "DRIVE_SERVER_ERROR"; retryable = true; autoRecoverable = true; httpStatus = 503;
    } else if (/AbortError|TimeoutError|timed out|timeout|network|fetch failed|connection/i.test(haystack)) {
      code = "NETWORK_TIMEOUT"; retryable = true; autoRecoverable = true; httpStatus = 503;
    } else if (/DUPLICATE_OPERATION|already.*progress|lock/i.test(haystack)) {
      code = "DUPLICATE_OPERATION"; retryable = true; autoRecoverable = true; httpStatus = 409;
    } else if (/INVALID_FILE_METADATA|invalid.*file|파일.*정보/i.test(haystack)) {
      code = "INVALID_FILE_METADATA"; userActionRequired = true; httpStatus = 400;
    } else if (/stream|body.*used|disturbed|EOF/i.test(haystack)) {
      code = "FILE_STREAM_ERROR"; retryable = true; autoRecoverable = true; httpStatus = 503;
    }
  } else {
    autoRecoverable = retryable;
    userActionRequired = !retryable && [
      "DRIVE_RECONNECT_REQUIRED", "DRIVE_NOT_CONNECTED", "DRIVE_PERMISSION_DENIED",
      "DRIVE_STORAGE_QUOTA", "R2_SOURCE_MISSING", "R2_UPLOAD_EXPIRED", "INVALID_FILE_METADATA",
      "DUPLICATE_OPERATION",
    ].includes(code);
  }

  return {
    code,
    userMessage: USER_MESSAGES[code],
    technicalDetail: sanitizeUploadDetail(error),
    stage: protocol?.stage || fallbackStage,
    retryable,
    autoRecoverable,
    userActionRequired,
    httpStatus,
  };
}

export function safeUploadLog(error: unknown, stage: string, context: Record<string, unknown> = {}) {
  const failure = classifyUploadError(error, stage);
  const safeContext = Object.fromEntries(Object.entries(context).filter(([key]) =>
    !/token|secret|session.?uri|authorization|credential/i.test(key)));
  return {
    ...safeContext,
    errorCode: failure.code,
    errorDetail: failure.technicalDetail,
    failureStage: failure.stage,
    retryable: failure.retryable,
  };
}

export function uploadErrorResponse(error: unknown, stage: string, extra: Record<string, unknown> = {}): Response {
  const failure = classifyUploadError(error, stage);
  return Response.json({
    ok: false,
    ...extra,
    error: {
      code: failure.code,
      message: failure.userMessage,
      detail: failure.technicalDetail,
      stage: failure.stage,
      retryable: failure.retryable,
      autoRecoverable: failure.autoRecoverable,
      userActionRequired: failure.userActionRequired,
    },
  }, { status: failure.httpStatus });
}
