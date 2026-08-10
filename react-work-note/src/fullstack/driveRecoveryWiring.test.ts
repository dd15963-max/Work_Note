import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const uploadRoute = readFileSync(
  new URL("../../../app/api/files/upload/route.ts", import.meta.url),
  "utf8",
);
const filesRoute = readFileSync(
  new URL("../../../app/api/files/route.ts", import.meta.url),
  "utf8",
);

describe("production recovery wiring", () => {
  it("delegates Drive chunk recovery through the tested route coordinator", () => {
    expect(uploadRoute).toContain("import { recoverDriveNextFailure }");
    expect(uploadRoute).toMatch(/await recoverDriveNextFailure\(error,\s*\{/);
  });

  it("delegates attachment download through the tested preserved-source fallback", () => {
    expect(filesRoute).toContain("import { downloadWithPreservedSourceFallback }");
    expect(filesRoute).toMatch(/return downloadWithPreservedSourceFallback\(\{/);
  });
});
