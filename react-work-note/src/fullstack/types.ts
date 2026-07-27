export type AnyRecord = Record<string, unknown>;

export type WorkNoteData = {
  version: string;
  updatedAt: string;
  companies: AnyRecord[];
  internalContacts: AnyRecord[];
  notes: AnyRecord[];
  materialSalesNotes: AnyRecord[];
  settlementTasks: AnyRecord[];
  outputTasks: AnyRecord[];
  otherTasks: AnyRecord[];
  accounts: AnyRecord[];
  loadedAt?: string;
  error?: string;
};

export type DataCounts = {
  companies: number;
  companyContacts: number;
  internalContacts: number;
  equipmentSales: number;
  materialSales: number;
  settlements: number;
  settlementEntries: number;
  outputTasks: number;
  otherTasks: number;
  taskSchedules: number;
  accounts: number;
  attachments: number;
  totalRecords: number;
};

export type MigrationPhase =
  | "unchecked"
  | "no-local-data"
  | "ready"
  | "backup-complete"
  | "uploading"
  | "partial"
  | "failed"
  | "verifying"
  | "verified"
  | "complete";

export type MigrationProgress = {
  phase: MigrationPhase;
  message: string;
  completed: number;
  total: number;
  failedAttachmentIds: string[];
};

export type SyncState = {
  mode: "disabled" | "connecting" | "online" | "saving" | "offline" | "error";
  message: string;
  lastSyncedAt: string;
  pendingCount: number;
  error: string;
};

export type AttachmentRecord = AnyRecord & {
  id: string;
  blob?: Blob;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
};
