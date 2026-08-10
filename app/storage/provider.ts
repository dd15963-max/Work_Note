import { fileBucket } from "@/db/runtime";
import {
  getDriveFile,
  getDriveFileMetadata,
  trashDriveFile,
  updateDriveFileMetadata,
  uploadDriveFile,
  type DriveFileMetadata,
} from "@/app/google-drive/files";

export type StorageProviderName = "site_storage" | "google_drive";

export type StoredFileReference = {
  provider: StorageProviderName;
  storageKey?: string;
  driveFileId?: string;
  driveFolderId?: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
};

export type UploadFileInput = {
  userEmail: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  body: BodyInit;
  folderId: string;
  existing?: StoredFileReference | null;
  appProperties?: Record<string, string>;
};

export type StoredFile = StoredFileReference & {
  previewAvailable: boolean;
  metadata?: DriveFileMetadata;
};

export interface StorageProvider {
  uploadFile(input: UploadFileInput): Promise<StoredFile>;
  downloadFile(userEmail: string, file: StoredFileReference): Promise<Response>;
  deleteFile(userEmail: string, file: StoredFileReference): Promise<void>;
  renameFile(userEmail: string, file: StoredFileReference, newName: string): Promise<StoredFileReference>;
  moveFile(userEmail: string, file: StoredFileReference, folderId: string): Promise<StoredFileReference>;
  getFileMetadata(userEmail: string, file: StoredFileReference): Promise<Record<string, unknown>>;
}

export class GoogleDriveStorageProvider implements StorageProvider {
  async uploadFile(input: UploadFileInput): Promise<StoredFile> {
    const metadata = await uploadDriveFile(input.userEmail, {
      name: input.fileName,
      mimeType: input.mimeType,
      size: input.fileSize,
      body: input.body,
      folderId: input.folderId,
      existingFileId: input.existing?.provider === "google_drive" ? input.existing.driveFileId : undefined,
      appProperties: input.appProperties,
    });
    return {
      provider: "google_drive",
      driveFileId: metadata.id,
      driveFolderId: metadata.parents?.[0] || input.folderId,
      fileName: metadata.name || input.fileName,
      mimeType: metadata.mimeType || input.mimeType,
      fileSize: Number(metadata.size || input.fileSize),
      previewAvailable: Boolean(metadata.thumbnailLink || metadata.mimeType?.startsWith("image/") || metadata.mimeType === "application/pdf"),
      metadata,
    };
  }

  downloadFile(userEmail: string, file: StoredFileReference) {
    if (!file.driveFileId) throw new Error("Google Drive 파일 ID가 없습니다.");
    return getDriveFile(userEmail, file.driveFileId);
  }

  async deleteFile(userEmail: string, file: StoredFileReference) {
    if (!file.driveFileId) throw new Error("Google Drive 파일 ID가 없습니다.");
    await trashDriveFile(userEmail, file.driveFileId);
  }

  async renameFile(userEmail: string, file: StoredFileReference, newName: string) {
    if (!file.driveFileId) throw new Error("Google Drive 파일 ID가 없습니다.");
    const metadata = await updateDriveFileMetadata(userEmail, file.driveFileId, { name: newName });
    return { ...file, fileName: metadata.name || newName };
  }

  async moveFile(userEmail: string, file: StoredFileReference, folderId: string) {
    if (!file.driveFileId) throw new Error("Google Drive 파일 ID가 없습니다.");
    const metadata = await getDriveFileMetadata(userEmail, file.driveFileId);
    await updateDriveFileMetadata(userEmail, file.driveFileId, {
      addParent: folderId,
      removeParent: (metadata.parents || []).join(","),
    });
    return { ...file, driveFolderId: folderId };
  }

  async getFileMetadata(userEmail: string, file: StoredFileReference) {
    if (!file.driveFileId) throw new Error("Google Drive 파일 ID가 없습니다.");
    return getDriveFileMetadata(userEmail, file.driveFileId);
  }
}

export class SiteStorageProvider implements StorageProvider {
  async uploadFile(): Promise<StoredFile> {
    throw new Error("신규 첨부파일은 Google Drive 연결 후 업로드할 수 있습니다.");
  }

  async downloadFile(_userEmail: string, file: StoredFileReference) {
    if (!file.storageKey) throw new Error("기존 파일 저장 키가 없습니다.");
    const object = await fileBucket().get(file.storageKey);
    if (!object) throw new Error("기존 첨부 원본 파일을 찾을 수 없습니다.");
    return new Response(object.body, {
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Length": String(file.fileSize || object.size),
      },
    });
  }

  async deleteFile(_userEmail: string, file: StoredFileReference) {
    if (file.storageKey) await fileBucket().delete(file.storageKey);
  }

  async renameFile(_userEmail: string, file: StoredFileReference, newName: string) {
    return { ...file, fileName: newName };
  }

  async moveFile(_userEmail: string, file: StoredFileReference, _folderId: string) {
    return file;
  }

  async getFileMetadata(_userEmail: string, file: StoredFileReference) {
    return file;
  }
}

const googleDriveProvider = new GoogleDriveStorageProvider();
const siteStorageProvider = new SiteStorageProvider();

export function storageProvider(name: string): StorageProvider {
  return name === "google_drive" ? googleDriveProvider : siteStorageProvider;
}
