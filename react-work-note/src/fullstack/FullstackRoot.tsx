import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import { Cloud, CloudOff, Database, Download, LogOut, RefreshCw, Settings, ShieldCheck, Upload, X } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { App, loadWorkNoteData } from "../App";
import { fullstackConfig, hasSupabaseConfig } from "./config";
import {
  clearPendingSync,
  clearRemoteRuntime,
  flushPendingChanges,
  getServerCounts,
  initializeRemoteRuntime,
  loadServerDataset,
  softDeleteAllAccountData
} from "./repository";
import {
  clearLocalAttachmentCache,
  countWorkNoteData,
  downloadLocalMigrationBackup,
  hasLocalWorkNoteData,
  migrateLocalDataToServer,
  retryAttachmentMigration
} from "./migration";
import { getSupabaseClient } from "./supabaseClient";
import { getSyncState, useSyncState } from "./syncStore";
import type { DataCounts, MigrationProgress, WorkNoteData } from "./types";

const STORAGE_KEY = "salesNoteAppDataV1";
const AUTO_SNAPSHOT_KEY = "workNoteReactAutoSnapshotsV1";
const ALLOWED_PROFILE_CACHE_KEY = "workNoteAllowedProfileV1";
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 20_000, refetchOnWindowFocus: false } }
});

export function FullstackRoot() {
  return (
    <QueryClientProvider client={queryClient}>
      <FullstackBootstrap />
    </QueryClientProvider>
  );
}

function FullstackBootstrap() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setAuthReady(true);
      return;
    }
    const supabase = getSupabaseClient();
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
      if (!nextSession) clearRemoteRuntime();
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (!hasSupabaseConfig) return <ConfigurationRequired />;
  if (!authReady) return <FullPageState title="로그인 상태 확인 중" detail="안전한 서버 연결을 준비하고 있습니다." />;
  if (!session?.user) return <LoginScreen />;
  return <AuthenticatedWorkNote user={session.user} />;
}

function ConfigurationRequired() {
  return (
    <main className="fullstack-auth-page">
      <section className="fullstack-auth-card setup-card">
        <Database size={32} />
        <p className="eyebrow">FULL-STACK SETUP</p>
        <h1>Supabase 연결이 필요합니다</h1>
        <p>기존 Work Note 배포는 그대로 유지됩니다. 이 시험 버전은 환경변수와 DB 마이그레이션이 준비된 뒤에만 로그인 화면을 엽니다.</p>
        <div className="setup-steps">
          <strong>필요한 환경변수</strong>
          <code>VITE_SUPABASE_URL</code>
          <code>VITE_SUPABASE_ANON_KEY</code>
          <code>VITE_ALLOWED_EMAIL</code>
        </div>
      </section>
    </main>
  );
}

