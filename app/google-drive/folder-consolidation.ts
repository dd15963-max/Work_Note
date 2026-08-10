import { database } from "@/db/runtime";
import { driveFetch, getDriveConnection } from "./auth";
import {
  acquireDriveOperationLock,
  acquireDriveFolderPlacementLock,
  applyOrganizedPlacement,
  loadWorkNoteDataset,
  logDriveOperation,
  managedFolderHasStrictAncestry,
  ownerContextForAttachment,
  releaseDriveOperationLock,
  releaseDriveFolderPlacementLock,
  renewDriveOperationLock,
  type DriveAttachmentRow,
  folderHasActiveWork,
} from "./managed-folders";
import {
  chooseCanonicalFolder,
  normalizeCompanyFolderKey,
  normalizeDriveFolderComparisonKey,
  resolveManagedMemoIdentity,
  type CanonicalFolderCandidate,
} from "./organization";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const MANAGED_BY = "work-note";

type DriveFolder = {
  id: string;
  name: string;
  mimeType?: string;
  parents?: string[];
  trashed?: boolean;
  appProperties?: Record<string, string>;
  modifiedTime?: string;
  createdTime?: string;
};

type RegistryRow = {
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

type AnnotatedFolder = CanonicalFolderCandidate & {
  item: DriveFolder;
  registry?: RegistryRow;
  memoId?: string;
  identityConflict?: boolean;
};

export type DuplicateFolderItem = {
  id: string;
  folderType: "company" | "memo" | "category" | "root";
  name: string;
  currentPath: string;
  targetPath: string;
  canonicalFolderId: string;
  action: "keep" | "merge" | "keep_separate" | "protect";
  reason: string;
  eligible: boolean;
};

export type DuplicateFolderResult = {
  checked: number;
  companyGroups: number;
  duplicateCompanyFolders: number;
  duplicateMemoFolders: number;
  filesToMove: number;
  filesMoved: number;
  foldersTrashed: number;
  protectedUserFolders: number;
  protectedRoot: number;
  excludedNonEmpty: number;
  failed: number;
  planFingerprint: string;
  items: DuplicateFolderItem[];
  idempotentReplay?: boolean;
  remaining?: DuplicateFolderResult;
};

type InternalPlan = DuplicateFolderResult & {
  attachmentRows: DriveAttachmentRow[];
  cleanupTypes: Map<string, "company" | "memo" | "category">;
};

function escapeQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function listFolders(userEmail: string, parentId: string): Promise<DriveFolder[]> {
  const folders: DriveFolder[] = [];
  let pageToken = "";
  do {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set(
      "q",
      `'${escapeQuery(parentId)}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
    );
    url.searchParams.set("spaces", "drive");
    url.searchParams.set("pageSize", "100");
    url.searchParams.set(
      "fields",
      "nextPageToken,files(id,name,mimeType,parents,trashed,appProperties,modifiedTime,createdTime)",
    );
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await driveFetch(userEmail, url.toString());
    const payload = await response.json() as {
      files?: DriveFolder[];
      nextPageToken?: string;
    };
    folders.push(...(payload.files || []));
    pageToken = payload.nextPageToken || "";
  } while (pageToken);
  return folders;
}

async function folderHasAnyChild(userEmail: string, parentId: string): Promise<boolean> {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set(
    "q",
    `'${escapeQuery(parentId)}' in parents and trashed = false`,
  );
  url.searchParams.set("spaces", "drive");
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("fields", "files(id)");
  const response = await driveFetch(userEmail, url.toString());
  const payload = await response.json() as { files?: Array<{ id: string }> };
  return Boolean(payload.files?.length);
}

async function getFolder(userEmail: string, folderId: string): Promise<DriveFolder | null> {
  try {
    const response = await driveFetch(
      userEmail,
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}` +
        "?fields=id,name,mimeType,parents,trashed,appProperties,modifiedTime,createdTime",
    );
    return response.json() as Promise<DriveFolder>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("찾을 수 없습니다")) return null;
    throw error;
  }
}

