import { database } from "@/db/runtime";
import { driveFetch, getDriveConnection } from "./auth";
import {
  buildDrivePath,
  chooseCanonicalFolder,
  driveFileUrl,
  driveFolderUrl,
  managedFolderKeys,
  memoFolderCollisionName,
  normalizeCompanyFolderKey,
  normalizeCompanyFolderName,
  normalizeDriveFolderComparisonKey,
  resolveAttachmentOwnerContext,
  sanitizeDriveFolderName,
  type AttachmentOwnerContext,
  type CanonicalFolderCandidate,
  type JsonRecord,
} from "./organization";
import {
  folderActivityBlocksCleanup,
  isCompanyAliasCandidateEligible,
  managedFolderChainIsStrict,
  type ManagedFolderChainNode,
} from "./folder-safety";

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
  createdTime?: string;
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
  const items: DriveItem[] = [];
  let pageToken = "";
  do {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", query);
    url.searchParams.set("spaces", "drive");
    url.searchParams.set("pageSize", String(Math.min(100, Math.max(1, pageSize - items.length))));
    url.searchParams.set(
      "fields",
      "nextPageToken,files(id,name,mimeType,parents,trashed,appProperties,webViewLink,modifiedTime,createdTime)",
    );
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await driveFetch(userEmail, url.toString());
    const payload = await response.json() as {
      files?: DriveItem[];
      nextPageToken?: string;
    };
    items.push(...(payload.files || []));
    pageToken = payload.nextPageToken || "";
  } while (pageToken && items.length < pageSize);
  return items.slice(0, pageSize);
}

