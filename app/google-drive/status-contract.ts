import { normalizeCompanyFolderKey } from "./organization";

export type CanonicalAttachmentStatus =
  | "local_only"
  | "pending"
  | "uploading"
  | "synced"
  | "failed"
  | "retry_required"
  | "reconnect_required";

export type DriveStatusAttachmentRow = {
  storage_provider: string;
  drive_file_id: string | null;
  drive_company_folder_id: string;
  drive_memo_folder_id: string;
  drive_category_folder_id: string;
  drive_path: string;
  sync_status: string;
  upload_status: string;
  last_synced_at: string;
};

export type DriveStatusFolderRow = {
  folder_id: string;
  folder_name: string;
  managed_key: string;
  folder_type: string;
  last_synced_at: string;
};

export type DriveStatusOperationRow = {
  operation_type: string;
  status: string;
  updated_at: string;
};

const LEGACY_STATUS_MAP: Record<string, CanonicalAttachmentStatus> = {
  "동기화 완료": "synced",
  "저장 완료": "synced",
  "업로드 완료": "synced",
  "완료": "synced",
  "동기화 중": "uploading",
  "업로드 중": "uploading",
  "저장 중": "uploading",
  "이동 중": "uploading",
  "대기": "pending",
  "대기 중": "pending",
  "저장 대기": "pending",
  "저장 실패": "failed",
  "업로드 실패": "failed",
  "Drive 저장 실패": "failed",
  "동기화 실패": "failed",
  "실패": "failed",
  "재시도 필요": "retry_required",
  "재시도필요": "retry_required",
  "다시 시도 필요": "retry_required",
  "연결 필요": "reconnect_required",
  "연결필요": "reconnect_required",
  "연결 끊김": "reconnect_required",
  "다시 연결 필요": "reconnect_required",
  "로컬 전용": "local_only",
  "이 기기": "local_only",
};

export function normalizeAttachmentStatus(
  value: unknown,
  fallback: CanonicalAttachmentStatus = "local_only",
): CanonicalAttachmentStatus {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if ([
    "local_only",
    "pending",
    "uploading",
    "synced",
    "failed",
    "retry_required",
    "reconnect_required",
  ].includes(normalized)) {
    return normalized as CanonicalAttachmentStatus;
  }
  if (normalized === "completed") return "synced";
  if (normalized === "moving") return "uploading";
  const compact = raw.replace(/\s+/g, "");
  const compactLegacy: Record<string, CanonicalAttachmentStatus> = {
    "\uB3D9\uAE30\uD654\uC644\uB8CC": "synced",
    "\uC800\uC7A5\uC644\uB8CC": "synced",
    "\uC5C5\uB85C\uB4DC\uC644\uB8CC": "synced",
    "\uC644\uB8CC": "synced",
    "\uB3D9\uAE30\uD654\uC911": "uploading",
    "\uC5C5\uB85C\uB4DC\uC911": "uploading",
    "\uC800\uC7A5\uC911": "uploading",
    "\uC774\uB3D9\uC911": "uploading",
    "\uB300\uAE30": "pending",
    "\uC7AC\uC2DC\uB3C4\uD544\uC694": "retry_required",
    "\uB2E4\uC2DC\uC2DC\uB3C4\uD544\uC694": "retry_required",
    "\uC5F0\uACB0\uD544\uC694": "reconnect_required",
    "\uC5F0\uACB0\uC548\uB428": "reconnect_required",
    "\uB2E4\uC2DC\uC5F0\uACB0\uD544\uC694": "reconnect_required",
  };
  return compactLegacy[compact] || LEGACY_STATUS_MAP[raw] || fallback;
}


