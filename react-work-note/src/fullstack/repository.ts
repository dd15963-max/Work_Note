import { normalizeDriveSyncErrorCode } from "../../../app/google-drive/error-code-contract";
import { updateSyncState } from "./syncStore";
import type {
  AttachmentRecord,
  AttachmentSyncError,
  AttachmentSyncProgress,
  AttachmentSyncStatus,
  DataCounts,
  WorkNoteData,
} from "./types";
import { buildServerPayload } from "./serverPayload";

export type SiteUser = {
  id: string;
  email: string;
  displayName?: string;
};

export type GoogleDriveStatus = {
  connected: boolean;
  provider: "google_drive";
  googleEmail?: string;
  rootFolderId?: string;
  rootFolderName?: string;
  rootFolderUrl?: string;
  connectedAt?: string;
  lastSyncedAt?: string;
  driveFileCount?: number;
  legacyFileCount?: number;
  quota?: { limit?: string; usage?: string; usageInDrive?: string } | null;
  error?: string;
  canonicalCompanyFolderCount?: number;
  duplicateCompanyFolderCount?: number;
  duplicateUnknownCompanyFolderCount?: number;
  mergePendingCount?: number;
  mergeCompletedCount?: number;
  mergeFailedCount?: number;
  failedFileCount?: number;
  lastFolderCleanupAt?: string;
  lastDriveSyncAt?: string;
  managedFolderCount?: number;
  retryRequiredCount?: number;
  organizedFileCount?: number;
};

export type DriveOrganizationItem = {
  id?: string;
  folder_id?: string;
  drive_path?: string;
  currentPath?: string;
  targetPath?: string;
  category?: string;
  needsMove?: boolean;
  eligible?: boolean;
  reason?: string;
  excludedReason?: string;
  fileCount?: number;
  memoFolderCount?: number;
  canonicalFolderId?: string;
  canonicalPath?: string;
  trashFolderCount?: number;
  excludedUserFolderCount?: number;
  currentFolderId?: string;
  folderType?: string;
  name?: string;
  action?: string;
};

export type DriveOrganizationResult = {
  checked?: number;
  empty?: number;
  excluded?: number;
  cleaned?: number;
  failed?: number;
  synchronized?: number;
  moveRequired?: number;
  canonicalCompanyFolderCount?: number;
  duplicateCompanyFolderCount?: number;
  duplicateUnknownCompanyFolderCount?: number;
  mergePendingCount?: number;
  mergeCompletedCount?: number;
  mergeFailedCount?: number;
  companyGroups?: number;
  duplicateCompanyFolders?: number;
  duplicateMemoFolders?: number;
  filesToMove?: number;
  filesMoved?: number;
  foldersTrashed?: number;
  protectedUserFolders?: number;
  protectedRoot?: number;
  excludedNonEmpty?: number;
  planFingerprint?: string;
  operationToken?: string;
  idempotentReplay?: boolean;
  folders?: DriveOrganizationItem[];
  items?: DriveOrganizationItem[];
  remaining?: DriveOrganizationResult | number;
};

type ErrorPayload = {
  error?: string | AttachmentSyncError;
  code?: string;
  message?: string;
  detail?: string;
  stage?: string;
  retryable?: boolean;
  autoRecoverable?: boolean;
  userActionRequired?: boolean;
  status?: AttachmentSyncStatus;
  sessionId?: string;
  sourceStatus?: string;
};

export class RepositoryError extends Error {
  code: string;
  detail: string;
  stage: string;
  retryable: boolean;
  autoRecoverable: boolean;
  userActionRequired: boolean;
  syncStatus?: AttachmentSyncStatus;
  sessionId: string;
  sourceStatus: string;

  constructor(message: string, values: Partial<RepositoryError> = {}) {
    super(message);
    this.name = "RepositoryError";
    this.code = values.code || "unknown";
    this.detail = values.detail || "";
    this.stage = values.stage || "";
    this.retryable = Boolean(values.retryable);
    this.autoRecoverable = Boolean(values.autoRecoverable);
    this.userActionRequired = Boolean(values.userActionRequired);
    this.syncStatus = values.syncStatus;
    this.sessionId = values.sessionId || "";
    this.sourceStatus = values.sourceStatus || "";
  }
}

export function applySourceStatusFallback(error: RepositoryError, sourceReady: boolean): RepositoryError {
  if (!error.sourceStatus && sourceReady) error.sourceStatus = "available";
  return error;
}

export type AttachmentRetryResult = {
  succeeded: number;
  failed: number;
  skipped: number;
  records: AttachmentRecord[];
  errors: Array<{ id: string; error: RepositoryError }>;
};

export type AttachmentProgressListener = (
  attachmentId: string,
  progress: AttachmentSyncProgress,
) => void;

const PENDING_DATASET_KEY = "workNotePendingServerSyncV1";
const PENDING_ATTACHMENTS_KEY = "workNotePendingAttachmentSyncV1";
const PENDING_ATTACHMENT_DELETES_KEY = "workNotePendingAttachmentDeleteV1";
const MIGRATION_MARKER_KEY = "workNoteServerMigrationV1";
const ATTACHMENT_DB_NAME = "salesNoteAttachmentDbV1";
const ATTACHMENT_STORE_NAME = "files";
const ATTACHMENT_DB_VERSION = 1;

