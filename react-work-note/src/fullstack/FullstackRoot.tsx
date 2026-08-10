"use client";

import {
  Cloud,
  CloudOff,
  Database,
  Download,
  FolderOpen,
  HardDrive,
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
import { App, BackupSettingsPanel, loadWorkNoteData } from "../App";
import {
  clearPendingSync,
  clearRemoteRuntime,
  cleanupEmptyDriveFolders,
  connectGoogleDrive,
  disconnectGoogleDrive,
  flushPendingChanges,
  getRecentDriveOperations,
  getGoogleDriveStatus,
  getServerCounts,
  initializeRemoteRuntime,
  loadServerDataset,
  mergeDuplicateDriveFolders,
  migrateLegacyAttachmentsToDrive,
  previewDriveMigration,
  previewDuplicateDriveFolders,
  previewEmptyDriveFolders,
  refreshRemoteAttachments,
  retryDriveOrganization,
  retryRemoteAttachments,
  runDriveMigration,
  softDeleteAllAccountData,
  testGoogleDriveConnection,
  type DriveOrganizationResult,
  type GoogleDriveStatus,
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
import { DriveOpenButton, isFailedAttachmentStatus } from "./driveUi";
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
    if (params.get("drive") === "connected" || params.has("driveError")) {
      setSettingsOpen(true);
      if (params.has("driveError")) setError(params.get("driveError") || "Google Drive 연결에 실패했습니다.");
      params.delete("drive");
      params.delete("driveError");
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
  const [counts, setCounts] = useState<DataCounts | null>(null);
  const [drive, setDrive] = useState<GoogleDriveStatus | null>(null);
  const [driveMessage, setDriveMessage] = useState("");
  const [driveResult, setDriveResult] = useState<DriveOrganizationResult | null>(null);
  const [driveOperations, setDriveOperations] = useState<Record<string, unknown>[]>([]);
  const sync = useSyncState();
  const failedAttachmentIds = useMemo(
    () => collectFailedAttachmentIds(localData),
    [localData],
  );
  const snapshot = useMemo(readServerSnapshotSummary, [localData.updatedAt]);
  const outputSavedAt = useMemo(
    () => readLatestOutputSavedAt(localData),
    [localData],
  );

  const refreshDrive = async () => {
    const status = await getGoogleDriveStatus();
    setDrive(status);
    return status;
  };

  useEffect(() => {
    void getServerCounts().then(setCounts).catch(() => setCounts(null));
    void refreshDrive().catch((caught) => {
      setDrive({
        connected: false,
        provider: "google_drive",
        error: caught instanceof Error ? caught.message : String(caught),
      });
    });
  }, []);

  useEffect(() => {
    const target = initialTarget === "drive" ? "server-drive-settings-card" : "server-sync-status-card";
    document.getElementById(target)?.scrollIntoView({ block: "start" });
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
            <h2 id="server-settings-title">현재 동기화 데이터 설정</h2>
            <small>{user.displayName || user.email} · {user.email}</small>
          </div>
          <button type="button" aria-label="설정 닫기" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="server-settings-scroll">
          <section className="data-settings-card" id="server-sync-status-card">
            <div className="data-settings-card-heading">
              <div><span>A</span><h3>동기화 상태</h3></div>
              <DataStatusBadge tone={syncTone} label={syncStatusLabel(sync.mode, sync.pendingCount)} />
            </div>
            <div className="data-settings-status-grid">
              <span><b>서버 데이터</b>{sync.mode === "offline" ? "연결 끊김" : "D1 연결"}</span>
              <span><b>Google Drive</b>{!drive ? "확인 전" : drive.connected ? `연결됨 · ${drive.googleEmail || "계정 확인됨"}` : "연결 필요"}</span>
              <span><b>마지막 서버 동기화</b>{formatSettingsTime(sync.lastSyncedAt)}</span>
              <span><b>마지막 Drive 동기화</b>{formatSettingsTime(drive?.lastDriveSyncAt || drive?.lastSyncedAt)}</span>
              <span><b>현재 동기화 중</b>{sync.mode === "saving" ? "예" : "아니요"}</span>
              <span><b>동기화 실패</b>{sync.error ? "오류 발생" : failedAttachmentIds.length ? `${failedAttachmentIds.length}개 확인 필요` : "없음"}</span>
              <span><b>현재 데이터 저장 위치</b>D1 업무 데이터 · R2 원본 · Google Drive 동기화</span>
              <span><b>최종 출력 파일 저장</b>{formatSettingsTime(outputSavedAt)}</span>
            </div>
            {counts && <CountSummary counts={counts} />}
          </section>

          <section className="data-settings-card">
            <div className="data-settings-card-heading">
              <div><span>B</span><h3>안전 저장 및 백업</h3></div>
              <DataStatusBadge tone="is-normal" label="정상" />
            </div>
            <div className="data-settings-status-grid">
              <span><b>안전 저장 모드</b>사용 중</span>
              <span><b>자동 스냅샷</b>{snapshot.count}개 · {formatSettingsTime(snapshot.lastAt)}</span>
              <span><b>마이그레이션</b>{progress.message}</span>
              <span><b>백업 원본</b>JSON 기록 또는 첨부 포함 ZIP</span>
            </div>
            <BackupSettingsPanel
              data={localData as ReturnType<typeof loadWorkNoteData>}
              setData={onLocalDataChanged}
              setSaveMessage={setDriveMessage}
            />
            <div className="settings-actions">
              <button type="button" disabled={Boolean(busy)} onClick={onMigrate}>
                <Upload size={16} /> 로컬 데이터를 Sites로 이전
              </button>
            </div>
          </section>

          <section className="data-settings-card">
            <div className="data-settings-card-heading">
              <div><span>C</span><h3>데이터 새로고침 및 복구</h3></div>
              {sync.error && <DataStatusBadge tone="is-error" label="오류 발생" />}
            </div>
            <div className="settings-actions">
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
            </div>
          </section>

          <section className="data-settings-card drive-storage-settings" id="server-drive-settings-card">
            <div className="data-settings-card-heading">
              <div><span>D</span><h3>Google Drive 관리</h3></div>
              <DataStatusBadge tone={driveTone} label={!drive ? "확인 전" : drive.connected ? "정상" : "연결 끊김"} />
            </div>
            {!drive && <p>Google Drive 연결 상태를 확인하고 있습니다.</p>}
            {drive && !drive.connected && (
              <>
                <p>{drive.error || "Google Drive를 연결하면 첨부 원본을 개인 Drive에 비공개로 동기화할 수 있습니다."}</p>
                <button type="button" className="primary" onClick={() => connectGoogleDrive("/")}>
                  Google Drive 연결
                </button>
              </>
            )}
            {drive && (
              <>
                <div className="drive-status-grid">
                  <span>Google Drive 연결 <b>{drive.connected ? "연결됨" : "연결 필요"}</b></span>
                  <span>정상 업체 폴더 <b>{formatOptionalDriveMetric(drive.canonicalCompanyFolderCount, "개")}</b></span>
                  <span>중복 업체 폴더 <b>{formatOptionalDriveMetric(drive.duplicateCompanyFolderCount, "개")}</b></span>
                  <span>중복 수업처 미정 폴더 <b>{formatOptionalDriveMetric(drive.duplicateUnknownCompanyFolderCount, "개")}</b></span>
                  <span>병합 예정 <b>{formatOptionalDriveMetric(drive.mergePendingCount, "건")}</b></span>
                  <span>병합 완료 <b>{formatOptionalDriveMetric(drive.mergeCompletedCount, "건")}</b></span>
                  <span>병합 실패 <b>{formatOptionalDriveMetric(drive.mergeFailedCount, "건")}</b></span>
                  <span>Drive 저장 실패 파일 <b>{formatOptionalDriveMetric(drive.failedFileCount, "개")}</b></span>
                  <span>재시도 필요 파일 <b>{formatOptionalDriveMetric(drive.retryRequiredCount, "개")}</b></span>
                  <span>마지막 Drive 동기화 <b>{formatSettingsTime(drive.lastDriveSyncAt || drive.lastSyncedAt)}</b></span>
                  <span>마지막 폴더 정리 <b>{formatSettingsTime(drive.lastFolderCleanupAt)}</b></span>
                  {drive.quota?.usage && (
                    <span>Drive 사용량 <b>{formatStorageSize(drive.quota.usage)}{drive.quota.limit ? ` / ${formatStorageSize(drive.quota.limit)}` : ""}</b></span>
                  )}
                </div>

                <DriveOpenButton
                  href={drive.rootFolderUrl}
                  label="Google Drive 폴더 열기"
                  disabledReason={drive.connected ? "폴더 정보를 불러오지 못했습니다." : "먼저 Google Drive 연결을 완료해주세요."}
                />

                {driveMessage && <p className="drive-settings-message" role="status">{driveMessage}</p>}
                {driveResult && <DriveOrganizationSummary result={driveResult} />}
                {driveOperations.length > 0 && <DriveOperationList operations={driveOperations} />}

                {drive.connected && (
                  <div className="settings-actions drive-management-actions">
                    <button type="button" disabled={Boolean(busy)} onClick={() => run("duplicates-preview", async () => {
                      const result = await previewDuplicateDriveFolders();
                      setDriveResult(result);
                      setDriveMessage(`중복 폴더 미리보기 · 업체 ${result.duplicateCompanyFolders || 0}개 · 메모 ${result.duplicateMemoFolders || 0}개 · 이동 파일 ${result.filesToMove || 0}개`);
                    })}>
                      <FolderOpen size={16} /> 폴더 구조 미리보기
                    </button>
                    <button type="button" disabled={Boolean(busy) || !driveResult?.planFingerprint} onClick={() => run("duplicates-merge", async () => {
                      if (!confirm(`미리 본 계획대로 중복 폴더를 병합할까요?\n이동 파일 ${driveResult?.filesToMove || 0}개 · 보호된 사용자 폴더 ${driveResult?.protectedUserFolders || 0}개`)) return;
                      const result = await mergeDuplicateDriveFolders(driveResult?.planFingerprint || "");
                      setDriveResult(result);
                      setDriveMessage(`중복 폴더 병합 완료 · 파일 이동 ${result.filesMoved || 0}개 · 폴더 휴지통 이동 ${result.foldersTrashed || 0}개 · 실패 ${result.failed || 0}개`);
                      await refreshDrive();
                    })}>
                      <FolderOpen size={16} /> 중복 폴더 병합 실행
                    </button>
                    <button type="button" disabled={Boolean(busy)} onClick={() => run("cleanup-preview", async () => {
                      const result = await previewEmptyDriveFolders();
                      setDriveResult(result);
                      setDriveMessage(`빈 폴더 미리보기 · 정리 예정 ${result.empty || 0}개 · 보호/제외 ${result.excluded || 0}개`);
                    })}>
                      빈 폴더 정리 미리보기
                    </button>
                    <button type="button" disabled={Boolean(busy)} onClick={() => run("cleanup", async () => {
                      if (!confirm("미리 확인한 비어 있는 Work Note 관리 폴더만 휴지통으로 이동할까요?")) return;
                      const result = await cleanupEmptyDriveFolders();
                      setDriveResult(result);
                      setDriveMessage(`빈 폴더 정리 완료 · 성공 ${result.cleaned || 0}개 · 제외 ${result.excluded || 0}개 · 실패 ${result.failed || 0}개`);
                      await refreshDrive();
                    })}>
                      빈 폴더 정리
                    </button>
                    <button type="button" disabled={Boolean(busy)} onClick={() => run("migration-preview", async () => {
                      const result = await previewDriveMigration();
                      setDriveResult(result);
                      setDriveMessage(`기존 파일 정리 미리보기 · 이동 ${result.moveRequired || 0}개 · 제외 ${result.excluded || 0}개`);
                    })}>
                      기존 파일 정리 미리보기
                    </button>
                    <button type="button" disabled={Boolean(busy)} onClick={() => run("migration", async () => {
                      if (!confirm("기존 Work Note 파일을 canonical 업체·메모·종류 폴더로 이동할까요? 파일 ID와 링크는 유지됩니다.")) return;
                      const result = await runDriveMigration();
                      setDriveResult(asDriveOrganizationResult(result.remaining, result));
                      setDriveMessage(`기존 파일 정리 완료 · 성공 ${result.synchronized || 0}개 · 실패 ${result.failed || 0}개`);
                      await refreshDrive();
                    })}>
                      기존 파일 폴더 정리 실행
                    </button>
                    <button type="button" disabled={Boolean(busy) || !drive.legacyFileCount} onClick={() => run("legacy-migrate", async () => {
                      if (!confirm(`기존 Site 원본 ${drive.legacyFileCount || 0}개를 Google Drive로 안전하게 이전할까요? 검증 전에는 R2 원본을 삭제하지 않습니다.`)) return;
                      const result = await migrateLegacyAttachmentsToDrive((migrated, remaining) => {
                        setDriveMessage(`기존 파일 이전 ${migrated}개 완료 · 남은 파일 ${remaining}개`);
                      });
                      setDriveMessage(`이전 완료 ${result.migrated}개 · 실패 ${result.failed}개 · 남음 ${result.remaining}개`);
                      await refreshDrive();
                    })}>
                      기존 R2 파일 Drive로 이전
                    </button>
                    <button type="button" disabled={Boolean(busy) || !failedAttachmentIds.length} onClick={() => run("retry-files", retryFailedFiles)}>
                      <RefreshCw size={16} /> 실패 파일 다시 시도
                    </button>
                    <button type="button" disabled={Boolean(busy)} onClick={() => run("refresh-failures", refreshFailureState)}>
                      <RefreshCw size={16} /> 실패 항목 새로고침
                    </button>
                    <button type="button" disabled={Boolean(busy)} onClick={() => run("drive-test", async () => {
                      await testGoogleDriveConnection();
                      await refreshDrive();
                      setDriveMessage("Google Drive 연결이 정상입니다.");
                    })}>
                      <ShieldCheck size={16} /> Google Drive 연결 재확인
                    </button>
                    <button type="button" disabled={Boolean(busy)} onClick={() => run("logs", async () => {
                      const operations = await getRecentDriveOperations();
                      setDriveOperations(operations);
                      setDriveMessage(`최근 동기화 결과 ${operations.length}건을 불러왔습니다.`);
                    })}>
                      최근 동기화 결과
                    </button>
                    <button type="button" className="danger-button" disabled={Boolean(busy)} onClick={() => run("disconnect", async () => {
                      if (!confirm("Google Drive 연결을 해제할까요? 기존 파일은 Drive와 Work Note에 그대로 유지됩니다.")) return;
                      await disconnectGoogleDrive();
                      await refreshDrive();
                      setDriveMessage("Google Drive 연결을 해제했습니다.");
                    })}>
                      연결 해제
                    </button>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="danger-zone data-settings-card">
            <h3>이 기기의 임시 데이터 삭제</h3>
            <p>Sites 서버 데이터는 유지하고 이 기기의 캐시와 자동 스냅샷만 비웁니다.</p>
            <button type="button" disabled={Boolean(busy)} onClick={() => run("local-clear", async () => {
              if (!confirm("이 기기의 로컬 캐시를 비울까요? Sites 서버 데이터는 유지됩니다.")) return;
              clearPendingSync();
              window.localStorage.removeItem(AUTO_SNAPSHOT_KEY);
              window.localStorage.removeItem(STORAGE_KEY);
              await clearLocalAttachmentCache();
              await onReload();
            })}>
              로컬 임시 데이터 삭제
            </button>
          </section>

          <section className="danger-zone data-settings-card">
            <h3>계정 데이터 전체 삭제</h3>
            <p>현재 ChatGPT 계정의 D1 업무 데이터와 첨부 메타데이터를 삭제 상태로 전환합니다. 실행하려면 <b>전체 삭제</b>를 입력하세요.</p>
            <input value={deleteText} onChange={(event) => setDeleteText(event.target.value)} placeholder="전체 삭제" />
            <button type="button" className="danger-button" disabled={deleteText !== "전체 삭제" || Boolean(busy)} onClick={() => run("delete", async () => {
              if (!confirm("현재 계정의 모든 Sites 데이터를 삭제 상태로 전환할까요?")) return;
              await softDeleteAllAccountData();
              window.localStorage.removeItem(STORAGE_KEY);
              window.location.reload();
            })}>
              계정 데이터 전체 삭제
            </button>
          </section>

          <a className="settings-signout-link" href="/signout-with-chatgpt?return_to=/">
            <LogOut size={16} /> 로그아웃
          </a>
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
