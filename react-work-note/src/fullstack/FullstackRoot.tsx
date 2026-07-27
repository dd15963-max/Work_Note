"use client";

import {
  Cloud,
  CloudOff,
  Database,
  Download,
  LogOut,
  RefreshCw,
  Settings,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { App, loadWorkNoteData } from "../App";
import {
  clearPendingSync,
  clearRemoteRuntime,
  flushPendingChanges,
  getServerCounts,
  initializeRemoteRuntime,
  loadServerDataset,
  softDeleteAllAccountData,
  type SiteUser,
} from "./repository";
import {
  clearLocalAttachmentCache,
  countWorkNoteData,
  downloadLocalMigrationBackup,
  hasLocalWorkNoteData,
  migrateLocalDataToServer,
  retryAttachmentMigration,
} from "./migration";
import { getSyncState, useSyncState } from "./syncStore";
import type { DataCounts, MigrationProgress, WorkNoteData } from "./types";

const STORAGE_KEY = "salesNoteAppDataV1";
const AUTO_SNAPSHOT_KEY = "workNoteReactAutoSnapshotsV1";

type BootstrapState = "loading" | "ready" | "migration" | "error";

export function FullstackRoot({ user }: { user: SiteUser }) {
  const [state, setState] = useState<BootstrapState>("loading");
  const [error, setError] = useState("");
  const [appVersion, setAppVersion] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [migration, setMigration] = useState<MigrationProgress>({
    phase: "unchecked",
    message: "기존 데이터를 확인하고 있습니다.",
    completed: 0,
    total: 0,
    failedAttachmentIds: [],
  });
  const localData = useMemo(readLocalData, [appVersion]);

  useEffect(() => {
    let cancelled = false;
    initializeRemoteRuntime(user);

    const boot = async () => {
      try {
        await flushPendingChanges();
        const serverData = await loadServerDataset();
        if (cancelled) return;

        const currentLocal = readLocalData();
        const serverHasData = hasLocalWorkNoteData(serverData);
        const localHasData = hasLocalWorkNoteData(currentLocal);
        const serverTime = serverData.updatedAt || "";
        const localTime = currentLocal.updatedAt || "";

        if (serverHasData && (!localHasData || serverTime >= localTime)) {
          writeLocalData(serverData);
          setMigration({
            phase: "complete",
            message: "Sites 서버 데이터 연결 완료",
            completed: 1,
            total: 1,
            failedAttachmentIds: [],
          });
          setAppVersion((value) => value + 1);
          setState("ready");
          return;
        }

        if (localHasData) {
          setMigration({
            phase: "ready",
            message: serverHasData
              ? "이 기기에 서버보다 새로운 데이터가 있습니다."
              : "기존 브라우저 데이터가 발견되었습니다.",
            completed: 0,
            total: countWorkNoteData(currentLocal).attachments + 1,
            failedAttachmentIds: [],
          });
          setState("migration");
          return;
        }

        writeLocalData(serverData);
        setMigration({
          phase: "complete",
          message: "빈 Sites 작업공간을 준비했습니다.",
          completed: 1,
          total: 1,
          failedAttachmentIds: [],
        });
        setAppVersion((value) => value + 1);
        setState("ready");
      } catch (caught) {
        if (cancelled) return;
        const message = caught instanceof Error ? caught.message : String(caught);
        if (hasLocalWorkNoteData(readLocalData())) {
          setError(message);
          setState("ready");
        } else {
          setError(message);
          setState("error");
        }
      }
    };

    void boot();
    return () => {
      cancelled = true;
      clearRemoteRuntime();
    };
  }, [user.email, user.id]);

  useEffect(() => {
    const warnPendingSave = (event: BeforeUnloadEvent) => {
      if (getSyncState().pendingCount < 1) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnPendingSave);
    return () => window.removeEventListener("beforeunload", warnPendingSave);
  }, []);

  const runMigration = async () => {
    try {
      await migrateLocalDataToServer(readLocalData(), setMigration);
      const fresh = await loadServerDataset();
      writeLocalData(fresh);
      setAppVersion((value) => value + 1);
      setState("ready");
    } catch (caught) {
      setMigration((current) => ({
        ...current,
        phase: "failed",
        message: caught instanceof Error ? caught.message : String(caught),
      }));
    }
  };

  const retryFiles = async () => {
    setMigration((current) => ({
      ...current,
      phase: "uploading",
      message: "실패한 첨부파일을 다시 전송하고 있습니다.",
    }));
    const failed = await retryAttachmentMigration(
      migration.failedAttachmentIds,
      (completed, total) => {
        setMigration((current) => ({
          ...current,
          completed,
          total,
          message: `첨부파일 재시도 ${completed}/${total}`,
        }));
      },
    );
    setMigration((current) => ({
      ...current,
      phase: failed.length ? "partial" : "complete",
      failedAttachmentIds: failed,
      message: failed.length
        ? `${failed.length}개 파일은 다시 확인해야 합니다.`
        : "첨부파일 이전 완료",
    }));
    if (!failed.length) setState("ready");
  };

  if (state === "loading") {
    return (
      <FullPageState
        title="Work Note 연결 중"
        detail="ChatGPT 계정의 업무 데이터와 첨부파일 저장소를 확인하고 있습니다."
      />
    );
  }
  if (state === "error") {
    return (
      <FullPageState
        title="Sites 서버에 연결하지 못했습니다"
        detail={error}
        action={
          <button type="button" onClick={() => window.location.reload()}>
            다시 시도
          </button>
        }
      />
    );
  }
  if (state === "migration") {
    return (
      <MigrationScreen
        data={localData}
        progress={migration}
        onMigrate={runMigration}
        onRetryFiles={retryFiles}
      />
    );
  }

  return (
    <>
      <SyncDock
        warning={error}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <App key={appVersion} />
      {settingsOpen && (
        <ServerSettings
          user={user}
          localData={readLocalData()}
          progress={migration}
          onClose={() => setSettingsOpen(false)}
          onReload={async () => {
            await flushPendingChanges();
            const fresh = await loadServerDataset();
            writeLocalData(fresh);
            setAppVersion((value) => value + 1);
          }}
          onMigrate={runMigration}
          onOpenBackupCenter={() => {
            setSettingsOpen(false);
            window.setTimeout(() => {
              const center = document.getElementById(
                "work-note-backup-center",
              ) as HTMLDetailsElement | null;
              if (!center) return;
              center.open = true;
              center.scrollIntoView({ block: "center", behavior: "smooth" });
            }, 0);
          }}
        />
      )}
    </>
  );
}

function MigrationScreen({
  data,
  progress,
  onMigrate,
  onRetryFiles,
}: {
  data: WorkNoteData;
  progress: MigrationProgress;
  onMigrate: () => void;
  onRetryFiles: () => void;
}) {
  const counts = countWorkNoteData(data);
  const busy = ["backup-complete", "uploading", "verifying"].includes(
    progress.phase,
  );
  return (
    <main className="fullstack-auth-page migration-page">
      <section className="migration-card">
        <div className="migration-heading">
          <div>
            <p className="eyebrow">SAFE MIGRATION</p>
            <h1>기존 Work Note 데이터 발견</h1>
            <p>{progress.message}</p>
          </div>
          <a href="/signout-with-chatgpt?return_to=/">
            <LogOut size={16} /> 로그아웃
          </a>
        </div>
        <div className="migration-count-grid">
          <Metric label="고객사" value={counts.companies} />
          <Metric
            label="업무"
            value={
              counts.equipmentSales +
              counts.materialSales +
              counts.outputTasks +
              counts.otherTasks
            }
          />
          <Metric label="정산" value={counts.settlements} />
          <Metric label="정산 행" value={counts.settlementEntries} />
          <Metric label="일정" value={counts.taskSchedules} />
          <Metric label="첨부 기록" value={counts.attachments} />
        </div>
        <div className="migration-safety-note">
          <ShieldCheck size={20} />
          <div>
            <strong>원본 보존</strong>
            <p>
              이전 전 JSON 백업을 자동 생성하며 localStorage와 IndexedDB
              원본은 자동 삭제하지 않습니다.
            </p>
          </div>
        </div>
        {progress.total > 0 && (
          <progress value={progress.completed} max={progress.total} />
        )}
        {progress.failedAttachmentIds.length > 0 && (
          <p className="fullstack-form-message">
            첨부파일 {progress.failedAttachmentIds.length}개는 다시 시도할 수
            있습니다.
          </p>
        )}
        <div className="migration-actions">
          <button
            type="button"
            onClick={() => downloadLocalMigrationBackup(data)}
          >
            <Download size={16} /> JSON 백업
          </button>
          {progress.failedAttachmentIds.length > 0 && (
            <button type="button" onClick={onRetryFiles}>
              <RefreshCw size={16} /> 실패 파일 재시도
            </button>
          )}
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={onMigrate}
          >
            <Upload size={16} />
            {busy ? "Sites로 이전 중" : "Sites로 안전하게 이전"}
          </button>
        </div>
      </section>
    </main>
  );
}

function SyncDock({
  warning,
  onOpenSettings,
}: {
  warning: string;
  onOpenSettings: () => void;
}) {
  const sync = useSyncState();
  const Icon = sync.mode === "offline" || sync.mode === "error"
    ? CloudOff
    : Cloud;
  return (
    <div
      className={`fullstack-sync-dock ${sync.mode}`}
      role="status"
      title={warning || sync.error}
    >
      <Icon size={15} />
      <span>{warning ? "로컬 모드 · 서버 재연결 대기" : sync.message}</span>
      {sync.pendingCount > 0 && <b>{sync.pendingCount}</b>}
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="Sites 데이터 설정"
      >
        <Settings size={16} />
      </button>
    </div>
  );
}

function ServerSettings({
  user,
  localData,
  progress,
  onClose,
  onReload,
  onMigrate,
  onOpenBackupCenter,
}: {
  user: SiteUser;
  localData: WorkNoteData;
  progress: MigrationProgress;
  onClose: () => void;
  onReload: () => Promise<void>;
  onMigrate: () => void;
  onOpenBackupCenter: () => void;
}) {
  const [busy, setBusy] = useState("");
  const [deleteText, setDeleteText] = useState("");
  const [counts, setCounts] = useState<DataCounts | null>(null);
  const sync = useSyncState();

  useEffect(() => {
    void getServerCounts().then(setCounts).catch(() => setCounts(null));
  }, []);

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    try {
      await action();
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="server-settings-backdrop" onMouseDown={onClose}>
      <section
        className="server-settings-panel"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">CHATGPT SITES</p>
            <h2>서버 및 데이터 설정</h2>
          </div>
          <button type="button" aria-label="설정 닫기" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="server-settings-scroll">
          <section>
            <h3>로그인 계정</h3>
            <p>{user.displayName || user.email}</p>
            <small>{user.email}</small>
            <a href="/signout-with-chatgpt?return_to=/">
              <LogOut size={16} /> 로그아웃
            </a>
          </section>
          <section>
            <h3>동기화</h3>
            <p>{sync.message}</p>
            <small>
              마지막 동기화{" "}
              {sync.lastSyncedAt
                ? new Date(sync.lastSyncedAt).toLocaleString("ko-KR")
                : "기록 없음"}
            </small>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => run("reload", onReload)}
            >
              <RefreshCw size={16} /> 서버 데이터 다시 불러오기
            </button>
          </section>
          <section>
            <h3>서버 데이터</h3>
            {counts
              ? <CountSummary counts={counts} />
              : <p>개수 확인 중</p>}
          </section>
          <section>
            <h3>백업 및 이전</h3>
            <p>마이그레이션 상태: {progress.message}</p>
            <div className="settings-actions">
              <button
                type="button"
                onClick={() => downloadLocalMigrationBackup(localData)}
              >
                <Download size={16} /> JSON 백업
              </button>
              <button type="button" onClick={onMigrate}>
                <Upload size={16} /> 로컬 데이터를 Sites로 이전
              </button>
              <button type="button" onClick={onOpenBackupCenter}>
                <Database size={16} /> 전체 백업·복원 센터
              </button>
            </div>
          </section>
          <section className="danger-zone">
            <h3>로컬 임시 데이터 삭제</h3>
            <p>
              Sites 서버 데이터는 유지하고 이 기기의 캐시와 재시도 큐만
              비웁니다.
            </p>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() =>
                run("local-clear", async () => {
                  if (!confirm(
                    "이 기기의 로컬 캐시를 비울까요? Sites 서버 데이터는 유지됩니다.",
                  )) return;
                  clearPendingSync();
                  window.localStorage.removeItem(AUTO_SNAPSHOT_KEY);
                  window.localStorage.removeItem(STORAGE_KEY);
                  await clearLocalAttachmentCache();
                  await onReload();
                })}
            >
              로컬 임시 데이터 삭제
            </button>
          </section>
          <section className="danger-zone">
            <h3>계정 데이터 전체 삭제</h3>
            <p>
              현재 ChatGPT 계정의 D1 업무 데이터와 첨부 메타데이터를 삭제
              상태로 전환합니다. 실행하려면 <b>전체 삭제</b>를 입력하세요.
            </p>
            <input
              value={deleteText}
              onChange={(event) => setDeleteText(event.target.value)}
              placeholder="전체 삭제"
            />
            <button
              type="button"
              className="danger-button"
              disabled={deleteText !== "전체 삭제" || Boolean(busy)}
              onClick={() =>
                run("delete", async () => {
                  if (!confirm(
                    "현재 ChatGPT 계정의 모든 Sites 데이터를 삭제 상태로 전환할까요?",
                  )) return;
                  await softDeleteAllAccountData();
                  window.localStorage.removeItem(STORAGE_KEY);
                  window.location.reload();
                })}
            >
              계정 데이터 전체 삭제
            </button>
          </section>
        </div>
      </section>
    </div>
  );
}

function CountSummary({ counts }: { counts: DataCounts }) {
  return (
    <div className="server-count-summary">
      <span>고객사 <b>{counts.companies}</b></span>
      <span>
        업무{" "}
        <b>
          {counts.equipmentSales +
            counts.materialSales +
            counts.outputTasks +
            counts.otherTasks}
        </b>
      </span>
      <span>정산 <b>{counts.settlements}</b></span>
      <span>첨부 <b>{counts.attachments}</b></span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FullPageState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <main className="fullstack-auth-page">
      <section className="fullstack-auth-card">
        <Database size={30} />
        <h1>{title}</h1>
        <p>{detail}</p>
        {action}
      </section>
    </main>
  );
}

function readLocalData(): WorkNoteData {
  return loadWorkNoteData() as WorkNoteData;
}

function writeLocalData(data: WorkNoteData) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
