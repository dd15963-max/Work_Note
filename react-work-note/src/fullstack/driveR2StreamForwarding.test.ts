import { afterEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  driveFetch: vi.fn(),
  driveFetchOnce: vi.fn(),
  getDriveConnection: vi.fn(),
  googleError: vi.fn(),
}));
const runtimeMocks = vi.hoisted(() => ({ database: vi.fn() }));

vi.mock("@/db/runtime", () => runtimeMocks);
vi.mock("../../../app/google-drive/auth", () => authMocks);

import { uploadDriveResumableChunk } from "../../../app/google-drive/files";
import { DRIVE_UPLOAD_CHUNK_SIZE } from "../../../app/google-drive/resumable-protocol";

afterEach(() => {
  authMocks.driveFetch.mockReset();
  authMocks.driveFetchOnce.mockReset();
  authMocks.getDriveConnection.mockReset();
  authMocks.googleError.mockReset();
  runtimeMocks.database.mockReset();
  vi.unstubAllGlobals();
});

describe("R2 Range to Google Drive forwarding", () => {
  it("forwards the exact one-shot R2 stream to Drive without FormData or buffering", async () => {
    const total = 164 * 1024 * 1024;
    const marker = new Uint8Array([7]);
    const r2RangeStream = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.enqueue(marker);
        controller.close();
      },
    });
    vi.stubGlobal("FormData", class ForbiddenFormData {
      constructor() {
        throw new Error("FormData must never be used by the R2-to-Drive path");
      }
    });
    authMocks.driveFetchOnce.mockImplementation(async (
      _userEmail: string,
      _url: string,
      init?: RequestInit,
    ) => {
      expect(init?.body).toBe(r2RangeStream);
      expect(new Headers(init?.headers).get("Content-Length"))
        .toBe(String(DRIVE_UPLOAD_CHUNK_SIZE));
      expect(new Headers(init?.headers).get("Content-Range"))
        .toBe(`bytes 0-${DRIVE_UPLOAD_CHUNK_SIZE - 1}/${total}`);
      const reader = (init?.body as ReadableStream<Uint8Array<ArrayBuffer>>).getReader();
      expect((await reader.read()).value).toBe(marker);
      expect((await reader.read()).done).toBe(true);
      return new Response(null, {
        status: 308,
        headers: { Range: `bytes=0-${DRIVE_UPLOAD_CHUNK_SIZE - 1}` },
      });
    });

    const result = await uploadDriveResumableChunk(
      "test@example.com",
      "https://www.googleapis.com/upload/drive/v3/files?upload_id=opaque",
      {
        body: r2RangeStream,
        start: 0,
        end: DRIVE_UPLOAD_CHUNK_SIZE - 1,
        total,
        mimeType: "model/stl",
      },
    );

    expect(authMocks.driveFetchOnce).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      complete: false,
      confirmedBytes: DRIVE_UPLOAD_CHUNK_SIZE,
    });
  });
});
