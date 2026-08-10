import { database, emptyDataset, ensureSchema } from "@/db/runtime";
import {
  logDriveOperation,
  synchronizeAttachmentFoldersForDataset,
} from "@/app/google-drive/managed-folders";
import { normalizeAttachmentStatus } from "@/app/google-drive/status-contract";
import { getSiteUser } from "@/app/site-user";
import { sanitizeBoundaryRecord } from "@/react-work-note/src/fullstack/boundarySanitizer";

type JsonRecord = Record<string, unknown>;

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonRecord =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function nestedCount(records: JsonRecord[], key: string): number {
  return records.reduce((sum, record) => sum + asArray(record[key]).length, 0);
}

async function currentUserEmail(): Promise<string | null> {
  const user = await getSiteUser();
  return user?.email.trim().toLowerCase() || null;
}

async function readDataset(email: string): Promise<JsonRecord> {
  const row = await database()
    .prepare(`SELECT payload FROM work_note_datasets
      WHERE user_email = ? AND deleted_at IS NULL`)
    .bind(email)
    .first<{ payload: string }>();
  if (!row?.payload) return emptyDataset();
  try {
    return { ...emptyDataset(), ...asRecord(JSON.parse(row.payload)) };
  } catch {
    throw new Error("서버 업무 데이터의 JSON 형식이 올바르지 않습니다.");
  }
}

function parseMetadata(value: string): JsonRecord {
  try { return asRecord(JSON.parse(value)); } catch { return {}; }
}

function publicAttachmentMetadata(value: string): JsonRecord {
  return sanitizeBoundaryRecord(parseMetadata(value));
}

function progressPercent(processedBytes: number, totalBytes: number): number {
  if (totalBytes <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((processedBytes / totalBytes) * 100)));
}

async function hydrateAttachmentMetadata(email: string, data: JsonRecord): Promise<JsonRecord> {
  const rows = await database().prepare(`SELECT local_id, storage_provider,
    drive_file_id, drive_folder_id, drive_company_folder_id, drive_memo_folder_id,
    drive_category_folder_id, drive_path, drive_web_view_link, file_category,
    upload_status, sync_status, last_synced_at, last_error, metadata_json,
    sync_error_code, sync_error_message, sync_error_detail, failure_stage,
    failed_at, retry_count, last_retry_at, last_retry_result,
    auto_recoverable, user_action_required, upload_session_id,
    processed_bytes, total_bytes, current_chunk, source_status,
    operation_token, updated_at
    FROM work_note_attachments WHERE user_email = ? AND deleted_at IS NULL`)
    .bind(email).all<{
      local_id: string;
      storage_provider: string;
      drive_file_id: string | null;
      drive_folder_id: string | null;
      drive_company_folder_id: string;
      drive_memo_folder_id: string;
      drive_category_folder_id: string;
      drive_path: string;
      drive_web_view_link: string;
      file_category: string;
      upload_status: string;
      sync_status: string;
      last_synced_at: string;
      last_error: string;
      metadata_json: string;
      sync_error_code: string;
      sync_error_message: string;
      sync_error_detail: string;
      failure_stage: string;
      failed_at: string;
      retry_count: number;
      last_retry_at: string;
      last_retry_result: string;
      auto_recoverable: number;
      user_action_required: number;
      upload_session_id: string;
      processed_bytes: number;
      total_bytes: number;
      current_chunk: number;
      source_status: string;
      operation_token: string;
      updated_at: string;
    }>();
  const byId = new Map(rows.results.map((row) => [row.local_id, row]));
  const collectionKeys = [
    "companies",
    "notes",
    "materialSalesNotes",
    "settlementTasks",
    "outputTasks",
    "otherTasks",
  ];
  const hydrated = sanitizeBoundaryRecord(data);
  for (const key of collectionKeys) {
    hydrated[key] = asArray(data[key]).map((record) => ({
      ...record,
      attachments: asArray(record.attachments).map((attachment) => {
        const publicAttachment = sanitizeBoundaryRecord(attachment);
        const id = String(publicAttachment.id || "");
        const row = byId.get(id);
        if (!row) return publicAttachment;
        const totalBytes = Number(row.total_bytes || attachment.fileSize || 0);
        const processedBytes = Number(row.processed_bytes || 0);
        const sourceStatus = String(row.source_status || "");
        const statusFallback = row.storage_provider === "google_drive" && row.drive_file_id
          ? "synced"
          : row.storage_provider === "site_storage" ? "local_only" : "pending";
        const syncStatus = normalizeAttachmentStatus(
          row.sync_status || row.upload_status,
          statusFallback,
        );
        return {
          ...publicAttachment,
          ...publicAttachmentMetadata(row.metadata_json),
          id,
          storageProvider: row.storage_provider,
          driveFileId: row.drive_file_id || "",
          driveFolderId: row.drive_category_folder_id || row.drive_folder_id || "",
          driveCompanyFolderId: row.drive_company_folder_id || "",
          driveMemoFolderId: row.drive_memo_folder_id || "",
          driveCategoryFolderId: row.drive_category_folder_id || "",
          drivePath: row.drive_path || "",
          driveWebViewLink: row.drive_web_view_link || "",
          driveMemoFolderUrl: row.drive_memo_folder_id
            ? `https://drive.google.com/drive/folders/${encodeURIComponent(row.drive_memo_folder_id)}`
            : "",
          category: row.file_category || attachment.category || "기타",
          uploadStatus: syncStatus,
          syncStatus,
          lastSyncedAt: row.last_synced_at || row.updated_at,
          uploadError: row.sync_error_message || row.last_error || "",
          syncErrorCode: row.sync_error_code || "",
          syncErrorMessage: row.sync_error_message || row.last_error || "",
          syncErrorDetail: row.sync_error_detail || "",
          syncFailedStage: row.failure_stage || "",
          syncFailedAt: row.failed_at || "",
          retryCount: Number(row.retry_count || 0),
          lastRetryAt: row.last_retry_at || "",
          lastRetryResult: row.last_retry_result || "",
          autoRecoverable: Boolean(row.auto_recoverable),
          userActionRequired: Boolean(row.user_action_required),
          uploadSessionId: row.upload_session_id || "",
          operationToken: row.operation_token || "",
          processedBytes,
          totalBytes,
          currentChunk: Number(row.current_chunk || 0),
          sourceStatus,
          sourceAvailable: sourceStatus === "available",
          sourceLocation: sourceStatus === "available" ? "r2" : "unknown",
          syncProgress: {
            stage: row.failure_stage || "",
            processedBytes,
            totalBytes,
            currentChunk: Number(row.current_chunk || 0),
            progress: progressPercent(processedBytes, totalBytes),
          },
        };
      }),
    }));
  }
  return sanitizeBoundaryRecord(hydrated);
}

