export type ClientDriveErrorCode =
  | "memory_limit"
  | "stream_error"
  | "file_too_large"
  | "auth_expired"
  | "drive_disconnected"
  | "permission_denied"
  | "folder_not_found"
  | "storage_quota_exceeded"
  | "api_quota_exceeded"
  | "network_timeout"
  | "upload_session_expired"
  | "duplicate_operation"
  | "source_missing"
  | "invalid_file"
  | "unknown";

const CLIENT_CODES = new Set<ClientDriveErrorCode>([
  "memory_limit",
  "stream_error",
  "file_too_large",
  "auth_expired",
  "drive_disconnected",
  "permission_denied",
  "folder_not_found",
  "storage_quota_exceeded",
  "api_quota_exceeded",
  "network_timeout",
  "upload_session_expired",
  "duplicate_operation",
  "source_missing",
  "invalid_file",
  "unknown",
]);

const SERVER_ALIASES: Record<string, ClientDriveErrorCode> = {
  WORKER_MEMORY_LIMIT: "memory_limit",
  FILE_STREAM_ERROR: "stream_error",
  INVALID_CONTENT_RANGE: "stream_error",
  FILE_SIZE_MISMATCH: "file_too_large",
  GOOGLE_AUTH_EXPIRED: "auth_expired",
  DRIVE_AUTH_EXPIRED: "auth_expired",
  DRIVE_RECONNECT_REQUIRED: "drive_disconnected",
  DRIVE_NOT_CONNECTED: "drive_disconnected",
  DRIVE_PERMISSION_DENIED: "permission_denied",
  DRIVE_FOLDER_NOT_FOUND: "folder_not_found",
  DRIVE_STORAGE_QUOTA: "storage_quota_exceeded",
  DRIVE_API_QUOTA: "api_quota_exceeded",
  DRIVE_SERVER_ERROR: "network_timeout",
  NETWORK_TIMEOUT: "network_timeout",
  UPLOAD_SESSION_EXPIRED: "upload_session_expired",
  DUPLICATE_OPERATION: "duplicate_operation",
  R2_SOURCE_MISSING: "source_missing",
  R2_UPLOAD_EXPIRED: "source_missing",
  INVALID_FILE_METADATA: "invalid_file",
  UNKNOWN_UPLOAD_ERROR: "unknown",
};

export function normalizeDriveSyncErrorCode(value: unknown): ClientDriveErrorCode {
  const raw = String(value || "").trim();
  const clientValue = raw.toLowerCase().replace(/[\s-]+/g, "_") as ClientDriveErrorCode;
  if (CLIENT_CODES.has(clientValue)) return clientValue;
  const serverValue = raw.toUpperCase().replace(/[\s-]+/g, "_");
  return SERVER_ALIASES[serverValue] || "unknown";
}