let user: SiteUser | null = null;
let flushing: Promise<void> | null = null;
let flushingAttachments: Promise<void> | null = null;
let onlineListenerAttached = false;

function emptyData(): WorkNoteData {
  return {
    version: "sites-work-note-v1",
    updatedAt: "",
    generalMemos: [],
    companies: [],
    internalContacts: [],
    notes: [],
    materialSalesNotes: [],
    settlementTasks: [],
    outputTasks: [],
    otherTasks: [],
    accounts: [],
    loadedAt: new Date().toISOString(),
  };
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object")
    : [];
}

async function responseError(response: Response): Promise<RepositoryError> {
  try {
    const payload = await response.json() as ErrorPayload;
    const nested = payload.error && typeof payload.error === "object"
      ? payload.error
      : null;
    const message = nested?.message
      || payload.message
      || (typeof payload.error === "string" ? payload.error : "")
      || `서버 요청 실패 (${response.status})`;
    return new RepositoryError(message, {
      code: normalizeDriveSyncErrorCode(
        nested?.code || payload.code || `http_${response.status}`,
      ),
      detail: nested?.detail || payload.detail || "",
      stage: nested?.stage || payload.stage || "",
      retryable: nested?.retryable ?? payload.retryable ?? response.status >= 500,
      autoRecoverable: nested?.autoRecoverable ?? payload.autoRecoverable ?? false,
      userActionRequired: nested?.userActionRequired ?? payload.userActionRequired ?? false,
      syncStatus: payload.status,
      sessionId: payload.sessionId || "",
      sourceStatus: payload.sourceStatus || "",
    });
  } catch {
    return new RepositoryError(`서버 요청 실패 (${response.status})`, {
      code: `http_${response.status}`,
      retryable: response.status >= 500,
    });
  }
}

export function repositoryErrorFields(error: unknown): Partial<AttachmentRecord> {
  const value = error instanceof RepositoryError
    ? error
    : new RepositoryError(error instanceof Error ? error.message : String(error));
  const code = normalizeDriveSyncErrorCode(value.code);
  const reconnect = value.syncStatus === "reconnect_required"
    || ["auth_expired", "drive_disconnected", "permission_denied"].includes(code);
  const sourceFields: Partial<AttachmentRecord> = value.sourceStatus === "available"
    ? { sourceAvailable: true, sourceLocation: "r2", sourceStatus: "available" }
    : value.sourceStatus
      ? { sourceAvailable: false, sourceLocation: "unknown", sourceStatus: value.sourceStatus }
      : {};
  return {
    syncStatus: reconnect ? "reconnect_required" : value.retryable ? "retry_required" : "failed",
    syncErrorCode: code,
    syncErrorMessage: value.message,
    syncErrorDetail: value.detail,
    syncFailedStage: value.stage,
    syncFailedAt: new Date().toISOString(),
    autoRecoverable: value.autoRecoverable,
    userActionRequired: value.userActionRequired,
    uploadSessionId: value.sessionId,
    ...sourceFields,
  };
}

export function initializeRemoteRuntime(nextUser: SiteUser) {
  user = nextUser;
  updateSyncState({
    mode: navigator.onLine ? "online" : "offline",
    message: navigator.onLine ? "Sites 서버 연결됨" : "오프라인",
    pendingCount: pendingCount(),
    error: "",
  });
  if (!onlineListenerAttached) {
    window.addEventListener("online", () => void flushPendingChanges());
    window.addEventListener("offline", () =>
      updateSyncState({
        mode: "offline",
        message: "오프라인 · 변경사항은 이 기기에 보관됩니다.",
      }));
    onlineListenerAttached = true;
  }
  void flushPendingChanges();
}

export function clearRemoteRuntime() {
  user = null;
  updateSyncState({
    mode: "disabled",
    message: "로그아웃",
    lastSyncedAt: "",
    pendingCount: pendingCount(),
    error: "",
  });
}

export function isRemoteModeActive(): boolean {
  return Boolean(user);
}

export function getRemoteUser(): SiteUser | null {
  return user;
}

export function hasCompletedMigration(): boolean {
  if (!user) return false;
  try {
    const marker = JSON.parse(
      window.localStorage.getItem(MIGRATION_MARKER_KEY) || "{}",
    ) as { userId?: string; completedAt?: string };
    return marker.userId === user.id && Boolean(marker.completedAt);
  } catch {
    return false;
  }
}

export function markMigrationComplete() {
  if (!user) return;
  window.localStorage.setItem(
    MIGRATION_MARKER_KEY,
    JSON.stringify({ userId: user.id, completedAt: new Date().toISOString() }),
  );
}

