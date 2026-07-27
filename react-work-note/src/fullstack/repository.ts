import type { SupabaseClient, User } from "@supabase/supabase-js";
import { fullstackConfig } from "./config";
import { updateSyncState } from "./syncStore";
import type { AttachmentRecord, DataCounts, WorkNoteData } from "./types";
import { buildServerPayload } from "./serverPayload";

const PENDING_DATASET_KEY = "workNotePendingServerSyncV1";
const PENDING_ATTACHMENTS_KEY = "workNotePendingAttachmentSyncV1";
const PENDING_ATTACHMENT_DELETES_KEY = "workNotePendingAttachmentDeleteV1";
const MIGRATION_MARKER_KEY = "workNoteServerMigrationV1";
const ATTACHMENT_DB_NAME = "salesNoteAttachmentDbV1";
const ATTACHMENT_STORE_NAME = "files";
const ATTACHMENT_DB_VERSION = 1;

let client: SupabaseClient | null = null;
let user: User | null = null;
let flushing: Promise<void> | null = null;
let flushingAttachments: Promise<void> | null = null;
let onlineListenerAttached = false;

function emptyData(): WorkNoteData {
  return {
    version: "react-work-note-v1",
    updatedAt: "",
    companies: [],
    internalContacts: [],
    notes: [],
    materialSalesNotes: [],
    settlementTasks: [],
    outputTasks: [],
    otherTasks: [],
    accounts: [],
    loadedAt: new Date().toISOString()
  };
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
}

export function initializeRemoteRuntime(nextClient: SupabaseClient, nextUser: User) {
  client = nextClient;
  user = nextUser;
  updateSyncState({ mode: navigator.onLine ? "online" : "offline", message: navigator.onLine ? "서버 연결됨" : "오프라인", pendingCount: pendingCount(), error: "" });
  if (!onlineListenerAttached) {
    window.addEventListener("online", () => void flushPendingChanges());
    window.addEventListener("offline", () => updateSyncState({ mode: "offline", message: "오프라인 · 변경사항은 이 기기에 보관됩니다." }));
    onlineListenerAttached = true;
  }
  void flushPendingChanges();
}

export function clearRemoteRuntime() {
  client = null;
  user = null;
  updateSyncState({ mode: "disabled", message: "로그아웃", lastSyncedAt: "", pendingCount: pendingCount(), error: "" });
}

export function isRemoteModeActive(): boolean {
  return Boolean(client && user);
}

export function getRemoteUser(): User | null {
  return user;
}

export function hasCompletedMigration(): boolean {
  if (!user) return false;
  try {
    const marker = JSON.parse(window.localStorage.getItem(MIGRATION_MARKER_KEY) || "{}") as { userId?: string; completedAt?: string };
    return marker.userId === user.id && Boolean(marker.completedAt);
  } catch {
    return false;
  }
}

export function markMigrationComplete() {
  if (!user) return;
  window.localStorage.setItem(MIGRATION_MARKER_KEY, JSON.stringify({ userId: user.id, completedAt: new Date().toISOString() }));
}

export async function loadServerDataset(): Promise<WorkNoteData> {
  ensureRuntime();
  updateSyncState({ mode: "connecting", message: "서버 데이터 불러오는 중", error: "" });
  const { data, error } = await client!.rpc("get_work_note_dataset");
  if (error) {
    updateSyncState({ mode: "error", message: "서버 불러오기 실패", error: error.message });
    throw error;
  }
  const payload = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const result: WorkNoteData = {
    ...emptyData(),
    version: String(payload.version || "server-work-note-v1"),
    updatedAt: String(payload.updatedAt || payload.updated_at || ""),
    companies: asArray(payload.companies),
    internalContacts: asArray(payload.internalContacts),
    notes: asArray(payload.notes),
    materialSalesNotes: asArray(payload.materialSalesNotes),
    settlementTasks: asArray(payload.settlementTasks),
    outputTasks: asArray(payload.outputTasks),
    otherTasks: asArray(payload.otherTasks),
    accounts: asArray(payload.accounts),
    loadedAt: new Date().toISOString()
  };
  updateSyncState({ mode: "online", message: "동기화 완료", lastSyncedAt: new Date().toISOString(), error: "" });
  return result;
}

export async function syncServerDataset(
  data: WorkNoteData,
  reason: string,
  mode: "sync" | "merge" | "replace" = "sync",
  migrationBatchId = ""
): Promise<void> {
  ensureRuntime();
  const { error } = await client!.rpc("sync_work_note_dataset", {
    p_payload: buildServerPayload(data),
    p_reason: reason,
    p_mode: mode,
    p_migration_batch_id: migrationBatchId || null
  });
  if (error) throw error;
}