async function getDriveItem(userEmail: string, id: string): Promise<DriveItem | null> {
  if (!id) return null;
  try {
    const response = await driveFetch(
      userEmail,
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,parents,trashed,appProperties,webViewLink,modifiedTime,createdTime`,
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
    "https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,parents,trashed,appProperties,webViewLink,modifiedTime,createdTime",
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
    "id,name,mimeType,parents,trashed,appProperties,webViewLink,modifiedTime,createdTime",
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
  const bootstrapLockKey = "managed-root-bootstrap";
  const bootstrapLockToken = await acquireLock(userEmail, bootstrapLockKey);
  try {
  const connection = await getDriveConnection(userEmail);
  if (!connection) throw new Error("Google Drive 연결이 필요합니다.");
  let existing = await getDriveItem(userEmail, connection.rootFolderId);
  if (existing && existing.mimeType === FOLDER_MIME) {
    if (existing.trashed) {
      existing = await patchDriveItem(userEmail, existing.id, { trashed: false });
    }
    return existing.id;
  }
  const matches = await listDriveItems(
    userEmail,
    `mimeType = '${FOLDER_MIME}' and trashed = false and ` +
      `appProperties has { key='managedBy' and value='${MANAGED_BY}' } and ` +
      "appProperties has { key='folderType' and value='root' }",
    10,
  );
  const now = new Date().toISOString();
  const root = matches.sort((left, right) =>
    (left.createdTime || "").localeCompare(right.createdTime || ""))[0] ||
    await createFolder(userEmail, "Work Note", undefined, {
      managedBy: MANAGED_BY,
      folderType: "root",
      createdAt: now,
      lastSyncedAt: now,
    });
  await database().prepare(`UPDATE work_note_google_drive_connections
    SET root_folder_id = ?, root_folder_name = 'Work Note', last_synced_at = ?, updated_at = ?
    WHERE user_email = ?`).bind(root.id, now, now, userEmail).run();
  return root.id;
  } finally {
    await releaseLock(userEmail, bootstrapLockKey, bootstrapLockToken);
  }
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
        new Date(now.getTime() + 120_000).toISOString(),
        now.toISOString(),
      ).run();
    if (Number((result.meta as { changes?: number } | undefined)?.changes || 0) > 0) return token;
    await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
  }
  throw new Error("DUPLICATE_OPERATION: Google Drive 폴더 작업이 진행 중입니다. 잠시 후 자동으로 다시 시도합니다.");
}

async function releaseLock(userEmail: string, lockKey: string, token: string) {
  await database().prepare(`DELETE FROM work_note_drive_locks
    WHERE user_email = ? AND lock_key = ? AND owner_token = ?`)
    .bind(userEmail, lockKey, token).run();
}

export async function acquireDriveOperationLock(
  userEmail: string,
  lockKey: string,
): Promise<string> {
  return acquireLock(userEmail, lockKey);
}

export async function renewDriveOperationLock(
  userEmail: string,
  lockKey: string,
  token: string,
): Promise<void> {
  const result = await database().prepare(`UPDATE work_note_drive_locks SET expires_at = ?
    WHERE user_email = ? AND lock_key = ? AND owner_token = ?`)
    .bind(new Date(Date.now() + 120_000).toISOString(), userEmail, lockKey, token).run();
  if (Number((result.meta as { changes?: number } | undefined)?.changes || 0) < 1) {
    throw new Error("Google Drive 폴더 작업 잠금이 만료되었습니다.");
  }
}

export async function releaseDriveOperationLock(
  userEmail: string,
  lockKey: string,
  token: string,
): Promise<void> {
  await releaseLock(userEmail, lockKey, token);
}

export type DriveFolderPlacementLease = {
  lockKey: string;
  token: string;
};

export async function acquireDriveFolderPlacementLock(
  userEmail: string,
): Promise<DriveFolderPlacementLease> {
  const rootFolderId = await ensureRootFolder(userEmail);
  const lockKey = `folder-placement:${rootFolderId}`;
  return { lockKey, token: await acquireLock(userEmail, lockKey) };
}

export async function releaseDriveFolderPlacementLock(
  userEmail: string,
  lease: DriveFolderPlacementLease,
): Promise<void> {
  await releaseLock(userEmail, lease.lockKey, lease.token);
}

export async function withDriveFolderPlacementLock<T>(
  userEmail: string,
  operation: (lease: DriveFolderPlacementLease) => Promise<T>,
): Promise<T> {
  const lease = await acquireDriveFolderPlacementLock(userEmail);
  try {
    return await operation(lease);
  } finally {
    await releaseDriveFolderPlacementLock(userEmail, lease);
  }
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

async function folderReferenceCounts(
  userEmail: string,
  folderType: "company" | "memo" | "category",
): Promise<Map<string, number>> {
  const column = folderType === "company"
    ? "drive_company_folder_id"
    : folderType === "memo"
      ? "drive_memo_folder_id"
      : "drive_category_folder_id";
  const rows = await database().prepare(`SELECT ${column} AS folder_id,
    COUNT(*) AS reference_count FROM work_note_attachments
    WHERE user_email = ? AND deleted_at IS NULL AND ${column} <> ''
    GROUP BY ${column}`).bind(userEmail).all<{
      folder_id: string;
      reference_count: number | string;
    }>();
  return new Map(rows.results.map((row) => [
    row.folder_id,
    Number(row.reference_count || 0),
  ]));
}

async function ensureCanonicalCompanyFolder(input: {
  userEmail: string;
  rootFolderId: string;
  context: AttachmentOwnerContext;
  companyPath: string;
}): Promise<string> {
  const companyName = normalizeCompanyFolderName(input.context.companyName);
  const companyKey = normalizeCompanyFolderKey(companyName);
  const companyIdAlias = `company-id:${input.context.companyId}`;
  const companyNameAlias = `company-name:${companyKey}`;
  const managedKey = managedFolderKeys(input.context).company;
  const lockToken = await acquireLock(input.userEmail, managedKey);
  try {
    const [driveItems, registryRows, references, aliasRows] = await Promise.all([
      listDriveItems(
        input.userEmail,
        `'${escapeQuery(input.rootFolderId)}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
        1000,
      ),
      database().prepare(`SELECT folder_id, managed_key, parent_folder_id,
        folder_type, folder_name, company_id, memo_id, file_category, drive_path,
        created_at, last_synced_at, trashed_at FROM work_note_drive_folders
        WHERE user_email = ? AND folder_type = 'company'`)
        .bind(input.userEmail).all<ManagedFolderRow>(),
      folderReferenceCounts(input.userEmail, "company"),
      database().prepare(`SELECT alias_key, folder_id FROM work_note_drive_folder_aliases
        WHERE user_email = ? AND alias_key IN (?, ?)`)
        .bind(input.userEmail, companyIdAlias, companyNameAlias)
        .all<{ alias_key: string; folder_id: string }>(),
    ]);
    const registryById = new Map(registryRows.results.map((row) => [row.folder_id, row]));
    const aliasKeysByFolder = new Map<string, string[]>();
    for (const alias of aliasRows.results) {
      const keys = aliasKeysByFolder.get(alias.folder_id) || [];
      keys.push(alias.alias_key);
      aliasKeysByFolder.set(alias.folder_id, keys);
    }
    const aliasMatchesContext = (item: DriveItem, registry?: ManagedFolderRow) =>
      (aliasKeysByFolder.get(item.id) || []).some((aliasKey) =>
        isCompanyAliasCandidateEligible({
          aliasKey,
          expectedCompanyId: input.context.companyId,
          expectedCompanyKey: companyKey,
          driveFolderName: item.name,
          driveCompanyId: item.appProperties?.companyId,
          driveCanonicalCompanyKey: item.appProperties?.canonicalCompanyKey,
          registryFolderName: registry?.folder_name,
          registryCompanyId: registry?.company_id,
        }));
    const candidates = driveItems
      .filter((item) => {
        const registry = registryById.get(item.id);
        return normalizeCompanyFolderKey(item.name) === companyKey ||
          registry?.managed_key === managedKey ||
          aliasMatchesContext(item, registry);
      })
      .map((item) => {
        const registry = registryById.get(item.id);
        const healthyRegistry = Boolean(
          (registry &&
          !registry.trashed_at &&
          registry.parent_folder_id === input.rootFolderId &&
          (registry.managed_key === managedKey ||
            normalizeCompanyFolderKey(registry.folder_name) === companyKey)) ||
          aliasMatchesContext(item, registry),
        );
        const managedByWorkNote = item.appProperties?.managedBy === MANAGED_BY &&
          (!item.appProperties.folderType || item.appProperties.folderType === "company");
        return {
          folderId: item.id,
          name: item.name,
          createdTime: item.createdTime,
          healthyRegistry,
          managedByWorkNote,
          attachmentReferences: references.get(item.id) || 0,
          item,
          registry,
        };
      })
      .filter((candidate) =>
        candidate.healthyRegistry ||
        candidate.managedByWorkNote ||
        candidate.attachmentReferences > 0);
    let selected = chooseCanonicalFolder(candidates);
    const syncedAt = new Date().toISOString();
    const appProperties = {
      managedBy: MANAGED_BY,
      managedKey,
      folderType: "company",
      companyId: input.context.companyId,
      canonicalCompanyKey: companyKey,
      memoId: "",
      fileCategory: "",
      createdAt: selected?.registry?.created_at || syncedAt,
      lastSyncedAt: syncedAt,
    };
    if (!selected) {
      const item = await createFolder(
        input.userEmail,
        companyName,
        input.rootFolderId,
        appProperties,
      );
      selected = {
        folderId: item.id,
        name: item.name,
        createdTime: item.createdTime,
        healthyRegistry: false,
        managedByWorkNote: true,
        attachmentReferences: 0,
        item,
        registry: undefined,
      };
      await logDriveOperation(input.userEmail, {
        operationType: "folder_create",
        targetId: item.id,
        afterPath: input.companyPath,
        status: "completed",
        payload: { managedKey, canonicalCompanyKey: companyKey },
      });
    } else {
      const needsRename = selected.item.name !== companyName;
      await patchDriveItem(input.userEmail, selected.item.id, {
        ...(needsRename ? { name: companyName } : {}),
        appProperties,
      });
      if (needsRename) {
        await logDriveOperation(input.userEmail, {
          operationType: "folder_rename",
          targetId: selected.item.id,
          beforePath: `Work Note/${selected.item.name}`,
          afterPath: input.companyPath,
          status: "completed",
        });
      }
    }
    const staleCanonical = registryRows.results.find((row) =>
      row.managed_key === managedKey && row.folder_id !== selected?.folderId);
    if (staleCanonical) {
      const staleItem = await getDriveItem(input.userEmail, staleCanonical.folder_id);
      if (staleItem && !staleItem.trashed) {
        throw new Error(
          "정상 등록된 Google Drive 업체 폴더를 확인하지 않고 registry를 교체할 수 없습니다.",
        );
      }
      await database().prepare(`UPDATE work_note_drive_folders
        SET managed_key = ?, last_synced_at = ?
        WHERE user_email = ? AND folder_id = ?`)
        .bind(`stale:${staleCanonical.folder_id}`, syncedAt,
          input.userEmail, staleCanonical.folder_id).run();
    }
    await saveManagedFolder(input.userEmail, {
      folderId: selected.folderId,
      managedKey,
      parentFolderId: input.rootFolderId,
      folderType: "company",
      folderName: companyName,
      companyId: input.context.companyId,
      memoId: "",
      category: "",
      drivePath: input.companyPath,
    });
    await database().batch([
      database().prepare(`DELETE FROM work_note_drive_folder_aliases
        WHERE user_email = ? AND folder_id = ? AND folder_type = 'company'
          AND alias_key LIKE 'company-name:%' AND alias_key <> ?`)
        .bind(input.userEmail, selected.folderId, companyNameAlias),
      database().prepare(`INSERT INTO work_note_drive_folder_aliases
        (user_email, alias_key, folder_id, folder_type, updated_at)
        VALUES (?, ?, ?, 'company', ?)
        ON CONFLICT(user_email, alias_key) DO UPDATE SET
          folder_id = excluded.folder_id,
          folder_type = excluded.folder_type,
          updated_at = excluded.updated_at`)
        .bind(input.userEmail, companyIdAlias, selected.folderId, syncedAt),
      database().prepare(`INSERT INTO work_note_drive_folder_aliases
        (user_email, alias_key, folder_id, folder_type, updated_at)
        VALUES (?, ?, ?, 'company', ?)
        ON CONFLICT(user_email, alias_key) DO UPDATE SET
          folder_id = excluded.folder_id,
          folder_type = excluded.folder_type,
          updated_at = excluded.updated_at`)
        .bind(input.userEmail, companyNameAlias, selected.folderId, syncedAt),
    ]);
    if (candidates.length > 1) {
      await logDriveOperation(input.userEmail, {
        operationType: "duplicate_company_detected",
        targetId: selected.folderId,
        afterPath: input.companyPath,
        status: "preview_required",
        payload: {
          canonicalFolderId: selected.folderId,
          duplicateFolderIds: candidates
            .filter((candidate) => candidate.folderId !== selected?.folderId)
            .map((candidate) => candidate.folderId),
        },
      });
    }
    return selected.folderId;
  } finally {
    await releaseLock(input.userEmail, managedKey, lockToken);
  }
}

