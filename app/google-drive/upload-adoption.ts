import type { AdoptableDriveFile } from "./upload-recovery";

export type DriveAdoptionDecision<T extends AdoptableDriveFile> =
  | { kind: "adopt"; file: T }
  | { kind: "create" }
  | { kind: "duplicate"; candidates: T[] };

/**
 * An operation token represents one logical file creation. If Drive already
 * contains any files for it, never create another one. Exactly one verified
 * file is adopted; ambiguous or size-mismatched candidates block creation.
 */
export function decideDriveFileAdoption<T extends AdoptableDriveFile>(
  files: T[],
  input: { attachmentId: string; operationToken: string; totalBytes: number },
): DriveAdoptionDecision<T> {
  const operationFiles = files.filter((file) =>
    !file.trashed
    && file.appProperties?.managedBy === "work-note"
    && file.appProperties?.attachmentId === input.attachmentId
    && file.appProperties?.operationToken === input.operationToken);
  const verified = operationFiles.filter((file) => Number(file.size || 0) === input.totalBytes);
  if (verified.length === 1 && operationFiles.length === 1) return { kind: "adopt", file: verified[0] };
  if (operationFiles.length > 0) return { kind: "duplicate", candidates: operationFiles };
  return { kind: "create" };
}


export function driveParentChangeForDestination(
  parents: string[] | undefined,
  destinationFolderId: string,
): { addParent: string; removeParent?: string } | null {
  const current = [...new Set((parents || []).filter(Boolean))];
  if (current.includes(destinationFolderId)) return null;
  const previous = current.filter((parentId) => parentId !== destinationFolderId);
  return {
    addParent: destinationFolderId,
    ...(previous.length ? { removeParent: previous.join(",") } : {}),
  };
}
