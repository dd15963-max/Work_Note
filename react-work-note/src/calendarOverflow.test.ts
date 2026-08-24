import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("calendar overflow interaction", () => {
  it("preserves the visible limits and opens all work for the selected date", () => {
    expect(appSource).toContain('const visibleLimit = mode === "week" ? 8 : 3;');
    expect(appSource).toContain('className="calendar-more-button"');
    expect(appSource).toContain("onClick={() => setOpenDate(key)}");
    expect(appSource).toContain("{openItems.map((item) => (");
  });

  it("lets every item open its existing work detail and supports dialog dismissal", () => {
    expect(appSource).toContain("onClick={() => openScheduleItem(item)}");
    expect(appSource).toContain('if (event.key === "Escape") setOpenDate(null);');
    expect(appSource).toContain('role="dialog" aria-modal="true"');
  });

  it("includes responsive, scrollable dialog styles", () => {
    expect(stylesSource).toContain(".calendar-day-modal-list");
    expect(stylesSource).toContain("overflow-y: auto;");
    expect(stylesSource).toContain("@media (max-width: 640px)");
  });
});
