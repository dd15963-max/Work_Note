import { updateSyncState } from "./syncStore";
import type { AttachmentRecord, DataCounts, WorkNoteData } from "./types";
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
};

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

async function responseError(response: Response): Promise<Error> {
  try {
    const payload = await response.json() as { error?: string };
    return new Error(payload.error || `서버 요청 실패 (${response.status})`);
  } catch {
    return new Error(`서버 요청 실패 (${response.status})`);
  }
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

async function sha256ForBlob(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) return "";
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return Array.from(
    new Uint8Array(digest),
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");
}

export async function uploadRemoteAttachment(
  record: AttachmentRecord,
  migrationBatchId = "",
): Promise<void> {
  ensureRuntime();
  if (!record.id || !(record.blob instanceof Blob)) {
    throw new Error("업로드할 첨부 원본이 없습니다.");
  }
  const fileName = String(record.fileName || record.name || "attachment");
  const fileHash =
    String(record.sha256 || "") || await sha256ForBlob(record.blob);
  const metadata = {
    ...record,
    fileName,
    fileType: String(
      record.fileType || record.blob.type || "application/octet-stream",
    ),
    fileSize: Number(record.fileSize || record.blob.size || 0),
    sha256: fileHash,
    migrationBatchId,
  };
  delete metadata.blob;
  const form = new FormData();
  form.set("id", record.id);
  form.set("metadata", JSON.stringify(metadata));
  form.set("file", record.blob, fileName);
  const response = await uploadFormWithProgress(form, fileName, record.id);
  if (!response.ok) throw await responseError(response);
  removePendingAttachment(record.id);
}

export function queueRemoteAttachmentUpload(record: AttachmentRecord) {
  if (!isRemoteModeActive() || !(record.blob instanceof Blob)) return;
  removePendingAttachmentDelete(record.id);
  addPendingAttachment(record.id);
  void flushPendingAttachments();
}

export async function downloadRemoteAttachment(
  id: string,
): Promise<AttachmentRecord | null> {
  if (!isRemoteModeActive() || !id) return null;
  const metadataResponse = await fetch(
    `/api/files?id=${encodeURIComponent(id)}&metadata=1`,
    { credentials: "same-origin", cache: "no-store" },
  );
  if (metadataResponse.status === 404) return null;
  if (!metadataResponse.ok) throw await responseError(metadataResponse);
  const metadata = await metadataResponse.json() as AttachmentRecord;
  const fileResponse = await fetch(
    `/api/files?id=${encodeURIComponent(id)}`,
    { credentials: "same-origin", cache: "no-store" },
  );
  if (!fileResponse.ok) throw await responseError(fileResponse);
  const blob = await fileResponse.blob();
  if (Number(metadata.fileSize || 0) && blob.size !== Number(metadata.fileSize)) {
    throw new Error("첨부파일 크기 검증에 실패했습니다.");
  }
  if (metadata.sha256) {
    const downloadedHash = await sha256ForBlob(blob);
    if (downloadedHash && downloadedHash !== metadata.sha256) {
      throw new Error("첨부파일 무결성 검증에 실패했습니다.");
    }
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

function uploadFormWithProgress(form: FormData, fileName: string, id: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", "/api/files");
    request.withCredentials = true;
    request.upload.onprogress = (event) => {
      const percent = event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : 0;
      updateSyncState({ mode: "saving", message: percent
        ? `${fileName} Google Drive 업로드 ${percent}%`
        : `${fileName} Google Drive 업로드 중`, error: "" });
    };
    request.onerror = () => reject(new Error("파일 업로드에 실패했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요."));
    request.onabort = () => reject(new Error("파일 업로드가 취소되었습니다."));
    request.onload = () => resolve(new Response(request.responseText, {
      status: request.status,
      statusText: request.statusText,
      headers: { "Content-Type": request.getResponseHeader("Content-Type") || "application/json" },
    }));
    addPendingAttachment(id);
    request.send(form);
  });
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

export async function testGoogleDriveConnection(): Promise<void> {
  ensureRuntime();
  const response = await fetch("/api/google-drive/test", { method: "POST", credentials: "same-origin" });
  if (!response.ok) throw await responseError(response);
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
    const result = await response.json() as { migrated: number; failed: number; remaining: number };
    migrated += Number(result.migrated || 0);
    failed += Number(result.failed || 0);
    remaining = Number(result.remaining || 0);
    onProgress?.(migrated, remaining);
    if (result.migrated === 0 || result.failed > 0) break;
  }
  return { migrated, failed, remaining };
}

export async function updateRemoteAttachment(
  id: string,
  values: { fileName?: string; ownerKind?: string; ownerLocalId?: string; category?: string; sentDate?: string; memo?: string },
): Promise<void> {
  if (!isRemoteModeActive() || !id) return;
  const response = await fetch("/api/files", {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...values }),
  });
  if (!response.ok) throw await responseError(response);
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