function LoginScreen() {
  const [email, setEmail] = useState(fullstackConfig.allowedEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const validateEmail = () => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) throw new Error("이메일을 입력해 주세요.");
    if (fullstackConfig.allowedEmail && normalized !== fullstackConfig.allowedEmail) throw new Error("이 Work Note에 허용된 계정이 아닙니다.");
    return normalized;
  };
  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("로그인 중"); setMessage("");
    try {
      const { error } = await getSupabaseClient().auth.signInWithPassword({ email: validateEmail(), password });
      if (error) throw error;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally { setBusy(""); }
  };
  const sendMagicLink = async () => {
    setBusy("로그인 링크 전송 중"); setMessage("");
    try {
      const { error } = await getSupabaseClient().auth.signInWithOtp({
        email: validateEmail(),
        options: { shouldCreateUser: false, emailRedirectTo: window.location.href.split("#")[0] }
      });
      if (error) throw error;
      setMessage("이메일로 로그인 링크를 보냈습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally { setBusy(""); }
  };

  return (
    <main className="fullstack-auth-page">
      <form className="fullstack-auth-card" onSubmit={signIn}>
        <ShieldCheck size={34} />
        <p className="eyebrow">WORK NOTE</p>
        <h1>개인 업무 메모장 로그인</h1>
        <p>인증된 본인 계정만 서버 데이터와 첨부파일에 접근할 수 있습니다.</p>
        <label><span>이메일</span><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label><span>비밀번호</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {message && <p className="fullstack-form-message" role="status">{message}</p>}
        <button className="primary" type="submit" disabled={Boolean(busy)}>{busy || "로그인"}</button>
        <button type="button" disabled={Boolean(busy)} onClick={sendMagicLink}>이메일 매직링크 받기</button>
      </form>
    </main>
  );
}

function AuthenticatedWorkNote({ user }: { user: User }) {
  const client = getSupabaseClient();
  const queryClientInstance = useQueryClient();
  const [appVersion, setAppVersion] = useState(0);
  const [migration, setMigration] = useState<MigrationProgress>({ phase: "unchecked", message: "기존 데이터 검사 전", completed: 0, total: 0, failedAttachmentIds: [] });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const localData = useMemo(readLocalData, [appVersion]);
  const cachedAllowed = readAllowedProfileCache(user.id);
  const profileQuery = useQuery({
    queryKey: ["work-note-profile", user.id],
    queryFn: async () => {
      const { data, error } = await client.from("profiles").select("email,display_name,is_allowed").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      return data;
    }
  });
  const hasAccess = profileQuery.data ? Boolean(profileQuery.data.is_allowed) : cachedAllowed;
  const serverQuery = useQuery({
    queryKey: ["work-note-dataset", user.id],
    enabled: hasAccess,
    queryFn: async () => {
      initializeRemoteRuntime(client, user);
      await flushPendingChanges();
      return loadServerDataset();
    },
    refetchInterval: () => navigator.onLine && document.visibilityState === "visible" ? 60_000 : false
  });

  useEffect(() => {
    if (!profileQuery.data) return;
    writeAllowedProfileCache(user.id, Boolean(profileQuery.data.is_allowed));
  }, [profileQuery.data, user.id]);

  useEffect(() => {
    if (!hasAccess) return;
    initializeRemoteRuntime(client, user);
  }, [client, hasAccess, user]);

  useEffect(() => {
    if (!hasAccess) return;
    const channel = client
      .channel(`work-note-activity-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_logs", filter: `user_id=eq.${user.id}` },
        () => void queryClientInstance.invalidateQueries({ queryKey: ["work-note-dataset", user.id] })
      )
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [client, hasAccess, queryClientInstance, user.id]);

  useEffect(() => {
    if (!hasAccess) return;
    const refreshFromServer = () => {
      if (!navigator.onLine || document.visibilityState !== "visible") return;
      void flushPendingChanges().then(() => queryClientInstance.invalidateQueries({ queryKey: ["work-note-dataset", user.id] }));
    };
    window.addEventListener("online", refreshFromServer);
    window.addEventListener("focus", refreshFromServer);
    document.addEventListener("visibilitychange", refreshFromServer);
    return () => {
      window.removeEventListener("online", refreshFromServer);
      window.removeEventListener("focus", refreshFromServer);
      document.removeEventListener("visibilitychange", refreshFromServer);
    };
  }, [hasAccess, queryClientInstance, user.id]);

  useEffect(() => {
    const warnPendingSave = (event: BeforeUnloadEvent) => {
      if (getSyncState().pendingCount < 1) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnPendingSave);
    return () => window.removeEventListener("beforeunload", warnPendingSave);
  }, []);

  useEffect(() => {
    if (!serverQuery.data || !hasAccess) return;
    const currentLocal = readLocalData();
    const serverHasData = hasLocalWorkNoteData(serverQuery.data);
    const localHasData = hasLocalWorkNoteData(currentLocal);
    const serverTime = serverQuery.data.updatedAt || "";
    const localTime = currentLocal.updatedAt || "";

    if (serverHasData) {
      if (localHasData && localTime > serverTime) {
        if (getSyncState().pendingCount > 0) {
          setMigration({ phase: "complete", message: "로컬 변경사항을 서버에 저장하는 중입니다.", completed: 1, total: 1, failedAttachmentIds: [] });
          void flushPendingChanges();
          return;
        }
        setMigration({ phase: "ready", message: "서버보다 새로운 로컬 데이터가 발견되었습니다.", completed: 0, total: countWorkNoteData(currentLocal).attachments + 1, failedAttachmentIds: [] });
        return;
      }
      if (!localHasData || serverTime > localTime) {
        writeLocalData(serverQuery.data);
        setAppVersion((value) => value + 1);
      }
      setMigration({ phase: "complete", message: "서버 데이터 연결 완료", completed: 1, total: 1, failedAttachmentIds: [] });
      return;
    }

    if (localHasData) {
      setMigration({ phase: "ready", message: "기존 브라우저 데이터가 발견되었습니다.", completed: 0, total: countWorkNoteData(currentLocal).attachments + 1, failedAttachmentIds: [] });
      return;
    }

    writeLocalData(serverQuery.data);
    setMigration({ phase: "complete", message: "빈 서버 작업공간을 준비했습니다.", completed: 1, total: 1, failedAttachmentIds: [] });
    setAppVersion((value) => value + 1);
  }, [hasAccess, serverQuery.data]);

  const runMigration = async () => {
    try {
      await migrateLocalDataToServer(readLocalData(), setMigration);
      await queryClientInstance.invalidateQueries({ queryKey: ["work-note-dataset", user.id] });
    } catch (error) {
      setMigration((current) => ({ ...current, phase: "failed", message: error instanceof Error ? error.message : String(error) }));
    }
  };
  const retryFiles = async () => {
    setMigration((current) => ({ ...current, phase: "uploading", message: "실패한 첨부파일 재시도 중" }));
    const failed = await retryAttachmentMigration(migration.failedAttachmentIds, (completed, total) => {
      setMigration((current) => ({ ...current, completed, total, message: `첨부파일 재시도 ${completed}/${total}` }));
    });
    setMigration((current) => ({ ...current, phase: failed.length ? "partial" : "complete", failedAttachmentIds: failed, message: failed.length ? `${failed.length}개 파일 재시도 필요` : "첨부파일 이전 완료" }));
  };

  const appShell = (
    <>
      <SyncDock onOpenSettings={() => setSettingsOpen(true)} />
      <App key={appVersion} />
      {settingsOpen && (
        <ServerSettings
          user={user}
          localData={readLocalData()}
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
              const center = document.getElementById("work-note-backup-center") as HTMLDetailsElement | null;
              if (!center) return;
              center.open = true;
              center.scrollIntoView({ block: "center", behavior: "smooth" });
            }, 0);
          }}
          progress={migration}
        />
      )}
    </>
  );

  if (profileQuery.isLoading && !cachedAllowed) return <FullPageState title="접근 권한 확인 중" detail="본인 계정과 RLS 정책을 확인하고 있습니다." />;
  if (profileQuery.error && !cachedAllowed) return <FullPageState title="프로필을 읽지 못했습니다" detail={String(profileQuery.error)} />;
  if (!hasAccess) return <AccessPending user={user} />;
  if ((!navigator.onLine || serverQuery.error) && hasLocalWorkNoteData(localData)) return appShell;
  if (serverQuery.isLoading || migration.phase === "unchecked") return <FullPageState title="서버 데이터 확인 중" detail="로컬 데이터를 지우지 않고 서버 상태를 비교하고 있습니다." />;
  if (serverQuery.error) return <FullPageState title="서버 데이터 연결 실패" detail={String(serverQuery.error)} action={<button onClick={() => void serverQuery.refetch()}>다시 시도</button>} />;
  if (["ready", "backup-complete", "uploading", "verifying", "partial", "failed"].includes(migration.phase)) {
    return <MigrationScreen data={localData} progress={migration} onMigrate={runMigration} onRetryFiles={retryFiles} onLogout={() => client.auth.signOut()} />;
  }

  return appShell;
}

function AccessPending({ user }: { user: User }) {
  return (
    <FullPageState
      title="이 계정은 아직 허용되지 않았습니다"
      detail={`${user.email || "현재 계정"}으로 첫 로그인은 완료됐습니다. Supabase SQL Editor에서 profiles.is_allowed를 true로 설정한 뒤 새로고침해 주세요.`}
      action={<button onClick={() => getSupabaseClient().auth.signOut()}>로그아웃</button>}
    />
  );
}

function MigrationScreen({ data, progress, onMigrate, onRetryFiles, onLogout }: { data: WorkNoteData; progress: MigrationProgress; onMigrate: () => void; onRetryFiles: () => void; onLogout: () => void }) {
  const counts = countWorkNoteData(data);
  const busy = ["backup-complete", "uploading", "verifying"].includes(progress.phase);
  return (
    <main className="fullstack-auth-page migration-page">
      <section className="migration-card">
        <div className="migration-heading"><div><p className="eyebrow">SAFE MIGRATION</p><h1>기존 데이터 발견</h1><p>{progress.message}</p></div><button type="button" onClick={onLogout}><LogOut size={16} /> 로그아웃</button></div>
        <div className="migration-count-grid">
          <Metric label="고객사" value={counts.companies} /><Metric label="업무" value={counts.equipmentSales + counts.materialSales + counts.outputTasks + counts.otherTasks} />
          <Metric label="정산" value={counts.settlements} /><Metric label="정산 행" value={counts.settlementEntries} /><Metric label="일정" value={counts.taskSchedules} /><Metric label="첨부 기록" value={counts.attachments} />
        </div>
        <div className="migration-safety-note"><ShieldCheck size={20} /><div><strong>원본 보존</strong><p>이전 전 JSON 백업을 자동 생성하며 localStorage와 IndexedDB 원본은 자동 삭제하지 않습니다.</p></div></div>
        {progress.total > 0 && <progress value={progress.completed} max={progress.total} />}
        {progress.failedAttachmentIds.length > 0 && <p className="fullstack-form-message">첨부파일 {progress.failedAttachmentIds.length}개는 다시 시도할 수 있습니다.</p>}
        <div className="migration-actions">
          <button type="button" onClick={() => downloadLocalMigrationBackup(data)}><Download size={16} /> JSON 백업</button>
          {progress.failedAttachmentIds.length > 0 && <button type="button" onClick={onRetryFiles}><RefreshCw size={16} /> 실패 파일 재시도</button>}
          <button type="button" className="primary" disabled={busy} onClick={onMigrate}><Upload size={16} /> {busy ? "서버 이전 중" : "서버로 안전하게 이전"}</button>
        </div>
      </section>
    </main>
  );
}

function SyncDock({ onOpenSettings }: { onOpenSettings: () => void }) {
  const sync = useSyncState();
  const Icon = sync.mode === "offline" || sync.mode === "error" ? CloudOff : Cloud;
  return (
    <div className={`fullstack-sync-dock ${sync.mode}`} role="status">
      <Icon size={15} /><span>{sync.message}</span>{sync.pendingCount > 0 && <b>{sync.pendingCount}</b>}
      <button type="button" onClick={onOpenSettings} aria-label="서버 설정"><Settings size={16} /></button>
    </div>
  );
}

function ServerSettings({ user, localData, progress, onClose, onReload, onMigrate, onOpenBackupCenter }: { user: User; localData: WorkNoteData; progress: MigrationProgress; onClose: () => void; onReload: () => Promise<void>; onMigrate: () => void; onOpenBackupCenter: () => void }) {
  const [busy, setBusy] = useState("");
  const [deleteText, setDeleteText] = useState("");
  const countsQuery = useQuery({ queryKey: ["server-counts", user.id], queryFn: getServerCounts });
  const sync = useSyncState();
  const run = async (label: string, action: () => Promise<void>) => { setBusy(label); try { await action(); } finally { setBusy(""); } };
  return (
    <div className="server-settings-backdrop" onMouseDown={onClose}>
      <section className="server-settings-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><p className="eyebrow">SETTINGS</p><h2>서버 및 데이터 설정</h2></div><button type="button" aria-label="설정 닫기" onClick={onClose}><X size={18} /></button></header>
        <div className="server-settings-scroll">
          <section><h3>로그인 계정</h3><p>{user.email}</p><button type="button" onClick={() => getSupabaseClient().auth.signOut()}><LogOut size={16} /> 로그아웃</button></section>
          <section><h3>동기화</h3><p>{sync.message}</p><small>마지막 동기화: {sync.lastSyncedAt ? new Date(sync.lastSyncedAt).toLocaleString("ko-KR") : "기록 없음"}</small><button type="button" disabled={Boolean(busy)} onClick={() => run("reload", onReload)}><RefreshCw size={16} /> 서버 데이터 다시 불러오기</button></section>
          <section><h3>서버 데이터</h3>{countsQuery.data ? <CountSummary counts={countsQuery.data} /> : <p>개수 확인 중</p>}</section>
          <section><h3>로컬 데이터와 백업</h3><p>마이그레이션 상태: {progress.message}</p><div className="settings-actions"><button type="button" onClick={() => downloadLocalMigrationBackup(localData)}><Download size={16} /> JSON 백업</button><button type="button" onClick={onMigrate}><Upload size={16} /> 로컬 데이터를 서버로 이전</button><button type="button" onClick={onOpenBackupCenter}><Database size={16} /> 전체 백업·복원 센터</button></div><small>전체 백업·복원 센터에서 첨부파일 포함 ZIP, JSON 병합·교체, CSV ZIP, Excel을 그대로 사용할 수 있습니다.</small></section>
          <section className="danger-zone"><h3>로컬 임시 데이터 삭제</h3><p>서버 데이터는 유지하고 이 기기의 캐시·재시도 큐·첨부 캐시만 비웁니다.</p><button type="button" disabled={Boolean(busy)} onClick={() => run("local-clear", async () => { if (!confirm("이 기기의 로컬 캐시를 비울까요? 서버 데이터는 유지됩니다.")) return; clearPendingSync(); window.localStorage.removeItem(AUTO_SNAPSHOT_KEY); window.localStorage.removeItem(STORAGE_KEY); await clearLocalAttachmentCache(); await onReload(); })}>로컬 임시 데이터 삭제</button></section>
          <section className="danger-zone"><h3>계정 데이터 전체 삭제</h3><p>서버 데이터는 소프트 삭제되며 일반 화면에서 사라집니다. 실행하려면 <b>전체 삭제</b>를 입력하세요.</p><input value={deleteText} onChange={(event) => setDeleteText(event.target.value)} placeholder="전체 삭제" /><button type="button" className="danger-button" disabled={deleteText !== "전체 삭제" || Boolean(busy)} onClick={() => run("delete", async () => { if (!confirm("계정의 모든 서버 데이터를 삭제 상태로 전환할까요?")) return; await softDeleteAllAccountData(); window.localStorage.removeItem(STORAGE_KEY); window.location.reload(); })}>계정 데이터 전체 삭제</button></section>
        </div>
      </section>
    </div>
  );
}

function CountSummary({ counts }: { counts: DataCounts }) { return <div className="server-count-summary"><span>고객사 <b>{counts.companies}</b></span><span>업무 <b>{counts.equipmentSales + counts.materialSales + counts.outputTasks + counts.otherTasks}</b></span><span>정산 <b>{counts.settlements}</b></span><span>첨부 <b>{counts.attachments}</b></span></div>; }
function Metric({ label, value }: { label: string; value: number }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function FullPageState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) { return <main className="fullstack-auth-page"><section className="fullstack-auth-card"><Database size={30} /><h1>{title}</h1><p>{detail}</p>{action}</section></main>; }

function readLocalData(): WorkNoteData {
  return loadWorkNoteData() as WorkNoteData;
}

function writeLocalData(data: WorkNoteData) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function readAllowedProfileCache(userId: string): boolean {
  try {
    const cached = JSON.parse(window.localStorage.getItem(ALLOWED_PROFILE_CACHE_KEY) || "{}") as { userId?: string; allowed?: boolean };
    return cached.userId === userId && cached.allowed === true;
  } catch {
    return false;
  }
}

function writeAllowedProfileCache(userId: string, allowed: boolean) {
  if (!allowed) {
    window.localStorage.removeItem(ALLOWED_PROFILE_CACHE_KEY);
    return;
  }
  window.localStorage.setItem(ALLOWED_PROFILE_CACHE_KEY, JSON.stringify({ userId, allowed: true, checkedAt: new Date().toISOString() }));
}