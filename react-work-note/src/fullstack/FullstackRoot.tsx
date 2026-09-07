"use client";

import {
  ChevronRight,
  Cloud,
  CloudOff,
  Database,
  Download,
  File,
  FolderOpen,
  FolderTree,
  HardDrive,
  LogOut,
  RefreshCw,
  Search,
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
import { App, BackupSettingsPanel, loadWorkNoteData } from "../App";
import {
  authorizeGoogleSheets,
  clearPendingSync,
  clearRemoteRuntime,
  cleanupEmptyDriveFolders,
  cleanupSyncedSiteSources,
  connectGoogleDrive,
  disconnectGoogleDrive,
  flushPendingAttachments,
  flushPendingChanges,
  flushPendingDataset,
  getRecentDriveOperations,
  getTeamShareSettings,
  getGoogleDriveStatus,
  hasCompletedMigration,
  initializeRemoteRuntime,
  loadServerDataset,
  mergeDuplicateDriveFolders,
  migrateLegacyAttachmentsToDrive,
  previewDriveMigration,
  previewDuplicateDriveFolders,
  previewEmptyDriveFolders,
  reconnectGoogleDrive,
  refreshRemoteAttachments,
  retryDriveOrganization,
  retryRemoteAttachments,
  runDriveMigration,
  saveTeamShareSettings,
  softDeleteAllAccountData,
  syncServerDataset,
  testGoogleDriveConnection,
  testTeamShareConnection,
  type DriveOrganizationResult,
  type GoogleDriveStatus,
  type SiteUser,
  type TeamShareSettingsStatus,
} from "./repository";
import {
  clearLocalAttachmentCache,
  countWorkNoteData,
  downloadLocalMigrationBackup,
  hasLocalWorkNoteData,
  migrateLocalDataToServer,
  retryAttachmentMigration,
} from "./migration";
import { DriveOpenButton, isFailedAttachmentStatus } from "./driveUi";
import {
  collectDriveExplorerFiles,
  drivePathBreadcrumbs,
  listDriveFolderContents,
  type DriveExplorerFile,
} from "./driveExplorer";
import { getSyncState, useSyncState } from "./syncStore";
import type { DataCounts, MigrationProgress, WorkNoteData } from "./types";

const STORAGE_KEY = "salesNoteAppDataV1";
const AUTO_SNAPSHOT_KEY = "workNoteReactAutoSnapshotsV1";
const AUTO_SNAPSHOT_LAST_KEY = "workNoteReactAutoSnapshotLastV1";

type BootstrapState = "loading" | "ready" | "migration" | "error";

export function FullstackRoot({ user }: { user: SiteUser }) {
  const [state, setState] = useState<BootstrapState>("loading");
  const [error, setError] = useState("");
  const [appVersion, setAppVersion] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTarget, setSettingsTarget] = useState("sync");
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
        await flushPendingDataset();
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
          if (hasCompletedMigration()) {
            await syncServerDataset(currentLocal, "완료된 기기 데이터 동기화");
            const fresh = await loadServerDataset();
            if (cancelled) return;
            writeLocalData(fresh);
            setMigration({
              phase: "complete",
              message: "기기 변경사항 동기화 완료",
              completed: 1,
              total: 1,
              failedAttachmentIds: [],
            });
            setAppVersion((value) => value + 1);
            setState("ready");
            return;
          }
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
    if (state !== "ready") return;
    const timer = window.setTimeout(() => void flushPendingAttachments(), 0);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    const openSettings = (event: Event) => {
      const detail = (event as CustomEvent<{ target?: string }>).detail;
      setSettingsTarget(detail?.target || "sync");
      setSettingsOpen(true);
    };
    window.addEventListener("worknote:open-data-settings", openSettings);
    return () => window.removeEventListener("worknote:open-data-settings", openSettings);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("drive") === "connected" || params.has("driveError") || params.has("teamShare")) {
      setSettingsOpen(true);
      if (params.has("teamShare")) setSettingsTarget("team-share");
      if (params.has("driveError")) setError(params.get("driveError") || "Google Drive 연결에 실패했습니다.");
      params.delete("drive");
      params.delete("driveError");
      params.delete("teamShare");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    }
  }, []);

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
        onOpenSettings={() => {
          setSettingsTarget("sync");
          setSettingsOpen(true);
        }}
      />
      <App key={appVersion} />
      {settingsOpen && (
        <ServerSettings
          user={user}
          localData={readLocalData()}
          progress={migration}
          initialTarget={settingsTarget}
          onClose={() => setSettingsOpen(false)}
          onReload={async () => {
            await flushPendingChanges();
            const fresh = await loadServerDataset();
            writeLocalData(fresh);
            setAppVersion((value) => value + 1);
          }}
          onMigrate={runMigration}
          onLocalDataChanged={(next) => {
            writeLocalData(next);
            setAppVersion((value) => value + 1);
            window.dispatchEvent(new CustomEvent("worknote:data-updated"));
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
          <Metric label="메모" value={counts.generalMemos} />
          <Metric label="업체" value={counts.companies} />
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
  const important = Boolean(warning)
    || sync.mode === "saving"
    || sync.mode === "offline"
    || sync.mode === "error"
    || sync.pendingCount > 0;
  const [visible, setVisible] = useState(important);

  useEffect(() => {
    if (important) {
      setVisible(true);
      return;
    }
    if (!sync.lastSyncedAt) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 2600);
    return () => window.clearTimeout(timer);
  }, [important, sync.lastSyncedAt]);

  if (!visible) return null;
  const Icon = sync.mode === "offline" || sync.mode === "error"
    ? CloudOff
    : sync.mode === "saving"
      ? RefreshCw
      : Cloud;
  const label = warning
    ? "서버 연결을 확인해 주세요."
    : sync.mode === "saving"
      ? sync.message || "저장 중"
      : sync.mode === "error"
        ? sync.error || "동기화 실패"
        : sync.pendingCount > 0
          ? `저장 대기 ${sync.pendingCount}건`
          : "저장 완료";

  return (
    <button
      className={`fullstack-sync-dock ${sync.mode}`}
      type="button"
      onClick={onOpenSettings}
      title={warning || sync.error || "현재 동기화 데이터 설정 열기"}
    >
      <Icon className={sync.mode === "saving" ? "is-spinning" : ""} size={15} />
      <span role="status" aria-live="polite">{label}</span>
      {sync.pendingCount > 0 && <b>{sync.pendingCount}</b>}
      <Settings size={16} aria-hidden="true" />
    </button>
  );
}

function ServerSettings({
  user,
  localData,
  progress,
  initialTarget,
  onClose,
  onReload,
  onMigrate,
  onLocalDataChanged,
}: {
  user: SiteUser;
  localData: WorkNoteData;
  progress: MigrationProgress;
  initialTarget: string;
  onClose: () => void;
  onReload: () => Promise<void>;
  onMigrate: () => void;
  onLocalDataChanged: (data: WorkNoteData) => void;
}) {
  const [busy, setBusy] = useState("");
  const [deleteText, setDeleteText] = useState("");
  const [drive, setDrive] = useState<GoogleDriveStatus | null>(null);
  const [driveDetailsLoaded, setDriveDetailsLoaded] = useState(false);
  const [driveMessage, setDriveMessage] = useState("");
  const [driveResult, setDriveResult] = useState<DriveOrganizationResult | null>(null);
  const [driveOperations, setDriveOperations] = useState<Record<string, unknown>[]>([]);
  const [driveFolderExplorerOpen, setDriveFolderExplorerOpen] = useState(false);
  const [driveLogExplorerOpen, setDriveLogExplorerOpen] = useState(false);
  const [teamShare, setTeamShare] = useState<TeamShareSettingsStatus | null>(null);
  const [teamSpreadsheet, setTeamSpreadsheet] = useState("");
  const [teamSheetName, setTeamSheetName] = useState("영업 리드 건 관리");
  const [teamDisplayName, setTeamDisplayName] = useState(user.displayName || "");
  const [teamShareMessage, setTeamShareMessage] = useState("");
  const sync = useSyncState();
  const failedAttachmentIds = useMemo(
    () => collectFailedAttachmentIds(localData),
    [localData],
  );
  const driveExplorerFiles = useMemo(
    () => collectDriveExplorerFiles(localData),
    [localData],
  );
  const snapshot = useMemo(readServerSnapshotSummary, [localData.updatedAt]);
  const outputSavedAt = useMemo(
    () => readLatestOutputSavedAt(localData),
    [localData],
  );
  const counts = useMemo(() => countWorkNoteData(localData), [localData]);

  const refreshDrive = async (includeQuota = false) => {
    const status = await getGoogleDriveStatus(includeQuota);
    setDrive((current) => !includeQuota && current?.quota ? { ...status, quota: current.quota } : status);
    return status;
  };

  const refreshTeamShare = async () => {
    const status = await getTeamShareSettings();
    setTeamShare(status);
    setTeamSpreadsheet(status.spreadsheetUrl || status.spreadsheetId);
    setTeamSheetName(status.sheetName || "영업 리드 건 관리");
    setTeamDisplayName(status.displayName || user.displayName || "");
    return status;
  };

  useEffect(() => {
    void refreshDrive().catch((caught) => {
      setDrive({
        connected: false,
        provider: "google_drive",
        error: caught instanceof Error ? caught.message : String(caught),
      });
    });
    void refreshTeamShare().catch((caught) => {
      setTeamShareMessage(caught instanceof Error ? caught.message : String(caught));
    });
  }, []);

  useEffect(() => {
    const target = initialTarget === "drive"
      ? "server-drive-settings-card"
      : initialTarget === "team-share"
        ? "server-team-share-settings-card"
        : "server-sync-status-card";
    const targetCard = document.getElementById(target);
    if (targetCard instanceof HTMLDetailsElement) targetCard.open = true;
    targetCard?.scrollIntoView({ block: "start" });
  }, [initialTarget]);

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    setDriveMessage("");
    try {
      await action();
    } catch (caught) {
      setDriveMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy("");
    }
  };

  const runTeamShare = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    setTeamShareMessage("");
    try {
      await action();
    } catch (caught) {
      setTeamShareMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy("");
    }
  };

  const saveTeamSettings = async () => {
    const status = await saveTeamShareSettings({
      spreadsheet: teamSpreadsheet,
      sheetName: teamSheetName,
      displayName: teamDisplayName,
    });
    setTeamShare(status);
    setTeamSpreadsheet(status.spreadsheetUrl || status.spreadsheetId);
    setTeamSheetName(status.sheetName);
    setTeamDisplayName(status.displayName);
    return status;
  };

  const retryFailedFiles = async () => {
    if (!failedAttachmentIds.length) {
      setDriveMessage("다시 시도할 실패 파일이 없습니다.");
      return;
    }
    const result = await retryRemoteAttachments(failedAttachmentIds);
    setDriveMessage(
      `실패 파일 재시도 완료 · 성공 ${result.succeeded}개 · 확인 필요 ${result.failed}개 · 이미 완료 ${result.skipped}개`,
    );
    await onReload();
    await refreshDrive();
  };

  const refreshFailureState = async () => {
    if (failedAttachmentIds.length) {
      await refreshRemoteAttachments(failedAttachmentIds);
    }
    await onReload();
    await refreshDrive();
    setDriveMessage(`실패 원인 ${failedAttachmentIds.length}개를 새로고침했습니다.`);
  };

  const syncTone = warningTone(sync.mode, Boolean(sync.error));
  const driveTone = !drive ? "is-saving" : drive.connected ? "is-normal" : "is-disconnected";
  const teamShareTone = !teamShare
    ? "is-saving"
    : teamShare.verifiedAt && teamShare.sheetsAuthorized
      ? "is-normal"
      : "is-disconnected";

  return (
    <div className="server-settings-backdrop" onMouseDown={onClose}>
      <section
        className="server-settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="server-settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">WORK NOTE DATA</p>
            <h2 id="server-settings-title">설정</h2>
            <small>{user.displayName || user.email} · {user.email}</small>
          </div>
          <button type="button" aria-label="설정 닫기" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="server-settings-scroll">
          <details className="data-settings-card settings-disclosure" id="server-sync-status-card">
            <summary className="data-settings-card-heading">
              <div><span>A</span><h3>일반</h3></div>
              <DataStatusBadge tone={syncTone} label={syncStatusLabel(sync.mode, sync.pendingCount)} />
            </summary>
            <div className="settings-disclosure-body"><div className="data-settings-status-grid">
              <span><b>업무 데이터</b>{sync.mode === "offline" ? "연결 끊김" : "안전하게 저장됨"}</span>
              <span><b>Google Drive</b>{!drive ? "확인 전" : drive.connected ? `연결됨 · ${drive.googleEmail || "계정 확인됨"}` : "연결 필요"}</span>
              <span><b>마지막 서버 동기화</b>{formatSettingsTime(sync.lastSyncedAt)}</span>
              <span><b>마지막 Drive 동기화</b>{formatSettingsTime(drive?.lastDriveSyncAt || drive?.lastSyncedAt)}</span>
              <span><b>현재 동기화 중</b>{sync.mode === "saving" ? "예" : "아니요"}</span>
              <span><b>동기화 실패</b>{sync.error ? "오류 발생" : failedAttachmentIds.length ? `${failedAttachmentIds.length}개 확인 필요` : "없음"}</span>
              <span><b>저장 구성</b>업무 기록 · 임시 원본 · Google Drive 파일</span>
              <span><b>최종 출력 파일 저장</b>{formatSettingsTime(outputSavedAt)}</span>
            </div>
            <CountSummary counts={counts} /></div>
          </details>

          <details className="data-settings-card settings-disclosure" id="server-data-storage-card">
            <summary className="data-settings-card-heading">
              <div><span>B</span><h3>데이터 / 저장</h3><small>내보내기·불러오기</small></div>
            </summary>
            <div className="settings-disclosure-body">
              <BackupSettingsPanel
                data={localData as ReturnType<typeof loadWorkNoteData>}
                setData={onLocalDataChanged}
                setSaveMessage={setDriveMessage}
              />
            </div>
          </details>

          <details className="data-settings-card settings-disclosure" id="server-diagnostics-card">
            <summary className="data-settings-card-heading">
              <div><span>C</span><h3>진단 / 고급</h3><small>새로고침·복구·연결 확인</small></div>
              {sync.error && <DataStatusBadge tone="is-error" label="오류 발생" />}
            </summary>
            <div className="settings-disclosure-body"><div className="settings-actions">
              <button type="button" disabled={Boolean(busy)} onClick={() => run("reload", onReload)}>
                <RefreshCw size={16} /> 서버 데이터 새로고침
              </button>
              <button type="button" disabled={Boolean(busy)} onClick={() => run("sync", async () => {
                await flushPendingChanges();
                await onReload();
                setDriveMessage("대기 중인 동기화를 다시 실행했습니다.");
              })}>
                <RefreshCw size={16} /> 동기화 다시 실행
              </button>
              <button type="button" disabled={Boolean(busy)} onClick={() => run("retry-items", async () => {
                const result = await retryDriveOrganization();
                setDriveResult(asDriveOrganizationResult(result.remaining, result));
                setDriveMessage(`실패 항목 재시도 완료 · 성공 ${result.synchronized || 0}개 · 실패 ${result.failed || 0}개`);
              })}>
                <RefreshCw size={16} /> 실패 항목 다시 시도
              </button>
              <button type="button" disabled={Boolean(busy)} onClick={() => run("recheck", async () => {
                await testGoogleDriveConnection();
                await refreshDrive();
                setDriveMessage("서버와 Google Drive 연결 상태가 정상입니다.");
              })}>
                <ShieldCheck size={16} /> 데이터 연결 상태 재확인
              </button>
              <button type="button" disabled={Boolean(busy)} onClick={() => {
                if (driveOperations.length > 0) {
                  setDriveLogExplorerOpen(true);
                  return;
                }
                void run("logs", async () => {
                  const operations = await getRecentDriveOperations();
                  setDriveOperations(operations);
                  setDriveLogExplorerOpen(true);
                });
              }}>
                <Search size={16} /> 로그 탐색
              </button>
            </div></div>
          </details>

          <details className="data-settings-card settings-disclosure drive-storage-settings" id="server-drive-settings-card">
            <summary className="data-settings-card-heading">
              <div><span>D</span><h3>Google Drive</h3></div>
              <DataStatusBadge tone={driveTone} label={!drive ? "확인 전" : drive.connected ? "정상" : "연결 끊김"} />
            </summary>
            <div className="settings-disclosure-body">
            {!drive && <p>Google Drive 연결 상태를 확인하고 있습니다.</p>}
            {drive && (
              <div className={`drive-connection-panel ${drive.connected ? "is-connected" : "is-disconnected"}`}>
                <div className="drive-connection-copy">
                  <strong>{drive.connected ? `연결됨 · ${drive.googleEmail || "Google 계정"}` : "Google Drive 연결 필요"}</strong>
                  <p>
                    {drive.connected
                      ? "권한이 만료되었거나 저장이 실패하면 다시 연결해 새 인증을 받을 수 있습니다. 기존 파일과 폴더는 유지됩니다."
                      : drive.error || "Google Drive를 연결하면 첨부 원본을 개인 Drive에 비공개로 동기화할 수 있습니다."}
                  </p>
                </div>
                <div className="drive-connection-actions" aria-label="Google Drive 연결 관리">
                  <button type="button" className="primary" disabled={Boolean(busy)} onClick={() => {
                    if (!drive.connected) {
                      connectGoogleDrive("/");
                      return;
                    }
                    void run("reconnect", async () => reconnectGoogleDrive("/"));
                  }}>
                    <RefreshCw size={16} /> {drive.connected ? "Google Drive 다시 연결" : "Google Drive 연결"}
                  </button>
                  {drive.connected && (
                    <button type="button" className="danger-button" disabled={Boolean(busy)} onClick={() => run("disconnect", async () => {
                      if (!confirm("Google Drive 연결을 해제할까요? 기존 파일은 Drive와 Work Note에 그대로 유지됩니다.")) return;
                      await disconnectGoogleDrive();
                      await refreshDrive();
                      setDriveMessage("Google Drive 연결을 해제했습니다.");
                    })}>
                      연결 해제
                    </button>
                  )}
                </div>
              </div>
            )}
            {drive && (
              <>
                <DriveOpenButton
                  href={drive.rootFolderUrl}
                  label="Google Drive 폴더 열기"
                  disabledReason={drive.connected ? "폴더 정보를 불러오지 못했습니다." : "먼저 Google Drive 연결을 완료해주세요."}
                />

                <div className="drive-essential-actions" aria-label="Google Drive 파일 관리">
                  <button
                    type="button"
                    disabled={!drive.connected}
                    onClick={() => setDriveFolderExplorerOpen(true)}
                  >
                    <FolderTree size={16} /> 폴더 탐색
                  </button>
                  <button type="button" disabled={Boolean(busy) || !drive.connected} onClick={() => run("cleanup", async () => {
                    if (!confirm("비어 있는 Work Note 관리 폴더만 Google Drive 휴지통으로 이동할까요? 파일이 들어 있는 폴더는 유지됩니다.")) return;
                    const result = await cleanupEmptyDriveFolders();
                    setDriveMessage(`빈 폴더 정리 완료 · 성공 ${result.cleaned || 0}개 · 제외 ${result.excluded || 0}개 · 실패 ${result.failed || 0}개`);
                    await refreshDrive();
                  })}>
                    <FolderOpen size={16} /> 빈 폴더 정리
                  </button>
                </div>

                {failedAttachmentIds.length > 0 && (
                  <div className="drive-recovery-callout" role="status">
                    <div>
                      <strong>저장 실패 파일 {failedAttachmentIds.length}개</strong>
                      <span>사이트 원본을 보관하고 있어 안전하게 다시 시도할 수 있습니다.</span>
                    </div>
                    <button type="button" disabled={Boolean(busy)} onClick={() => run("retry-files", retryFailedFiles)}>
                      <RefreshCw size={16} /> 다시 시도
                    </button>
                  </div>
                )}

                {driveMessage && <p className="drive-settings-message" role="status">{driveMessage}</p>}
              </>
            )}
            </div>
          </details>

          <details className="data-settings-card settings-disclosure team-share-settings" id="server-team-share-settings-card">
            <summary className="data-settings-card-heading">
              <div><span>E</span><h3>팀 공유 · Google Sheets</h3></div>
              <DataStatusBadge
                tone={teamShareTone}
                label={!teamShare ? "확인 전" : teamShare.verifiedAt && teamShare.sheetsAuthorized ? "연결 확인됨" : "설정 필요"}
              />
            </summary>
            <div className="settings-disclosure-body">
            <p>장비 영업 업무만 ‘팀 공유’할 수 있습니다. 담당자는 아래에 입력한 이름으로 저장되고, 같은 업무는 새 행이 생기지 않고 갱신됩니다.</p>
            <div className="team-share-form">
              <label>
                <span>Google Sheets 주소</span>
                <input
                  value={teamSpreadsheet}
                  onChange={(event) => setTeamSpreadsheet(event.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                />
              </label>
              <label>
                <span>탭 이름</span>
                <input value={teamSheetName} onChange={(event) => setTeamSheetName(event.target.value)} />
              </label>
              <label>
                <span>시트 담당자 이름</span>
                <input value={teamDisplayName} onChange={(event) => setTeamDisplayName(event.target.value)} placeholder="예: 백상민" />
              </label>
            </div>
            <div className="data-settings-status-grid">
              <span><b>시트 담당자</b>{teamDisplayName || "이름 입력 필요"}</span>
              <span><b>Sheets 권한</b>{teamShare?.sheetsAuthorized ? "승인됨" : "승인 필요"}</span>
              <span><b>대상 탭</b>{teamSheetName || "영업 리드 건 관리"}</span>
              <span><b>마지막 연결 확인</b>{formatSettingsTime(teamShare?.verifiedAt)}</span>
            </div>
            <div className="settings-actions">
              <button type="button" disabled={Boolean(busy)} onClick={() => void runTeamShare("team-save", async () => {
                await saveTeamSettings();
                setTeamShareMessage("팀 공유 설정을 저장했습니다.");
              })}>
                설정 저장
              </button>
              <button type="button" disabled={Boolean(busy)} onClick={() => authorizeGoogleSheets()}>
                Google Sheets 권한 승인
              </button>
              <button type="button" className="primary" disabled={Boolean(busy)} onClick={() => void runTeamShare("team-test", async () => {
                await saveTeamSettings();
                const status = await testTeamShareConnection();
                setTeamShare(status);
                setTeamShareMessage("시트 연결 확인 완료 · 헤더도 준비되었습니다.");
              })}>
                <ShieldCheck size={16} /> 저장 후 연결 확인
              </button>
              {teamShare?.spreadsheetUrl && (
                <a className="settings-link-button" href={teamShare.spreadsheetUrl} target="_blank" rel="noreferrer">
                  시트 열기
                </a>
              )}
            </div>
            {teamShareMessage && <p className="drive-settings-message" role="status">{teamShareMessage}</p>}
            </div>
          </details>

          <details className="danger-zone data-settings-card settings-disclosure" id="server-local-data-clear-card">
            <summary className="data-settings-card-heading"><div><span>F</span><h3>이 기기의 임시 데이터 삭제</h3></div></summary>
            <div className="settings-disclosure-body">
            <p>Sites 서버 데이터는 유지하고 이 기기의 캐시와 자동 스냅샷만 비웁니다.</p>
            <button type="button" disabled={Boolean(busy)} onClick={() => run("local-clear", async () => {
              if (!confirm("이 기기의 로컬 캐시를 비울까요? Sites 서버 데이터는 유지됩니다.")) return;
              clearPendingSync();
              window.localStorage.removeItem(AUTO_SNAPSHOT_KEY);
              window.localStorage.removeItem(AUTO_SNAPSHOT_LAST_KEY);
              window.localStorage.removeItem(STORAGE_KEY);
              await clearLocalAttachmentCache();
              await onReload();
            })}>
              로컬 임시 데이터 삭제
            </button>
            </div>
          </details>

          <details className="danger-zone data-settings-card settings-disclosure" id="server-account-delete-card">
            <summary className="data-settings-card-heading"><div><span>G</span><h3>계정 데이터 전체 삭제</h3></div></summary>
            <div className="settings-disclosure-body">
            <p>현재 계정의 업무 데이터와 첨부 메타데이터를 삭제 상태로 전환합니다. 실행하려면 <b>전체 삭제</b>를 입력하세요.</p>
            <input value={deleteText} onChange={(event) => setDeleteText(event.target.value)} placeholder="전체 삭제" />
            <button type="button" className="danger-button" disabled={deleteText !== "전체 삭제" || Boolean(busy)} onClick={() => run("delete", async () => {
              if (!confirm("현재 계정의 모든 Work Note 데이터를 삭제 상태로 전환할까요?")) return;
              await softDeleteAllAccountData();
              window.localStorage.removeItem(STORAGE_KEY);
              window.location.reload();
            })}>
              계정 데이터 전체 삭제
            </button>
            </div>
          </details>

          <a className="settings-signout-link" href="/signout-with-chatgpt?return_to=/">
            <LogOut size={16} /> 로그아웃
          </a>
        </div>
      </section>

      {driveFolderExplorerOpen && (
        <DriveFolderExplorer
          account={drive?.googleEmail || user.email}
          files={driveExplorerFiles}
          onClose={() => setDriveFolderExplorerOpen(false)}
        />
      )}

      {driveLogExplorerOpen && (
        <DriveLogExplorer
          operations={driveOperations}
          busy={busy === "logs"}
          onClose={() => setDriveLogExplorerOpen(false)}
          onRefresh={() => run("logs", async () => {
            const operations = await getRecentDriveOperations();
            setDriveOperations(operations);
          })}
        />
      )}
    </div>
  );
}

function DriveFolderExplorer({
  account,
  files,
  onClose,
}: {
  account: string;
  files: DriveExplorerFile[];
  onClose: () => void;
}) {
  const [currentPath, setCurrentPath] = useState("");
  const [query, setQuery] = useState("");
  const breadcrumbs = drivePathBreadcrumbs(currentPath);
  const contents = listDriveFolderContents(files, currentPath, query);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="settings-explorer-backdrop" onMouseDown={(event) => {
      event.stopPropagation();
      onClose();
    }}>
      <section className="settings-explorer-dialog" role="dialog" aria-modal="true" aria-labelledby="drive-folder-explorer-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="settings-explorer-header">
          <div>
            <span className="settings-explorer-eyebrow">GOOGLE DRIVE</span>
            <h2 id="drive-folder-explorer-title">폴더 탐색</h2>
            <p>{account || "연결된 계정"} · Work Note 첨부파일 {files.length}개</p>
          </div>
          <button type="button" className="settings-explorer-close" aria-label="폴더 탐색 닫기" onClick={onClose}><X size={20} /></button>
        </header>

        <div className="settings-explorer-toolbar">
          <nav className="drive-breadcrumbs" aria-label="현재 폴더">
            <button type="button" onClick={() => setCurrentPath("")}>Work Note</button>
            {breadcrumbs.map((item) => (
              <span key={item.path}>
                <ChevronRight size={14} />
                <button type="button" onClick={() => setCurrentPath(item.path)}>{item.name}</button>
              </span>
            ))}
          </nav>
          <label className="settings-explorer-search">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="파일명, 폴더, 업무 검색" />
          </label>
        </div>

        <div className="settings-explorer-content">
          {contents.folders.length > 0 && (
            <div className="drive-folder-grid">
              {contents.folders.map((folder) => (
                <button type="button" key={folder.path} onClick={() => setCurrentPath(folder.path)}>
                  <FolderOpen size={19} />
                  <span>{folder.name}</span>
                  <small>{folder.fileCount}개</small>
                </button>
              ))}
            </div>
          )}

          {contents.files.length > 0 && (
            <div className="drive-explorer-file-list">
              {contents.files.map((file) => (
                <article key={file.id} className="drive-explorer-file-row">
                  <File size={18} />
                  <div>
                    <strong>{file.fileName}</strong>
                    <small>{file.sourceLabel} · {file.ownerTitle}{file.fileSize ? ` · ${formatStorageSize(String(file.fileSize))}` : ""}</small>
                  </div>
                  <span>{formatSettingsTime(file.lastSyncedAt)}</span>
                  <a href={file.driveWebViewLink} target="_blank" rel="noopener noreferrer">Drive에서 열기</a>
                </article>
              ))}
            </div>
          )}

          {!contents.folders.length && !contents.files.length && (
            <div className="settings-explorer-empty">
              <FolderTree size={32} />
              <strong>{query ? "검색 결과가 없습니다." : "이 폴더에 표시할 파일이 없습니다."}</strong>
              <span>Drive 저장이 완료된 Work Note 첨부파일만 표시됩니다.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function DriveLogExplorer({
  operations,
  busy,
  onClose,
  onRefresh,
}: {
  operations: Record<string, unknown>[];
  busy: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const statuses = Array.from(new Set(operations.map((operation) => String(operation.status || "unknown"))));
  const filtered = operations.filter((operation) => {
    const matchesStatus = status === "all" || String(operation.status || "unknown") === status;
    const haystack = [
      operation.operation_type,
      operation.status,
      operation.before_path,
      operation.after_path,
      operation.target_id,
      operation.error_message,
    ].map((value) => String(value || "")).join(" ").toLocaleLowerCase("ko");
    return matchesStatus && haystack.includes(query.trim().toLocaleLowerCase("ko"));
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="settings-explorer-backdrop" onMouseDown={(event) => {
      event.stopPropagation();
      onClose();
    }}>
      <section className="settings-explorer-dialog" role="dialog" aria-modal="true" aria-labelledby="drive-log-explorer-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="settings-explorer-header">
          <div>
            <span className="settings-explorer-eyebrow">DIAGNOSTICS</span>
            <h2 id="drive-log-explorer-title">로그 탐색</h2>
            <p>최근 Google Drive 동기화·재시도 기록 {operations.length}건</p>
          </div>
          <button type="button" className="settings-explorer-close" aria-label="로그 탐색 닫기" onClick={onClose}><X size={20} /></button>
        </header>

        <div className="settings-explorer-toolbar drive-log-toolbar">
          <label className="settings-explorer-search">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="작업, 경로, 오류 검색" />
          </label>
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="로그 상태 필터">
            <option value="all">모든 상태</option>
            {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button type="button" disabled={busy} onClick={onRefresh}><RefreshCw className={busy ? "is-spinning" : ""} size={16} /> 새로고침</button>
        </div>

        <div className="settings-explorer-content">
          {filtered.length > 0 ? (
            <div className="drive-log-explorer-list">
              {filtered.map((operation, index) => (
                <article key={String(operation.id || index)}>
                  <div>
                    <strong>{String(operation.operation_type || "Drive 작업")}</strong>
                    <span className={`drive-log-status is-${String(operation.status || "unknown").toLowerCase()}`}>{String(operation.status || "unknown")}</span>
                  </div>
                  <p>{String(operation.after_path || operation.before_path || operation.target_id || "경로 정보 없음")}</p>
                  {Boolean(operation.error_message) && <small className="drive-log-error">{String(operation.error_message)}</small>}
                  <time>{formatSettingsTime(operation.completed_at || operation.updated_at || operation.created_at)}</time>
                </article>
              ))}
            </div>
          ) : (
            <div className="settings-explorer-empty">
              <Search size={32} />
              <strong>{operations.length ? "조건에 맞는 로그가 없습니다." : "최근 Drive 로그가 없습니다."}</strong>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function DataStatusBadge({ tone, label }: { tone: string; label: string }) {
  return <span className={`data-status-badge ${tone}`}>{label}</span>;
}

function warningTone(mode: string, hasError: boolean): string {
  if (mode === "saving") return "is-saving";
  if (mode === "offline") return "is-disconnected";
  if (mode === "error" || hasError) return "is-error";
  return "is-normal";
}

function syncStatusLabel(mode: string, pendingCount: number): string {
  if (mode === "saving") return "동기화 중";
  if (mode === "offline") return "연결 끊김";
  if (mode === "error") return "오류 발생";
  if (pendingCount > 0) return "재시도 필요";
  return "정상";
}

function formatOptionalDriveMetric(value: number | null | undefined, suffix: string): string {
  return value === undefined || value === null ? "확인 전" : `${value}${suffix}`;
}

function formatSettingsTime(value: unknown): string {
  if (!value) return "기록 없음";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString("ko-KR");
}

function readServerSnapshotSummary(): { count: number; lastAt: string } {
  try {
    const value = JSON.parse(window.localStorage.getItem(AUTO_SNAPSHOT_KEY) || "[]") as Array<{ at?: string }>;
    return {
      count: Array.isArray(value) ? value.length : 0,
      lastAt: String(value?.[0]?.at || ""),
    };
  } catch {
    return { count: 0, lastAt: "" };
  }
}

function readLatestOutputSavedAt(data: WorkNoteData): string {
  const values: string[] = [];
  for (const record of data.outputTasks) {
    values.push(String(record.updatedAt || record.createdAt || ""));
    const attachments = Array.isArray(record.attachments)
      ? record.attachments as Array<Record<string, unknown>>
      : [];
    for (const attachment of attachments) {
      values.push(String(attachment.lastSyncedAt || attachment.uploadedAt || attachment.createdAt || ""));
    }
  }
  return values.filter(Boolean).sort().at(-1) || "";
}

function collectFailedAttachmentIds(data: WorkNoteData): string[] {
  const ids = new Set<string>();
  const collections = [
    data.generalMemos,
    data.companies,
    data.notes,
    data.materialSalesNotes,
    data.settlementTasks,
    data.outputTasks,
    data.otherTasks,
  ] as Array<Array<Record<string, unknown>>>;
  for (const collection of collections) {
    for (const owner of collection) {
      const attachments = Array.isArray(owner.attachments)
        ? owner.attachments as Array<Record<string, unknown>>
        : [];
      for (const attachment of attachments) {
        const status = String(attachment.syncStatus || attachment.uploadStatus || "");
        const id = String(attachment.id || attachment.attachmentId || "");
        if (id && isFailedAttachmentStatus(status)) ids.add(id);
      }
    }
  }
  return [...ids];
}

function asDriveOrganizationResult(
  remaining: DriveOrganizationResult | number | undefined,
  fallback: DriveOrganizationResult,
): DriveOrganizationResult {
  return remaining && typeof remaining === "object" ? remaining : fallback;
}

function CountSummary({ counts }: { counts: DataCounts }) {
  return (
    <div className="server-count-summary">
      <span>메모 <b>{counts.generalMemos}</b></span>
      <span>업체 <b>{counts.companies}</b></span>
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

function DriveOrganizationSummary({ result }: { result: DriveOrganizationResult }) {
  const items = result.folders || result.items || [];
  const hasDuplicatePlan = Boolean(
    result.planFingerprint
    || result.duplicateCompanyFolders
    || result.duplicateMemoFolders
    || result.filesToMove,
  );
  return (
    <div className="drive-organization-result">
      <div className="drive-organization-metrics">
        <span>확인 <b>{result.checked || 0}</b></span>
        {hasDuplicatePlan && <span>업체 그룹 <b>{result.companyGroups || 0}</b></span>}
        {hasDuplicatePlan && <span>중복 업체 폴더 <b>{result.duplicateCompanyFolders || 0}</b></span>}
        {hasDuplicatePlan && <span>중복 메모 폴더 <b>{result.duplicateMemoFolders || 0}</b></span>}
        <span>이동 파일 <b>{result.filesToMove || result.moveRequired || 0}</b></span>
        <span>이동 완료 <b>{result.filesMoved || result.synchronized || 0}</b></span>
        <span>휴지통 이동 폴더 <b>{result.foldersTrashed || result.cleaned || 0}</b></span>
        <span>보호된 사용자 폴더 <b>{result.protectedUserFolders || 0}</b></span>
        <span>보호된 루트 <b>{result.protectedRoot || 0}</b></span>
        <span>비어 있지 않아 제외 <b>{result.excludedNonEmpty || result.excluded || 0}</b></span>
        <span>실패 <b>{result.failed || 0}</b></span>
      </div>
      {result.idempotentReplay && (
        <p className="drive-plan-note">같은 작업 요청이 이미 처리되어 기존 병합 결과를 안전하게 다시 표시합니다.</p>
      )}
      {items.length > 0 && (
        <div className="drive-organization-list">
          {items.slice(0, 40).map((item, index) => (
            <article key={String(item.id || item.folder_id || index)}>
              <div>
                <strong>{String(item.name || item.targetPath || item.drive_path || item.currentPath || "경로 정보 없음")}</strong>
                {item.folderType && <small>{item.folderType === "memo" ? "메모 폴더" : "업체 폴더"}</small>}
              </div>
              <dl>
                <div><dt>현재 경로</dt><dd>{String(item.currentPath || item.drive_path || "-")}</dd></div>
                <div><dt>최종 이동 경로</dt><dd>{String(item.targetPath || item.canonicalPath || "-")}</dd></div>
                <div><dt>이동 파일</dt><dd>{Number(item.fileCount || 0)}개</dd></div>
                <div><dt>이동 메모 폴더</dt><dd>{Number(item.memoFolderCount || 0)}개</dd></div>
                <div><dt>canonical 폴더</dt><dd>{String(item.canonicalFolderId || "-")}</dd></div>
                <div><dt>보호/제외 이유</dt><dd>{String(item.reason || item.excludedReason || (item.eligible ? "병합 예정" : "확인 완료"))}</dd></div>
              </dl>
            </article>
          ))}
          {items.length > 40 && <small>외 {items.length - 40}건</small>}
        </div>
      )}
    </div>
  );
}

function DriveOperationList({ operations }: { operations: Record<string, unknown>[] }) {
  return (
    <div className="drive-organization-list">
      {operations.slice(0, 20).map((operation, index) => (
        <article key={String(operation.id || index)}>
          <strong>{String(operation.operation_type || "Drive 작업")} · {String(operation.status || "")}</strong>
          <small>
            {String(operation.after_path || operation.before_path || operation.target_id || "")}
            {operation.error_message ? ` · ${String(operation.error_message)}` : ""}
          </small>
        </article>
      ))}
    </div>
  );
}

function formatStorageSize(value: string): string {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)}${units[index]}`;
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
