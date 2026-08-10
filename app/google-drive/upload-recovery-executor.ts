import { classifyUploadError, type UploadErrorCode } from "./upload-errors";
import { recoveryActionForErrorCode, type UploadRecoveryAction } from "./upload-recovery";

export type UploadRecoveryOperations<T> = {
  refreshAccessToken?: () => Promise<void>;
  rebuildCanonicalFolder?: () => Promise<void>;
  probeUploadSession?: () => Promise<boolean>;
  restartUploadSession?: () => Promise<void>;
  waitBeforeRetry?: () => Promise<void>;
  restoreSource?: () => Promise<void>;
  retryStep: () => Promise<T>;
};

export type UploadRecoveryExecution<T> = {
  action: UploadRecoveryAction;
  result: T;
};

/**
 * Executes only the bounded recovery prerequisite and then retries one upload step.
 * It never loops, so callers retain control of retry limits and progress reporting.
 */
export async function recoverAndRetry<T>(
  errorCode: UploadErrorCode,
  operations: UploadRecoveryOperations<T>,
): Promise<UploadRecoveryExecution<T>> {
  const action = recoveryActionForErrorCode(errorCode);
  if (action === "refresh_token") {
    if (!operations.refreshAccessToken) throw new Error("refreshAccessToken recovery is unavailable");
    await operations.refreshAccessToken();
  } else if (action === "rebuild_folder") {
    if (!operations.rebuildCanonicalFolder) throw new Error("rebuildCanonicalFolder recovery is unavailable");
    await operations.rebuildCanonicalFolder();
  } else if (action === "probe_or_restart_session") {
    const active = await operations.probeUploadSession?.();
    if (!active) {
      if (!operations.restartUploadSession) throw new Error("restartUploadSession recovery is unavailable");
      await operations.restartUploadSession();
    }
  } else if (action === "retry_with_backoff") {
    await operations.waitBeforeRetry?.();
  } else if (action === "restore_source") {
    if (!operations.restoreSource) throw new Error("restoreSource recovery is unavailable");
    await operations.restoreSource();
  } else if (action === "reconnect_drive" || action === "user_action") {
    throw new Error(`automatic recovery is not allowed for ${errorCode}`);
  }
  return { action, result: await operations.retryStep() };
}


export async function recoverDriveNextFailure<T>(
  error: unknown,
  operations: UploadRecoveryOperations<T>,
): Promise<UploadRecoveryExecution<T> & { errorCode: UploadErrorCode }> {
  const failure = classifyUploadError(error, "drive_chunk");
  const execution = await recoverAndRetry(failure.code, operations);
  return { errorCode: failure.code, ...execution };
}