export async function loadServerDataset(): Promise<WorkNoteData> {
  ensureRuntime();
  updateSyncState({
    mode: "connecting",
    message: "서버 데이터를 불러오는 중",
    error: "",
  });
  const response = await fetch("/api/workspace", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    const error = await responseError(response);
    updateSyncState({
      mode: "error",
      message: "서버 불러오기 실패",
      error: error.message,
    });
    throw error;
  }
  const payload = await response.json() as Record<string, unknown>;
  const result: WorkNoteData = {
    ...emptyData(),
    version: String(payload.version || "sites-work-note-v1"),
    updatedAt: String(payload.updatedAt || payload.updated_at || ""),
    companies: asArray(payload.companies),
    internalContacts: asArray(payload.internalContacts),
    notes: asArray(payload.notes),
    materialSalesNotes: asArray(payload.materialSalesNotes),
    settlementTasks: asArray(payload.settlementTasks),
    outputTasks: asArray(payload.outputTasks),
    otherTasks: asArray(payload.otherTasks),
    accounts: asArray(payload.accounts),
    loadedAt: new Date().toISOString(),
  };
  updateSyncState({
    mode: "online",
    message: "동기화 완료",
    lastSyncedAt: new Date().toISOString(),
    error: "",
  });
  return result;
}

export async function syncServerDataset(
  data: WorkNoteData,
  _reason: string,
  _mode: "sync" | "merge" | "replace" = "sync",
  _migrationBatchId = "",
): Promise<void> {
  ensureRuntime();
  const response = await fetch("/api/workspace", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildServerPayload(data)),
  });
  if (!response.ok) throw await responseError(response);
}

export function enqueueRemoteDatasetSync(
  data: WorkNoteData,
  reason: string,
) {
  if (!isRemoteModeActive()) return;
  window.localStorage.setItem(
    PENDING_DATASET_KEY,
    JSON.stringify({ data, reason, queuedAt: new Date().toISOString() }),
  );
  updateSyncState({
    pendingCount: pendingCount(),
    message: navigator.onLine ? "저장 대기" : "오프라인 저장 대기",
  });
  void flushPendingDataset();
}

