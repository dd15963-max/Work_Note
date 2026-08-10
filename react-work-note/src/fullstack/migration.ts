import {
  addMigrationLog,
  getServerCounts,
  markMigrationComplete,
  queueRemoteAttachmentUpload,
  syncServerDataset,
  uploadRemoteAttachment
} from "./repository";
import type { AnyRecord, AttachmentRecord, DataCounts, MigrationProgress, WorkNoteData } from "./types";
import { buildServerPayload } from "./serverPayload";

const ATTACHMENT_DB_NAME = "salesNoteAttachmentDbV1";
const ATTACHMENT_STORE_NAME = "files";
const ATTACHMENT_DB_VERSION = 1;

function asArray(value: unknown): AnyRecord[] {
  return Array.isArray(value) ? value.filter((item): item is AnyRecord => Boolean(item) && typeof item === "object") : [];
}

function text(record: AnyRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
}

type AttachmentReference = { ownerType: string; ownerId: string };

function collectAttachmentReferences(data: WorkNoteData): Map<string, AttachmentReference> {
  const groups: Array<{ ownerType: string; items: AnyRecord[] }> = [
    { ownerType: "company", items: asArray(data.companies) },
    { ownerType: "sales", items: asArray(data.notes) },
    { ownerType: "materialSales", items: asArray(data.materialSalesNotes) },
    { ownerType: "settlement", items: asArray(data.settlementTasks) },
    { ownerType: "output", items: asArray(data.outputTasks) },
    { ownerType: "other", items: asArray(data.otherTasks) }
  ];
  const references = new Map<string, AttachmentReference>();
  groups.forEach(({ ownerType, items }) => items.forEach((owner) => {
    const ownerId = text(owner, ["id"]);
    asArray(owner.attachments).forEach((attachment) => {
      const id = text(attachment, ["id"]);
      if (id && !references.has(id)) references.set(id, { ownerType, ownerId });
    });
  }));
  return references;
}

export function countWorkNoteData(data: WorkNoteData): DataCounts {
  const companies = asArray(data.companies);
  const settlements = asArray(data.settlementTasks);
  const counts: DataCounts = {
    companies: companies.length,
    companyContacts: companies.reduce((sum, company) => sum + asArray(company.contacts).length, 0),
    internalContacts: asArray(data.internalContacts).length,
    equipmentSales: asArray(data.notes).length,
    materialSales: asArray(data.materialSalesNotes).length,
    settlements: settlements.length,
    settlementEntries: settlements.reduce((sum, settlement) => sum + asArray(settlement.paymentSchedule).length, 0),
    outputTasks: asArray(data.outputTasks).length,
    otherTasks: asArray(data.otherTasks).length,
    taskSchedules: asArray(buildServerPayload(data).taskSchedules).length,
    accounts: asArray(data.accounts).length,
    attachments: collectAttachmentReferences(data).size,
    totalRecords: 0
  };
  counts.totalRecords = counts.companies + counts.companyContacts + counts.internalContacts + counts.equipmentSales
    + counts.materialSales + counts.settlements + counts.settlementEntries + counts.outputTasks + counts.otherTasks + counts.taskSchedules + counts.accounts;
  return counts;
}
export function hasLocalWorkNoteData(data: WorkNoteData): boolean {
  return countWorkNoteData(data).totalRecords > 0;
}