async function uniqueMemoFolderName(
  userEmail: string,
  parentFolderId: string,
  desired: string,
  memoId: string,
): Promise<string> {
  const [items, rows] = await Promise.all([
    listDriveItems(
      userEmail,
      `'${escapeQuery(parentFolderId)}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
      1000,
    ),
    database().prepare(`SELECT folder_id, memo_id FROM work_note_drive_folders
      WHERE user_email = ? AND parent_folder_id = ? AND folder_type = 'memo'
        AND trashed_at IS NULL`).bind(userEmail, parentFolderId)
      .all<{ folder_id: string; memo_id: string }>(),
  ]);
  const registryMemoIds = new Map(rows.results.map((row) => [row.folder_id, row.memo_id]));
  const desiredKey = normalizeDriveFolderComparisonKey(desired);
  const conflicts = items.filter((item) => {
    if (normalizeDriveFolderComparisonKey(item.name) !== desiredKey) return false;
    const itemMemoId = item.appProperties?.memoId || item.appProperties?.ownerId ||
      registryMemoIds.get(item.id) || "";
    return itemMemoId !== memoId;
  });
  return conflicts.length
    ? memoFolderCollisionName(desired, memoId, items.map((item) => item.name))
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
    let storedItem = stored ? await getDriveItem(userEmail, stored.folder_id) : null;
    if (
      storedItem?.trashed &&
      storedItem.appProperties?.managedBy === MANAGED_BY &&
      storedItem.appProperties?.managedKey === input.managedKey
    ) {
      storedItem = await patchDriveItem(userEmail, storedItem.id, { trashed: false });
    }
    const query = [
      `mimeType = '${FOLDER_MIME}'`,
      "trashed = false",
      `appProperties has { key='managedBy' and value='${MANAGED_BY}' }`,
      `appProperties has { key='managedKey' and value='${escapeQuery(input.managedKey)}' }`,
    ].join(" and ");
    const [managedMatches, references, logicalReferences] = await Promise.all([
      listDriveItems(userEmail, query, 100),
      folderReferenceCounts(userEmail, input.folderType),
      input.folderType === "memo"
        ? database().prepare(`SELECT DISTINCT drive_memo_folder_id AS folder_id
          FROM work_note_attachments WHERE user_email = ? AND deleted_at IS NULL
            AND owner_local_id = ? AND drive_memo_folder_id <> ''`)
          .bind(userEmail, input.memoId).all<{ folder_id: string }>()
        : input.folderType === "category"
          ? database().prepare(`SELECT DISTINCT drive_category_folder_id AS folder_id
            FROM work_note_attachments WHERE user_email = ? AND deleted_at IS NULL
              AND owner_local_id = ? AND file_category = ?
              AND drive_category_folder_id <> ''`)
            .bind(userEmail, input.memoId, input.category).all<{ folder_id: string }>()
          : Promise.resolve({ results: [] as Array<{ folder_id: string }> }),
    ]);
    const referencedItems = await Promise.all(
      logicalReferences.results.slice(0, 100)
        .map((row) => getDriveItem(userEmail, row.folder_id)),
    );
    const itemById = new Map<string, DriveItem>();
    for (const candidate of [storedItem, ...managedMatches, ...referencedItems]) {
      if (candidate && !candidate.trashed && candidate.mimeType === FOLDER_MIME) {
        itemById.set(candidate.id, candidate);
      }
    }
    const ranked = chooseCanonicalFolder(
      [...itemById.values()].map((candidate): CanonicalFolderCandidate & { item: DriveItem } => ({
        folderId: candidate.id,
        name: candidate.name,
        createdTime: candidate.createdTime,
        healthyRegistry: Boolean(stored && candidate.id === stored.folder_id && !stored.trashed_at),
        managedByWorkNote: candidate.appProperties?.managedBy === MANAGED_BY &&
          candidate.appProperties?.managedKey === input.managedKey,
        attachmentReferences: references.get(candidate.id) || 0,
        item: candidate,
      })).filter((candidate) =>
        candidate.healthyRegistry ||
        candidate.managedByWorkNote ||
        candidate.attachmentReferences > 0),
    );
    let item = ranked?.item || null;
    const syncedAt = new Date().toISOString();
    const appProperties = {
      managedBy: MANAGED_BY,
      managedKey: input.managedKey,
      folderType: input.folderType,
      companyId: input.companyId,
      memoId: input.memoId,
      ownerId: input.memoId,
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
    if (stored && stored.folder_id !== item.id) {
      if (storedItem && !storedItem.trashed) {
        throw new Error(
          "정상 등록된 Google Drive 폴더를 확인하지 않고 registry를 교체할 수 없습니다.",
        );
      }
      await database().prepare(`UPDATE work_note_drive_folders
        SET managed_key = ?, last_synced_at = ? WHERE user_email = ? AND folder_id = ?`)
        .bind(`stale:${stored.folder_id}`, syncedAt, userEmail, stored.folder_id).run();
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
  const companyName = normalizeCompanyFolderName(context.companyName);
  const companyPath = `Work Note/${companyName}`;
  const companyFolderId = await ensureCanonicalCompanyFolder({
    userEmail,
    rootFolderId,
    context,
    companyPath,
  });
  const memoBaseName = sanitizeDriveFolderName(context.memoTitle, "제목 미정");
  const memoNameLockKey = `memo-name:${companyFolderId}:${normalizeDriveFolderComparisonKey(memoBaseName)}`;
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
  const placement = await withDriveFolderPlacementLock(input.userEmail, async (lease) => {
    const row = await database().prepare(`SELECT local_id, owner_kind, owner_local_id,
      storage_provider, drive_file_id, drive_folder_id, drive_company_folder_id,
      drive_memo_folder_id, drive_category_folder_id, drive_path, drive_web_view_link,
      file_category, file_name, display_file_name, mime_type, metadata_json,
      created_at, updated_at FROM work_note_attachments
      WHERE user_email = ? AND local_id = ? AND deleted_at IS NULL`)
      .bind(input.userEmail, input.row.local_id).first<DriveAttachmentRow>();
    if (!row) throw new Error("Attachment changed or was deleted before Drive placement.");
    const dataset = await loadWorkNoteDataset(input.userEmail);
    const context = ownerContextForAttachment(dataset, row);
    const folders = await ensureManagedAttachmentFolders(input.userEmail, context);
    const oldChain = [
      row.drive_category_folder_id || row.drive_folder_id || "",
      row.drive_memo_folder_id || "",
      row.drive_company_folder_id || "",
    ].filter(Boolean);
    let webViewLink = row.drive_web_view_link || "";
    if (input.moveFile !== false && row.drive_file_id) {
      await renewDriveOperationLock(input.userEmail, lease.lockKey, lease.token);
      const moved = await moveDriveFileToFolder(
        input.userEmail,
        row.drive_file_id,
        folders.categoryFolderId,
      );
      webViewLink = moved.webViewLink || driveFileUrl(row.drive_file_id);
    }
    const fileName = row.display_file_name || row.file_name;
    const now = new Date().toISOString();
    const drivePath = buildDrivePath(context, fileName);
    await renewDriveOperationLock(input.userEmail, lease.lockKey, lease.token);
    const updated = await database().prepare(`UPDATE work_note_attachments SET
      drive_folder_id = ?, drive_company_folder_id = ?, drive_memo_folder_id = ?,
      drive_category_folder_id = ?, drive_path = ?, drive_web_view_link = ?,
      file_category = ?, upload_status = 'completed', sync_status = 'synced',
      last_synced_at = ?, last_error = '', operation_token = '', updated_at = ?
      WHERE user_email = ? AND local_id = ? AND updated_at = ?`)
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
        row.local_id,
        row.updated_at,
      ).run();
    if (Number((updated.meta as { changes?: number } | undefined)?.changes || 0) < 1) {
      throw new Error("Attachment changed during Drive placement; retry with the latest metadata.");
    }
    await logDriveOperation(input.userEmail, {
      operationType: "file_move",
      targetId: row.drive_file_id || row.local_id,
      beforePath: row.drive_path || "",
      afterPath: drivePath,
      status: "completed",
      payload: { memoId: context.memoId, category: context.category },
    });
    return {
      result: {
        ...folders,
        drivePath,
        webViewLink,
        driveFileUrl: row.drive_file_id ? driveFileUrl(row.drive_file_id) : "",
      },
      oldChain,
    };
  });
  if (input.moveFile !== false && placement.oldChain.length) {
    await cleanupManagedFolderChain(input.userEmail, placement.oldChain);
  }
  return placement.result;
}
async function folderIsActuallyEmpty(userEmail: string, folderId: string): Promise<boolean> {
  const children = await listDriveItems(
    userEmail,
    `'${escapeQuery(folderId)}' in parents and trashed = false`,
    1,
  );
  return children.length === 0;
}

export async function folderHasActiveWork(
  userEmail: string,
  folderId: string,
  ignoredPlacementToken = "",
  ignoredOperationToken = "",
): Promise<boolean> {
  const now = new Date().toISOString();
  const [lock, session, attachment] = await Promise.all([
    database().prepare(`SELECT lock_key FROM work_note_drive_locks
      WHERE user_email = ? AND expires_at >= ?
        AND owner_token <> ? AND owner_token <> ? LIMIT 1`)
      .bind(userEmail, now, ignoredPlacementToken, ignoredOperationToken)
      .first<{ lock_key: string }>(),
    database().prepare(`SELECT id FROM work_note_upload_sessions
      WHERE user_email = ? AND (
        status IN ('pending', 'uploading') OR (
          status IN ('retry_required', 'reconnect_required') AND (
            destination_folder_id = ? OR company_folder_id = ? OR memo_folder_id = ?
          )
        )
      ) LIMIT 1`).bind(userEmail, folderId, folderId, folderId)
      .first<{ id: string }>(),
    database().prepare(`SELECT local_id FROM work_note_attachments
      WHERE user_email = ? AND deleted_at IS NULL AND (
        (operation_token <> '' AND (
          sync_status IN ('pending', 'uploading', '업로드 중', '이동 중') OR
          upload_status IN ('pending', 'uploading', 'moving')
        )) OR (
          sync_status IN ('retry_required', 'reconnect_required', '재시도 필요', '연결 필요')
          AND (
            drive_company_folder_id = ? OR drive_memo_folder_id = ? OR
            drive_category_folder_id = ? OR drive_folder_id = ?
          )
        )
      ) LIMIT 1`).bind(userEmail, folderId, folderId, folderId, folderId)
      .first<{ local_id: string }>(),
  ]);
  return folderActivityBlocksCleanup({
    activeUploadSession: Boolean(session),
    activeAttachmentOperation: Boolean(attachment),
    activeFolderLock: Boolean(lock),
  });
}


async function managedFolderRegistryById(
  userEmail: string,
  folderId: string,
): Promise<ManagedFolderRow | null> {
  return database().prepare(`SELECT folder_id, managed_key, parent_folder_id,
    folder_type, folder_name, company_id, memo_id, file_category, drive_path,
    created_at, last_synced_at, trashed_at FROM work_note_drive_folders
    WHERE user_email = ? AND folder_id = ?`)
    .bind(userEmail, folderId).first<ManagedFolderRow>();
}

export async function managedFolderHasStrictAncestry(
  userEmail: string,
  folderId: string,
  targetType: "company" | "memo" | "category",
  targetManagedKey = "",
): Promise<boolean> {
  const connection = await getDriveConnection(userEmail);
  if (!connection || !folderId || folderId === connection.rootFolderId) return false;
  const expectedTypes = targetType === "category"
    ? ["category", "memo", "company"] as const
    : targetType === "memo" ? ["memo", "company"] as const : ["company"] as const;
  const nodes: ManagedFolderChainNode[] = [];
  let currentId = folderId;
  for (const expectedType of expectedTypes) {
    const [item, registry] = await Promise.all([
      getDriveItem(userEmail, currentId),
      managedFolderRegistryById(userEmail, currentId),
    ]);
    if (!item || item.trashed || item.mimeType !== FOLDER_MIME) return false;
    nodes.push({
      id: item.id,
      parentIds: item.parents || [],
      managedBy: item.appProperties?.managedBy || "",
      folderType: item.appProperties?.folderType || "",
      managedKey: item.appProperties?.managedKey || "",
      ...(registry ? {
        registry: {
          parentFolderId: registry.parent_folder_id,
          folderType: registry.folder_type,
          managedKey: registry.managed_key,
          trashed: Boolean(registry.trashed_at),
        },
      } : {}),
    });
    if (item.appProperties?.folderType !== expectedType || (item.parents || []).length !== 1) {
      return false;
    }
    currentId = item.parents![0];
  }
  const root = await getDriveItem(userEmail, currentId);
  if (!root || root.trashed || root.mimeType !== FOLDER_MIME) return false;
  nodes.push({
    id: root.id,
    parentIds: root.parents || [],
    managedBy: root.appProperties?.managedBy || "",
    folderType: root.appProperties?.folderType || "",
    managedKey: root.appProperties?.managedKey || "",
  });
  return managedFolderChainIsStrict({
    targetType,
    targetManagedKey,
    rootFolderId: connection.rootFolderId,
    nodes,
  });
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
  ignoredPlacementToken = "",
): Promise<{ eligible: boolean; reason: string }> {
  const connection = await getDriveConnection(userEmail);
  if (!connection || row.folder_id === connection.rootFolderId) {
    return { eligible: false, reason: "Work Note 루트 폴더" };
  }
  if (row.trashed_at) return { eligible: false, reason: "이미 정리됨" };
  if (await folderHasActiveWork(userEmail, row.folder_id, ignoredPlacementToken)) {
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
    item.appProperties?.managedKey !== row.managed_key ||
    item.appProperties?.folderType !== row.folder_type
  ) {
    return { eligible: false, reason: "Work Note 관리 폴더로 확인되지 않음" };
  }
  if (!await managedFolderHasStrictAncestry(
    userEmail,
    row.folder_id,
    row.folder_type,
    row.managed_key,
  )) {
    return { eligible: false, reason: "Managed folder is outside the canonical Work Note chain" };
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
      const lease = await acquireDriveFolderPlacementLock(userEmail);
      try {
        const check = await inspectManagedFolderForCleanup(userEmail, row, lease.token);
        if (!check.eligible) {
          excluded += 1;
          continue;
        }
        if (
          !await managedFolderHasStrictAncestry(
            userEmail, row.folder_id, row.folder_type, row.managed_key,
          ) ||
          await folderHasActiveWork(userEmail, row.folder_id, lease.token) ||
          await attachmentReferencesFolder(userEmail, row.folder_id) ||
          !await folderIsActuallyEmpty(userEmail, row.folder_id)
        ) {
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
      } finally {
        await releaseDriveFolderPlacementLock(userEmail, lease);
      }
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
