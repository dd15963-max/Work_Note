import { database } from "@/db/runtime";
import { driveFetch, getDriveConnection } from "./auth";
import {
  buildDrivePath,
  driveFileUrl,
  driveFolderUrl,
  resolveAttachmentOwnerContext,
  sanitizeDriveFolderName,
  type AttachmentOwnerContext,
  type JsonRecord,
} from "./organization";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const MANAGED_BY = "work-note";

export type ManagedFolderSet = {
  rootFolderId: string;
  companyFolderId: string;
  memoFolderId: string;
  categoryFolderId: string;
  category: string;
  drivePath: string;
  memoFolderUrl: string;
};

export type DriveAttachmentRow = {
  local_id: string;
  owner_kind: string;
  owner_local_id: string;
  storage_provider: string;
  drive_file_id: string | null;
  drive_folder_id: string | null;
  drive_company_folder_id?: string;
  drive_memo_folder_id?: string;
  drive_category_folder_id?: string;
  drive_path?: string;
  drive_web_view_link?: string;
  file_category?: string;
  file_name: string;
  display_file_name: string;
  mime_type: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
};

type ManagedFolderRow = {
  folder_id: string;
  managed_key: string;
  parent_folder_id: string;
  folder_type: "company" | "memo" | "category";
  folder_name: string;
  company_id: string;
  memo_id: string;
  file_category: string;
  drive_path: string;
  created_at: string;
  last_synced_at: string;
  trashed_at: string | null;
};

type DriveItem = {
  id: string;
  name: string;
  mimeType?: string;
  parents?: string[];
  trashed?: boolean;
  appProperties?: Record<string, string>;
  webViewLink?: string;
  modifiedTime?: string;
};

function escapeQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function parseJson(value: string): JsonRecord {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as JsonRecord
      : {};
  } catch {
    return {};
  }
}

export async function loadWorkNoteDataset(userEmail: string): Promise<JsonRecord> {
  const row = await database().prepare(`SELECT payload FROM work_note_datasets
    WHERE user_email = ? AND deleted_at IS NULL`)
    .bind(userEmail).first<{ payload: string }>();
  return row?.payload ? parseJson(row.payload) : {};
}

async function listDriveItems(
  userEmail: string,
  query: string,
  pageSize = 100,
): Promise<DriveItem[]> {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", query);
  url.searchParams.set("spaces", "drive");
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set(
    "fields",
    "files(id,name,mimeType,parents,trashed,appProperties,webViewLink,modifiedTime)",
  );
  const response = await driveFetch(userEmail, url.toString());
  const payload = await response.json() as { files?: DriveItem[] };
  return payload.files || [];
}

