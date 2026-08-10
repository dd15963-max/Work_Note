import { database } from "@/db/runtime";
import { driveFetch, driveFetchOnce, getDriveConnection, googleError } from "./auth";
import {
  DRIVE_UPLOAD_CHUNK_SIZE,
  formatContentRange,
  formatStatusProbeRange,
  progressFromDriveResponse,
  type ResumableProgress,
} from "./resumable-protocol";
import { driveParentChangeForDestination } from "./upload-adoption";
import { UploadProtocolError } from "./upload-errors";

export type DriveFileMetadata = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  parents?: string[];
  trashed?: boolean;
  webViewLink?: string;
  thumbnailLink?: string;
  modifiedTime?: string;
  md5Checksum?: string;
  appProperties?: Record<string, string>;
};

const DRIVE_FILE_FIELDS =
  "id,name,mimeType,size,parents,trashed,webViewLink,thumbnailLink,modifiedTime,md5Checksum,appProperties";

export type DriveResumableSession = {
  sessionUri: string;
  createdAt: string;
};

export type DriveResumableChunkResult = ResumableProgress & {
  metadata?: DriveFileMetadata;
  sessionUri?: string;
};

function escapeQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export async function createDriveFolder(userEmail: string, name: string, parentId?: string): Promise<string> {
  const query = [
    `name = '${escapeQuery(name)}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    parentId ? `'${escapeQuery(parentId)}' in parents` : "",
  ].filter(Boolean).join(" and ");
  const listUrl = new URL("https://www.googleapis.com/drive/v3/files");
  listUrl.searchParams.set("q", query);
  listUrl.searchParams.set("spaces", "drive");
  listUrl.searchParams.set("fields", "files(id,name)");
  listUrl.searchParams.set("pageSize", "10");
  const listResponse = await driveFetch(userEmail, listUrl.toString());
  const listed = await listResponse.json() as { files?: Array<{ id: string }> };
  if (listed.files?.[0]?.id) return listed.files[0].id;

  const response = await driveFetch(userEmail, "https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  const created = await response.json() as { id?: string };
  if (!created.id) throw new Error("Google Drive 폴더를 만들지 못했습니다.");
  return created.id;
}

async function findInitialManagedRootFolder(userEmail: string): Promise<string> {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", [
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    "appProperties has { key='managedBy' and value='work-note' }",
    "appProperties has { key='folderType' and value='root' }",
  ].join(" and "));
  url.searchParams.set("spaces", "drive");
  url.searchParams.set("orderBy", "createdTime asc");
  url.searchParams.set("pageSize", "10");
  url.searchParams.set("fields", "files(id,createdTime)");
  const response = await driveFetch(userEmail, url.toString());
  const payload = await response.json() as { files?: Array<{ id: string }> };
  return payload.files?.[0]?.id || "";
}

async function createInitialManagedRootFolder(userEmail: string): Promise<string> {
  const now = new Date().toISOString();
  const response = await driveFetch(
    userEmail,
    "https://www.googleapis.com/drive/v3/files?fields=id",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Work Note",
        mimeType: "application/vnd.google-apps.folder",
        appProperties: {
          managedBy: "work-note",
          folderType: "root",
          createdAt: now,
          lastSyncedAt: now,
        },
      }),
    },
  );
  const created = await response.json() as { id?: string };
  if (!created.id) throw new Error("Google Drive 루트 폴더를 만들지 못했습니다.");
  return created.id;
}

export async function ensureRootFolders(userEmail: string): Promise<string> {
  const connection = await getDriveConnection(userEmail);
  if (!connection) throw new Error("Google Drive 연결이 필요합니다.");
  if (connection.rootFolderId) return connection.rootFolderId;
  const rootId = await findInitialManagedRootFolder(userEmail) ||
    await createInitialManagedRootFolder(userEmail);
  await database().prepare(`UPDATE work_note_google_drive_connections
    SET root_folder_id = ?, root_folder_name = 'Work Note', updated_at = ? WHERE user_email = ?`)
    .bind(rootId, new Date().toISOString(), userEmail).run();
  return rootId;
}

function ownerFolderName(ownerKind: string): string {
  if (ownerKind === "company") return "고객사";
  if (ownerKind === "settlement") return "정산";
  if (ownerKind === "schedule") return "일정";
  if (ownerKind === "shared") return "공용 파일함";
  if (["sales", "materialSales", "output", "other", "task"].includes(ownerKind)) return "업무";
  return "미분류";
}

export async function ensureAttachmentFolder(
  userEmail: string,
  ownerKind: string,
  ownerLocalId: string,
  uploadedAt: string,
): Promise<string> {
  const rootId = await ensureRootFolders(userEmail);
  const categoryId = await createDriveFolder(userEmail, ownerFolderName(ownerKind), rootId);
  const year = /^\d{4}/.exec(uploadedAt)?.[0] || String(new Date().getFullYear());
  const yearId = await createDriveFolder(userEmail, year, categoryId);
  return createDriveFolder(userEmail, ownerLocalId || `미분류_${crypto.randomUUID()}`, yearId);
}

export async function uploadDriveFile(userEmail: string, input: {
  name: string;
  mimeType: string;
  size: number;
  body: BodyInit;
  folderId: string;
  existingFileId?: string;
  appProperties?: Record<string, string>;
}): Promise<DriveFileMetadata> {
  if (input.size <= 0 || input.size > DRIVE_UPLOAD_CHUNK_SIZE) {
    throw new UploadProtocolError(
      "FILE_STREAM_ERROR",
      "이 파일은 분할 업로드 API로 저장해야 합니다.",
      { stage: "drive_upload", status: 409, retryable: true },
    );
  }
  const session = await createDriveResumableSession(userEmail, {
    name: input.name,
    mimeType: input.mimeType,
    size: input.size,
    folderId: input.folderId,
    existingFileId: input.existingFileId,
    appProperties: input.appProperties,
  });
  const uploaded = await uploadDriveResumableChunk(userEmail, session.sessionUri, {
    body: input.body,
    start: 0,
    end: input.size - 1,
    total: input.size,
    mimeType: input.mimeType,
  });
  if (!uploaded.complete || !uploaded.metadata?.id) {
    throw new UploadProtocolError("FILE_STREAM_ERROR", "Google Drive 업로드 완료 응답을 받지 못했습니다.", {
      stage: "drive_finalize",
      status: 503,
      retryable: true,
    });
  }
  return uploaded.metadata;
}

export async function createDriveResumableSession(userEmail: string, input: {
  name: string;
  mimeType: string;
  size: number;
  folderId: string;
  existingFileId?: string;
  appProperties?: Record<string, string>;
}): Promise<DriveResumableSession> {
  const endpoint = input.existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(input.existingFileId)}?uploadType=resumable&fields=${DRIVE_FILE_FIELDS}`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=${DRIVE_FILE_FIELDS}`;
  const started = await driveFetch(userEmail, endpoint, {
    method: input.existingFileId ? "PATCH" : "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": input.mimeType,
      "X-Upload-Content-Length": String(input.size),
    },
    body: JSON.stringify({
      name: input.name,
      ...(input.existingFileId ? {} : { parents: [input.folderId] }),
      ...(input.appProperties ? { appProperties: input.appProperties } : {}),
    }),
  });
  const uploadUrl = started.headers.get("Location");
  if (!uploadUrl) throw new Error("Google Drive 업로드 세션을 만들지 못했습니다.");
  return { sessionUri: uploadUrl, createdAt: new Date().toISOString() };
}

export async function uploadDriveResumableChunk(
  userEmail: string,
  sessionUri: string,
  input: {
    body: BodyInit;
    start: number;
    end: number;
    total: number;
    mimeType: string;
  },
): Promise<DriveResumableChunkResult> {
  const length = input.end - input.start + 1;
  if (length <= 0 || input.start < 0 || input.end >= input.total) {
    throw new UploadProtocolError("INVALID_CONTENT_RANGE", undefined, {
      stage: "drive_chunk",
      status: 400,
    });
  }
  const response = await driveFetchOnce(userEmail, sessionUri, {
    method: "PUT",
    headers: {
      "Content-Type": input.mimeType,
      "Content-Length": String(length),
      "Content-Range": formatContentRange({ start: input.start, end: input.end, total: input.total }),
    },
    body: input.body,
  });
  const nextSessionUri = response.headers.get("Location") || undefined;
  if (![200, 201, 308].includes(response.status)) {
    if ([404, 410].includes(response.status)) {
      throw new UploadProtocolError("UPLOAD_SESSION_EXPIRED", undefined, {
        stage: "drive_session",
        status: 409,
        retryable: true,
      });
    }
    throw await googleError(response);
  }
  const metadata = response.status === 200 || response.status === 201
    ? await response.json() as DriveFileMetadata
    : undefined;
  return {
    ...progressFromDriveResponse(response.status, response.headers.get("Range"), input.total, metadata),
    metadata,
    sessionUri: nextSessionUri,
  };
}

export async function queryDriveResumableStatus(
  userEmail: string,
  sessionUri: string,
  total: number,
): Promise<DriveResumableChunkResult> {
  const response = await driveFetchOnce(userEmail, sessionUri, {
    method: "PUT",
    headers: {
      "Content-Length": "0",
      "Content-Range": formatStatusProbeRange(total),
    },
  });
  if (![200, 201, 308].includes(response.status)) {
    if ([404, 410].includes(response.status)) {
      throw new UploadProtocolError("UPLOAD_SESSION_EXPIRED", undefined, {
        stage: "drive_session",
        status: 409,
        retryable: true,
      });
    }
    throw await googleError(response);
  }
  const metadata = response.status === 200 || response.status === 201
    ? await response.json() as DriveFileMetadata
    : undefined;
  return {
    ...progressFromDriveResponse(response.status, response.headers.get("Range"), total, metadata),
    metadata,
    sessionUri: response.headers.get("Location") || undefined,
  };
}

export async function findDriveFilesForAttachment(
  userEmail: string,
  attachmentId: string,
  options: { operationToken?: string; parentFolderId?: string } = {},
): Promise<DriveFileMetadata[]> {
  const clauses = [
    "trashed = false",
    `appProperties has { key='attachmentId' and value='${escapeQuery(attachmentId)}' }`,
    options.operationToken
      ? `appProperties has { key='operationToken' and value='${escapeQuery(options.operationToken)}' }`
      : "",
    options.parentFolderId ? `'${escapeQuery(options.parentFolderId)}' in parents` : "",
  ].filter(Boolean);
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", clauses.join(" and "));
  url.searchParams.set("spaces", "drive");
  url.searchParams.set("orderBy", "modifiedTime desc");
  url.searchParams.set("pageSize", "10");
  url.searchParams.set("fields", `files(${DRIVE_FILE_FIELDS})`);
  const response = await driveFetch(userEmail, url.toString());
  const result = await response.json() as { files?: DriveFileMetadata[] };
  return result.files || [];
}

export function getDriveFile(userEmail: string, fileId: string): Promise<Response> {
  return driveFetch(userEmail,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
}

export async function getDriveFileMetadata(userEmail: string, fileId: string): Promise<DriveFileMetadata> {
  const response = await driveFetch(userEmail,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${DRIVE_FILE_FIELDS}`);
  return response.json() as Promise<DriveFileMetadata>;
}

