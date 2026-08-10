import { describe, expect, it, vi } from "vitest";
import {
  recoverExpiredSourceMultipart,
} from "../../../app/google-drive/source-upload-recovery";
import {
  RepositoryError,
  applySourceStatusFallback,
  repositoryErrorFields,
} from "./repository";

describe("R2 source upload recovery", () => {
  it("만료된 multipart는 같은 논리 세션에 새 uploadId를 저장하고 0바이트부터 재개한다", async () => {
    const reset = vi.fn(async (uploadId: string) => ({
      sessionId: "same-session",
      operationToken: "same-operation",
      r2UploadId: uploadId,
      sourceUploadedBytes: 0,
      currentChunk: 0,
      sourceStatus: "uploading",
    }));
    const abort = vi.fn(async () => undefined);
    const result = await recoverExpiredSourceMultipart(164, {
      head: async () => null,
      create: async () => ({ uploadId: "new-multipart", abort }),
      adopt: async () => {
        throw new Error("완성 객체가 없으므로 adopt하면 안 됩니다.");
      },
      reset,
    });

    expect(result.kind).toBe("reinitialized");
    expect(reset).toHaveBeenCalledWith("new-multipart");
    expect(result.value).toMatchObject({
      sessionId: "same-session",
      operationToken: "same-operation",
      sourceUploadedBytes: 0,
      currentChunk: 0,
      sourceStatus: "uploading",
    });
    expect(abort).not.toHaveBeenCalled();
  });

  it("이미 완성된 R2 객체가 있으면 새 multipart를 만들지 않고 채택한다", async () => {
    const create = vi.fn();
    const adopt = vi.fn(async () => ({ sourceStatus: "available" }));
    const result = await recoverExpiredSourceMultipart(164, {
      head: async () => ({ size: 164 }),
      create,
      adopt,
      reset: async () => {
        throw new Error("reset하면 안 됩니다.");
      },
    });

    expect(result.kind).toBe("adopted");
    expect(create).not.toHaveBeenCalled();
    expect(adopt).toHaveBeenCalledOnce();
  });

  it("서버가 missing을 응답하면 이전 available 추정값으로 덮어쓰지 않는다", () => {
    const error = new RepositoryError("원본을 찾을 수 없습니다.", {
      code: "R2_SOURCE_MISSING",
      sourceStatus: "missing",
      userActionRequired: true,
    });
    applySourceStatusFallback(error, true);
    const fields = repositoryErrorFields(error);

    expect(error.sourceStatus).toBe("missing");
    expect(fields).toMatchObject({
      sourceAvailable: false,
      sourceLocation: "unknown",
      sourceStatus: "missing",
    });
  });
});
