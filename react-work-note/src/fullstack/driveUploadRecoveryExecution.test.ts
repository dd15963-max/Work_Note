import { describe, expect, it } from "vitest";
import {
  recoverDriveNextFailure,
} from "../../../app/google-drive/upload-recovery-executor";

describe("Google Drive route recovery coordinator", () => {
  it("[15] route의 401 분류는 access token 갱신 후 동일 업로드 step을 한 번 다시 실행한다", async () => {
    const calls: string[] = [];
    const execution = await recoverDriveNextFailure(
      { status: 401, message: "Unauthorized" },
      {
        refreshAccessToken: async () => { calls.push("refresh"); },
        retryStep: async () => { calls.push("retry"); return "uploaded"; },
      },
    );

    expect(calls).toEqual(["refresh", "retry"]);
    expect(execution).toEqual({
      errorCode: "GOOGLE_AUTH_EXPIRED",
      action: "refresh_token",
      result: "uploaded",
    });
  });

  it("[16] route의 폴더 404 분류는 canonical resolver 복구 후 동일 step을 재시도한다", async () => {
    const calls: string[] = [];
    const execution = await recoverDriveNextFailure(
      { status: 404, message: "destination folder not found" },
      {
        rebuildCanonicalFolder: async () => { calls.push("canonical-folder"); },
        retryStep: async () => { calls.push("retry"); return { ok: true }; },
      },
    );

    expect(calls).toEqual(["canonical-folder", "retry"]);
    expect(execution).toEqual({
      errorCode: "DRIVE_FOLDER_NOT_FOUND",
      action: "rebuild_folder",
      result: { ok: true },
    });
  });
});
