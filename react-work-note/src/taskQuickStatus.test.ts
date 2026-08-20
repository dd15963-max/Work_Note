import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("generic work quick status controls", () => {
  it("uses the existing settlement and work status options in the shared task portal", () => {
    expect(appSource).toContain(
      'const quickStatusOptions = type === "settlement" ? SETTLEMENT_STATUS_OPTIONS : WORK_STATUS_OPTIONS;'
    );
  });

  it("persists a selected status directly from every generic work card", () => {
    expect(appSource).toContain("const updateWorkQuickStatus = (id: string, value: string) => {");
    expect(appSource).toContain('onChange={(event) => updateWorkQuickStatus(id, event.target.value)}');
    expect(appSource).toContain("status: value,");
    expect(appSource).toContain("updatedAt: now");
  });

  it("preserves a legacy status while still rendering a styled accessible dropdown", () => {
    expect(appSource).toContain("!quickStatusOptions.includes(currentStatus)");
    expect(appSource).toContain("task-status-select");
    expect(appSource).toContain('aria-label={`${workTitle(record, type)} 상태 변경`}');
    expect(styleSource).toContain(".task-status-select {");
  });
});