export function legacyUploadDisposition(input: {
  storageProvider: string;
  driveFileId: string | null | undefined;
  syncStatus: unknown;
  uploadStatus: unknown;
  operationToken: string | null | undefined;
}) {
  const fallback: CanonicalAttachmentStatus = input.storageProvider === "google_drive" && input.driveFileId
    ? "synced"
    : input.storageProvider === "site_storage" ? "local_only" : "pending";
  const status = normalizeAttachmentStatus(input.syncStatus || input.uploadStatus, fallback);
  return {
    status,
    replacingExistingDriveFile: input.storageProvider === "google_drive" &&
      Boolean(input.driveFileId) && status === "synced",
    reuseOperationToken: Boolean(input.operationToken) && [
      "uploading", "failed", "retry_required", "reconnect_required",
    ].includes(status),
  };
}
export function summarizeAttachmentRows(rows: DriveStatusAttachmentRow[]) {
  let driveFileCount = 0;
  let legacyFileCount = 0;
  let failedFileCount = 0;
  let retryRequiredCount = 0;
  let organizedFileCount = 0;
  let lastAttachmentSyncAt = "";
  for (const row of rows) {
    const fallback = row.storage_provider === "google_drive" && row.drive_file_id
      ? "synced"
      : row.storage_provider === "site_storage" ? "local_only" : "pending";
    const status = normalizeAttachmentStatus(row.sync_status || row.upload_status, fallback);
    if (row.storage_provider === "google_drive" && row.drive_file_id) driveFileCount += 1;
    if (row.storage_provider === "site_storage") legacyFileCount += 1;
    if (status === "failed") failedFileCount += 1;
    if (["retry_required", "reconnect_required"].includes(status)) retryRequiredCount += 1;
    if (
      status === "synced" &&
      row.storage_provider === "google_drive" &&
      row.drive_file_id &&
      row.drive_company_folder_id &&
      row.drive_memo_folder_id &&
      row.drive_category_folder_id &&
      row.drive_path
    ) {
      organizedFileCount += 1;
    }
    lastAttachmentSyncAt = latestTimestamp(lastAttachmentSyncAt, row.last_synced_at);
  }
  return {
    driveFileCount,
    legacyFileCount,
    failedFileCount,
    retryRequiredCount,
    organizedFileCount,
    lastAttachmentSyncAt,
  };
}

export function summarizeFolderRows(rows: DriveStatusFolderRow[]) {
  const companyGroups = new Map<string, number>();
  for (const row of rows) {
    if (row.folder_type !== "company") continue;
    const key = normalizeCompanyFolderKey(row.folder_name);
    companyGroups.set(key, (companyGroups.get(key) || 0) + 1);
  }
  const unknownKey = normalizeCompanyFolderKey("업체 미정");
  return {
    managedFolderCount: rows.length,
    canonicalCompanyFolderCount: companyGroups.size,
    duplicateCompanyFolderCount: [...companyGroups.values()]
      .reduce((total, count) => total + Math.max(0, count - 1), 0),
    duplicateUnknownCompanyFolderCount: Math.max(0, (companyGroups.get(unknownKey) || 0) - 1),
  };
}

const CLEANUP_TYPES = new Set([
  "empty_folder_cleanup",
  "duplicate_folder_cleanup",
]);

const SYNC_TYPES = new Set([
  "dataset_sync",
  "file_upload",
  "file_upload_adopt",
  "file_replace",
  "file_move",
  "duplicate_file_move",
  "migration",
  "migration_adopt",
]);

export function summarizeOperationRows(rows: DriveStatusOperationRow[]) {
  let mergePendingCount = 0;
  let mergeCompletedCount = 0;
  let mergeFailedCount = 0;
  let lastFolderCleanupAt = "";
  let lastOperationSyncAt = "";
  for (const row of rows) {
    const status = String(row.status || "").trim().toLowerCase();
    if (row.operation_type === "duplicate_folder_merge_batch") {
      if (["pending", "in_progress", "uploading"].includes(status)) mergePendingCount += 1;
      else if (["completed", "synced"].includes(status)) mergeCompletedCount += 1;
      else if (["failed", "retry_required", "reconnect_required"].includes(status)) mergeFailedCount += 1;
    }
    if (CLEANUP_TYPES.has(row.operation_type) && ["completed", "synced"].includes(status)) {
      lastFolderCleanupAt = latestTimestamp(lastFolderCleanupAt, row.updated_at);
    }
    if (SYNC_TYPES.has(row.operation_type) && ["completed", "synced"].includes(status)) {
      lastOperationSyncAt = latestTimestamp(lastOperationSyncAt, row.updated_at);
    }
  }
  return {
    mergePendingCount,
    mergeCompletedCount,
    mergeFailedCount,
    lastFolderCleanupAt,
    lastOperationSyncAt,
  };
}

export function latestTimestamp(...values: Array<string | null | undefined>): string {
  return values.filter((value): value is string => Boolean(value))
    .sort((left, right) => right.localeCompare(left))[0] || "";
}
