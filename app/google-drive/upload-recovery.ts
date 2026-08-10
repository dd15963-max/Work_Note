import type { UploadErrorCode } from "./upload-errors";

export type UploadRecoveryAction =
  | "use_chunk_upload"
  | "refresh_token"
  | "reconnect_drive"
  | "rebuild_folder"
  | "probe_or_restart_session"
  | "retry_with_backoff"
  | "restore_source"
  | "user_action"
  | "none";

export function recoveryActionForErrorCode(code: UploadErrorCode): UploadRecoveryAction {
  if (code === "WORKER_MEMORY_LIMIT" || code === "FILE_STREAM_ERROR") return "use_chunk_upload";
  if (code === "GOOGLE_AUTH_EXPIRED") return "refresh_token";
  if (code === "DRIVE_RECONNECT_REQUIRED" || code === "DRIVE_NOT_CONNECTED") return "reconnect_drive";
  if (code === "DRIVE_FOLDER_NOT_FOUND") return "rebuild_folder";
  if (code === "UPLOAD_SESSION_EXPIRED" || code === "DUPLICATE_OPERATION") return "probe_or_restart_session";
  if (["DRIVE_API_QUOTA", "DRIVE_SERVER_ERROR", "NETWORK_TIMEOUT"].includes(code)) return "retry_with_backoff";
  if (code === "R2_UPLOAD_EXPIRED" || code === "R2_SOURCE_MISSING") return "restore_source";
  if (["DRIVE_PERMISSION_DENIED", "DRIVE_STORAGE_QUOTA", "INVALID_FILE_METADATA"].includes(code)) return "user_action";
  return "none";
}

export function isRetryEligibleStatus(status: string): boolean {
  return ["failed", "retry_required", "reconnect_required"].includes(status);
}

export function isPreservedSourceAvailable(sourceStatus: string, sourceKey: string): boolean {
  return sourceStatus === "available" && Boolean(sourceKey);
}

export type AdoptableDriveFile = {
  id: string;
  size?: string | number;
  trashed?: boolean;
  appProperties?: Record<string, string>;
};

export function selectAdoptableDriveFile<T extends AdoptableDriveFile>(
  files: T[],
  input: { attachmentId: string; operationToken: string; totalBytes: number },
): T | null {
  const exact = files.filter((file) =>
    !file.trashed
    && file.appProperties?.managedBy === "work-note"
    && file.appProperties?.attachmentId === input.attachmentId
    && file.appProperties?.operationToken === input.operationToken
    && Number(file.size || 0) === input.totalBytes);
  return exact.length === 1 ? exact[0] : null;
}
