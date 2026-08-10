import type { ClientDriveErrorCode } from "../../../app/google-drive/error-code-contract";

export type AnyRecord = Record<string, unknown>;

export type WorkNoteData = {
  version: string;
  updatedAt: string;
  generalMemos: AnyRecord[];
  companies: AnyRecord[];
  internalContacts: AnyRecord[];
  notes: AnyRecord[];
  materialSalesNotes: AnyRecord[];
  settlementTasks: AnyRecord[];
  outputTasks: AnyRecord[];
  otherTasks: AnyRecord[];
  accounts: AnyRecord[];
  loadedAt?: string;
  error?: string;
};

export type DataCounts = {
  generalMemos: number;
  companies: number;
  companyContacts: number;
  internalContacts: number;
  equipmentSales: number;
  materialSales: number;
  settlements: number;
  settlementEntries: number;
  outputTasks: number;
  otherTasks: number;
  taskSchedules: number;
  accounts: number;
  attachments: number;
  totalRecords: number;
};

export type MigrationPhase =
  | "unchecked"
  | "no-local-data"
  | "ready"
  | "backup-complete"
  | "uploading"
  | "partial"
  | "failed"
  | "verifying"
  | "verified"
  | "complete";

export type MigrationProgress = {
  phase: MigrationPhase;
  message: string;
  completed: number;
  total: number;
  failedAttachmentIds: string[];
};

export type SyncState = {
  mode: "disabled" | "connecting" | "online" | "saving" | "offline" | "error";
  message: string;
  lastSyncedAt: string;
  pendingCount: number;
  error: string;
};

export type AttachmentSyncStatus =
  | "local_only"
  | "pending"
  | "uploading"
  | "synced"
  | "failed"
  | "retry_required"
  | "reconnect_required";

export type DriveSyncErrorCode = ClientDriveErrorCode;

export type AttachmentRetryStage =
  | "checking_source"
  | "checking_drive"
  | "creating_session"
  | "uploading_source"
  | "creating_drive_session"
  | "uploading_chunks"
  | "finalizing";

export type AttachmentSyncError = {
  code: DriveSyncErrorCode | string;
  message: string;
  detail?: string;
  stage?: AttachmentRetryStage | string;
  retryable?: boolean;
  autoRecoverable?: boolean;
  userActionRequired?: boolean;
};

export type AttachmentSyncProgress = {
  stage?: AttachmentRetryStage | string;
  processedBytes?: number;
  totalBytes?: number;
  currentChunk?: number;
  progress?: number;
  message?: string;
};

export type AttachmentRecord = AnyRecord & {
  id: string;
  blob?: Blob;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  storageProvider?: string;
  driveFileId?: string;
  driveFolderId?: string;
  driveMemoFolderUrl?: string;
  drivePath?: string;
  driveWebViewLink?: string;
  lastSyncedAt?: string;
  syncStatus?: AttachmentSyncStatus;
  syncErrorCode?: DriveSyncErrorCode | string;
  syncErrorMessage?: string;
  syncErrorDetail?: string;
  syncFailedStage?: AttachmentRetryStage | string;
  syncFailedAt?: string;
  retryCount?: number;
  lastRetryAt?: string;
  lastRetryResult?: string;
  autoRecoverable?: boolean;
  userActionRequired?: boolean;
  sourceAvailable?: boolean;
  sourceLocation?: "r2" | "local" | "unknown" | string;
  sourceStatus?: string;
  uploadSessionId?: string;
  operationToken?: string;
  syncProgress?: AttachmentSyncProgress;
};
