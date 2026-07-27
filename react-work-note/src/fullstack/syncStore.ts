import { useSyncExternalStore } from "react";
import type { SyncState } from "./types";

const listeners = new Set<() => void>();

let state: SyncState = {
  mode: "disabled",
  message: "서버 연결 준비",
  lastSyncedAt: "",
  pendingCount: 0,
  error: ""
};

export function getSyncState(): SyncState {
  return state;
}

export function updateSyncState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function subscribeSyncState(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribeSyncState, getSyncState, getSyncState);
}
