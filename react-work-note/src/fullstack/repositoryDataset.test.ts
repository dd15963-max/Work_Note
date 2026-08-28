import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearRemoteRuntime,
  initializeRemoteRuntime,
  loadServerDataset,
} from "./repository";

function installBrowserRuntime(payload: Record<string, unknown>) {
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: () => null,
    get length() { return values.size; },
  } as Storage;

  vi.stubGlobal("window", {
    localStorage,
    addEventListener: vi.fn(),
    setTimeout,
    clearTimeout,
  });
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(payload)));
  initializeRemoteRuntime({ id: "memo-test-user", email: "memo@example.com" });
}

afterEach(() => {
  clearRemoteRuntime();
  vi.unstubAllGlobals();
});

describe("server dataset hydration", () => {
  it("preserves general memos returned by the workspace API", async () => {
    installBrowserRuntime({
      version: "sites-work-note-v1",
      updatedAt: "2026-08-28T02:23:56.044Z",
      generalMemos: [{ id: "memo-1", title: "사라지면 안 되는 메모", body: "내용" }],
      companies: [],
      internalContacts: [],
      notes: [],
      materialSalesNotes: [],
      settlementTasks: [],
      outputTasks: [],
      otherTasks: [],
      accounts: [],
    });

    const dataset = await loadServerDataset();

    expect(dataset.generalMemos).toEqual([
      { id: "memo-1", title: "사라지면 안 되는 메모", body: "내용" },
    ]);
  });
});