export function enqueueRemoteDatasetSync(data: WorkNoteData, reason: string) {
  if (!isRemoteModeActive()) return;
  const pending = { data, reason, queuedAt: new Date().toISOString() };
  window.localStorage.setItem(PENDING_DATASET_KEY, JSON.stringify(pending));
  updateSyncState({ pendingCount: pendingCount(), message: navigator.onLine ? "저장 대기" : "오프라인 저장 대기" });
  void flushPendingDataset();
}

export async function flushPendingDataset(): Promise<void> {
  if (!isRemoteModeActive() || flushing) return flushing || Promise.resolve();
  if (!navigator.onLine) {
    updateSyncState({ mode: "offline", message: "오프라인 · 변경사항 저장 대기", pendingCount: pendingCount() });
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
      updateSyncState({ mode: "saving", message: "서버 저장 중", pendingCount: pendingCount(), error: "" });
      try {
        await syncServerDataset(pending.data, pending.reason, "sync");
        const current = window.localStorage.getItem(PENDING_DATASET_KEY);
        if (current === raw) window.localStorage.removeItem(PENDING_DATASET_KEY);
        updateSyncState({ mode: "online", message: "동기화 완료", lastSyncedAt: new Date().toISOString(), pendingCount: pendingCount(), error: "" });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        updateSyncState({ mode: navigator.onLine ? "error" : "offline", message: "서버 저장 실패 · 재시도 대기", pendingCount: pendingCount(), error: message });
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
  updateSyncState({ pendingCount: 0, error: "", message: isRemoteModeActive() ? "동기화 완료" : "서버 연결 준비" });
}

function readIdQueue(key: string): string[] {
  try {
    const values = JSON.parse(window.localStorage.getItem(key) || "[]") as unknown;
    return Array.isArray(values) ? [...new Set(values.map(String).filter(Boolean))] : [];
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
  writeIdQueue(PENDING_ATTACHMENTS_KEY, [...readIdQueue(PENDING_ATTACHMENTS_KEY), id]);
}

function removePendingAttachment(id: string) {
  writeIdQueue(PENDING_ATTACHMENTS_KEY, readIdQueue(PENDING_ATTACHMENTS_KEY).filter((item) => item !== id));
}

function addPendingAttachmentDelete(id: string) {
  writeIdQueue(PENDING_ATTACHMENT_DELETES_KEY, [...readIdQueue(PENDING_ATTACHMENT_DELETES_KEY), id]);
}

function removePendingAttachmentDelete(id: string) {
  writeIdQueue(PENDING_ATTACHMENT_DELETES_KEY, readIdQueue(PENDING_ATTACHMENT_DELETES_KEY).filter((item) => item !== id));
}

export function getPendingAttachmentIds(): string[] {
  return readIdQueue(PENDING_ATTACHMENTS_KEY);
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "file";
}

async function sha256ForBlob(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) return "";
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function uploadRemoteAttachment(record: AttachmentRecord, migrationBatchId = ""): Promise<void> {
  ensureRuntime();
  if (!record.id || !(record.blob instanceof Blob)) throw new Error("업로드할 첨부 원본이 없습니다.");
  const fileName = String(record.fileName || record.name || "attachment");
  const storagePath = `${user!.id}/${safePathSegment(record.id)}/${safePathSegment(fileName)}`;
  const fileHash = String(record.sha256 || "") || await sha256ForBlob(record.blob);
  const { error: uploadError } = await client!.storage
    .from(fullstackConfig.storageBucket)
    .upload(storagePath, record.blob, { upsert: true, contentType: String(record.fileType || record.blob.type || "application/octet-stream") });
  if (uploadError) throw uploadError;
  const metadata = { ...record, ...(fileHash ? { sha256: fileHash } : {}) };
  delete metadata.blob;
  const { error: metadataError } = await client!.from("attachments").upsert({
    user_id: user!.id,
    local_id: record.id,
    owner_kind: String(record.ownerType || record.backupOwnerType || "unknown"),
    owner_local_id: String(record.ownerId || record.noteId || record.backupOwnerId || ""),
    storage_path: storagePath,
    file_name: fileName,
    mime_type: String(record.fileType || record.blob.type || "application/octet-stream"),
    file_size: Number(record.fileSize || record.blob.size || 0),
    sha256: fileHash || null,
    data: metadata,
    migration_batch_id: migrationBatchId || null,
    deleted_at: null,
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id,local_id" });
  if (metadataError) throw metadataError;
  removePendingAttachment(record.id);
}

export function queueRemoteAttachmentUpload(record: AttachmentRecord) {
  if (!isRemoteModeActive() || !(record.blob instanceof Blob)) return;
  removePendingAttachmentDelete(record.id);
  addPendingAttachment(record.id);
  void flushPendingAttachments();
}

export async function downloadRemoteAttachment(id: string): Promise<AttachmentRecord | null> {
  if (!isRemoteModeActive() || !id) return null;
  const { data: metadata, error } = await client!
    .from("attachments")
    .select("storage_path,file_name,mime_type,file_size,sha256,data")
    .eq("user_id", user!.id)
    .eq("local_id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!metadata) return null;
  const { data: blob, error: downloadError } = await client!.storage.from(fullstackConfig.storageBucket).download(metadata.storage_path);
  if (downloadError) throw downloadError;
  if (Number(metadata.file_size || 0) && blob.size !== Number(metadata.file_size)) throw new Error("첨부파일 크기 검증에 실패했습니다.");
  if (metadata.sha256) {
    const downloadedHash = await sha256ForBlob(blob);
    if (downloadedHash && downloadedHash !== metadata.sha256) throw new Error("첨부파일 무결성 검증에 실패했습니다.");
  }
  return {
    ...((metadata.data || {}) as Record<string, unknown>),
    id,
    fileName: metadata.file_name,
    fileType: metadata.mime_type,
    fileSize: metadata.file_size,
    sha256: metadata.sha256 || "",
    blob
  };
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
  if (!isRemoteModeActive() || flushingAttachments) return flushingAttachments || Promise.resolve();
  if (!navigator.onLine) {
    updateSyncState({ mode: "offline", message: "오프라인 · 첨부 변경사항 저장 대기", pendingCount: pendingCount() });
    return;
  }
  const startedQueue = JSON.stringify([readIdQueue(PENDING_ATTACHMENTS_KEY), readIdQueue(PENDING_ATTACHMENT_DELETES_KEY)]);
  let continueAfterFlush = false;
  flushingAttachments = (async () => {
    let lastError = "";
    for (const id of readIdQueue(PENDING_ATTACHMENTS_KEY)) {
      try {
        const record = await readLocalAttachmentForRetry(id);
        if (!record?.blob) throw new Error(`${id}: 로컬 첨부 원본을 찾지 못했습니다.`);
        updateSyncState({ mode: "saving", message: "첨부파일 서버 저장 중", error: "" });
        await uploadRemoteAttachment(record);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    for (const id of readIdQueue(PENDING_ATTACHMENT_DELETES_KEY)) {
      try {
        const { error } = await client!.from("attachments").update({ deleted_at: new Date().toISOString() }).eq("user_id", user!.id).eq("local_id", id);
        if (error) throw error;
        removePendingAttachmentDelete(id);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    const remaining = pendingCount();
    const finishedQueue = JSON.stringify([readIdQueue(PENDING_ATTACHMENTS_KEY), readIdQueue(PENDING_ATTACHMENT_DELETES_KEY)]);
    continueAfterFlush = finishedQueue !== startedQueue && finishedQueue !== "[[],[]]";
    updateSyncState(lastError && remaining > 0
      ? { mode: "error", message: "첨부파일 저장 실패 · 재시도 대기", pendingCount: remaining, error: lastError }
      : { mode: "online", message: "동기화 완료", lastSyncedAt: new Date().toISOString(), pendingCount: remaining, error: "" });
  })().finally(() => {
    flushingAttachments = null;
    if (continueAfterFlush && navigator.onLine && isRemoteModeActive()) void flushPendingAttachments();
  });
  return flushingAttachments;
}

async function readLocalAttachmentForRetry(id: string): Promise<AttachmentRecord | null> {
  if (!window.indexedDB || !id) return null;
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(ATTACHMENT_DB_NAME, ATTACHMENT_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(ATTACHMENT_STORE_NAME)) request.result.createObjectStore(ATTACHMENT_STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("첨부파일 저장소를 열지 못했습니다."));
  });
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ATTACHMENT_STORE_NAME, "readonly");
    const request = transaction.objectStore(ATTACHMENT_STORE_NAME).get(id);
    request.onsuccess = () => resolve((request.result as AttachmentRecord | undefined) || null);
    request.onerror = () => reject(request.error || new Error("재시도할 첨부파일을 읽지 못했습니다."));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => db.close();
  });
}
export async function getServerCounts(): Promise<DataCounts> {
  ensureRuntime();
  const { data, error } = await client!.rpc("get_work_note_counts");
  if (error) throw error;
  return data as DataCounts;
}

export async function softDeleteAllAccountData(): Promise<void> {
  ensureRuntime();
  const { error } = await client!.rpc("soft_delete_work_note_account_data");
  if (error) throw error;
  clearPendingSync();
}

export async function addMigrationLog(values: Record<string, unknown>) {
  if (!isRemoteModeActive()) return;
  const { error } = await client!.from("migration_logs").insert({ user_id: user!.id, ...values });
  if (error) throw error;
}

function ensureRuntime() {
  if (!client || !user) throw new Error("로그인된 Supabase 세션이 없습니다.");
}
