export type SourceCleanupResult = { status: "released" | "skipped" | "failed"; bytes: number };

export async function releaseVerifiedSource(input: {
  provider: string;
  syncStatus: string;
  driveFileId: string;
  fileSize: number;
}, operations: {
  driveMetadata: () => Promise<{ id: string; size?: string; trashed?: boolean }>;
  stillEligible: () => Promise<boolean>;
  sourceHead: () => Promise<{ size: number } | null>;
  deleteSource: () => Promise<void>;
  markReleased: () => Promise<void>;
}): Promise<SourceCleanupResult> {
  const skipped: SourceCleanupResult = { status: "skipped", bytes: 0 };
  if (input.provider !== "google_drive" || !["synced", "completed", "동기화 완료"].includes(input.syncStatus)
    || !input.driveFileId || !Number.isSafeInteger(input.fileSize) || input.fileSize <= 0) return skipped;
  try {
    const drive = await operations.driveMetadata();
    if (drive.id !== input.driveFileId || drive.trashed
      || drive.size === undefined || Number(drive.size) !== input.fileSize) return skipped;
    const source = await operations.sourceHead();
    if (source && source.size !== input.fileSize) return skipped;
    // Recheck persisted state after network requests, immediately before deleting bytes.
    if (!await operations.stillEligible()) return skipped;
    if (source) await operations.deleteSource();
    // An earlier request may have deleted bytes but failed before updating metadata.
    await operations.markReleased();
    return { status: "released", bytes: source?.size || 0 };
  } catch {
    // Cleanup failure must never turn a completed Drive upload into an upload failure.
    return { status: "failed", bytes: 0 };
  }
}