export async function GET(request: Request) {
  try {
    const email = await currentUserEmail();
    if (!email) return jsonError("ChatGPT 로그인이 필요합니다.", 401);
    await ensureSchema();
    const data = await readDataset(email);
    const url = new URL(request.url);
    if (url.searchParams.get("counts") !== "1") {
      return Response.json(await hydrateAttachmentMetadata(email, data));
    }
    const companies = asArray(data.companies);
    const internalContacts = asArray(data.internalContacts);
    const equipmentSales = asArray(data.notes);
    const materialSales = asArray(data.materialSalesNotes);
    const settlements = asArray(data.settlementTasks);
    const outputTasks = asArray(data.outputTasks);
    const otherTasks = asArray(data.otherTasks);
    const accounts = asArray(data.accounts);
    const taskSchedules = asArray(data.taskSchedules);
    const attachmentRow = await database()
      .prepare(`SELECT COUNT(*) AS count FROM work_note_attachments
        WHERE user_email = ? AND deleted_at IS NULL`)
      .bind(email)
      .first<{ count: number }>();
    const counts = {
      companies: companies.length,
      companyContacts: nestedCount(companies, "contacts"),
      internalContacts: internalContacts.length,
      equipmentSales: equipmentSales.length,
      materialSales: materialSales.length,
      settlements: settlements.length,
      settlementEntries: nestedCount(settlements, "paymentSchedule"),
      outputTasks: outputTasks.length,
      otherTasks: otherTasks.length,
      taskSchedules: taskSchedules.length,
      accounts: accounts.length,
      attachments: Number(attachmentRow?.count || 0),
      totalRecords: 0,
    };
    counts.totalRecords = counts.companies + counts.companyContacts +
      counts.internalContacts + counts.equipmentSales + counts.materialSales +
      counts.settlements + counts.settlementEntries + counts.outputTasks +
      counts.otherTasks + counts.taskSchedules + counts.accounts;
    return Response.json(counts);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error));
  }
}

export async function PUT(request: Request) {
  try {
    const email = await currentUserEmail();
    if (!email) return jsonError("ChatGPT 로그인이 필요합니다.", 401);
    await ensureSchema();
    const payload = sanitizeBoundaryRecord(await request.json());
    const updatedAt = String(payload.updatedAt || new Date().toISOString());
    payload.updatedAt = updatedAt;
    await database()
      .prepare(`INSERT INTO work_note_datasets
        (user_email, payload, data_version, updated_at, deleted_at)
        VALUES (?, ?, ?, ?, NULL)
        ON CONFLICT(user_email) DO UPDATE SET
          payload = excluded.payload, data_version = excluded.data_version,
          updated_at = excluded.updated_at, deleted_at = NULL`)
      .bind(email, JSON.stringify(payload), String(payload.version || "sites-work-note-v1"), updatedAt)
      .run();

    let driveSync: { checked: number; synchronized: number; failed: number } | null = null;
    try {
      driveSync = await synchronizeAttachmentFoldersForDataset(email, payload, 100);
    } catch (error) {
      await logDriveOperation(email, {
        operationType: "dataset_sync",
        status: "retry_required",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
    return Response.json({ ok: true, updatedAt, driveSync });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error));
  }
}

export async function POST(request: Request) {
  try {
    const email = await currentUserEmail();
    if (!email) return jsonError("ChatGPT 로그인이 필요합니다.", 401);
    await ensureSchema();
    const payload = sanitizeBoundaryRecord(await request.json());
    await database()
      .prepare(`INSERT INTO work_note_migration_logs
        (id, user_email, payload, created_at) VALUES (?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), email, JSON.stringify(payload), new Date().toISOString())
      .run();
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error));
  }
}

export async function DELETE() {
  try {
    const email = await currentUserEmail();
    if (!email) return jsonError("ChatGPT 로그인이 필요합니다.", 401);
    await ensureSchema();
    const now = new Date().toISOString();
    await database().batch([
      database().prepare(`UPDATE work_note_datasets SET deleted_at = ?, updated_at = ?
        WHERE user_email = ? AND deleted_at IS NULL`).bind(now, now, email),
      database().prepare(`UPDATE work_note_attachments SET deleted_at = ?, updated_at = ?
        WHERE user_email = ? AND deleted_at IS NULL`).bind(now, now, email),
    ]);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error));
  }
}