async function trashFolder(userEmail: string, folderId: string): Promise<void> {
  await driveFetch(
    userEmail,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,trashed`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    },
  );
}

function referenceMap(
  attachments: DriveAttachmentRow[],
  key: "drive_company_folder_id" | "drive_memo_folder_id",
): Map<string, number> {
  const result = new Map<string, number>();
  for (const attachment of attachments) {
    const id = String(attachment[key] || "");
    if (id) result.set(id, (result.get(id) || 0) + 1);
  }
  return result;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function publicResult(plan: InternalPlan): DuplicateFolderResult {
  const { attachmentRows: _attachmentRows, cleanupTypes: _cleanupTypes, ...result } = plan;
  return result;
}

async function loadRegistry(userEmail: string): Promise<RegistryRow[]> {
  const rows = await database().prepare(`SELECT folder_id, managed_key, parent_folder_id,
    folder_type, folder_name, company_id, memo_id, file_category, drive_path,
    created_at, last_synced_at, trashed_at FROM work_note_drive_folders
    WHERE user_email = ?`).bind(userEmail).all<RegistryRow>();
  return rows.results;
}

async function loadDriveAttachments(userEmail: string): Promise<DriveAttachmentRow[]> {
  const rows = await database().prepare(`SELECT local_id, owner_kind, owner_local_id,
    storage_provider, drive_file_id, drive_folder_id, drive_company_folder_id,
    drive_memo_folder_id, drive_category_folder_id, drive_path, drive_web_view_link,
    file_category, file_name, display_file_name, mime_type, metadata_json,
    created_at, updated_at FROM work_note_attachments
    WHERE user_email = ? AND storage_provider = 'google_drive'
      AND drive_file_id IS NOT NULL AND deleted_at IS NULL`)
    .bind(userEmail).all<DriveAttachmentRow>();
  return rows.results;
}

async function buildPlan(userEmail: string): Promise<InternalPlan> {
  const connection = await getDriveConnection(userEmail);
  if (!connection?.rootFolderId) throw new Error("Google Drive 연결이 필요합니다.");
  const root = await getFolder(userEmail, connection.rootFolderId);
  if (!root || root.trashed || root.mimeType !== FOLDER_MIME) {
    throw new Error("Work Note 루트 폴더를 확인할 수 없습니다.");
  }
  const [companyFolders, registry, attachments] = await Promise.all([
    listFolders(userEmail, root.id),
    loadRegistry(userEmail),
    loadDriveAttachments(userEmail),
  ]);
  const registryById = new Map(registry.map((row) => [row.folder_id, row]));
  const companyRefs = referenceMap(attachments, "drive_company_folder_id");
  const memoRefs = referenceMap(attachments, "drive_memo_folder_id");
  const attachmentOwnersByMemoFolder = new Map<string, Set<string>>();
  for (const attachment of attachments) {
    const folderId = String(attachment.drive_memo_folder_id || "");
    if (!folderId) continue;
    const owners = attachmentOwnersByMemoFolder.get(folderId) || new Set<string>();
    if (attachment.owner_local_id) owners.add(attachment.owner_local_id);
    attachmentOwnersByMemoFolder.set(folderId, owners);
  }

  const items: DuplicateFolderItem[] = [{
    id: root.id,
    folderType: "root",
    name: root.name,
    currentPath: "Work Note",
    targetPath: "Work Note",
    canonicalFolderId: root.id,
    action: "protect",
    reason: "Work Note 루트는 병합·휴지통 대상이 아닙니다.",
    eligible: false,
  }];
  let protectedUserFolders = 0;
  const companyGroups = new Map<string, AnnotatedFolder[]>();
  for (const folder of companyFolders) {
    const registryRow = registryById.get(folder.id);
    const healthyRegistry = Boolean(
      registryRow &&
      !registryRow.trashed_at &&
      registryRow.folder_type === "company" &&
      registryRow.parent_folder_id === root.id,
    );
    const managedByWorkNote = folder.appProperties?.managedBy === MANAGED_BY &&
      (!folder.appProperties.folderType || folder.appProperties.folderType === "company");
    const attachmentReferences = companyRefs.get(folder.id) || 0;
    if (!healthyRegistry && !managedByWorkNote && attachmentReferences < 1) {
      protectedUserFolders += 1;
      items.push({
        id: folder.id,
        folderType: "company",
        name: folder.name,
        currentPath: `Work Note/${folder.name}`,
        targetPath: "",
        canonicalFolderId: "",
        action: "protect",
        reason: "Work Note 관리 근거가 없는 사용자 폴더",
        eligible: false,
      });
      continue;
    }
    const key = normalizeCompanyFolderKey(folder.name);
    const group = companyGroups.get(key) || [];
    group.push({
      folderId: folder.id,
      name: folder.name,
      createdTime: folder.createdTime,
      healthyRegistry,
      managedByWorkNote,
      attachmentReferences,
      item: folder,
      registry: registryRow,
    });
    companyGroups.set(key, group);
  }

  let duplicateCompanyFolders = 0;
  let duplicateMemoFolders = 0;
  const attachmentsToMove = new Map<string, DriveAttachmentRow>();
  const cleanupTypes = new Map<string, "company" | "memo" | "category">();
  const fingerprintParts: string[] = [`root:${root.id}`];

  for (const [, companyCandidates] of companyGroups) {
    const canonicalCompany = chooseCanonicalFolder(companyCandidates);
    if (!canonicalCompany) continue;
    for (const candidate of companyCandidates) {
      fingerprintParts.push(
        `company:${candidate.folderId}:${candidate.item.modifiedTime || ""}:${canonicalCompany.folderId}`,
      );
      const isDuplicate = candidate.folderId !== canonicalCompany.folderId;
      if (isDuplicate) {
        duplicateCompanyFolders += 1;
        cleanupTypes.set(candidate.folderId, "company");
      }
      items.push({
        id: candidate.folderId,
        folderType: "company",
        name: candidate.name,
        currentPath: `Work Note/${candidate.name}`,
        targetPath: `Work Note/${canonicalCompany.name}`,
        canonicalFolderId: canonicalCompany.folderId,
        action: isDuplicate ? "merge" : "keep",
        reason: isDuplicate ? "정규화된 업체명이 동일함" : "canonical 업체 폴더",
        eligible: isDuplicate,
      });
    }

    const memoFolders = (
      await Promise.all(companyCandidates.map((candidate) =>
        listFolders(userEmail, candidate.folderId)))
    ).flat();
    const memoGroups = new Map<string, AnnotatedFolder[]>();
    const titleIdentities = new Map<string, Set<string>>();
    for (const folder of memoFolders) {
      const registryRow = registryById.get(folder.id);
      const identity = resolveManagedMemoIdentity({
        registryMemoIds: registryRow?.memo_id ? [registryRow.memo_id] : [],
        appProperties: folder.appProperties,
        attachmentOwnerIds: [...(attachmentOwnersByMemoFolder.get(folder.id) || [])],
      });
      const healthyRegistry = Boolean(
        registryRow &&
        !registryRow.trashed_at &&
        registryRow.folder_type === "memo" &&
        registryRow.memo_id &&
        !identity.conflict &&
        registryRow.memo_id === identity.memoId,
      );
      const managedByWorkNote = folder.appProperties?.managedBy === MANAGED_BY &&
        (!folder.appProperties.folderType || folder.appProperties.folderType === "memo");
      const attachmentReferences = memoRefs.get(folder.id) || 0;
      if ((!healthyRegistry && !managedByWorkNote && attachmentReferences < 1) ||
          identity.conflict || !identity.memoId) {
        if (!healthyRegistry && !managedByWorkNote && attachmentReferences < 1) {
          protectedUserFolders += 1;
        }
        items.push({
          id: folder.id,
          folderType: "memo",
          name: folder.name,
          currentPath: folder.name,
          targetPath: "",
          canonicalFolderId: "",
          action: "protect",
          reason: identity.conflict
            ? "memo identity 근거가 서로 충돌함"
            : identity.memoId
              ? "Work Note 관리 근거가 없는 사용자 폴더"
              : "memoId를 안전하게 확인할 수 없음",
          eligible: false,
        });
        continue;
      }
      const candidate: AnnotatedFolder = {
        folderId: folder.id,
        name: folder.name,
        createdTime: folder.createdTime,
        healthyRegistry,
        managedByWorkNote,
        attachmentReferences,
        item: folder,
        registry: registryRow,
        memoId: identity.memoId,
      };
      const memoGroup = memoGroups.get(identity.memoId) || [];
      memoGroup.push(candidate);
      memoGroups.set(identity.memoId, memoGroup);
      const titleKey = normalizeDriveFolderComparisonKey(folder.name);
      const identities = titleIdentities.get(titleKey) || new Set<string>();
      identities.add(identity.memoId);
      titleIdentities.set(titleKey, identities);
    }
    const conflictingTitles = new Set(
      [...titleIdentities.entries()]
        .filter(([, identities]) => identities.size > 1)
        .map(([title]) => title),
    );
    for (const [memoId, memoCandidates] of memoGroups) {
      const canonicalMemo = chooseCanonicalFolder(memoCandidates);
      if (!canonicalMemo) continue;
      for (const candidate of memoCandidates) {
        fingerprintParts.push(
          `memo:${memoId}:${candidate.folderId}:${candidate.item.modifiedTime || ""}:${canonicalMemo.folderId}`,
        );
        const isDuplicate = candidate.folderId !== canonicalMemo.folderId;
        if (isDuplicate) {
          duplicateMemoFolders += 1;
          cleanupTypes.set(candidate.folderId, "memo");
        }
        const titleConflict = conflictingTitles.has(
          normalizeDriveFolderComparisonKey(candidate.name),
        );
        items.push({
          id: candidate.folderId,
          folderType: "memo",
          name: candidate.name,
          currentPath: candidate.name,
          targetPath: canonicalMemo.name,
          canonicalFolderId: canonicalMemo.folderId,
          action: isDuplicate ? "merge" : titleConflict ? "keep_separate" : "keep",
          reason: isDuplicate
            ? `동일 memoId ${memoId}`
            : titleConflict
              ? "제목은 같지만 memoId가 달라 분리 유지"
              : "canonical 메모 폴더",
          eligible: isDuplicate,
        });
      }
    }

    const companyFolderIds = new Set(companyCandidates.map((candidate) => candidate.folderId));
    const canonicalMemoByFolder = new Map<string, string>();
    for (const [, memoCandidates] of memoGroups) {
      const canonicalMemo = chooseCanonicalFolder(memoCandidates);
      if (!canonicalMemo) continue;
      for (const candidate of memoCandidates) {
        canonicalMemoByFolder.set(candidate.folderId, canonicalMemo.folderId);
      }
    }
    for (const attachment of attachments) {
      const companyFolderId = String(attachment.drive_company_folder_id || "");
      if (!companyFolderIds.has(companyFolderId)) continue;
      const memoFolderId = String(attachment.drive_memo_folder_id || "");
      if (
        companyFolderId !== canonicalCompany.folderId ||
        (canonicalMemoByFolder.has(memoFolderId) &&
          canonicalMemoByFolder.get(memoFolderId) !== memoFolderId)
      ) {
        attachmentsToMove.set(attachment.local_id, attachment);
        fingerprintParts.push(
          `attachment:${attachment.local_id}:${attachment.updated_at}:${companyFolderId}:${memoFolderId}`,
        );
        const categoryFolderId = String(
          attachment.drive_category_folder_id || attachment.drive_folder_id || "",
        );
        if (categoryFolderId) cleanupTypes.set(categoryFolderId, "category");
        if (memoFolderId && canonicalMemoByFolder.get(memoFolderId) !== memoFolderId) {
          cleanupTypes.set(memoFolderId, "memo");
        }
      }
    }
  }

  const fingerprint = fnv1a(fingerprintParts.sort().join("|"));
  return {
    checked: companyFolders.length,
    companyGroups: companyGroups.size,
    duplicateCompanyFolders,
    duplicateMemoFolders,
    filesToMove: attachmentsToMove.size,
    filesMoved: 0,
    foldersTrashed: 0,
    protectedUserFolders,
    protectedRoot: 1,
    excludedNonEmpty: 0,
    failed: 0,
    planFingerprint: fingerprint,
    items,
    attachmentRows: [...attachmentsToMove.values()],
    cleanupTypes,
  };
}

export async function previewDuplicateFolders(
  userEmail: string,
): Promise<DuplicateFolderResult> {
  return publicResult(await buildPlan(userEmail));
}

async function folderHasAttachmentReference(
  userEmail: string,
  folderId: string,
): Promise<boolean> {
  const row = await database().prepare(`SELECT local_id FROM work_note_attachments
    WHERE user_email = ? AND deleted_at IS NULL AND (
      drive_company_folder_id = ? OR drive_memo_folder_id = ? OR
      drive_category_folder_id = ? OR drive_folder_id = ?
    ) LIMIT 1`).bind(userEmail, folderId, folderId, folderId, folderId)
    .first<{ local_id: string }>();
  return Boolean(row);
}

async function safeTrashMergedFolderUnderPlacementLock(input: {
  userEmail: string;
  folderId: string;
  rootFolderId: string;
  expectedFolderType: "company" | "memo" | "category";
  mergeLockToken: string;
}, ignoredPlacementToken: string): Promise<"trashed" | "protected" | "nonempty"> {
  if (!input.folderId || input.folderId === input.rootFolderId) return "protected";
  const [folder, registry] = await Promise.all([
    getFolder(input.userEmail, input.folderId),
    database().prepare(`SELECT folder_id, managed_key, parent_folder_id,
      folder_type, folder_name, company_id, memo_id, file_category, drive_path,
      created_at, last_synced_at, trashed_at FROM work_note_drive_folders
      WHERE user_email = ? AND folder_id = ?`)
      .bind(input.userEmail, input.folderId).first<RegistryRow>(),
  ]);
  if (!folder || folder.trashed) return "protected";
  if (folder.mimeType !== FOLDER_MIME) return "protected";
  const managedKey = String(folder.appProperties?.managedKey || "");
  const expectedPrefix = input.expectedFolderType === "company"
    ? "company-name:"
    : input.expectedFolderType === "memo" ? "memo:" : "category:";
  const hasStrictDriveMarker = folder.appProperties?.managedBy === MANAGED_BY &&
    folder.appProperties?.folderType === input.expectedFolderType &&
    managedKey.startsWith(expectedPrefix);
  const registryMatchesMarker = !registry || (
    !registry.trashed_at &&
    registry.folder_type === input.expectedFolderType &&
    registry.managed_key === managedKey
  );
  if (!hasStrictDriveMarker || !registryMatchesMarker) return "protected";
  if (
    await folderHasActiveWork(
      input.userEmail,
      input.folderId,
      ignoredPlacementToken,
      input.mergeLockToken,
    ) ||
    await folderHasAttachmentReference(input.userEmail, input.folderId)
  ) {
    return "nonempty";
  }
  if (await folderHasAnyChild(input.userEmail, input.folderId)) {
    return "nonempty";
  }
  if (
    await folderHasActiveWork(
      input.userEmail,
      input.folderId,
      ignoredPlacementToken,
      input.mergeLockToken,
    ) ||
    await folderHasAttachmentReference(input.userEmail, input.folderId) ||
    await folderHasAnyChild(input.userEmail, input.folderId)
  ) {
    return "nonempty";
  }
  if (!await managedFolderHasStrictAncestry(
    input.userEmail,
    input.folderId,
    input.expectedFolderType,
    managedKey,
  )) return "protected";
  // The ancestry checks perform multiple Drive reads. Re-check every mutable
  // guard immediately before the destructive trash transition so a child,
  // attachment reference, or active operation created during those reads wins.
  if (
    await folderHasActiveWork(
      input.userEmail,
      input.folderId,
      ignoredPlacementToken,
      input.mergeLockToken,
    ) ||
    await folderHasAttachmentReference(input.userEmail, input.folderId) ||
    await folderHasAnyChild(input.userEmail, input.folderId)
  ) {
    return "nonempty";
  }
  await trashFolder(input.userEmail, input.folderId);
  const now = new Date().toISOString();
  await database().prepare(`UPDATE work_note_drive_folders
    SET trashed_at = ?, last_synced_at = ? WHERE user_email = ? AND folder_id = ?`)
    .bind(now, now, input.userEmail, input.folderId).run();
  await logDriveOperation(input.userEmail, {
    operationType: "duplicate_folder_cleanup",
    targetId: input.folderId,
    beforePath: registry?.drive_path || folder.name,
    status: "completed",
  });
  return "trashed";
}

async function safeTrashMergedFolder(input: {
  userEmail: string;
  folderId: string;
  rootFolderId: string;
  expectedFolderType: "company" | "memo" | "category";
  mergeLockToken: string;
}): Promise<"trashed" | "protected" | "nonempty"> {
  const lease = await acquireDriveFolderPlacementLock(input.userEmail);
  try {
    return await safeTrashMergedFolderUnderPlacementLock(input, lease.token);
  } finally {
    await releaseDriveFolderPlacementLock(input.userEmail, lease);
  }
}

function parseStoredResult(value: string): DuplicateFolderResult | null {
  try {
    const parsed = JSON.parse(value) as { result?: DuplicateFolderResult };
    return parsed?.result || null;
  } catch {
    return null;
  }
}

export async function mergeDuplicateFolders(input: {
  userEmail: string;
  operationToken: string;
  planFingerprint?: string;
}): Promise<DuplicateFolderResult> {
  const connection = await getDriveConnection(input.userEmail);
  if (!connection?.rootFolderId) throw new Error("Google Drive 연결이 필요합니다.");
  const lockKey = `folder-merge:${connection.rootFolderId}`;
  const lockToken = await acquireDriveOperationLock(input.userEmail, lockKey);
  try {
    const existing = await database().prepare(`SELECT status, payload
      FROM work_note_drive_operations WHERE id = ? AND user_email = ?`)
      .bind(input.operationToken, input.userEmail)
      .first<{ status: string; payload: string }>();
    if (existing?.status === "completed") {
      const stored = parseStoredResult(existing.payload);
      if (stored) return { ...stored, idempotentReplay: true };
    }
    const now = new Date().toISOString();
    await database().prepare(`INSERT OR IGNORE INTO work_note_drive_operations
      (id, user_email, operation_type, status, target_id, before_path,
        after_path, payload, error_message, created_at, updated_at)
      VALUES (?, ?, 'duplicate_folder_merge_batch', 'in_progress', ?, '', '',
        '{}', '', ?, ?)`).bind(
      input.operationToken,
      input.userEmail,
      connection.rootFolderId,
      now,
      now,
    ).run();
    await database().prepare(`UPDATE work_note_drive_operations
      SET status = 'in_progress', error_message = '', updated_at = ?
      WHERE id = ? AND user_email = ?`).bind(
      now,
      input.operationToken,
      input.userEmail,
    ).run();
    const plan = await buildPlan(input.userEmail);
    if (input.planFingerprint && input.planFingerprint !== plan.planFingerprint) {
      throw new Error("중복 폴더 상태가 미리보기 이후 변경되었습니다. 다시 미리보기를 실행해 주세요.");
    }
    const dataset = await loadWorkNoteDataset(input.userEmail);
    let filesMoved = 0;
    let failed = 0;
    for (const row of plan.attachmentRows) {
      try {
        await renewDriveOperationLock(input.userEmail, lockKey, lockToken);
        const context = ownerContextForAttachment(dataset, row);
        await applyOrganizedPlacement({
          userEmail: input.userEmail,
          row,
          context,
        });
        filesMoved += 1;
      } catch (error) {
        failed += 1;
        await logDriveOperation(input.userEmail, {
          operationType: "duplicate_file_move",
          targetId: row.drive_file_id || row.local_id,
          beforePath: row.drive_path || "",
          status: "retry_required",
          payload: { batchId: input.operationToken },
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }
    let foldersTrashed = 0;
    let excludedNonEmpty = 0;
    const cleanupOrder = [...plan.cleanupTypes.entries()].sort((left, right) => {
      const weight = { category: 1, memo: 2, company: 3 };
      return weight[left[1]] - weight[right[1]];
    });
    for (const [folderId, folderType] of cleanupOrder) {
      await renewDriveOperationLock(input.userEmail, lockKey, lockToken);
      const result = await safeTrashMergedFolder({
        userEmail: input.userEmail,
        folderId,
        rootFolderId: connection.rootFolderId,
        expectedFolderType: folderType,
        mergeLockToken: lockToken,
      });
      if (result === "trashed") foldersTrashed += 1;
      if (result === "nonempty") excludedNonEmpty += 1;
    }
    const after = await previewDuplicateFolders(input.userEmail);
    const result: DuplicateFolderResult = {
      ...publicResult(plan),
      filesMoved,
      foldersTrashed,
      excludedNonEmpty,
      failed,
      remaining: after,
    };
    const completedAt = new Date().toISOString();
    await database().prepare(`UPDATE work_note_drive_operations SET
      status = ?, payload = ?, error_message = '', updated_at = ?
      WHERE id = ? AND user_email = ?`).bind(
      failed ? "retry_required" : "completed",
      JSON.stringify({ result }),
      completedAt,
      input.operationToken,
      input.userEmail,
    ).run();
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await database().prepare(`UPDATE work_note_drive_operations
      SET status = 'retry_required', error_message = ?, updated_at = ?
      WHERE id = ? AND user_email = ?`).bind(
      message,
      new Date().toISOString(),
      input.operationToken,
      input.userEmail,
    ).run();
    throw error;
  } finally {
    await releaseDriveOperationLock(input.userEmail, lockKey, lockToken);
  }
}
