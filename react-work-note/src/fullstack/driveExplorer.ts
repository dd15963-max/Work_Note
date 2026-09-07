import type { AttachmentRecord, WorkNoteData } from "./types";

export type DriveExplorerFile = {
  id: string;
  fileName: string;
  fileSize: number;
  folderPath: string;
  driveFileId: string;
  driveWebViewLink: string;
  lastSyncedAt: string;
  sourceLabel: string;
  ownerTitle: string;
};

export type DriveExplorerFolder = {
  name: string;
  path: string;
  fileCount: number;
};

export type DriveFolderContents = {
  folders: DriveExplorerFolder[];
  files: DriveExplorerFile[];
};

type WorkNoteCollectionKey = "generalMemos" | "companies" | "notes" | "materialSalesNotes" | "settlementTasks" | "outputTasks" | "otherTasks";

const SOURCE_COLLECTIONS: Array<{ key: WorkNoteCollectionKey; label: string }> = [
  { key: "generalMemos", label: "메모" },
  { key: "companies", label: "업체" },
  { key: "notes", label: "영업" },
  { key: "materialSalesNotes", label: "소재 영업" },
  { key: "settlementTasks", label: "정산" },
  { key: "outputTasks", label: "출력" },
  { key: "otherTasks", label: "기타" },
];

export function collectDriveExplorerFiles(data: WorkNoteData): DriveExplorerFile[] {
  const files = new Map<string, DriveExplorerFile>();

  for (const source of SOURCE_COLLECTIONS) {
    const records: Array<Record<string, unknown>> = Array.isArray(data[source.key])
      ? data[source.key] as Array<Record<string, unknown>>
      : [];
    for (const record of records) {
      collectRecordAttachments(record, source.label, displayTitle(record), files);
    }
  }

  return Array.from(files.values()).sort((left, right) => (
    left.folderPath.localeCompare(right.folderPath, "ko")
    || left.fileName.localeCompare(right.fileName, "ko")
  ));
}

export function listDriveFolderContents(
  files: DriveExplorerFile[],
  currentPath: string,
  query = "",
): DriveFolderContents {
  const normalizedPath = normalizeFolderPath(currentPath);
  const normalizedQuery = query.trim().toLocaleLowerCase("ko");

  if (normalizedQuery) {
    return {
      folders: [],
      files: files.filter((file) => [
        file.fileName,
        file.folderPath,
        file.ownerTitle,
        file.sourceLabel,
      ].some((value) => value.toLocaleLowerCase("ko").includes(normalizedQuery))),
    };
  }

  const folderCounts = new Map<string, number>();
  const directFiles: DriveExplorerFile[] = [];
  const prefix = normalizedPath ? `${normalizedPath}/` : "";

  for (const file of files) {
    if (file.folderPath === normalizedPath) {
      directFiles.push(file);
      continue;
    }
    if (!file.folderPath.startsWith(prefix)) continue;
    const remainder = file.folderPath.slice(prefix.length);
    const childName = remainder.split("/")[0];
    if (!childName) continue;
    folderCounts.set(childName, (folderCounts.get(childName) || 0) + 1);
  }

  const folders = Array.from(folderCounts.entries())
    .map(([name, fileCount]) => ({
      name,
      path: normalizedPath ? `${normalizedPath}/${name}` : name,
      fileCount,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "ko"));

  return { folders, files: directFiles };
}

export function drivePathBreadcrumbs(path: string): Array<{ name: string; path: string }> {
  const parts = normalizeFolderPath(path).split("/").filter(Boolean);
  return parts.map((name, index) => ({ name, path: parts.slice(0, index + 1).join("/") }));
}

function collectRecordAttachments(
  value: unknown,
  sourceLabel: string,
  ownerTitle: string,
  files: Map<string, DriveExplorerFile>,
): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const child of value) collectRecordAttachments(child, sourceLabel, ownerTitle, files);
    return;
  }

  const record = value as Record<string, unknown>;
  const nextOwnerTitle = displayTitle(record) || ownerTitle;
  const attachments = Array.isArray(record.attachments)
    ? record.attachments as AttachmentRecord[]
    : [];

  for (const attachment of attachments) {
    const driveFileId = String(attachment.driveFileId || "").trim();
    if (!driveFileId) continue;
    const id = String(attachment.id || driveFileId).trim();
    if (!id || files.has(id)) continue;
    const fileName = String(attachment.fileName || "이름 없는 파일").trim();
    files.set(id, {
      id,
      fileName,
      fileSize: Number(attachment.fileSize || 0),
      folderPath: attachmentFolderPath(String(attachment.drivePath || ""), fileName),
      driveFileId,
      driveWebViewLink: String(attachment.driveWebViewLink || `https://drive.google.com/open?id=${encodeURIComponent(driveFileId)}`),
      lastSyncedAt: String(attachment.lastSyncedAt || attachment.updatedAt || attachment.createdAt || ""),
      sourceLabel,
      ownerTitle: nextOwnerTitle || "제목 없음",
    });
  }

  for (const [key, child] of Object.entries(record)) {
    if (key === "attachments" || key === "blob") continue;
    if (Array.isArray(child) || (child && typeof child === "object")) {
      collectRecordAttachments(child, sourceLabel, nextOwnerTitle, files);
    }
  }
}

function attachmentFolderPath(rawPath: string, fileName: string): string {
  const parts = normalizeFolderPath(rawPath).split("/").filter(Boolean);
  if (parts.at(-1) === fileName) parts.pop();
  return parts.join("/");
}

function normalizeFolderPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
}

function displayTitle(record: Record<string, unknown>): string {
  const candidates = [
    record.title,
    record.taskTitle,
    record.subject,
    record.companyName,
    record.name,
    record.projectName,
    record.memo,
  ];
  return String(candidates.find((value) => typeof value === "string" && value.trim()) || "").trim();
}
