export type ExistingSourceObject = {
  size: number;
};

export type CreatedSourceMultipart = {
  uploadId: string;
  abort(): Promise<void>;
};

export type SourceMultipartRecoveryResult<T> =
  | { kind: "adopted"; value: T }
  | { kind: "reinitialized"; value: T; uploadId: string };

/**
 * Resolves an expired R2 multipart without changing the logical upload
 * session. A complete object always wins; otherwise a new multipart is
 * created and its id is committed by the caller. If that commit fails, the
 * newly-created multipart is aborted so it cannot become an orphan.
 */
export async function recoverExpiredSourceMultipart<T>(
  totalBytes: number,
  adapter: {
    head(): Promise<ExistingSourceObject | null>;
    create(): Promise<CreatedSourceMultipart>;
    adopt(): Promise<T>;
    reset(uploadId: string): Promise<T>;
  },
): Promise<SourceMultipartRecoveryResult<T>> {
  const existing = await adapter.head();
  if (existing?.size === totalBytes) {
    return { kind: "adopted", value: await adapter.adopt() };
  }

  const multipart = await adapter.create();
  try {
    return {
      kind: "reinitialized",
      value: await adapter.reset(multipart.uploadId),
      uploadId: multipart.uploadId,
    };
  } catch (error) {
    try { await multipart.abort(); } catch { /* Preserve the state-commit error. */ }
    throw error;
  }
}