export async function updateDriveFileMetadata(
  userEmail: string,
  fileId: string,
  values: { name?: string; addParent?: string; removeParent?: string },
): Promise<DriveFileMetadata> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set("fields", DRIVE_FILE_FIELDS);
  if (values.addParent) url.searchParams.set("addParents", values.addParent);
  if (values.removeParent) url.searchParams.set("removeParents", values.removeParent);
  const response = await driveFetch(userEmail, url.toString(), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values.name ? { name: values.name } : {}),
  });
  return response.json() as Promise<DriveFileMetadata>;
}


export async function ensureDriveFileParent(
  userEmail: string,
  metadata: DriveFileMetadata,
  destinationFolderId: string,
): Promise<DriveFileMetadata> {
  const change = driveParentChangeForDestination(metadata.parents, destinationFolderId);
  if (!change) return metadata;
  const moved = await updateDriveFileMetadata(userEmail, metadata.id, change);
  if (!(moved.parents || []).includes(destinationFolderId)) {
    throw new UploadProtocolError("DRIVE_FOLDER_NOT_FOUND", undefined, {
      stage: "drive_parent_verify", status: 409, retryable: true,
    });
  }
  return moved;
}
export async function trashDriveFile(userEmail: string, fileId: string): Promise<void> {
  await driveFetch(userEmail,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,trashed`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    });
}

export async function driveStorageQuota(userEmail: string) {
  const response = await driveFetch(userEmail,
    "https://www.googleapis.com/drive/v3/about?fields=storageQuota,user");
  return response.json() as Promise<{
    storageQuota?: { limit?: string; usage?: string; usageInDrive?: string; usageInDriveTrash?: string };
    user?: { emailAddress?: string };
  }>;
}

export function rootFolderUrl(rootFolderId: string): string {
  return rootFolderId
    ? `https://drive.google.com/drive/folders/${encodeURIComponent(rootFolderId)}`
    : "https://drive.google.com/drive/my-drive";
}