export function downloadLocalMigrationBackup(data: WorkNoteData) {
  const payload = {
    backupType: "pre-server-migration-json",
    backupCreatedAt: new Date().toISOString(),
    version: data.version || "react-work-note-v1",
    data
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `work-note-pre-server-migration-${filenameTimestamp()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 100);
}

export async function migrateLocalDataToServer(
  data: WorkNoteData,
  onProgress: (progress: MigrationProgress) => void
): Promise<{ counts: DataCounts; serverCounts: DataCounts; failedAttachmentIds: string[] }> {
  const counts = countWorkNoteData(data);
  const batchId = crypto.randomUUID();
  onProgress({ phase: "ready", message: "기존 데이터 확인 완료", completed: 0, total: counts.attachments + 1, failedAttachmentIds: [] });

  downloadLocalMigrationBackup(data);
  onProgress({ phase: "backup-complete", message: "마이그레이션 전 JSON 백업 생성 완료", completed: 0, total: counts.attachments + 1, failedAttachmentIds: [] });
  await addMigrationLog({ id: batchId, status: "uploading", source: "browser-local", counts, started_at: new Date().toISOString() });

  onProgress({ phase: "uploading", message: "업무 데이터를 서버로 이전하는 중", completed: 0, total: counts.attachments + 1, failedAttachmentIds: [] });
  await syncServerDataset(data, "기존 브라우저 데이터 마이그레이션", "merge", batchId);

  const attachmentReferences = collectAttachmentReferences(data);
  const failedAttachmentIds: string[] = [];
  let uploadedAttachmentCount = 0;
  let completed = 1;
  onProgress({
    phase: "uploading",
    message: `첨부파일 0/${attachmentReferences.size}개 이전`,
    completed,
    total: counts.attachments + 1,
    failedAttachmentIds: []
  });
  for (const [id, reference] of attachmentReferences.entries()) {
    const stored = await getLocalAttachmentRecordById(id);
    if (!stored?.blob) {
      failedAttachmentIds.push(id);
    } else {
      const record = { ...stored, ownerType: reference.ownerType, ownerId: reference.ownerId };
      try {
        await uploadRemoteAttachment(record, batchId);
        uploadedAttachmentCount += 1;
      } catch {
        failedAttachmentIds.push(id);
        queueRemoteAttachmentUpload(record);
      }
    }
    completed += 1;
    onProgress({
      phase: "uploading",
      message: `첨부파일 ${completed - 1}/${attachmentReferences.size}개 확인`,
      completed,
      total: counts.attachments + 1,
      failedAttachmentIds: [...failedAttachmentIds]
    });
  }
  onProgress({ phase: "verifying", message: "서버 데이터 개수와 연결을 검증하는 중", completed, total: counts.attachments + 1, failedAttachmentIds });
  const serverCounts = await getServerCounts();
  const mismatches = compareCounts(counts, serverCounts, uploadedAttachmentCount);
  if (mismatches.length) {
    await addMigrationLog({ id: batchId, status: "partial", counts, server_counts: serverCounts, failed_items: failedAttachmentIds, error_message: mismatches.join("; "), completed_at: new Date().toISOString() });
    onProgress({ phase: "partial", message: `일부 항목을 확인하지 못했습니다: ${mismatches.join(", ")}`, completed, total: counts.attachments + 1, failedAttachmentIds });
    return { counts, serverCounts, failedAttachmentIds };
  }

  await addMigrationLog({ id: batchId, status: failedAttachmentIds.length ? "partial" : "complete", counts, server_counts: serverCounts, failed_items: failedAttachmentIds, completed_at: new Date().toISOString() });
  if (!failedAttachmentIds.length) markMigrationComplete();
  onProgress({
    phase: failedAttachmentIds.length ? "partial" : "complete",
    message: failedAttachmentIds.length ? `기록 이전 완료 · 첨부 ${failedAttachmentIds.length}개 재시도 필요` : "서버 이전과 검증이 완료되었습니다.",
    completed,
    total: counts.attachments + 1,
    failedAttachmentIds
  });
  return { counts, serverCounts, failedAttachmentIds };
}

export async function retryAttachmentMigration(ids: string[], onProgress: (completed: number, total: number) => void): Promise<string[]> {
  const wanted = [...new Set(ids.filter(Boolean))];
  const failed: string[] = [];
  let completed = 0;
  for (const id of wanted) {
    const record = await getLocalAttachmentRecordById(id);
    if (!record?.blob) {
      failed.push(id);
    } else {
      try {
        await uploadRemoteAttachment(record);
      } catch {
        failed.push(id);
        queueRemoteAttachmentUpload(record);
      }
    }
    completed += 1;
    onProgress(completed, wanted.length);
  }
  return failed;
}

async function getLocalAttachmentRecordById(id: string): Promise<AttachmentRecord | null> {
  if (!window.indexedDB || !id) return null;
  const db = await openAttachmentDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ATTACHMENT_STORE_NAME, "readonly");
    const request = transaction.objectStore(ATTACHMENT_STORE_NAME).get(id);
    request.onsuccess = () => resolve((request.result as AttachmentRecord | undefined) || null);
    request.onerror = () => reject(request.error || new Error("로컬 첨부파일을 읽지 못했습니다."));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => db.close();
  });
}

export async function clearLocalAttachmentCache() {
  if (!window.indexedDB) return;
  const db = await openAttachmentDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(ATTACHMENT_STORE_NAME, "readwrite");
    transaction.objectStore(ATTACHMENT_STORE_NAME).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("로컬 첨부 캐시를 비우지 못했습니다."));
  });
  db.close();
}

function openAttachmentDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(ATTACHMENT_DB_NAME, ATTACHMENT_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(ATTACHMENT_STORE_NAME)) request.result.createObjectStore(ATTACHMENT_STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("로컬 첨부파일 저장소를 열지 못했습니다."));
  });
}

function compareCounts(local: DataCounts, server: DataCounts, uploadedAttachments: number): string[] {
  const keys: Array<keyof DataCounts> = [
    "companies", "companyContacts", "internalContacts", "equipmentSales", "materialSales",
    "settlements", "settlementEntries", "outputTasks", "otherTasks", "taskSchedules", "accounts"
  ];
  const mismatches = keys.filter((key) => Number(server[key] || 0) < Number(local[key] || 0)).map((key) => `${key} ${local[key]}/${server[key] || 0}`);
  if (Number(server.attachments || 0) < uploadedAttachments) mismatches.push(`attachments ${uploadedAttachments}/${server.attachments || 0}`);
  return mismatches;
}

function filenameTimestamp(): string {
  const now = new Date();
  const part = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${part(now.getMonth() + 1)}${part(now.getDate())}-${part(now.getHours())}${part(now.getMinutes())}`;
}
