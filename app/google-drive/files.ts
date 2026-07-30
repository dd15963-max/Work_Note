import { database } from "@/db/runtime";
import { driveFetch, getDriveConnection } from "./auth";

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

export async function ensureRootFolders(userEmail: string): Promise<string> {
  const connection = await getDriveConnection(userEmail);
  if (!connection) throw new Error("Google Drive 연결이 필요합니다.");
  const rootId = connection.rootFolderId || await createDriveFolder(userEmail, "Work Note");
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
}): Promise<DriveFileMetadata> {
  const fields = "id,name,mimeType,size,parents,trashed,webViewLink,thumbnailLink,modifiedTime";
  const endpoint = input.existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(input.existingFileId)}?uploadType=resumable&fields=${fields}`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=${fields}`;
  const started = await driveFetch(userEmail, endpoint, {
    method: input.existingFileId ? "PATCH" : "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": input.mimeType,
      "X-Upload-Content-Length": String(input.size),
    },
    body: JSON.stringify({ name: input.name, ...(input.existingFileId ? {} : { parents: [input.folderId] }) }),
  });
  const uploadUrl = started.headers.get("Location");
  if (!uploadUrl) throw new Error("Google Drive 업로드 세션을 만들지 못했습니다.");
  const uploaded = await driveFetch(userEmail, uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": input.mimeType, "Content-Length": String(input.size) },
    body: input.body,
  });
  return uploaded.json() as Promise<DriveFileMetadata>;
}

export function getDriveFile(userEmail: string, fileId: string): Promise<Response> {
  return driveFetch(userEmail,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
}

export async function getDriveFileMetadata(userEmail: string, fileId: string): Promise<DriveFileMetadata> {
  const response = await driveFetch(userEmail,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,parents,trashed,webViewLink,thumbnailLink,modifiedTime`);
  return response.json() as Promise<DriveFileMetadata>;
}

export async function updateDriveFileMetadata(
  userEmail: string,
  fileId: string,
  values: { name?: string; addParent?: string; removeParent?: string },
): Promise<DriveFileMetadata> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set("fields", "id,name,mimeType,size,parents,trashed,webViewLink,thumbnailLink,modifiedTime");
  if (values.addParent) url.searchParams.set("addParents", values.addParent);
  if (values.removeParent) url.searchParams.set("removeParents", values.removeParent);
  const response = await driveFetch(userEmail, url.toString(), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values.name ? { name: values.name } : {}),
  });
  return response.json() as Promise<DriveFileMetadata>;
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