export async function flushPendingDataset(): Promise<void> {
  if (!isRemoteModeActive() || flushing) return flushing || Promise.resolve();
  if (!navigator.onLine) {
    updateSyncState({
      mode: "offline",
      message: "오프라인 · 변경사항 저장 대기",
      pendingCount: pendingCount(),
    });
    return;
  }
  flushing = (async () => {
    while (isRemoteModeActive()) {
      const raw = window.localStorage.getItem(PENDING_DATASET_KEY);
      if (!raw) break;
      let pending: { data: WorkNoteData; reason: string; queuedAt: string };
      try {
        pending = JSON.parse(raw) as typeof pending;
      } catch {
        window.localStorage.removeItem(PENDING_DATASET_KEY);
        break;
      }
      updateSyncState({
        mode: "saving",
        message: "Sites 서버 저장 중",
        pendingCount: pendingCount(),
        error: "",
      });
      try {
        await syncServerDataset(pending.data, pending.reason);
        if (window.localStorage.getItem(PENDING_DATASET_KEY) === raw) {
          window.localStorage.removeItem(PENDING_DATASET_KEY);
        }
        updateSyncState({
          mode: "online",
          message: "동기화 완료",
          lastSyncedAt: new Date().toISOString(),
          pendingCount: pendingCount(),
          error: "",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        updateSyncState({
          mode: navigator.onLine ? "error" : "offline",
          message: "서버 저장 실패 · 재시도 대기",
          pendingCount: pendingCount(),
          error: message,
        });
        break;
      }
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

export function clearPendingSync() {
  window.localStorage.removeItem(PENDING_DATASET_KEY);
  window.localStorage.removeItem(PENDING_ATTACHMENTS_KEY);
  window.localStorage.removeItem(PENDING_ATTACHMENT_DELETES_KEY);
  updateSyncState({
    pendingCount: 0,
    error: "",
    message: isRemoteModeActive() ? "동기화 완료" : "서버 연결 준비",
  });
}

function readIdQueue(key: string): string[] {
  try {
    const values = JSON.parse(window.localStorage.getItem(key) || "[]") as unknown;
    return Array.isArray(values)
      ? [...new Set(values.map(String).filter(Boolean))]
      : [];
  } catch {
    return [];
  }
}

function writeIdQueue(key: string, ids: string[]) {
  const next = [...new Set(ids.filter(Boolean))];
  if (next.length) window.localStorage.setItem(key, JSON.stringify(next));
  else window.localStorage.removeItem(key);
  updateSyncState({ pendingCount: pendingCount() });
}

function pendingCount(): number {
  return (window.localStorage.getItem(PENDING_DATASET_KEY) ? 1 : 0)
    + readIdQueue(PENDING_ATTACHMENTS_KEY).length
    + readIdQueue(PENDING_ATTACHMENT_DELETES_KEY).length;
}

function addPendingAttachment(id: string) {
  writeIdQueue(
    PENDING_ATTACHMENTS_KEY,
    [...readIdQueue(PENDING_ATTACHMENTS_KEY), id],
  );
}

function removePendingAttachment(id: string) {
  writeIdQueue(
    PENDING_ATTACHMENTS_KEY,
    readIdQueue(PENDING_ATTACHMENTS_KEY).filter((item) => item !== id),
  );
}

function addPendingAttachmentDelete(id: string) {
  writeIdQueue(
    PENDING_ATTACHMENT_DELETES_KEY,
    [...readIdQueue(PENDING_ATTACHMENT_DELETES_KEY), id],
  );
}

function removePendingAttachmentDelete(id: string) {
  writeIdQueue(
    PENDING_ATTACHMENT_DELETES_KEY,
    readIdQueue(PENDING_ATTACHMENT_DELETES_KEY).filter((item) => item !== id),
  );
}

export function getPendingAttachmentIds(): string[] {
  return readIdQueue(PENDING_ATTACHMENTS_KEY);
}

export type UploadSessionResponse = {
  ok?: boolean;
  sessionId: string;
  operationToken?: string;
  chunkSize?: number;
  nextOffset?: number;
  sourceStatus?: string;
  status?: AttachmentSyncStatus;
  processedBytes?: number;
  totalBytes?: number;
  currentChunk?: number;
  progress?: number;
  driveFileId?: string;
  retryAfterMs?: number;
  adopted?: boolean;
  alreadyUploaded?: boolean;
  sourceRestarted?: boolean;
  sourceAdopted?: boolean;
  restartReason?: string;
  error?: AttachmentSyncError;
};

export const SAFE_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;

function uploadEndpoint(action: string, values: Record<string, string | number> = {}): string {
  const params = new URLSearchParams({ action });
  Object.entries(values).forEach(([key, value]) => params.set(key, String(value)));
  return `/api/files/upload?${params.toString()}`;
}

function uploadPayloadError(payload: UploadSessionResponse): RepositoryError | null {
  if (!payload.error && payload.ok !== false) return null;
  const error = payload.error || {
    code: "unknown",
    message: "Google Drive 저장을 완료하지 못했습니다.",
  };
  return new RepositoryError(error.message, {
    code: normalizeDriveSyncErrorCode(error.code),
    detail: error.detail || "",
    stage: error.stage || "",
    retryable: error.retryable,
    autoRecoverable: error.autoRecoverable,
    userActionRequired: error.userActionRequired,
    syncStatus: payload.status,
    sessionId: payload.sessionId,
    sourceStatus: payload.sourceStatus || "",
  });
}

async function uploadJson(
  action: string,
  body: Record<string, unknown>,
): Promise<UploadSessionResponse> {
  let response: Response;
  try {
    response = await fetch(uploadEndpoint(action), {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new RepositoryError(
      error instanceof Error ? error.message : "네트워크 연결 시간이 초과되었습니다.",
      { code: "network_timeout", stage: action, retryable: true, autoRecoverable: true },
    );
  }
  if (!response.ok) throw await responseError(response);
  const payload = await response.json() as UploadSessionResponse;
  const error = uploadPayloadError(payload);
  if (error) throw error;
  return payload;
}

function reportAttachmentProgress(
  attachmentId: string,
  fileName: string,
  progress: AttachmentSyncProgress,
  listener?: AttachmentProgressListener,
) {
  listener?.(attachmentId, progress);
  const percent = Number(progress.progress || (
    Number(progress.totalBytes || 0) > 0
      ? Math.round((Number(progress.processedBytes || 0) / Number(progress.totalBytes)) * 100)
      : 0
  ));
  updateSyncState({
    mode: "saving",
    message: percent
      ? `${fileName} Google Drive 저장 ${Math.min(100, percent)}%`
      : `${fileName} Google Drive 저장 중`,
    error: "",
  });
}

export async function uploadSourceParts(
  attachmentId: string,
  fileName: string,
  blob: Blob,
  session: UploadSessionResponse,
  listener?: AttachmentProgressListener,
): Promise<UploadSessionResponse> {
  const serverChunkSize = Number(session.chunkSize || SAFE_UPLOAD_CHUNK_BYTES);
  const chunkSize = Math.max(256 * 1024, Math.min(SAFE_UPLOAD_CHUNK_BYTES, serverChunkSize));
  let offset = Math.max(0, Number(session.nextOffset || 0));
  let latest = session;
  let restartCount = 0;

  while (offset < blob.size) {
    const endExclusive = Math.min(blob.size, offset + chunkSize);
    const partNumber = Math.floor(offset / chunkSize) + 1;
    const chunk = blob.slice(offset, endExclusive);
    let response: Response;
    try {
      response = await fetch(uploadEndpoint("part", {
        sessionId: session.sessionId,
        partNumber,
      }), {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Range": `bytes ${offset}-${endExclusive - 1}/${blob.size}`,
        },
        body: chunk,
      });
    } catch (error) {
      throw new RepositoryError(
        error instanceof Error ? error.message : "파일 청크 전송에 실패했습니다.",
        {
          code: "network_timeout",
          stage: "uploading_source",
          retryable: true,
          autoRecoverable: true,
          sessionId: session.sessionId,
        },
      );
    }
    if (!response.ok) throw await responseError(response);
    latest = await response.json() as UploadSessionResponse;
    const payloadError = uploadPayloadError(latest);
    if (payloadError) throw payloadError;
    if (latest.sourceStatus === "available") return latest;
    if (latest.sourceRestarted) {
      restartCount += 1;
      if (restartCount > 3) {
        throw new RepositoryError("원본 보관 세션이 반복해서 만료되었습니다. 잠시 후 다시 시도해 주세요.", {
          code: "R2_UPLOAD_EXPIRED",
          stage: "uploading_source",
          retryable: true,
          autoRecoverable: true,
          sessionId: session.sessionId,
          sourceStatus: latest.sourceStatus || "uploading",
        });
      }
      offset = Math.max(0, Number(latest.nextOffset || 0));
      continue;
    }
    const nextOffset = Number(latest.nextOffset ?? latest.processedBytes ?? endExclusive);
    if (nextOffset <= offset) {
      throw new RepositoryError("업로드된 파일 범위를 확인하지 못했습니다.", {
        code: "stream_error",
        stage: "uploading_source",
        retryable: true,
        sessionId: session.sessionId,
      });
    }
    offset = nextOffset;
    reportAttachmentProgress(attachmentId, fileName, {
      stage: "uploading_source",
      processedBytes: offset,
      totalBytes: blob.size,
      currentChunk: partNumber,
      progress: Math.round((offset / Math.max(1, blob.size)) * 100),
    }, listener);
  }
  return latest;
}

export async function completeDriveUpload(
  attachmentId: string,
  fileName: string,
  sessionId: string,
  fileSize: number,
  listener?: AttachmentProgressListener,
  initial?: UploadSessionResponse,
): Promise<UploadSessionResponse> {
  let state = initial || await uploadJson("drive-init", { sessionId });
  if (state.status === "synced") return state;
  const maxSteps = Math.max(12, Math.ceil(fileSize / SAFE_UPLOAD_CHUNK_BYTES) + 12);

  for (let step = 0; step < maxSteps; step += 1) {
    if (["failed", "retry_required", "reconnect_required"].includes(String(state.status || ""))) {
      throw uploadPayloadError(state) || new RepositoryError(
        "Google Drive 저장을 완료하지 못했습니다.",
        {
          code: "unknown",
          stage: "uploading_chunks",
          retryable: state.status === "retry_required",
          syncStatus: state.status,
          sessionId,
        },
      );
    }
    if (state.status === "synced") return state;
    const wait = Math.min(5000, Math.max(0, Number(state.retryAfterMs || 0)));
    if (wait > 0) await new Promise((resolve) => window.setTimeout(resolve, wait));
    state = await uploadJson("drive-next", { sessionId });
    reportAttachmentProgress(attachmentId, fileName, {
      stage: state.status === "synced" ? "finalizing" : "uploading_chunks",
      processedBytes: Number(state.processedBytes || 0),
      totalBytes: Number(state.totalBytes || fileSize),
      currentChunk: Number(state.currentChunk || step + 1),
      progress: Number(state.progress || 0),
    }, listener);
  }

  throw new RepositoryError("Google Drive 분할 업로드가 제한된 처리 횟수를 초과했습니다.", {
    code: "network_timeout",
    stage: "uploading_chunks",
    retryable: true,
    autoRecoverable: true,
    sessionId,
  });
}

export async function uploadRemoteAttachment(
  record: AttachmentRecord,
  migrationBatchId = "",
  onProgress?: AttachmentProgressListener,
): Promise<AttachmentRecord> {
  ensureRuntime();
  if (!record.id || !(record.blob instanceof Blob)) {
    throw new RepositoryError("업로드할 첨부 원본이 없습니다.", {
      code: "source_missing",
      stage: "checking_source",
      userActionRequired: true,
    });
  }
  const fileName = String(record.fileName || record.name || "attachment");
  const fileType = String(record.fileType || record.blob.type || "application/octet-stream");
  const fileSize = Number(record.fileSize || record.blob.size || 0);
  const metadata = { ...record, fileName, fileType, fileSize, migrationBatchId };
  delete metadata.blob;
  addPendingAttachment(record.id);
  reportAttachmentProgress(record.id, fileName, {
    stage: "creating_session",
    processedBytes: 0,
    totalBytes: fileSize,
    progress: 0,
  }, onProgress);

  const session = await uploadJson("init", {
    id: record.id,
    fileName,
    mimeType: fileType,
    fileSize,
    metadata,
    operationToken: String(record.operationToken || `attachment:${record.id}:${fileSize}`),
  });

  let sourceReady = session.sourceStatus === "available";
  try {
    let sourceState = session;
    for (let sourceAttempt = 0; !sourceReady && sourceAttempt < 4; sourceAttempt += 1) {
      sourceState = await uploadSourceParts(
        record.id,
        fileName,
        record.blob,
        sourceState,
        onProgress,
      );
      if (sourceState.sourceStatus === "available") {
        sourceReady = true;
        break;
      }
      const completed = await uploadJson("source-complete", { sessionId: session.sessionId });
      if (completed.sourceStatus === "available") {
        sourceReady = true;
        break;
      }
      if (!completed.sourceRestarted) {
        throw new RepositoryError("R2 원본 보관 상태를 확인하지 못했습니다.", {
          code: "source_incomplete",
          stage: "finalizing_source",
          retryable: true,
          sessionId: session.sessionId,
          sourceStatus: completed.sourceStatus || "",
        });
      }
      sourceState = completed;
    }
    if (!sourceReady) {
      throw new RepositoryError("R2 원본 보관 세션이 반복해서 만료되었습니다.", {
        code: "R2_UPLOAD_EXPIRED",
        stage: "finalizing_source",
        retryable: true,
        autoRecoverable: true,
        sessionId: session.sessionId,
        sourceStatus: sourceState.sourceStatus || "uploading",
      });
    }
    reportAttachmentProgress(record.id, fileName, {
      stage: "creating_drive_session",
      processedBytes: fileSize,
      totalBytes: fileSize,
      progress: 100,
    }, onProgress);
    const drive = await uploadJson("drive-init", { sessionId: session.sessionId });
    await completeDriveUpload(record.id, fileName, session.sessionId, fileSize, onProgress, drive);
  } catch (caught) {
    if (caught instanceof RepositoryError) applySourceStatusFallback(caught, sourceReady);
    throw caught;
  }
  removePendingAttachment(record.id);
  const remote = await getRemoteAttachmentMetadata(record.id);
  return {
    ...record,
    ...(remote || {}),
    id: record.id,
    blob: record.blob,
    sourceAvailable: true,
    sourceLocation: "r2",
    sourceStatus: "available",
    syncStatus: "synced",
    syncErrorCode: "",
    syncErrorMessage: "",
    syncErrorDetail: "",
    syncFailedStage: "",
    uploadSessionId: session.sessionId,
    operationToken: session.operationToken || record.operationToken,
  };
}

export function queueRemoteAttachmentUpload(record: AttachmentRecord) {
  if (!isRemoteModeActive() || !(record.blob instanceof Blob)) return;
  removePendingAttachmentDelete(record.id);
  addPendingAttachment(record.id);
  void flushPendingAttachments();
}

export async function getRemoteAttachmentMetadata(
  id: string,
): Promise<AttachmentRecord | null> {
  if (!isRemoteModeActive() || !id) return null;
  const response = await fetch(
    `/api/files?id=${encodeURIComponent(id)}&metadata=1`,
    { credentials: "same-origin", cache: "no-store" },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<AttachmentRecord>;
}

export async function refreshRemoteAttachments(
  ids: string[],
): Promise<AttachmentRecord[]> {
  const records: AttachmentRecord[] = [];
  for (const id of [...new Set(ids.filter(Boolean))]) {
    const record = await getRemoteAttachmentMetadata(id);
    if (record) records.push(record);
  }
  return records;
}

export async function downloadRemoteAttachment(
  id: string,
): Promise<AttachmentRecord | null> {
  const metadata = await getRemoteAttachmentMetadata(id);
  if (!metadata) return null;
  const fileResponse = await fetch(
    `/api/files?id=${encodeURIComponent(id)}`,
    { credentials: "same-origin", cache: "no-store" },
  );
  if (!fileResponse.ok) throw await responseError(fileResponse);
  const blob = await fileResponse.blob();
  if (Number(metadata.fileSize || 0) && blob.size !== Number(metadata.fileSize)) {
    throw new RepositoryError("첨부파일 크기 검증에 실패했습니다.", {
      code: "stream_error",
      stage: "download",
      retryable: true,
    });
  }
  return { ...metadata, id, blob };
}

export function queueRemoteAttachmentDelete(id: string) {
  if (!isRemoteModeActive() || !id) return;
  removePendingAttachment(id);
  addPendingAttachmentDelete(id);
  void flushPendingAttachments();
}

export async function flushPendingChanges(): Promise<void> {
  await flushPendingDataset();
  await flushPendingAttachments();
}

async function flushPendingAttachments(): Promise<void> {
  if (!isRemoteModeActive() || flushingAttachments) {
    return flushingAttachments || Promise.resolve();
  }
  if (!navigator.onLine) {
    updateSyncState({
      mode: "offline",
      message: "오프라인 · 첨부 변경사항 저장 대기",
      pendingCount: pendingCount(),
    });
    return;
  }
  const startedQueue = JSON.stringify([
    readIdQueue(PENDING_ATTACHMENTS_KEY),
    readIdQueue(PENDING_ATTACHMENT_DELETES_KEY),
  ]);
  let continueAfterFlush = false;
  flushingAttachments = (async () => {
    let lastError = "";
    for (const id of readIdQueue(PENDING_ATTACHMENTS_KEY)) {
      try {
        const record = await readLocalAttachmentForRetry(id);
        if (!record?.blob) {
          throw new Error(`${id}: 로컬 첨부 원본을 찾지 못했습니다.`);
        }
        updateSyncState({
          mode: "saving",
          message: "첨부파일 서버 저장 중",
          error: "",
        });
        await uploadRemoteAttachment(record);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    for (const id of readIdQueue(PENDING_ATTACHMENT_DELETES_KEY)) {
      try {
        const response = await fetch(
          `/api/files?id=${encodeURIComponent(id)}`,
          { method: "DELETE", credentials: "same-origin" },
        );
        if (!response.ok) throw await responseError(response);
        removePendingAttachmentDelete(id);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    const remaining = pendingCount();
    const finishedQueue = JSON.stringify([
      readIdQueue(PENDING_ATTACHMENTS_KEY),
      readIdQueue(PENDING_ATTACHMENT_DELETES_KEY),
    ]);
    continueAfterFlush =
      finishedQueue !== startedQueue && finishedQueue !== "[[],[]]";
    updateSyncState(
      lastError && remaining > 0
        ? {
            mode: "error",
            message: "첨부파일 저장 실패 · 재시도 대기",
            pendingCount: remaining,
            error: lastError,
          }
        : {
            mode: "online",
            message: "동기화 완료",
            lastSyncedAt: new Date().toISOString(),
            pendingCount: remaining,
            error: "",
          },
    );
  })().finally(() => {
    flushingAttachments = null;
    if (continueAfterFlush && navigator.onLine && isRemoteModeActive()) {
      void flushPendingAttachments();
    }
  });
  return flushingAttachments;
}

async function readLocalAttachmentForRetry(
  id: string,
): Promise<AttachmentRecord | null> {
  if (!window.indexedDB || !id) return null;
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(
      ATTACHMENT_DB_NAME,
      ATTACHMENT_DB_VERSION,
    );
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(ATTACHMENT_STORE_NAME)) {
        request.result.createObjectStore(ATTACHMENT_STORE_NAME, {
          keyPath: "id",
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("첨부파일 저장소를 열지 못했습니다."));
  });
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ATTACHMENT_STORE_NAME, "readonly");
    const request = transaction.objectStore(ATTACHMENT_STORE_NAME).get(id);
    request.onsuccess = () =>
      resolve((request.result as AttachmentRecord | undefined) || null);
    request.onerror = () =>
      reject(request.error || new Error("첨부파일을 읽지 못했습니다."));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => db.close();
  });
}

export async function getServerCounts(): Promise<DataCounts> {
  ensureRuntime();
  const response = await fetch("/api/workspace?counts=1", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<DataCounts>;
}

export async function getGoogleDriveStatus(): Promise<GoogleDriveStatus> {
  ensureRuntime();
  const response = await fetch("/api/google-drive/status", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<GoogleDriveStatus>;
}

export function connectGoogleDrive(returnTo = "/") {
  window.location.assign(`/api/google-drive/oauth/start?returnTo=${encodeURIComponent(returnTo)}`);
}

export async function disconnectGoogleDrive(): Promise<void> {
  ensureRuntime();
  const response = await fetch("/api/google-drive/disconnect", { method: "DELETE", credentials: "same-origin" });
  if (!response.ok) throw await responseError(response);
}

export async function reconnectGoogleDrive(returnTo = "/"): Promise<void> {
  await disconnectGoogleDrive();
  connectGoogleDrive(returnTo);
}

export async function testGoogleDriveConnection(): Promise<void> {
  ensureRuntime();
  const response = await fetch("/api/google-drive/test", { method: "POST", credentials: "same-origin" });
  if (!response.ok) throw await responseError(response);
}

export async function recheckGoogleDriveConnection(): Promise<GoogleDriveStatus> {
  await testGoogleDriveConnection();
  return getGoogleDriveStatus();
}

export async function migrateLegacyAttachmentsToDrive(
  onProgress?: (migrated: number, remaining: number) => void,
): Promise<{ migrated: number; failed: number; remaining: number }> {
  ensureRuntime();
  let migrated = 0;
  let failed = 0;
  let remaining = 1;
  while (remaining > 0) {
    const response = await fetch("/api/google-drive/migrate", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!response.ok) throw await responseError(response);
    const result = await response.json() as {
      migrated: number;
      failed: number;
      remaining: number;
      inProgress?: boolean;
      sessionId?: string;
      processedBytes?: number;
      totalBytes?: number;
    };
    migrated += Number(result.migrated || 0);
    failed += Number(result.failed || 0);
    remaining = Number(result.remaining || 0);
    onProgress?.(migrated, remaining);
    if (result.failed > 0 || (result.migrated === 0 && !result.inProgress)) break;
  }
  return { migrated, failed, remaining };
}

export async function updateRemoteAttachment(
  id: string,
  values: { fileName?: string; ownerKind?: string; ownerLocalId?: string; companyName?: string; companyId?: string; memoTitle?: string; category?: string; sentDate?: string; memo?: string },
): Promise<AttachmentRecord | null> {
  if (!isRemoteModeActive() || !id) return null;
  const response = await fetch("/api/files", {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...values }),
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<AttachmentRecord>;
}


export async function retryRemoteAttachments(
  ids: string[],
  onProgress?: AttachmentProgressListener,
): Promise<AttachmentRetryResult> {
  ensureRuntime();
  const result: AttachmentRetryResult = {
    succeeded: 0,
    failed: 0,
    skipped: 0,
    records: [],
    errors: [],
  };

  for (const id of [...new Set(ids.filter(Boolean))]) {
    let metadata = await getRemoteAttachmentMetadata(id);
    if (!metadata) {
      const error = new RepositoryError("첨부파일 정보를 찾지 못했습니다.", {
        code: "invalid_file",
        stage: "checking_source",
        userActionRequired: true,
      });
      result.failed += 1;
      result.errors.push({ id, error });
      result.records.push({ id, ...repositoryErrorFields(error) });
      continue;
    }
    if (String(metadata.syncStatus) === "synced" && metadata.driveFileId) {
      result.skipped += 1;
      result.records.push(metadata);
      continue;
    }

    try {
      onProgress?.(id, {
        stage: "checking_source",
        processedBytes: 0,
        totalBytes: Number(metadata.fileSize || 0),
        progress: 0,
      });
      const state = await uploadJson("retry", {
        sessionId: metadata.uploadSessionId,
        attachmentId: id,
      });
      const fileName = String(metadata.fileName || metadata.name || "attachment");
      await completeDriveUpload(
        id,
        fileName,
        state.sessionId,
        Number(metadata.fileSize || state.totalBytes || 0),
        onProgress,
        state,
      );
      removePendingAttachment(id);
      metadata = await getRemoteAttachmentMetadata(id) || metadata;
      result.succeeded += 1;
      result.records.push({
        ...metadata,
        syncStatus: "synced",
        syncErrorCode: "",
        syncErrorMessage: "",
        syncErrorDetail: "",
        syncFailedStage: "",
        lastRetryAt: new Date().toISOString(),
        lastRetryResult: "Google Drive 저장 완료",
      });
    } catch (caught) {
      const error = caught instanceof RepositoryError
        ? caught
        : new RepositoryError(caught instanceof Error ? caught.message : String(caught));
      let latest = metadata;
      try {
        latest = await getRemoteAttachmentMetadata(id) || metadata;
      } catch {
        // Preserve the last known metadata when the status refresh also fails.
      }
      result.failed += 1;
      result.errors.push({ id, error });
      result.records.push({
        ...latest,
        ...repositoryErrorFields(error),
        retryCount: Number(latest.retryCount || 0) + 1,
        lastRetryAt: new Date().toISOString(),
        lastRetryResult: error.message,
      });
    }
  }
  return result;
}

async function driveOrganizationRequest(
  action: "cleanup-preview" | "cleanup" | "migration-preview" | "migrate" | "retry" | "duplicates-preview" | "merge-duplicates",
  values: Record<string, unknown> = {},
): Promise<DriveOrganizationResult> {
  ensureRuntime();
  const response = await fetch("/api/google-drive/organize", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...values }),
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<DriveOrganizationResult>;
}

export function previewDriveMigration(): Promise<DriveOrganizationResult> {
  return driveOrganizationRequest("migration-preview");
}

export function runDriveMigration(): Promise<DriveOrganizationResult> {
  return driveOrganizationRequest("migrate");
}

export function previewEmptyDriveFolders(): Promise<DriveOrganizationResult> {
  return driveOrganizationRequest("cleanup-preview");
}

export function cleanupEmptyDriveFolders(): Promise<DriveOrganizationResult> {
  return driveOrganizationRequest("cleanup");
}

export function retryDriveOrganization(): Promise<DriveOrganizationResult> {
  return driveOrganizationRequest("retry");
}

export function previewDuplicateDriveFolders(): Promise<DriveOrganizationResult> {
  return driveOrganizationRequest("duplicates-preview");
}

export function mergeDuplicateDriveFolders(
  planFingerprint = "",
  operationToken = `merge-folders:${planFingerprint || Date.now()}`,
): Promise<DriveOrganizationResult> {
  return driveOrganizationRequest("merge-duplicates", {
    planFingerprint,
    operationToken,
  });
}

export async function getRecentDriveOperations(): Promise<Record<string, unknown>[]> {
  ensureRuntime();
  const response = await fetch("/api/google-drive/organize?mode=logs", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw await responseError(response);
  const result = await response.json() as { operations?: Record<string, unknown>[] };
  return result.operations || [];
}

export async function softDeleteAllAccountData(): Promise<void> {
  ensureRuntime();
  const response = await fetch("/api/workspace", {
    method: "DELETE",
    credentials: "same-origin",
  });
  if (!response.ok) throw await responseError(response);
  clearPendingSync();
}

export async function addMigrationLog(values: Record<string, unknown>) {
  if (!isRemoteModeActive()) return;
  const response = await fetch("/api/workspace", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  if (!response.ok) throw await responseError(response);
}

function ensureRuntime() {
  if (!user) throw new Error("로그인된 ChatGPT Sites 세션이 없습니다.");
}