async function getDriveItem(userEmail: string, id: string): Promise<DriveItem | null> {
  if (!id) return null;
  try {
    const response = await driveFetch(
      userEmail,
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,parents,trashed,appProperties,webViewLink,modifiedTime`,
    );
    return response.json() as Promise<DriveItem>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("찾을 수 없습니다")) return null;
    throw error;
  }
}

async function createFolder(
  userEmail: string,
  name: string,
  parentId: string | undefined,
  appProperties?: Record<string, string>,
): Promise<DriveItem> {
  const response = await driveFetch(
    userEmail,
    "https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,parents,trashed,appProperties,webViewLink,modifiedTime",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        ...(parentId ? { parents: [parentId] } : {}),
        ...(appProperties ? { appProperties } : {}),
      }),
    },
  );
  return response.json() as Promise<DriveItem>;
}

async function patchDriveItem(
  userEmail: string,
  id: string,
  input: {
    name?: string;
    addParent?: string;
    removeParent?: string;
    trashed?: boolean;
    appProperties?: Record<string, string>;
  },
): Promise<DriveItem> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`);
  url.searchParams.set(
    "fields",
    "id,name,mimeType,parents,trashed,appProperties,webViewLink,modifiedTime",
  );
  if (input.addParent) url.searchParams.set("addParents", input.addParent);
  if (input.removeParent) url.searchParams.set("removeParents", input.removeParent);
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.trashed !== undefined) body.trashed = input.trashed;
  if (input.appProperties) body.appProperties = input.appProperties;
  const response = await driveFetch(userEmail, url.toString(), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json() as Promise<DriveItem>;
}

async function ensureRootFolder(userEmail: string): Promise<string> {
  const connection = await getDriveConnection(userEmail);
  if (!connection) throw new Error("Google Drive 연결이 필요합니다.");
  const existing = await getDriveItem(userEmail, connection.rootFolderId);
  if (existing && !existing.trashed && existing.mimeType === FOLDER_MIME) return existing.id;
  const matches = await listDriveItems(
    userEmail,
    `name = 'Work Note' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    10,
  );
  const root = matches[0] || await createFolder(userEmail, "Work Note", undefined);
  const now = new Date().toISOString();
  await database().prepare(`UPDATE work_note_google_drive_connections
    SET root_folder_id = ?, root_folder_name = 'Work Note', last_synced_at = ?, updated_at = ?
    WHERE user_email = ?`).bind(root.id, now, now, userEmail).run();
  return root.id;
}

async function acquireLock(userEmail: string, lockKey: string): Promise<string> {
  const token = crypto.randomUUID();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const now = new Date();
    await database().prepare(`DELETE FROM work_note_drive_locks
      WHERE user_email = ? AND lock_key = ? AND expires_at < ?`)
      .bind(userEmail, lockKey, now.toISOString()).run();
    const result = await database().prepare(`INSERT OR IGNORE INTO work_note_drive_locks
      (user_email, lock_key, owner_token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(
        userEmail,
        lockKey,
        token,
        new Date(now.getTime() + 30_000).toISOString(),
        now.toISOString(),
      ).run();
    if (Number((result.meta as { changes?: number } | undefined)?.changes || 0) > 0) return token;
    await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
  }
  throw new Error("Google Drive 폴더 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.");
}

async function releaseLock(userEmail: string, lockKey: string, token: string) {
  await database().prepare(`DELETE FROM work_note_drive_locks
    WHERE user_email = ? AND lock_key = ? AND owner_token = ?`)
    .bind(userEmail, lockKey, token).run();
}

async function folderByManagedKey(
  userEmail: string,
  managedKey: string,
): Promise<ManagedFolderRow | null> {
  return database().prepare(`SELECT folder_id, managed_key, parent_folder_id,
    folder_type, folder_name, company_id, memo_id, file_category, drive_path,
    created_at, last_synced_at, trashed_at FROM work_note_drive_folders
    WHERE user_email = ? AND managed_key = ?`)
    .bind(userEmail, managedKey).first<ManagedFolderRow>();
}

async function saveManagedFolder(
  userEmail: string,
  input: {
    folderId: string;
    managedKey: string;
    parentFolderId: string;
    folderType: "company" | "memo" | "category";
    folderName: string;
    companyId: string;
    memoId: string;
    category: string;
    drivePath: string;
  },
) {
  await database().prepare(`DELETE FROM work_note_drive_folders
    WHERE user_email = ? AND managed_key = ? AND folder_id <> ?`)
    .bind(userEmail, input.managedKey, input.folderId).run();
  const now = new Date().toISOString();
  await database().prepare(`INSERT INTO work_note_drive_folders
    (user_email, folder_id, managed_key, parent_folder_id, folder_type,
      folder_name, company_id, memo_id, file_category, drive_path,
      created_at, last_synced_at, trashed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(user_email, folder_id) DO UPDATE SET
      managed_key = excluded.managed_key, parent_folder_id = excluded.parent_folder_id,
      folder_type = excluded.folder_type, folder_name = excluded.folder_name,
      company_id = excluded.company_id, memo_id = excluded.memo_id,
      file_category = excluded.file_category, drive_path = excluded.drive_path,
      last_synced_at = excluded.last_synced_at, trashed_at = NULL`)
    .bind(
      userEmail,
      input.folderId,
      input.managedKey,
      input.parentFolderId,
      input.folderType,
      input.folderName,
      input.companyId,
      input.memoId,
      input.category,
      input.drivePath,
      now,
      now,
    ).run();
}

async function uniqueMemoFolderName(
  userEmail: string,
  parentFolderId: string,
  desired: string,
  memoId: string,
): Promise<string> {
  const rows = await database().prepare(`SELECT memo_id FROM work_note_drive_folders
    WHERE user_email = ? AND parent_folder_id = ? AND folder_type = 'memo'
      AND folder_name = ? AND trashed_at IS NULL`)
    .bind(userEmail, parentFolderId, desired).all<{ memo_id: string }>();
  return rows.results.some((row) => row.memo_id !== memoId)
    ? sanitizeDriveFolderName(`${desired}_${memoId.slice(0, 8)}`, desired)
    : desired;
}

async function ensureManagedFolder(
  userEmail: string,
  input: {
    managedKey: string;
    parentFolderId: string;
    folderType: "company" | "memo" | "category";
    folderName: string;
    companyId: string;
    memoId: string;
    category: string;
    drivePath: string;
  },
): Promise<string> {
  const token = await acquireLock(userEmail, input.managedKey);
  try {
    const stored = await folderByManagedKey(userEmail, input.managedKey);
    let item = stored ? await getDriveItem(userEmail, stored.folder_id) : null;
    if (
      item?.trashed &&
      item.appProperties?.managedBy === MANAGED_BY &&
      item.appProperties?.managedKey === input.managedKey
    ) {
      item = await patchDriveItem(userEmail, item.id, { trashed: false });
    }
    if (!item || item.trashed || item.mimeType !== FOLDER_MIME ||
        item.appProperties?.managedBy !== MANAGED_BY ||
        item.appProperties?.managedKey !== input.managedKey) {
      const query = [
        `'${escapeQuery(input.parentFolderId)}' in parents`,
        `mimeType = '${FOLDER_MIME}'`,
        "trashed = false",
        `appProperties has { key='managedBy' and value='${MANAGED_BY}' }`,
        `appProperties has { key='managedKey' and value='${escapeQuery(input.managedKey)}' }`,
      ].join(" and ");
      item = (await listDriveItems(userEmail, query, 10))[0] || null;
    }
    const syncedAt = new Date().toISOString();
    const appProperties = {
      managedBy: MANAGED_BY,
      managedKey: input.managedKey,
      folderType: input.folderType,
      companyId: input.companyId,
      memoId: input.memoId,
      fileCategory: input.category,
      createdAt: stored?.created_at || syncedAt,
      lastSyncedAt: syncedAt,
    };
    if (!item) {
      item = await createFolder(
        userEmail,
        input.folderName,
        input.parentFolderId,
        appProperties,
      );
      await logDriveOperation(userEmail, {
        operationType: "folder_create",
        targetId: item.id,
        afterPath: input.drivePath,
        status: "completed",
      });
    } else {
      const currentParent = item.parents?.[0] || "";
      const needsMove = currentParent !== input.parentFolderId;
      const needsRename = item.name !== input.folderName;
      if (needsMove || needsRename) {
        const beforePath = stored?.drive_path || "";
        item = await patchDriveItem(userEmail, item.id, {
          ...(needsRename ? { name: input.folderName } : {}),
          ...(needsMove
            ? { addParent: input.parentFolderId, removeParent: (item.parents || []).join(",") }
            : {}),
          appProperties,
        });
        await logDriveOperation(userEmail, {
          operationType: needsMove ? "folder_move" : "folder_rename",
          targetId: item.id,
          beforePath,
          afterPath: input.drivePath,
          status: "completed",
        });
      } else {
        await patchDriveItem(userEmail, item.id, { appProperties });
      }
    }
    await saveManagedFolder(userEmail, { ...input, folderId: item.id });
    return item.id;
  } finally {
    await releaseLock(userEmail, input.managedKey, token);
  }
}

export async function ensureManagedAttachmentFolders(
  userEmail: string,
  context: AttachmentOwnerContext,
): Promise<ManagedFolderSet> {
  const rootFolderId = await ensureRootFolder(userEmail);
  const companyName = sanitizeDriveFolderName(context.companyName, "업체 미정");
  const companyPath = `Work Note/${companyName}`;
  const companyFolderId = await ensureManagedFolder(userEmail, {
    managedKey: `company:${context.companyId}`,
    parentFolderId: rootFolderId,
    folderType: "company",
    folderName: companyName,
    companyId: context.companyId,
    memoId: "",
    category: "",
    drivePath: companyPath,
  });
  const memoBaseName = sanitizeDriveFolderName(context.memoTitle, "제목 미정");
  const memoNameLockKey = `memo-name:${companyFolderId}:${memoBaseName.toLowerCase()}`;
  const memoNameLockToken = await acquireLock(userEmail, memoNameLockKey);
  let memoName = memoBaseName;
  let memoPath = "";
  let memoFolderId = "";
  try {
    memoName = await uniqueMemoFolderName(
      userEmail,
      companyFolderId,
      memoBaseName,
      context.memoId,
    );
    memoPath = `${companyPath}/${memoName}`;
    memoFolderId = await ensureManagedFolder(userEmail, {
      managedKey: `memo:${context.memoId}`,
      parentFolderId: companyFolderId,
      folderType: "memo",
      folderName: memoName,
      companyId: context.companyId,
      memoId: context.memoId,
      category: "",
      drivePath: memoPath,
    });
  } finally {
    await releaseLock(userEmail, memoNameLockKey, memoNameLockToken);
  }
  const categoryPath = `${memoPath}/${context.category}`;
  const categoryFolderId = await ensureManagedFolder(userEmail, {
    managedKey: `category:${context.memoId}:${context.category}`,
    parentFolderId: memoFolderId,
    folderType: "category",
    folderName: context.category,
    companyId: context.companyId,
    memoId: context.memoId,
    category: context.category,
    drivePath: categoryPath,
  });
  return {
    rootFolderId,
    companyFolderId,
    memoFolderId,
    categoryFolderId,
    category: context.category,
    drivePath: categoryPath,
    memoFolderUrl: driveFolderUrl(memoFolderId),
  };
}

export function ownerContextForAttachment(
  dataset: JsonRecord,
  row: DriveAttachmentRow,
  overrides: JsonRecord = {},
): AttachmentOwnerContext {
  const metadata = { ...parseJson(row.metadata_json), ...overrides };
  return resolveAttachmentOwnerContext({
    dataset,
    ownerKind: String(overrides.ownerKind || row.owner_kind),
    ownerLocalId: String(overrides.ownerLocalId || row.owner_local_id),
    metadata,
    fileName: String(overrides.fileName || row.display_file_name || row.file_name),
    mimeType: String(overrides.mimeType || row.mime_type),
    category: overrides.category ?? metadata.category ?? row.file_category,
    uploadedAt: row.created_at,
  });
}

export async function moveDriveFileToFolder(
  userEmail: string,
  fileId: string,
  folderId: string,
): Promise<DriveItem> {
  const item = await getDriveItem(userEmail, fileId);
  if (!item || item.trashed) throw new Error("Google Drive에서 이동할 파일을 찾을 수 없습니다.");
  if ((item.parents || []).includes(folderId)) return item;
  return patchDriveItem(userEmail, fileId, {
    addParent: folderId,
    removeParent: (item.parents || []).join(","),
  });
}

export async function applyOrganizedPlacement(input: {
  userEmail: string;
  row: DriveAttachmentRow;
  context: AttachmentOwnerContext;
  moveFile?: boolean;
}): Promise<ManagedFolderSet & { webViewLink: string; driveFileUrl: string }> {
  const folders = await ensureManagedAttachmentFolders(input.userEmail, input.context);
  const oldChain = [
    input.row.drive_category_folder_id || input.row.drive_folder_id || "",
    input.row.drive_memo_folder_id || "",
    input.row.drive_company_folder_id || "",
  ].filter(Boolean);
  let webViewLink = input.row.drive_web_view_link || "";
  if (input.moveFile !== false && input.row.drive_file_id) {
    const moved = await moveDriveFileToFolder(
      input.userEmail,
      input.row.drive_file_id,
      folders.categoryFolderId,
    );
    webViewLink = moved.webViewLink || driveFileUrl(input.row.drive_file_id);
  }
  const fileName = input.row.display_file_name || input.row.file_name;
  const now = new Date().toISOString();
  const drivePath = buildDrivePath(input.context, fileName);
  await database().prepare(`UPDATE work_note_attachments SET
    drive_folder_id = ?, drive_company_folder_id = ?, drive_memo_folder_id = ?,
    drive_category_folder_id = ?, drive_path = ?, drive_web_view_link = ?,
    file_category = ?, upload_status = 'completed', sync_status = '동기화 완료',
    last_synced_at = ?, last_error = '', operation_token = '', updated_at = ?
    WHERE user_email = ? AND local_id = ?`)
    .bind(
      folders.categoryFolderId,
      folders.companyFolderId,
      folders.memoFolderId,
      folders.categoryFolderId,
      drivePath,
      webViewLink,
      folders.category,
      now,
      now,
      input.userEmail,
      input.row.local_id,
    ).run();
  await logDriveOperation(input.userEmail, {
    operationType: "file_move",
    targetId: input.row.drive_file_id || input.row.local_id,
    beforePath: input.row.drive_path || "",
    afterPath: drivePath,
    status: "completed",
    payload: { memoId: input.context.memoId, category: input.context.category },
  });
  if (input.moveFile !== false && oldChain.length) {
    await cleanupManagedFolderChain(input.userEmail, oldChain);
  }
  return {
    ...folders,
    drivePath,
    webViewLink,
    driveFileUrl: input.row.drive_file_id ? driveFileUrl(input.row.drive_file_id) : "",
  };
}

async function folderIsActuallyEmpty(userEmail: string, folderId: string): Promise<boolean> {
  const children = await listDriveItems(
    userEmail,
    `'${escapeQuery(folderId)}' in parents and trashed = false`,
    1,
  );
  return children.length === 0;
}

async function hasActiveFolderLock(userEmail: string, row: ManagedFolderRow): Promise<boolean> {
  const now = new Date().toISOString();
  const lock = await database().prepare(`SELECT lock_key FROM work_note_drive_locks
    WHERE user_email = ? AND expires_at >= ? AND (
      lock_key = ? OR lock_key = ? OR lock_key LIKE ?
    ) LIMIT 1`).bind(
      userEmail,
      now,
      row.managed_key,
      `memo:${row.memo_id}`,
      row.memo_id ? `category:${row.memo_id}:%` : "category:__none__:%",
    ).first<{ lock_key: string }>();
  return Boolean(lock);
}

async function attachmentReferencesFolder(userEmail: string, folderId: string): Promise<boolean> {
  const row = await database().prepare(`SELECT local_id FROM work_note_attachments
    WHERE user_email = ? AND deleted_at IS NULL AND (
      drive_company_folder_id = ? OR drive_memo_folder_id = ? OR
      drive_category_folder_id = ? OR drive_folder_id = ?
    ) LIMIT 1`).bind(userEmail, folderId, folderId, folderId, folderId)
    .first<{ local_id: string }>();
  return Boolean(row);
}

export async function inspectManagedFolderForCleanup(
  userEmail: string,
  row: ManagedFolderRow,
): Promise<{ eligible: boolean; reason: string }> {
  const connection = await getDriveConnection(userEmail);
  if (!connection || row.folder_id === connection.rootFolderId) {
    return { eligible: false, reason: "Work Note 루트 폴더" };
  }
  if (row.trashed_at) return { eligible: false, reason: "이미 정리됨" };
  if (await hasActiveFolderLock(userEmail, row)) {
    return { eligible: false, reason: "업로드·이동 작업 진행 중" };
  }
  if (await attachmentReferencesFolder(userEmail, row.folder_id)) {
    return { eligible: false, reason: "첨부파일 또는 다른 메모에서 참조 중" };
  }
  const item = await getDriveItem(userEmail, row.folder_id);
  if (!item || item.trashed) return { eligible: false, reason: "Drive에서 찾을 수 없거나 이미 휴지통에 있음" };
  if (item.mimeType !== FOLDER_MIME) return { eligible: false, reason: "폴더가 아님" };
  if (
    item.appProperties?.managedBy !== MANAGED_BY ||
    item.appProperties?.managedKey !== row.managed_key
  ) {
    return { eligible: false, reason: "Work Note 관리 폴더로 확인되지 않음" };
  }
  if (!await folderIsActuallyEmpty(userEmail, row.folder_id)) {
    return { eligible: false, reason: "파일 또는 하위 폴더가 있음" };
  }
  return { eligible: true, reason: "" };
}

export async function cleanupManagedFolderChain(
  userEmail: string,
  folderIds: string[],
): Promise<{ cleaned: number; excluded: number; failed: number }> {
  let cleaned = 0;
  let excluded = 0;
  let failed = 0;
  for (const folderId of [...new Set(folderIds.filter(Boolean))]) {
    const row = await database().prepare(`SELECT folder_id, managed_key, parent_folder_id,
      folder_type, folder_name, company_id, memo_id, file_category, drive_path,
      created_at, last_synced_at, trashed_at FROM work_note_drive_folders
      WHERE user_email = ? AND folder_id = ?`)
      .bind(userEmail, folderId).first<ManagedFolderRow>();
    if (!row) {
      excluded += 1;
      continue;
    }
    try {
      const check = await inspectManagedFolderForCleanup(userEmail, row);
      if (!check.eligible) {
        excluded += 1;
        continue;
      }
      await patchDriveItem(userEmail, row.folder_id, { trashed: true });
      const now = new Date().toISOString();
      await database().prepare(`UPDATE work_note_drive_folders SET trashed_at = ?,
        last_synced_at = ? WHERE user_email = ? AND folder_id = ?`)
        .bind(now, now, userEmail, row.folder_id).run();
      await logDriveOperation(userEmail, {
        operationType: "empty_folder_cleanup",
        targetId: row.folder_id,
        beforePath: row.drive_path,
        status: "completed",
      });
      cleaned += 1;
    } catch (error) {
      failed += 1;
      await logDriveOperation(userEmail, {
        operationType: "empty_folder_cleanup",
        targetId: row.folder_id,
        beforePath: row.drive_path,
        status: "retry_required",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { cleaned, excluded, failed };
}

export async function previewManagedEmptyFolders(userEmail: string) {
  const rows = await database().prepare(`SELECT folder_id, managed_key, parent_folder_id,
    folder_type, folder_name, company_id, memo_id, file_category, drive_path,
    created_at, last_synced_at, trashed_at FROM work_note_drive_folders
    WHERE user_email = ? AND trashed_at IS NULL
    ORDER BY CASE folder_type WHEN 'category' THEN 1 WHEN 'memo' THEN 2 ELSE 3 END,
      created_at ASC LIMIT 300`)
    .bind(userEmail).all<ManagedFolderRow>();
  const folders: Array<ManagedFolderRow & { eligible: boolean; reason: string }> = [];
  for (const row of rows.results) {
    const check = await inspectManagedFolderForCleanup(userEmail, row);
    folders.push({ ...row, ...check });
  }
  return {
    checked: folders.length,
    empty: folders.filter((folder) => folder.eligible).length,
    excluded: folders.filter((folder) => !folder.eligible).length,
    folders,
  };
}

export async function cleanupAllManagedEmptyFolders(userEmail: string) {
  const preview = await previewManagedEmptyFolders(userEmail);
  const candidateIds = preview.folders
    .filter((folder) => folder.eligible)
    .map((folder) => folder.folder_id);
  const result = await cleanupManagedFolderChain(userEmail, candidateIds);
  return { ...preview, ...result };
}

export async function synchronizeAttachmentFoldersForDataset(
  userEmail: string,
  dataset: JsonRecord,
  limit = 100,
) {
  const rows = await database().prepare(`SELECT local_id, owner_kind, owner_local_id,
    storage_provider, drive_file_id, drive_folder_id, drive_company_folder_id,
    drive_memo_folder_id, drive_category_folder_id, drive_path, drive_web_view_link,
    file_category, file_name, display_file_name, mime_type, metadata_json,
    created_at, updated_at FROM work_note_attachments
    WHERE user_email = ? AND storage_provider = 'google_drive'
      AND drive_file_id IS NOT NULL AND deleted_at IS NULL
    ORDER BY updated_at ASC LIMIT ?`)
    .bind(userEmail, limit).all<DriveAttachmentRow>();
  let synchronized = 0;
  let failed = 0;
  for (const row of rows.results) {
    const context = ownerContextForAttachment(dataset, row);
    const expected = buildDrivePath(context, row.display_file_name || row.file_name);
    if (row.drive_path === expected && row.drive_category_folder_id) continue;
    try {
      await applyOrganizedPlacement({ userEmail, row, context });
      synchronized += 1;
    } catch (error) {
      failed += 1;
      const now = new Date().toISOString();
      await database().prepare(`UPDATE work_note_attachments SET sync_status = '재시도 필요',
        last_error = ?, updated_at = ? WHERE user_email = ? AND local_id = ?`)
        .bind(error instanceof Error ? error.message : String(error), now, userEmail, row.local_id).run();
      await logDriveOperation(userEmail, {
        operationType: "dataset_sync",
        targetId: row.local_id,
        beforePath: row.drive_path || "",
        afterPath: expected,
        status: "retry_required",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { checked: rows.results.length, synchronized, failed };
}

export async function logDriveOperation(
  userEmail: string,
  input: {
    operationType: string;
    status: string;
    targetId?: string;
    beforePath?: string;
    afterPath?: string;
    payload?: JsonRecord;
    errorMessage?: string;
  },
) {
  const now = new Date().toISOString();
  await database().prepare(`INSERT INTO work_note_drive_operations
    (id, user_email, operation_type, status, target_id, before_path,
      after_path, payload, error_message, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      crypto.randomUUID(),
      userEmail,
      input.operationType,
      input.status,
      input.targetId || "",
      input.beforePath || "",
      input.afterPath || "",
      JSON.stringify(input.payload || {}),
      input.errorMessage || "",
      now,
      now,
    ).run();
}

export async function recentDriveOperations(userEmail: string, limit = 50) {
  const rows = await database().prepare(`SELECT id, operation_type, status,
    target_id, before_path, after_path, payload, error_message, created_at, updated_at
    FROM work_note_drive_operations WHERE user_email = ?
    ORDER BY created_at DESC LIMIT ?`).bind(userEmail, limit).all();
  return rows.results;
}

export async function previewAttachmentOrganization(userEmail: string) {
  const dataset = await loadWorkNoteDataset(userEmail);
  const rows = await database().prepare(`SELECT local_id, owner_kind, owner_local_id,
    storage_provider, drive_file_id, drive_folder_id, drive_company_folder_id,
    drive_memo_folder_id, drive_category_folder_id, drive_path, drive_web_view_link,
    file_category, file_name, display_file_name, mime_type, metadata_json,
    created_at, updated_at FROM work_note_attachments
    WHERE user_email = ? AND deleted_at IS NULL ORDER BY updated_at ASC LIMIT 500`)
    .bind(userEmail).all<DriveAttachmentRow>();
  const items = rows.results.map((row) => {
    const context = ownerContextForAttachment(dataset, row);
    const targetPath = buildDrivePath(context, row.display_file_name || row.file_name);
    const needsMove = row.storage_provider === "google_drive" &&
      Boolean(row.drive_file_id) &&
      row.drive_path !== targetPath;
    return {
      id: row.local_id,
      storageProvider: row.storage_provider,
      driveFileId: row.drive_file_id || "",
      currentPath: row.drive_path || "",
      targetPath,
      companyName: context.companyName,
      memoTitle: context.memoTitle,
      category: context.category,
      needsMove,
      excludedReason: row.storage_provider !== "google_drive"
        ? "기존 Site 저장 파일은 Drive 이전 단계에서 처리"
        : !row.drive_file_id
          ? "Google Drive 파일 ID 없음"
          : needsMove ? "" : "이미 올바른 위치",
    };
  });
  return {
    checked: items.length,
    moveRequired: items.filter((item) => item.needsMove).length,
    excluded: items.filter((item) => !item.needsMove).length,
    items,
  };
}
