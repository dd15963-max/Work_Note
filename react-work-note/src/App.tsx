import {
  Archive,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  ExternalLink,
  FileText,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  WalletCards,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type PortalId = "schedule" | "company" | "sales" | "settlement" | "output" | "other" | "account";
type CalendarMode = "month" | "week";
type SalesPanelMode = "detail" | "company" | "files";
type AnyRecord = Record<string, unknown>;
type AttachmentCollectionKey = "companies" | "notes" | "settlementTasks" | "outputTasks" | "otherTasks";
type AttachmentOwnerType = "company" | "sales" | "settlement" | "output" | "other";

type WorkNoteData = {
  version: string;
  updatedAt: string;
  companies: AnyRecord[];
  notes: AnyRecord[];
  settlementTasks: AnyRecord[];
  outputTasks: AnyRecord[];
  otherTasks: AnyRecord[];
  accounts: AnyRecord[];
  loadedAt: string;
  error?: string;
};

type ScheduleItem = {
  id: string;
  date: string;
  title: string;
  detail: string;
  type: "sales" | "settlement" | "output" | "other";
  portal: Extract<PortalId, "sales" | "settlement" | "output" | "other">;
  recordKey: string;
  status: string;
  priority: string;
};

type AttachmentRecord = AnyRecord & {
  id: string;
  blob?: Blob;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
};

const STORAGE_KEY = "salesNoteAppDataV1";
const REACT_AUTOSNAPSHOT_KEY = "workNoteReactAutoSnapshotsV1";
const LEGACY_APP_PATH = "../sales-note-app/";
const ATTACHMENT_DB_NAME = "salesNoteAttachmentDbV1";
const ATTACHMENT_STORE_NAME = "files";
const ATTACHMENT_DB_VERSION = 1;
let zipCrcTable: Uint32Array | null = null;
const SALES_STATUS_OPTIONS = ["신규 문의", "1차 대응 완료", "미팅 예정", "샘플/BMT 진행", "검토 중", "수주 가능성 높음", "보류", "완료", "실패/종료"];
const SALES_ITEM_CATEGORY_OPTIONS = ["장비", "소재", "타사 장비", "타사 소재", "기타"];
const PRIORITY_OPTIONS = ["긴급", "높음", "보통", "낮음"];
const PURCHASE_POSSIBILITY_OPTIONS = ["미정", "낮음", "보통", "높음"];
const QUOTE_STATUS_OPTIONS = ["미진행", "발송 완료", "진행 중", "불필요"];
const REVENUE_TYPE_OPTIONS = ["장비 매출", "소재 매출", "타사 장비", "타사 소재", "기타"];

const FILE_CATEGORY_OPTIONS = [
  "견적서",
  "발송자료",
  "메일 캡처",
  "사업자등록증",
  "통장 사본",
  "회사 서류",
  "출력 파일",
  "정산자료",
  "세금계산서",
  "입금증",
  "샘플/BMT",
  "계약/발주",
  "기타 파일"
];
const WORK_STATUS_OPTIONS = ["대기", "진행 중", "확인 필요", "보류", "완료"];
const SETTLEMENT_STATUS_OPTIONS = ["예정", "선금 예정", "선금 완료", "차감 진행 중", "확인 필요", "보류", "완료"];
const SETTLEMENT_PAYMENT_OPTIONS = ["분할 결제", "선금 결제"];
const SETTLEMENT_ROW_STATUS_OPTIONS = ["예정", "청구 완료", "입금 완료", "차감 완료", "처리 완료", "확인 필요", "보류"];

const portals: Array<{ id: PortalId; label: string; icon: typeof CalendarDays }> = [
  { id: "schedule", label: "일정", icon: CalendarDays },
  { id: "company", label: "업체", icon: Building2 },
  { id: "sales", label: "영업", icon: BriefcaseBusiness },
  { id: "settlement", label: "정산", icon: WalletCards },
  { id: "output", label: "출력", icon: Printer },
  { id: "other", label: "기타", icon: ListChecks },
  { id: "account", label: "계정", icon: KeyRound }
];

const completedWords = ["완료", "종료", "실패", "취소"];
const highPriorityWords = ["긴급", "높음", "중요"];

export function App() {
  const [activePortal, setActivePortal] = useState<PortalId>("schedule");
  const [query, setQuery] = useState("");
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("month");
  const [calendarCursor, setCalendarCursor] = useState(() => startOfDay(new Date()));
  const [focusTarget, setFocusTarget] = useState<{ portal: PortalId; id: string; nonce: number } | null>(null);
  const [data, setData] = useState<WorkNoteData>(() => loadWorkNoteData());
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setData(loadWorkNoteData());
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const scheduleItems = useMemo(() => collectScheduleItems(data), [data]);
  const filteredScheduleItems = useMemo(
    () => scheduleItems.filter((item) => matchesText(item, query)),
    [scheduleItems, query]
  );
  const todayItems = useMemo(
    () => filteredScheduleItems.filter((item) => item.date === toDateKey(new Date())),
    [filteredScheduleItems]
  );
  const globalResults = useMemo(() => collectGlobalResults(data, query), [data, query]);
  const counts = useMemo(
    () => ({
      companies: data.companies.length,
      sales: data.notes.length,
      settlement: data.settlementTasks.length,
      output: data.outputTasks.length,
      other: data.otherTasks.length,
      account: data.accounts.length,
      today: todayItems.length,
      week: scheduleItems.filter((item) => isSameWeek(parseDate(item.date), new Date())).length
    }),
    [data, scheduleItems, todayItems.length]
  );

  const refreshData = () => setData(loadWorkNoteData());
  const openScheduleItem = (item: ScheduleItem) => {
    setQuery("");
    setFocusTarget({ portal: item.portal, id: item.recordKey, nonce: Date.now() });
    setActivePortal(item.portal);
  };
  const persistData = (updater: (current: WorkNoteData) => WorkNoteData, reason: string) => {
    try {
      const current = loadWorkNoteData();
      const saved = saveWorkNoteData(updater(current), reason);
      setData(saved);
      setSaveMessage(`${reason} 저장됨 · ${formatDateTime(saved.updatedAt)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveMessage(`저장 실패 · ${message}`);
      alert(`저장하지 못했습니다.\n${message}`);
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">WORK NOTE</p>
          <h1>업무 메모장</h1>
          <p className="header-note">
            일정, 영업, 정산, 출력, 업체와 계정을 한 곳에서 관리하는 업무 메모장입니다.
          </p>
        </div>
        <div className="header-actions">
          <StatusBadge data={data} />
          <BackupCenter data={data} setData={setData} setSaveMessage={setSaveMessage} />
          <button className="icon-text-button" type="button" onClick={refreshData}>
            <RefreshCw size={17} />
            새로고침
          </button>
          <a className="icon-text-button" href={LEGACY_APP_PATH}>
            이전 버전
            <ExternalLink size={16} />
          </a>
        </div>
      </header>

      <section className="safety-strip" aria-label="데이터 안전 안내">
        <ShieldCheck size={18} />
        <span>안전 저장 모드</span>
        <small>
          이 브라우저에 저장된 업무 데이터를 사용합니다. 교체/병합 불러오기 전에는 자동 스냅샷을 남기고, 전체 ZIP 백업으로 첨부 원본까지 보관할 수 있습니다.
          {saveMessage && <b> {saveMessage}</b>}
        </small>
      </section>

      <nav className="portal-nav" aria-label="업무 포탈">
        <div className="portal-nav-group schedule-group">
          <PortalButton id="schedule" activePortal={activePortal} setActivePortal={setActivePortal} />
        </div>
        <div className="portal-nav-group work-group">
          {(["sales", "settlement", "output", "other"] as PortalId[]).map((id) => (
            <PortalButton key={id} id={id} activePortal={activePortal} setActivePortal={setActivePortal} />
          ))}
        </div>
        <div className="portal-nav-group account-group">
          {(["company", "account"] as PortalId[]).map((id) => (
            <PortalButton key={id} id={id} activePortal={activePortal} setActivePortal={setActivePortal} />
          ))}
        </div>
      </nav>

      <section className="command-bar">
        <label className="search-box">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="업체, 영업, 계정, 일정, 담당자, 메모 통합 검색"
          />
        </label>
        <div className="command-meta">
          <span>{formatDateTime(data.loadedAt)} 읽음</span>
          {data.updatedAt && <span>기존 데이터 수정: {formatDateTime(data.updatedAt)}</span>}
        </div>
      </section>

      {query && (
        <section className="global-results" aria-label="통합 검색 결과">
          <div className="section-title-row">
            <h2>통합 검색</h2>
            <span>{globalResults.length}건</span>
          </div>
          <div className="result-grid">
            {globalResults.slice(0, 8).map((result) => (
              <button
                type="button"
                className="result-card"
                key={result.id}
                onClick={() => setActivePortal(result.portal)}
              >
                <strong>{result.title}</strong>
                <span>{result.meta}</span>
              </button>
            ))}
            {!globalResults.length && <EmptyState title="검색 결과 없음" detail="다른 검색어로 다시 확인해보세요." />}
          </div>
        </section>
      )}

      <main className="portal-content">
        {activePortal === "schedule" && (
          <SchedulePortal
            counts={counts}
            items={filteredScheduleItems}
            todayItems={todayItems}
            calendarCursor={calendarCursor}
            setCalendarCursor={setCalendarCursor}
            calendarMode={calendarMode}
            setCalendarMode={setCalendarMode}
            onOpenItem={openScheduleItem}
          />
        )}
        {activePortal === "company" && <CompanyPortal data={data} query={query} onPersist={persistData} />}
        {activePortal === "sales" && <SalesPortal data={data} query={query} onPersist={persistData} focusTarget={focusTarget} />}
        {activePortal === "settlement" && <GenericWorkPortal title="정산" records={data.settlementTasks} query={query} type="settlement" data={data} onPersist={persistData} focusTarget={focusTarget} />}
        {activePortal === "output" && <GenericWorkPortal title="출력" records={data.outputTasks} query={query} type="output" data={data} onPersist={persistData} focusTarget={focusTarget} />}
        {activePortal === "other" && <GenericWorkPortal title="기타" records={data.otherTasks} query={query} type="other" data={data} onPersist={persistData} focusTarget={focusTarget} />}
        {activePortal === "account" && <AccountPortal data={data} query={query} onPersist={persistData} />}
      </main>
    </div>
  );
}

function PortalButton({
  id,
  activePortal,
  setActivePortal
}: {
  id: PortalId;
  activePortal: PortalId;
  setActivePortal: (id: PortalId) => void;
}) {
  const portal = portals.find((item) => item.id === id)!;
  const Icon = portal.icon;
  return (
    <button
      className={`portal-button ${activePortal === id ? "is-active" : ""}`}
      type="button"
      onClick={() => setActivePortal(id)}
    >
      <Icon size={17} />
      {portal.label}
    </button>
  );
}

function EditorDrawer({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="editor-drawer-backdrop" onMouseDown={onClose}>
      <div className="editor-drawer" onMouseDown={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ data }: { data: WorkNoteData }) {
  if (data.error) {
    return (
      <span className="status-badge warning">
        <Archive size={16} />
        데이터 확인 필요
      </span>
    );
  }
  return (
    <span className="status-badge">
      <CheckCircle2 size={16} />
      로컬 데이터 연결
    </span>
  );
}

function BackupCenter({
  data,
  setData,
  setSaveMessage
}: {
  data: WorkNoteData;
  setData: (data: WorkNoteData) => void;
  setSaveMessage: (message: string) => void;
}) {
  const jsonInputRef = useRef<HTMLInputElement | null>(null);
  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const [jsonMode, setJsonMode] = useState<"replace" | "merge">("replace");
  const [zipMode, setZipMode] = useState<"replace" | "merge">("replace");
  const [busy, setBusy] = useState("");

  const finishImport = (message: string) => {
    const fresh = loadWorkNoteData();
    setData(fresh);
    setSaveMessage(`${message} · ${formatDateTime(fresh.updatedAt || fresh.loadedAt)}`);
  };

  const exportJson = () => {
    const payload = createBackupPayload(data, "manual-json");
    downloadJson(payload, `sales-note-backup-${getFilenameTimestamp()}.json`);
    setSaveMessage(`기록 백업 생성 · ${formatDateTime(new Date().toISOString())}`);
  };

  const exportZip = async () => {
    setBusy("전체 ZIP 생성 중");
    try {
      const result = await createFullBackupZipBlob(data);
      downloadBlob(result.blob, `work-note-full-backup-${getFilenameTimestamp()}.zip`, "application/zip");
      setSaveMessage(`전체 백업 생성 · 파일 ${result.totalCount - result.missingCount}/${result.totalCount}개 포함`);
      if (result.missingCount) {
        alert(`전체 백업 ZIP을 만들었지만 원본 파일 ${result.missingCount}개를 찾지 못했습니다.\n해당 파일은 기록만 백업됩니다.`);
      }
    } catch (error) {
      alert(`전체 백업 ZIP을 만들지 못했습니다.\n${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy("");
    }
  };

  const exportCsv = () => {
    downloadWorkNoteCsv(data);
    setSaveMessage(`CSV 내보내기 완료 · ${formatDateTime(new Date().toISOString())}`);
  };

  const auditAttachments = async () => {
    setBusy("첨부 원본 점검 중");
    try {
      const result = await auditAttachmentStorage(data);
      const message = `첨부 원본 점검 완료 · 원본 ${result.foundCount}/${result.totalCount}개 확인`;
      setSaveMessage(message);
      if (!result.totalCount) {
        alert("점검할 첨부 기록이 없습니다.");
      } else if (result.missing.length) {
        alert(`첨부 기록 ${result.totalCount}개 중 원본 파일 ${result.missing.length}개를 찾지 못했습니다.\n\n누락 예시:\n${result.missing.slice(0, 8).map((item) => `- ${item.ownerTitle} / ${item.fileName}`).join("\n")}\n\n누락된 파일은 JSON에는 기록만 남고, 전체 ZIP에도 원본이 포함되지 않습니다.`);
      } else {
        alert(`첨부 원본 ${result.totalCount}개를 모두 확인했습니다.`);
      }
    } catch (error) {
      alert(`첨부 원본을 점검하지 못했습니다.\n${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy("");
    }
  };

  const auditFullBackupZip = async () => {
    setBusy("ZIP 자체 점검 중");
    try {
      const result = await createFullBackupZipBlob(data);
      const parsed = await readFullBackupZip(result.blob);
      const expectedCounts = getBackupRecordCounts(data);
      const parsedCounts = getBackupRecordCounts(parsed.data);
      const countMismatches = compareBackupCounts(expectedCounts, parsedCounts);
      const expectedRestoredFiles = result.totalCount - result.missingCount;

      if (countMismatches.length || parsed.files.records.length !== expectedRestoredFiles) {
        const detail = [
          ...countMismatches,
          parsed.files.records.length !== expectedRestoredFiles
            ? `첨부 원본 수: 예상 ${expectedRestoredFiles}개 / 확인 ${parsed.files.records.length}개`
            : ""
        ].filter(Boolean).join("\n");
        throw new Error(detail || "ZIP 자체 점검 결과가 일치하지 않습니다.");
      }

      const message = `ZIP 자체 점검 완료 · 기록 ${Object.values(parsedCounts).reduce((sum, count) => sum + count, 0)}건, 원본 ${parsed.files.records.length}/${result.totalCount}개 확인`;
      setSaveMessage(message);
      alert(`${message}${result.missingCount ? `\n\n주의: 원본이 없는 첨부 ${result.missingCount}개는 기록만 확인됐습니다.` : ""}`);
    } catch (error) {
      alert(`ZIP 자체 점검에 실패했습니다.\n${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy("");
    }
  };

  const resetWorkspace = async () => {
    const ok = confirm("전체 메모장을 초기화할까요?\n\n영업, 정산, 출력, 기타, 업체, 계정 기록과 이 브라우저에 저장된 첨부 원본 파일이 모두 삭제됩니다.\n필요한 자료가 있으면 먼저 전체 ZIP 백업을 만들어 주세요.");
    if (!ok) return;

    setBusy("전체 초기화 중");
    try {
      await clearAttachmentStore();
      const emptyData = createEmptyWorkNoteData();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyData));
      window.localStorage.removeItem(REACT_AUTOSNAPSHOT_KEY);
      const fresh = loadWorkNoteData();
      setData(fresh);
      setSaveMessage(`전체 메모장 초기화 완료 · ${formatDateTime(fresh.updatedAt || fresh.loadedAt)}`);
      alert("전체 메모장을 초기화했습니다.");
    } catch (error) {
      alert(`전체 메모장을 초기화하지 못했습니다.\n${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy("");
    }
  };

  const chooseJson = (mode: "replace" | "merge") => {
    setJsonMode(mode);
    if (jsonInputRef.current) {
      jsonInputRef.current.value = "";
      jsonInputRef.current.click();
    }
  };

  const chooseZip = (mode: "replace" | "merge") => {
    setZipMode(mode);
    if (zipInputRef.current) {
      zipInputRef.current.value = "";
      zipInputRef.current.click();
    }
  };

  const handleJsonFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(jsonMode === "merge" ? "JSON 병합 중" : "JSON 교체 중");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as AnyRecord;
      const backupData = normalizeBackupToWorkNote(extractBackupData(parsed));
      validateWorkNotePayload(backupData);
      if (jsonMode === "merge") {
        if (!confirm(`JSON 백업을 현재 데이터에 병합할까요?\n\nJSON에는 원본 파일이 없어서 새 첨부자료는 파일명 기록만 들어옵니다.`)) return;
        const merged = mergeBackupData(loadWorkNoteData(), backupData);
        saveWorkNoteData(merged, "JSON 백업 병합");
        finishImport("JSON 병합 완료");
        return;
      }
      if (!confirm("JSON 백업으로 현재 데이터를 교체할까요?\n\n첨부 파일 원본은 JSON에 포함되지 않습니다. 필요한 경우 전체 ZIP 백업을 사용해 주세요.")) return;
      downloadPreImportBackup(loadWorkNoteData(), "before-json-replace");
      saveWorkNoteData(backupData, "JSON 백업 교체");
      finishImport("JSON 교체 완료");
    } catch (error) {
      alert(`JSON 백업을 불러오지 못했습니다.\n${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy("");
      event.target.value = "";
    }
  };

  const handleZipFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(zipMode === "merge" ? "ZIP 병합 중" : "ZIP 교체 중");
    try {
      const zipResult = await readFullBackupZip(file);
      if (zipMode === "merge") {
        if (!confirm(`전체 ZIP 백업을 현재 데이터에 병합할까요?\n\n복원 가능한 원본 파일: ${zipResult.files.records.length}개`)) return;
        const current = loadWorkNoteData();
        const merged = mergeBackupData(current, zipResult.data);
        await restoreZipAttachmentRecords(zipResult.files, merged);
        saveWorkNoteData(merged, "전체 ZIP 백업 병합");
        finishImport(`ZIP 병합 완료 · 파일 ${zipResult.files.records.length}개`);
        return;
      }
      if (!confirm(`전체 ZIP 백업으로 현재 데이터를 교체할까요?\n\n복원 가능한 원본 파일: ${zipResult.files.records.length}개`)) return;
      downloadPreImportBackup(loadWorkNoteData(), "before-zip-replace");
      const next = normalizeBackupToWorkNote(zipResult.data);
      await restoreZipAttachmentRecords(zipResult.files, next);
      saveWorkNoteData(next, "전체 ZIP 백업 교체");
      finishImport(`ZIP 교체 완료 · 파일 ${zipResult.files.records.length}개`);
    } catch (error) {
      alert(`전체 ZIP 백업을 불러오지 못했습니다.\n${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy("");
      event.target.value = "";
    }
  };

  return (
    <details className="backup-center">
      <summary className="icon-text-button">
        <Archive size={16} />
        백업 센터
      </summary>
      <div className="backup-center-panel">
        <div>
          <strong>내보내기</strong>
          <button type="button" onClick={exportJson} disabled={Boolean(busy)}>기록 백업 JSON</button>
          <button type="button" onClick={exportZip} disabled={Boolean(busy)}>전체 백업 ZIP</button>
        </div>
        <div>
          <strong>불러오기</strong>
          <button type="button" onClick={() => chooseJson("replace")} disabled={Boolean(busy)}>JSON 교체</button>
          <button type="button" onClick={() => chooseZip("replace")} disabled={Boolean(busy)}>ZIP 교체</button>
        </div>
        <div>
          <strong>병합</strong>
          <button type="button" onClick={() => chooseJson("merge")} disabled={Boolean(busy)}>JSON 병합</button>
          <button type="button" onClick={() => chooseZip("merge")} disabled={Boolean(busy)}>ZIP 병합</button>
        </div>
        <div>
          <strong>점검</strong>
          <button type="button" onClick={auditAttachments} disabled={Boolean(busy)}>첨부 원본 점검</button>
          <button type="button" onClick={auditFullBackupZip} disabled={Boolean(busy)}>ZIP 자체 점검</button>
        </div>
        <div>
          <strong>관리</strong>
          <button type="button" onClick={exportCsv} disabled={Boolean(busy)}>CSV 내보내기</button>
          <button className="danger" type="button" onClick={resetWorkspace} disabled={Boolean(busy)}>전체 초기화</button>
        </div>
        <small>{busy || "ZIP은 원본 파일까지, JSON은 기록만 저장합니다."}</small>
      </div>
      <input ref={jsonInputRef} type="file" accept="application/json,.json" hidden onChange={handleJsonFile} />
      <input ref={zipInputRef} type="file" accept="application/zip,.zip" hidden onChange={handleZipFile} />
    </details>
  );
}

function SchedulePortal({
  counts,
  items,
  todayItems,
  calendarCursor,
  setCalendarCursor,
  calendarMode,
  setCalendarMode,
  onOpenItem
}: {
  counts: Record<string, number>;
  items: ScheduleItem[];
  todayItems: ScheduleItem[];
  calendarCursor: Date;
  setCalendarCursor: (date: Date) => void;
  calendarMode: CalendarMode;
  setCalendarMode: (mode: CalendarMode) => void;
  onOpenItem: (item: ScheduleItem) => void;
}) {
  return (
    <div className="schedule-layout">
      <section className="schedule-main">
        <div className="summary-grid">
          <MetricCard label="오늘 업무" value={counts.today} />
          <MetricCard label="이번 주 일정" value={counts.week} />
          <MetricCard label="영업" value={counts.sales} />
          <MetricCard label="전체 업무" value={counts.settlement + counts.output + counts.other} />
        </div>
        <div className="panel calendar-panel">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">CALENDAR</p>
              <h2>{formatMonthTitle(calendarCursor)}</h2>
            </div>
            <div className="toolbar-cluster">
              <button type="button" onClick={() => setCalendarCursor(moveCalendar(calendarCursor, calendarMode, -1))}>
                이전
              </button>
              <button type="button" onClick={() => setCalendarCursor(startOfDay(new Date()))}>
                오늘
              </button>
              <button type="button" onClick={() => setCalendarCursor(moveCalendar(calendarCursor, calendarMode, 1))}>
                다음
              </button>
              <div className="segmented">
                <button
                  type="button"
                  className={calendarMode === "month" ? "is-active" : ""}
                  onClick={() => setCalendarMode("month")}
                >
                  월간
                </button>
                <button
                  type="button"
                  className={calendarMode === "week" ? "is-active" : ""}
                  onClick={() => setCalendarMode("week")}
                >
                  주간
                </button>
              </div>
            </div>
          </div>
          <CalendarGrid cursor={calendarCursor} mode={calendarMode} items={items} onOpenItem={onOpenItem} />
        </div>
      </section>
      <aside className="today-panel panel">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">TODAY</p>
            <h2>오늘 일정</h2>
          </div>
          <span>{todayItems.length}건</span>
        </div>
        <div className="today-list">
          {todayItems.map((item) => (
            <ScheduleListItem item={item} key={item.id} onOpenItem={onOpenItem} />
          ))}
          {!todayItems.length && <EmptyState title="오늘 일정 없음" detail="오늘 날짜에 연결된 업무가 없습니다." />}
        </div>
      </aside>
    </div>
  );
}

function CalendarGrid({ cursor, mode, items, onOpenItem }: { cursor: Date; mode: CalendarMode; items: ScheduleItem[]; onOpenItem: (item: ScheduleItem) => void }) {
  const days = mode === "month" ? getCalendarMonthDays(cursor) : getCalendarWeekDays(cursor);
  const itemsByDate = groupByDate(items);
  return (
    <div className={`calendar-grid ${mode === "week" ? "week-mode" : ""}`}>
      {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
        <div className="calendar-weekday" key={day}>
          {day}
        </div>
      ))}
      {days.map((day) => {
        const key = toDateKey(day);
        const dayItems = itemsByDate.get(key) || [];
        const muted = mode === "month" && day.getMonth() !== cursor.getMonth();
        return (
          <div className={`calendar-cell ${muted ? "is-muted" : ""} ${key === toDateKey(new Date()) ? "is-today" : ""}`} key={key}>
            <strong>{day.getDate()}</strong>
            <div className="calendar-items">
              {dayItems.slice(0, mode === "week" ? 8 : 3).map((item) => (
                <button type="button" className={`calendar-chip ${item.type}`} key={item.id} title={`${item.title} ${item.detail}`} onClick={() => onOpenItem(item)}>
                  {item.title}
                </button>
              ))}
              {dayItems.length > (mode === "week" ? 8 : 3) && <small>+{dayItems.length - (mode === "week" ? 8 : 3)}</small>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScheduleListItem({ item, onOpenItem }: { item: ScheduleItem; onOpenItem: (item: ScheduleItem) => void }) {
  return (
    <button type="button" className={`schedule-list-item ${item.type}`} onClick={() => onOpenItem(item)}>
      <div>
        <strong>{item.title}</strong>
        <p>{item.detail || "상세 내용 없음"}</p>
      </div>
      <div className="stacked-meta">
        <span>{formatDateForDisplay(item.date)}</span>
        {item.status && <small>{item.status}</small>}
      </div>
    </button>
  );
}

function CompanyPortal({
  data,
  query,
  onPersist
}: {
  data: WorkNoteData;
  query: string;
  onPersist: (updater: (current: WorkNoteData) => WorkNoteData, reason: string) => void;
}) {
  const [editingCompany, setEditingCompany] = useState<AnyRecord | null>(null);
  const [companyFilePanel, setCompanyFilePanel] = useState<string | null>(null);
  const companyFiles = createAttachmentHandlers({
    data,
    onPersist,
    collectionKey: "companies",
    ownerType: "company",
    reasonLabel: "업체 파일"
  });
  const companies = data.companies
    .map((company, originalIndex) => ({ company, originalIndex, id: recordId(company, originalIndex) }))
    .filter(({ company }) => matchesRecord(company, query));
  const saveCompany = (draft: AnyRecord) => {
    const normalized = normalizeCompanyDraft(draft);
    const normalizedName = firstText(normalized, ["name"]);
    const normalizedId = firstText(normalized, ["id"]);
    if (!normalizedName) {
      alert("업체명을 입력해 주세요.");
      return;
    }

    const similar = findSimilarCompanies(data.companies, normalizedName, normalizedId);
    if (similar.length && !confirm(`비슷한 업체명이 있습니다.\n\n${similar.map(companyName).join("\n")}\n\n그래도 저장할까요?`)) {
      return;
    }

    onPersist((current) => {
      const now = new Date().toISOString();
      const previous = current.companies.find((company, index) => recordId(company, index) === normalized.id);
      const company = {
        ...previous,
        ...normalized,
        attachments: previous ? asArray(previous.attachments) : asArray(draft.attachments),
        history: previous ? asArray(previous.history) : [],
        createdAt: firstText(previous || ({} as AnyRecord), ["createdAt"]) || now,
        updatedAt: now
      };
      const exists = current.companies.some((item, index) => recordId(item, index) === normalized.id);
      return {
        ...current,
        companies: exists
          ? current.companies.map((item, index) => (recordId(item, index) === normalized.id ? company : item))
          : [company, ...current.companies]
      };
    }, firstText(draft, ["id"]) ? "업체 수정" : "업체 등록");
    setEditingCompany(null);
  };

  const deleteCompany = (company: AnyRecord, index: number) => {
    const id = recordId(company, index);
    const name = companyName(company) || "선택한 업체";
    const linkedCount = countLinkedCompanyRecords(data, id);
    const attachmentCount = asArray(company.attachments).length;
    const message = [
      `${name} 업체를 삭제할까요?`,
      linkedCount ? `연결된 영업/업무 ${linkedCount}건은 업체명 텍스트만 남기고 연결을 해제합니다.` : "",
      attachmentCount ? `업체 서류 기록 ${attachmentCount}개도 목록에서 제거됩니다. 원본 파일 Blob 삭제는 추후 파일 관리 단계에서 처리합니다.` : ""
    ].filter(Boolean).join("\n");
    if (!confirm(message)) return;

    onPersist((current) => ({
      ...current,
      companies: current.companies.filter((item, itemIndex) => recordId(item, itemIndex) !== id),
      notes: clearCompanyLinks(current.notes, id, name),
      settlementTasks: clearCompanyLinks(current.settlementTasks, id, name),
      outputTasks: clearCompanyLinks(current.outputTasks, id, name),
      otherTasks: clearCompanyLinks(current.otherTasks, id, name)
    }), "업체 삭제");
  };

  return (
    <section className="panel">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">COMPANIES</p>
          <h2>업체 관리</h2>
        </div>
        <div className="toolbar-cluster">
          <span className="count-label">{companies.length}개</span>
          <button type="button" onClick={() => setEditingCompany(createBlankCompany())}>
            <Plus size={16} />
            새 업체
          </button>
        </div>
      </div>
      {editingCompany && (
        <EditorDrawer onClose={() => setEditingCompany(null)}>
          <CompanyEditor
            draft={editingCompany}
            setDraft={setEditingCompany}
            onSave={saveCompany}
            onCancel={() => setEditingCompany(null)}
          />
        </EditorDrawer>
      )}
      <div className="card-grid">
        {companies.map(({ company, originalIndex, id }) => {
          const contacts = asArray(company.contacts);
          const primaryContactIndex = contacts.findIndex((contact) => Boolean(contact.isPrimary));
          const visibleContactIndex = primaryContactIndex >= 0 ? primaryContactIndex : 0;
          const primaryContact = contacts[visibleContactIndex] || null;
          const extraContacts = contacts.filter((_, contactIndex) => contactIndex !== visibleContactIndex);
          const attachments = asArray(company.attachments);
          return (
            <article className="company-card" key={id}>
              <div className="card-heading">
                <strong>{companyName(company) || "업체명 미입력"}</strong>
                <Badge>{firstText(company, ["status", "dealStatus", "tradeStatus"]) || "상태 미정"}</Badge>
              </div>
              <InfoLine label="사업자" value={firstText(company, ["businessNumber"])} />
              <InfoLine label="대표" value={firstText(company, ["representative", "representativeName", "ceoName", "owner"])} />
              <InfoLine label="업종" value={firstText(company, ["businessType", "industry", "category"])} />
              <InfoLine label="연락처" value={firstText(company, ["phone", "mainPhone", "contact"])} />
              <InfoLine label="이메일" value={firstText(company, ["email", "mainEmail"])} />
              <InfoLine label="주소" value={firstText(company, ["address"])} />
              <InfoLine label="서류" value={attachments.length ? `${attachments.length}개` : ""} />
              <InfoLine label="담당자" value={primaryContact ? companyContactSummary(primaryContact) : ""} />
              {extraContacts.length > 0 && (
                <details className="company-contact-details">
                  <summary>추가 담당자 {extraContacts.length}명</summary>
                  <div>
                    {extraContacts.map((contact, contactIndex) => (
                      <span key={recordId(contact, contactIndex)}>{companyContactSummary(contact) || "담당자"}</span>
                    ))}
                  </div>
                </details>
              )}
              <AttachmentPreview record={company} />
              {firstText(company, ["memo"]) && <p className="muted-preview">{firstText(company, ["memo"])}</p>}
              <div className="card-actions">
                <button type="button" onClick={() => setCompanyFilePanel(companyFilePanel === id ? null : id)}>
                  <FileText size={15} />
                  파일 {attachments.length}
                </button>
                <button type="button" onClick={() => setEditingCompany(prepareCompanyDraft(company, originalIndex))}>
                  <Pencil size={15} />
                  수정
                </button>
                <button type="button" className="danger-button" onClick={() => deleteCompany(company, originalIndex)}>
                  <Trash2 size={15} />
                  삭제
                </button>
              </div>
              {companyFilePanel === id && (
                <div className="inline-file-panel">
                  <SalesFileManager
                    noteId={id}
                    attachments={attachments}
                    onUpload={companyFiles.uploadAttachments}
                    onUpdateMeta={companyFiles.updateAttachmentMeta}
                    onDelete={companyFiles.deleteAttachment}
                    emptyDetail="사업자등록증, 통장 사본, 회사 서류 같은 업체 자료를 업로드해 두면 다시 다운로드할 수 있습니다."
                  />
                </div>
              )}
            </article>
          );
        })}
        {!companies.length && <EmptyState title="업체 없음" detail="검색 조건에 맞는 업체가 없습니다." />}
      </div>
    </section>
  );
}

function CompanyEditor({
  draft,
  setDraft,
  onSave,
  onCancel
}: {
  draft: AnyRecord;
  setDraft: (draft: AnyRecord) => void;
  onSave: (draft: AnyRecord) => void;
  onCancel: () => void;
}) {
  const contacts = asArray(draft.contacts);
  const updateField = (key: string, value: string) => setDraft({ ...draft, [key]: value });
  const updateContact = (index: number, key: string, value: string) => {
    setDraft({
      ...draft,
      contacts: contacts.map((contact, contactIndex) => (contactIndex === index ? { ...contact, [key]: value } : contact))
    });
  };
  const addContact = () => {
    setDraft({
      ...draft,
      contacts: [...contacts, { id: createId("contact_"), name: "", department: "", title: "", phone: "", email: "", memo: "" }]
    });
  };
  const removeContact = (index: number) => {
    setDraft({ ...draft, contacts: contacts.filter((_, contactIndex) => contactIndex !== index) });
  };

  return (
    <section className="editor-panel">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">COMPANY MASTER</p>
          <h2>{firstText(draft, ["id"]) ? "업체 수정" : "업체 등록"}</h2>
        </div>
        <button type="button" onClick={onCancel} aria-label="업체 편집 닫기">
          <X size={17} />
        </button>
      </div>
      <div className="form-grid">
        <TextField label="업체명" value={firstText(draft, ["name"])} onChange={(value) => updateField("name", value)} placeholder="예: 예시테크" />
        <TextField label="사업자번호" value={firstText(draft, ["businessNumber"])} onChange={(value) => updateField("businessNumber", value)} placeholder="000-00-00000" />
        <TextField label="대표자명" value={firstText(draft, ["representative"])} onChange={(value) => updateField("representative", value)} placeholder="예: 홍길동" />
        <TextField label="업종/분류" value={firstText(draft, ["businessType"])} onChange={(value) => updateField("businessType", value)} placeholder="예: 제조, 연구소, 병원" />
        <label className="field">
          <span>거래 상태</span>
          <select value={firstText(draft, ["status"]) || "검토중"} onChange={(event) => updateField("status", event.target.value)}>
            {["검토중", "거래중", "보류", "종료"].map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </label>
        <TextField label="대표 연락처" value={firstText(draft, ["mainPhone"])} onChange={(value) => updateField("mainPhone", value)} placeholder="010-0000-0000" />
        <TextField label="대표 이메일" value={firstText(draft, ["mainEmail"])} onChange={(value) => updateField("mainEmail", value)} placeholder="company@example.com" />
        <TextField label="주소" value={firstText(draft, ["address"])} onChange={(value) => updateField("address", value)} placeholder="주소" wide />
        <TextAreaField label="메모" value={firstText(draft, ["memo"])} onChange={(value) => updateField("memo", value)} placeholder="업체 관련 메모" wide />
      </div>
      <div className="editor-subsection">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">CONTACTS</p>
            <h2>담당자</h2>
          </div>
          <button type="button" onClick={addContact}>
            <Plus size={16} />
            담당자 추가
          </button>
        </div>
        <div className="contact-editor-list">
          {contacts.map((contact, index) => (
            <div className="contact-editor-row" key={recordId(contact, index)}>
              <TextField label="담당자명" value={firstText(contact, ["name"])} onChange={(value) => updateContact(index, "name", value)} placeholder="예: 홍길동" />
              <TextField label="부서" value={firstText(contact, ["department"])} onChange={(value) => updateContact(index, "department", value)} placeholder="예: 구매팀" />
              <TextField label="직함" value={firstText(contact, ["title"])} onChange={(value) => updateContact(index, "title", value)} placeholder="예: 책임" />
              <TextField label="연락처" value={firstText(contact, ["phone"])} onChange={(value) => updateContact(index, "phone", value)} placeholder="010-0000-0000" />
              <TextField label="이메일" value={firstText(contact, ["email"])} onChange={(value) => updateContact(index, "email", value)} placeholder="name@example.com" />
              <TextField label="메모" value={firstText(contact, ["memo"])} onChange={(value) => updateContact(index, "memo", value)} placeholder="역할, 주의사항" />
              <button type="button" className="danger-button contact-remove-button" onClick={() => removeContact(index)}>
                <Trash2 size={15} />
                삭제
              </button>
            </div>
          ))}
          {!contacts.length && <EmptyState title="담당자 없음" detail="필요하면 담당자를 추가해 주세요." />}
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="icon-text-button primary" onClick={() => onSave(draft)}>
          저장
        </button>
        <button type="button" className="icon-text-button" onClick={onCancel}>
          취소
        </button>
      </div>
    </section>
  );
}

function SalesPortal({
  data,
  query,
  onPersist,
  focusTarget
}: {
  data: WorkNoteData;
  query: string;
  onPersist: (updater: (current: WorkNoteData) => WorkNoteData, reason: string) => void;
  focusTarget: { portal: PortalId; id: string; nonce?: number } | null;
}) {
  const [salesPanel, setSalesPanel] = useState<{ id: string; mode: SalesPanelMode } | null>(null);
  const [editingNote, setEditingNote] = useState<AnyRecord | null>(null);
  const handledFocusTargetRef = useRef("");
  const notes = useMemo(
    () =>
      data.notes
        .filter((note) => matchesRecord(note, query))
        .sort((a, b) => priorityScore(b) - priorityScore(a) || compareDate(firstText(b, ["updatedAt"]), firstText(a, ["updatedAt"]))),
    [data.notes, query]
  );

  useEffect(() => {
    if (focusTarget?.portal !== "sales") return;
    const focusKey = `${focusTarget.portal}:${focusTarget.id}:${focusTarget.nonce ?? ""}`;
    if (handledFocusTargetRef.current === focusKey) return;
    const exists = notes.some((note, index) => recordId(note, index) === focusTarget.id);
    if (!exists) return;
    handledFocusTargetRef.current = focusKey;
    setSalesPanel((current) => (current?.id === focusTarget.id && current.mode === "detail" ? current : { id: focusTarget.id, mode: "detail" }));
    scrollRecordIntoView(focusTarget.id);
  }, [focusTarget, notes]);

  const toggleSalesPanel = (id: string, mode: SalesPanelMode) => {
    setSalesPanel((current) => (current?.id === id && current.mode === mode ? null : { id, mode }));
  };

  const updateSalesQuickField = (id: string, key: string, value: string) => {
    onPersist((current) => {
      const now = new Date().toISOString();
      return {
        ...current,
        notes: current.notes.map((item, itemIndex) =>
          recordId(item, itemIndex) === id
            ? {
                ...item,
                [key]: value,
                updatedAt: now
              }
            : item
        )
      };
    }, "영업 목록 빠른 수정");
  };

  const saveNote = (draft: AnyRecord) => {
    const normalized = normalizeSalesDraft(draft, data.companies);
    if (!normalized.company && !normalized.companyUnknown) {
      alert("업체를 선택하거나 미정을 체크해 주세요.");
      return;
    }

    onPersist((current) => {
      const now = new Date().toISOString();
      const previous = current.notes.find((note, index) => recordId(note, index) === normalized.id);
      const note = {
        ...previous,
        ...normalized,
        attachments: previous ? asArray(previous.attachments) : asArray(draft.attachments),
        history: previous ? asArray(previous.history) : [],
        createdAt: firstText(previous || {}, ["createdAt"]) || now,
        updatedAt: now
      };
      const exists = current.notes.some((item, index) => recordId(item, index) === normalized.id);
      return {
        ...current,
        notes: exists
          ? current.notes.map((item, index) => (recordId(item, index) === normalized.id ? note : item))
          : [note, ...current.notes]
      };
    }, firstText(draft, ["id"]) ? "영업 메모 수정" : "영업 메모 등록");
    setEditingNote(null);
  };

  const deleteNote = (note: AnyRecord, index: number) => {
    const id = recordId(note, index);
    const label = salesCustomer(note);
    const attachmentCount = asArray(note.attachments).length;
    const message = [
      `${label} 영업 메모를 삭제할까요?`,
      attachmentCount ? `첨부자료 기록 ${attachmentCount}개도 목록에서 제거됩니다. 원본 파일 Blob 삭제는 추후 파일 관리 단계에서 처리합니다.` : ""
    ].filter(Boolean).join("\n");
    if (!confirm(message)) return;
    onPersist((current) => ({
      ...current,
      notes: current.notes.filter((item, itemIndex) => recordId(item, itemIndex) !== id)
    }), "영업 메모 삭제");
    if (salesPanel?.id === id) setSalesPanel(null);
  };

  const updateSalesAttachments = (
    noteId: string,
    updater: (attachments: AnyRecord[]) => AnyRecord[],
    reason: string
  ) => {
    onPersist((current) => {
      const now = new Date().toISOString();
      return {
        ...current,
        notes: current.notes.map((item, itemIndex) =>
          recordId(item, itemIndex) === noteId
            ? {
                ...item,
                attachments: updater(asArray(item.attachments)),
                updatedAt: now
              }
            : item
        )
      };
    }, reason);
  };

  const uploadSalesAttachments = async (
    noteId: string,
    files: File[],
    meta: { category: string; sentDate: string; memo: string }
  ) => {
    if (!files.length) {
      alert("업로드할 파일을 선택해 주세요.");
      return;
    }

    const uploadedAt = new Date().toISOString();
    const records = files.map((file) => {
      const id = createId("file_");
      const attachmentMeta: AttachmentRecord = {
        id,
        ownerType: "sales",
        ownerId: noteId,
        fileName: file.name,
        name: file.name,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
        category: meta.category,
        sentDate: meta.sentDate,
        memo: meta.memo,
        uploadedAt
      };
      return { meta: attachmentMeta, record: { ...attachmentMeta, blob: file } };
    });

    try {
      await Promise.all(records.map(({ record }) => putAttachmentRecord(record)));
      updateSalesAttachments(noteId, (attachments) => [...attachments, ...records.map(({ meta }) => meta)], "영업 파일 업로드");
    } catch (error) {
      alert(`파일을 저장하지 못했습니다.\n${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const updateSalesAttachmentMeta = async (
    noteId: string,
    attachmentKey: string,
    values: { category: string; sentDate: string; memo: string }
  ) => {
    let updatedAttachment: AnyRecord | null = null;
    updateSalesAttachments(
      noteId,
      (attachments) =>
        attachments.map((attachment, attachmentIndex) => {
          if (recordId(attachment, attachmentIndex) !== attachmentKey) return attachment;
          updatedAttachment = { ...attachment, ...values };
          return updatedAttachment;
        }),
      "영업 파일 정보 수정"
    );

    const nextAttachmentMeta = updatedAttachment as AnyRecord | null;
    const attachmentId = nextAttachmentMeta ? firstText(nextAttachmentMeta, ["id"]) : "";
    if (!attachmentId) return;
    try {
      const stored = await getAttachmentRecord(attachmentId);
      if (stored?.blob) {
        await putAttachmentRecord({ ...stored, ...nextAttachmentMeta, blob: stored.blob });
      }
    } catch {
      // Metadata is still saved in localStorage. The original blob can be restored by importing a full ZIP backup.
    }
  };

  const deleteSalesAttachment = async (noteId: string, attachmentKey: string) => {
    if (!confirm("이 파일을 파일함에서 삭제할까요? 원본 파일도 이 브라우저 저장소에서 삭제됩니다.")) return;
    const targetNote = data.notes.find((item, itemIndex) => recordId(item, itemIndex) === noteId);
    const targetAttachment = asArray(targetNote?.attachments).find((attachment, attachmentIndex) => recordId(attachment, attachmentIndex) === attachmentKey);
    const attachmentId = targetAttachment ? firstText(targetAttachment, ["id"]) : "";

    try {
      if (attachmentId) await deleteAttachmentRecord(attachmentId);
      updateSalesAttachments(
        noteId,
        (attachments) => attachments.filter((attachment, attachmentIndex) => recordId(attachment, attachmentIndex) !== attachmentKey),
        "영업 파일 삭제"
      );
    } catch (error) {
      alert(`파일을 삭제하지 못했습니다.\n${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <section className="panel">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">SALES</p>
          <h2>영업 메모</h2>
        </div>
        <div className="toolbar-cluster">
          <span className="count-label">{notes.length}건</span>
          <button type="button" onClick={() => setEditingNote(createBlankSalesNote())}>
            <Plus size={16} />
            새 메모
          </button>
        </div>
      </div>
      {editingNote && (
        <EditorDrawer onClose={() => setEditingNote(null)}>
          <SalesEditor
            draft={editingNote}
            setDraft={setEditingNote}
            data={data}
            onSave={saveNote}
            onCancel={() => setEditingNote(null)}
          />
        </EditorDrawer>
      )}
      <div className="responsive-table">
        <div className="table-header sales-grid">
          <span>고객/연락처</span>
          <span>진행</span>
          <span>구분</span>
          <span>중요도</span>
          <span>현황</span>
          <span>다음 액션</span>
          <span>일정</span>
          <span>관리</span>
        </div>
        {notes.map((note, index) => {
          const id = recordId(note, index);
          const activeMode = salesPanel?.id === id ? salesPanel.mode : null;
          const expanded = Boolean(activeMode);
          const linkedCompany = getLinkedCompanyForSales(note, data.companies);
          const attachments = asArray(note.attachments);
          return (
            <div className={`sales-row-group ${focusTarget?.portal === "sales" && focusTarget.id === id ? "is-focus-target" : ""}`} key={id} data-record-id={id}>
              <article
                className={`table-row sales-grid clickable-row ${expanded ? "is-expanded" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => toggleSalesPanel(id, "detail")}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleSalesPanel(id, "detail");
                  }
                }}
              >
                <div>
                  <strong>{salesCustomer(note)}</strong>
                  <div className="contact-lines">
                    <span>{firstText(note, ["contactName", "managerName"]) || "담당자 미입력"}</span>
                    <span>{firstText(note, ["contactPhone", "phone", "contact", "mobile"]) || "연락처 미입력"}</span>
                    <span>{firstText(note, ["contactEmail", "email"]) || "이메일 미입력"}</span>
                  </div>
                </div>
                <div onClick={(event) => event.stopPropagation()}>
                  <select
                    className="quick-select tone-blue"
                    value={salesStatus(note) || SALES_STATUS_OPTIONS[0]}
                    onChange={(event) => updateSalesQuickField(id, "status", event.target.value)}
                  >
                    {SALES_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
                <div onClick={(event) => event.stopPropagation()}>
                  <select
                    className="quick-select tone-green"
                    value={salesCategory(note) || SALES_ITEM_CATEGORY_OPTIONS[0]}
                    onChange={(event) => updateSalesQuickField(id, "itemCategory", event.target.value)}
                  >
                    {SALES_ITEM_CATEGORY_OPTIONS.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                <div onClick={(event) => event.stopPropagation()}>
                  <select
                    className={`quick-select tone-${priorityTone(salesPriority(note))}`}
                    value={salesPriority(note) || "보통"}
                    onChange={(event) => updateSalesQuickField(id, "priority", event.target.value)}
                  >
                    {PRIORITY_OPTIONS.map((priority) => (
                      <option key={priority} value={priority}>{priority}</option>
                    ))}
                  </select>
                </div>
                <div className="compact-lines sales-status-lines">
                  <InfoLine label="관심제품" value={salesInterest(note) || "-"} />
                  <InfoLine label="견적여부" value={firstText(note, ["quoteStatus"]) || "미입력"} />
                  <InfoLine label="구매가능성" value={firstText(note, ["purchasePossibility"]) || "미입력"} />
                  {hasAmountValue(firstText(note, ["expectedRevenueAmount"])) && (
                    <InfoLine label="예상매출" value={formatMoneyWithVat(firstText(note, ["expectedRevenueAmount"]), note.expectedRevenueVatIncluded)} />
                  )}
                  {(hasAmountValue(firstText(note, ["revenueAmount"])) || firstText(note, ["revenueType"])) && (
                    <InfoLine label="매출" value={formatRevenueForDisplay(note)} />
                  )}
                  <InfoLine label="관련자료" value={attachmentCountText(note)} />
                </div>
                <div className="next-action-cell">
                  <strong>{firstText(note, ["nextAction", "action"]) || "다음 액션 미입력"}</strong>
                </div>
                <div className="compact-lines sales-status-lines">
                  <InfoLine label="다음연락" value={formatNextContact(note)} />
                  {(salesStatus(note) === "미팅 예정" || firstText(note, ["meetingDate"])) && (
                    <InfoLine label="미팅일정" value={formatOptionalDate(firstText(note, ["meetingDate"])) || "-"} />
                  )}
                  <InfoLine label="최근연락" value={formatOptionalDate(firstText(note, ["lastContactDate"])) || "-"} />
                </div>
                <div className="sales-management-actions" onClick={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => toggleSalesPanel(id, "company")}
                    aria-expanded={activeMode === "company"}
                    disabled={!linkedCompany && !salesCustomer(note)}
                  >
                    업체
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSalesPanel(id, "files")}
                    aria-expanded={activeMode === "files"}
                  >
                    파일 {attachments.length}
                  </button>

                  <button type="button" onClick={() => setEditingNote(prepareSalesDraft(note, index))}>
                    수정
                  </button>
                  <button type="button" className="danger-button" onClick={() => deleteNote(note, index)}>
                    삭제
                  </button>
                  <small>{formatDateTime(firstText(note, ["updatedAt"]))}</small>
                </div>
              </article>
              {expanded && (
                <SalesDetailPanel
                  note={note}
                  company={linkedCompany}
                  mode={activeMode || "detail"}
                  noteId={id}
                  onUploadAttachments={uploadSalesAttachments}
                  onUpdateAttachmentMeta={updateSalesAttachmentMeta}
                  onDeleteAttachment={deleteSalesAttachment}
                />
              )}
            </div>
          );
        })}
        {!notes.length && <EmptyState title="영업 메모 없음" detail="검색 조건에 맞는 영업 메모가 없습니다." />}
      </div>
    </section>
  );
}

function SalesEditor({
  draft,
  setDraft,
  data,
  onSave,
  onCancel
}: {
  draft: AnyRecord;
  setDraft: (draft: AnyRecord) => void;
  data: WorkNoteData;
  onSave: (draft: AnyRecord) => void;
  onCancel: () => void;
}) {
  const selectedCompany = firstText(draft, ["companyId"])
    ? data.companies.find((company, index) => recordId(company, index) === firstText(draft, ["companyId"]))
    : null;
  const contacts = selectedCompany ? asArray(selectedCompany.contacts) : [];
  const [companySearch, setCompanySearch] = useState("");
  const companyOptions = useMemo(
    () => data.companies.filter((company) => matchesText(company, companySearch)).slice(0, 80),
    [data.companies, companySearch]
  );
  const updateField = (key: string, value: string | boolean) => setDraft({ ...draft, [key]: value });

  const selectCompany = (value: string) => {
    if (value === "__unknown") {
      setDraft({ ...draft, companyId: "", contactId: "", companyUnknown: true, company: "", contactName: "", contactPhone: "", contactEmail: "" });
      return;
    }
    const company = data.companies.find((item, index) => recordId(item, index) === value) || null;
    const primaryContact = company ? asArray(company.contacts).find((contact) => Boolean(contact.isPrimary)) || asArray(company.contacts)[0] : null;
    setDraft({
      ...draft,
      companyId: value,
      contactId: primaryContact ? recordId(primaryContact, 0) : "",
      companyUnknown: false,
      company: company ? companyName(company) : firstText(draft, ["company"]),
      contactName: primaryContact ? firstText(primaryContact, ["name", "contactName"]) : firstText(draft, ["contactName"]),
      contactPhone: primaryContact ? firstText(primaryContact, ["phone", "contactPhone"]) : firstText(draft, ["contactPhone"]),
      contactEmail: primaryContact ? firstText(primaryContact, ["email", "contactEmail"]) : firstText(draft, ["contactEmail"])
    });
  };

  const selectContact = (value: string) => {
    const contact = contacts.find((item, index) => recordId(item, index) === value) || null;
    setDraft({
      ...draft,
      contactId: value,
      contactName: contact ? firstText(contact, ["name", "contactName"]) : firstText(draft, ["contactName"]),
      contactPhone: contact ? firstText(contact, ["phone", "contactPhone"]) : firstText(draft, ["contactPhone"]),
      contactEmail: contact ? firstText(contact, ["email", "contactEmail"]) : firstText(draft, ["contactEmail"])
    });
  };

  return (
    <section className="editor-panel">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">SALES NOTE</p>
          <h2>{firstText(draft, ["id"]) ? "영업 메모 수정" : "영업 메모 등록"}</h2>
        </div>
        <button type="button" onClick={onCancel} aria-label="영업 메모 편집 닫기">
          <X size={17} />
        </button>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>업체 검색</span>
          <input
            type="search"
            value={companySearch}
            onChange={(event) => setCompanySearch(event.target.value)}
            placeholder="업체명, 담당자, 연락처, 이메일"
          />
        </label>
        <label className="field">
          <span>업체 선택</span>
          <select
            value={draft.companyUnknown ? "__unknown" : firstText(draft, ["companyId"])}
            onChange={(event) => selectCompany(event.target.value)}
          >
            <option value="">직접 입력 / 연결 안 함</option>
            <option value="__unknown">미정</option>
            {companyOptions.map((company, index) => (
              <option key={recordId(company, index)} value={recordId(company, index)}>
                {companyName(company) || "업체명 미입력"}
              </option>
            ))}
          </select>
        </label>
        <div className="selection-summary wide-field">
          <strong>{selectedCompany ? companyName(selectedCompany) : (draft.companyUnknown ? "업체 미정" : "직접 입력")}</strong>
          <span>
            {[firstText(draft, ["contactName"]), firstText(draft, ["contactPhone"]), firstText(draft, ["contactEmail"])]
              .filter(Boolean)
              .join(" · ") || "담당자 정보 없음"}
          </span>
        </div>
        <TextField label="고객/업체명" value={firstText(draft, ["company"])} onChange={(value) => updateField("company", value)} placeholder="업체명 또는 고객명" />
        {contacts.length > 0 && (
          <label className="field">
            <span>담당자 선택</span>
            <select value={firstText(draft, ["contactId"])} onChange={(event) => selectContact(event.target.value)}>
              <option value="">직접 입력</option>
              {contacts.map((contact, index) => (
                <option key={recordId(contact, index)} value={recordId(contact, index)}>
                  {companyContactSummary(contact) || "담당자"}
                </option>
              ))}
            </select>
          </label>
        )}
        <TextField label="담당자" value={firstText(draft, ["contactName"])} onChange={(value) => updateField("contactName", value)} placeholder="담당자명" />
        <TextField label="연락처" value={firstText(draft, ["contactPhone"])} onChange={(value) => updateField("contactPhone", value)} placeholder="010-0000-0000" />
        <TextField label="이메일" value={firstText(draft, ["contactEmail"])} onChange={(value) => updateField("contactEmail", value)} placeholder="name@example.com" />
        <TextField label="관심 장비/소재" value={firstText(draft, ["interest"])} onChange={(value) => updateField("interest", value)} placeholder="예: IMD-C" />
        <SelectField label="구분" value={firstText(draft, ["itemCategory"]) || "장비"} onChange={(value) => updateField("itemCategory", value)} options={SALES_ITEM_CATEGORY_OPTIONS} />
        <SelectField label="진행 상태" value={salesStatus(draft) || SALES_STATUS_OPTIONS[0]} onChange={(value) => updateField("status", value)} options={SALES_STATUS_OPTIONS} />
        <SelectField label="중요도" value={salesPriority(draft) || "보통"} onChange={(value) => updateField("priority", value)} options={PRIORITY_OPTIONS} />
        <SelectField label="견적 여부" value={firstText(draft, ["quoteStatus"]) || "미진행"} onChange={(value) => updateField("quoteStatus", value)} options={QUOTE_STATUS_OPTIONS} />
        <SelectField label="구매 가능성" value={firstText(draft, ["purchasePossibility"]) || "미정"} onChange={(value) => updateField("purchasePossibility", value)} options={PURCHASE_POSSIBILITY_OPTIONS} />
        <TextField
          label="예상매출"
          value={firstText(draft, ["expectedRevenueAmount"])}
          onChange={(value) => updateField("expectedRevenueAmount", value)}
          placeholder="예: 15000000"
          option={<FieldCheck label="VAT 포함" checked={Boolean(draft.expectedRevenueVatIncluded)} onChange={(checked) => updateField("expectedRevenueVatIncluded", checked)} />}
        />
        <TextField
          label="매출"
          value={firstText(draft, ["revenueAmount"])}
          onChange={(value) => updateField("revenueAmount", value)}
          placeholder="예: 10000000"
          option={<FieldCheck label="VAT 포함" checked={Boolean(draft.revenueAmountVatIncluded)} onChange={(checked) => updateField("revenueAmountVatIncluded", checked)} />}
        />
        <SelectField label="매출 구분" value={firstText(draft, ["revenueType"])} onChange={(value) => updateField("revenueType", value)} options={REVENUE_TYPE_OPTIONS} placeholder="선택 안 함" />
        <TextField
          label="다음 연락 예정일"
          type="date"
          value={firstText(draft, ["nextContactDate"])}
          onChange={(value) => updateField("nextContactDate", value)}
          disabled={Boolean(draft.nextContactUnknown)}
          option={<FieldCheck label="미정" checked={Boolean(draft.nextContactUnknown)} onChange={(checked) => updateField("nextContactUnknown", checked)} />}
        />
        <TextField label="미팅 일정" type="date" value={firstText(draft, ["meetingDate"])} onChange={(value) => updateField("meetingDate", value)} />
        <TextField label="최근 연락" type="date" value={firstText(draft, ["lastContactDate"])} onChange={(value) => updateField("lastContactDate", value)} />
        <TextAreaField label="다음 액션" value={firstText(draft, ["nextAction"])} onChange={(value) => updateField("nextAction", value)} placeholder="다음에 할 일" wide />
        <TextAreaField label="상세 메모" value={firstText(draft, ["memo"])} onChange={(value) => updateField("memo", value)} placeholder="상세 내용" wide />
      </div>
      <div className="form-actions">
        <button type="button" className="icon-text-button primary" onClick={() => onSave(draft)}>
          저장
        </button>
        <button type="button" className="icon-text-button" onClick={onCancel}>
          취소
        </button>
      </div>
    </section>
  );
}

function SalesDetailPanel({
  note,
  company,
  mode,
  noteId,
  onUploadAttachments,
  onUpdateAttachmentMeta,
  onDeleteAttachment
}: {
  note: AnyRecord;
  company: AnyRecord | null;
  mode: SalesPanelMode;
  noteId: string;
  onUploadAttachments: (noteId: string, files: File[], meta: { category: string; sentDate: string; memo: string }) => Promise<void>;
  onUpdateAttachmentMeta: (noteId: string, attachmentKey: string, values: { category: string; sentDate: string; memo: string }) => Promise<void>;
  onDeleteAttachment: (noteId: string, attachmentKey: string) => Promise<void>;
}) {
  const attachments = asArray(note.attachments);
  const contacts = company ? asArray(company.contacts) : [];
  return (
    <div className="sales-detail-panel">
      {mode === "detail" && (
        <div className="sales-detail-grid">
          <section>
            <p className="eyebrow">MEMO</p>
            <p className="detail-text">{firstText(note, ["memo", "description", "note"]) || "상세 메모가 없습니다."}</p>
          </section>
          <section>
            <p className="eyebrow">AMOUNT</p>
            <InfoLine label="예상매출" value={hasAmountValue(firstText(note, ["expectedRevenueAmount"])) ? formatMoneyWithVat(firstText(note, ["expectedRevenueAmount"]), note.expectedRevenueVatIncluded) : "-"} />
            <InfoLine label="매출" value={formatRevenueForDisplay(note)} />
            <InfoLine label="견적" value={firstText(note, ["quoteStatus"]) || "미입력"} />
            <InfoLine label="구매" value={firstText(note, ["purchasePossibility"]) || "미입력"} />
          </section>
          <section>
            <p className="eyebrow">SCHEDULE</p>
            <InfoLine label="다음" value={formatNextContact(note)} />
            <InfoLine label="미팅" value={formatOptionalDate(firstText(note, ["meetingDate"])) || "-"} />
            <InfoLine label="최근" value={formatOptionalDate(firstText(note, ["lastContactDate"])) || "-"} />
          </section>
        </div>
      )}

      {mode === "company" && (
        <div className="sales-detail-grid">
          <section>
            <p className="eyebrow">COMPANY</p>
            <h3>{company ? companyName(company) : salesCustomer(note)}</h3>
            <InfoLine label="대표" value={company ? firstText(company, ["representativeName", "ceoName", "owner"]) : ""} />
            <InfoLine label="연락처" value={company ? firstText(company, ["phone", "mainPhone", "contact"]) : firstText(note, ["contactPhone", "phone"])} />
            <InfoLine label="이메일" value={company ? firstText(company, ["email", "mainEmail"]) : firstText(note, ["contactEmail", "email"])} />
          </section>
          <section className="wide-detail-section">
            <p className="eyebrow">CONTACTS</p>
            <div className="contact-chip-list">
              {contacts.slice(0, 8).map((contact, index) => (
                <span key={recordId(contact, index)}>
                  {[firstText(contact, ["name", "contactName"]), firstText(contact, ["phone", "contactPhone"]), firstText(contact, ["email", "contactEmail"])].filter(Boolean).join(" · ") || "담당자"}
                </span>
              ))}
              {!contacts.length && <span>등록된 담당자 정보가 없습니다.</span>}
            </div>
          </section>
        </div>
      )}

      {mode === "files" && (
        <div className="sales-detail-grid">
          <section className="wide-detail-section">
            <p className="eyebrow">FILES</p>
            <SalesFileManager
              noteId={noteId}
              attachments={attachments}
              onUpload={onUploadAttachments}
              onUpdateMeta={onUpdateAttachmentMeta}
              onDelete={onDeleteAttachment}
            />
          </section>
        </div>
      )}
    </div>
  );
}

function SalesFileManager({
  noteId,
  attachments,
  onUpload,
  onUpdateMeta,
  onDelete,
  emptyDetail = "이 영업 건에 보낸 견적서, 자료, 메일 캡처 이미지를 업로드해 두면 다시 다운로드할 수 있습니다."
}: {
  noteId: string;
  attachments: AnyRecord[];
  onUpload: (noteId: string, files: File[], meta: { category: string; sentDate: string; memo: string }) => Promise<void>;
  onUpdateMeta: (noteId: string, attachmentKey: string, values: { category: string; sentDate: string; memo: string }) => Promise<void>;
  onDelete: (noteId: string, attachmentKey: string) => Promise<void>;
  emptyDetail?: string;
}) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [category, setCategory] = useState(FILE_CATEGORY_OPTIONS[0]);
  const [sentDate, setSentDate] = useState(toDateKey(new Date()));
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);

  const handleUpload = async () => {
    setBusy(true);
    try {
      await onUpload(noteId, selectedFiles, { category, sentDate, memo });
      setSelectedFiles([]);
      setMemo("");
      setFileInputKey((value) => value + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sales-file-manager">
      <div className="file-upload-panel">
        <label className="file-picker">
          <Upload size={17} />
          <span>파일 선택</span>
          <input
            key={fileInputKey}
            type="file"
            multiple
            onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))}
          />
        </label>
        <div className="file-upload-fields">
          <label className="field">
            <span>분류</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {FILE_CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <TextField label="발송/등록일" type="date" value={sentDate} onChange={setSentDate} />
          <TextField label="파일 메모" value={memo} onChange={setMemo} placeholder="예: 발송 메일 캡처, 수정본, 최종 견적서" />
          <button type="button" className="icon-text-button primary" disabled={busy || !selectedFiles.length} onClick={handleUpload}>
            <Upload size={16} />
            업로드
          </button>
        </div>
        <div className="selected-file-list" aria-label="선택한 파일">
          {selectedFiles.map((file) => (
            <span key={`${file.name}-${file.size}-${file.lastModified}`}>
              {file.name} · {formatFileSize(file.size)}
            </span>
          ))}
          {!selectedFiles.length && <span>여러 파일을 한 번에 선택할 수 있습니다.</span>}
        </div>
      </div>

      <div className="attachment-editor-list">
        {attachments.map((attachment, index) => (
          <AttachmentMetaEditor
            key={recordId(attachment, index)}
            noteId={noteId}
            attachmentKey={recordId(attachment, index)}
            attachment={attachment}
            onUpdateMeta={onUpdateMeta}
            onDelete={onDelete}
          />
        ))}
        {!attachments.length && (
          <div className="empty-inline">
            <strong>첨부자료 없음</strong>
            <span>{emptyDetail}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function AttachmentMetaEditor({
  noteId,
  attachmentKey,
  attachment,
  onUpdateMeta,
  onDelete
}: {
  noteId: string;
  attachmentKey: string;
  attachment: AnyRecord;
  onUpdateMeta: (noteId: string, attachmentKey: string, values: { category: string; sentDate: string; memo: string }) => Promise<void>;
  onDelete: (noteId: string, attachmentKey: string) => Promise<void>;
}) {
  const [category, setCategory] = useState(firstText(attachment, ["category"]) || FILE_CATEGORY_OPTIONS[0]);
  const [sentDate, setSentDate] = useState(firstText(attachment, ["sentDate"]));
  const [memo, setMemo] = useState(firstText(attachment, ["memo"]));
  const [busy, setBusy] = useState(false);
  const fileName = firstText(attachment, ["fileName", "name", "filename"]) || "첨부자료";

  const saveMeta = async () => {
    setBusy(true);
    try {
      await onUpdateMeta(noteId, attachmentKey, { category, sentDate, memo });
    } finally {
      setBusy(false);
    }
  };

  const deleteFile = async () => {
    setBusy(true);
    try {
      await onDelete(noteId, attachmentKey);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="attachment-editor-card">
      <div className="attachment-title-row">
        <div>
          <strong>{fileName}</strong>
          <span>
            {formatFileSize(Number(attachment.fileSize) || 0)}
            {firstText(attachment, ["uploadedAt"]) ? ` · 등록 ${formatDateTime(firstText(attachment, ["uploadedAt"]))}` : ""}
          </span>
        </div>
        <AttachmentActions attachment={attachment} />
      </div>
      <div className="attachment-editor-grid">
        <label className="field">
          <span>분류</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {FILE_CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <TextField label="발송/등록일" type="date" value={sentDate} onChange={setSentDate} />
        <TextField label="메모" value={memo} onChange={setMemo} placeholder="파일별 메모" />
        <div className="attachment-editor-actions">
          <button type="button" onClick={saveMeta} disabled={busy}>
            저장
          </button>
          <button type="button" className="danger-button" onClick={deleteFile} disabled={busy}>
            삭제
          </button>
        </div>
      </div>
    </article>
  );
}

function createAttachmentHandlers({
  data,
  onPersist,
  collectionKey,
  ownerType,
  reasonLabel
}: {
  data: WorkNoteData;
  onPersist: (updater: (current: WorkNoteData) => WorkNoteData, reason: string) => void;
  collectionKey: AttachmentCollectionKey;
  ownerType: AttachmentOwnerType;
  reasonLabel: string;
}) {
  const updateRecordAttachments = (
    recordKey: string,
    updater: (attachments: AnyRecord[]) => AnyRecord[],
    reason: string
  ) => {
    onPersist((current) => {
      const now = new Date().toISOString();
      const records = current[collectionKey] as AnyRecord[];
      return {
        ...current,
        [collectionKey]: records.map((item, itemIndex) =>
          recordId(item, itemIndex) === recordKey
            ? {
                ...item,
                attachments: updater(asArray(item.attachments)),
                updatedAt: now
              }
            : item
        )
      } as WorkNoteData;
    }, reason);
  };

  const uploadAttachments = async (
    recordKey: string,
    files: File[],
    meta: { category: string; sentDate: string; memo: string }
  ) => {
    if (!files.length) {
      alert("업로드할 파일을 선택해 주세요.");
      return;
    }

    const uploadedAt = new Date().toISOString();
    const records = files.map((file) => {
      const id = createId("file_");
      const attachmentMeta: AttachmentRecord = {
        id,
        ownerType,
        ownerId: recordKey,
        fileName: file.name,
        name: file.name,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
        category: meta.category,
        sentDate: meta.sentDate,
        memo: meta.memo,
        uploadedAt
      };
      return { meta: attachmentMeta, record: { ...attachmentMeta, blob: file } };
    });

    try {
      await Promise.all(records.map(({ record }) => putAttachmentRecord(record)));
      updateRecordAttachments(recordKey, (attachments) => [...attachments, ...records.map(({ meta }) => meta)], `${reasonLabel} 업로드`);
    } catch (error) {
      alert(`파일을 저장하지 못했습니다.\n${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const updateAttachmentMeta = async (
    recordKey: string,
    attachmentKey: string,
    values: { category: string; sentDate: string; memo: string }
  ) => {
    let updatedAttachment: AnyRecord | null = null;
    updateRecordAttachments(
      recordKey,
      (attachments) =>
        attachments.map((attachment, attachmentIndex) => {
          if (recordId(attachment, attachmentIndex) !== attachmentKey) return attachment;
          updatedAttachment = { ...attachment, ...values };
          return updatedAttachment;
        }),
      `${reasonLabel} 정보 수정`
    );

    const nextAttachmentMeta = updatedAttachment as AnyRecord | null;
    const attachmentId = nextAttachmentMeta ? firstText(nextAttachmentMeta, ["id"]) : "";
    if (!attachmentId) return;
    try {
      const stored = await getAttachmentRecord(attachmentId);
      if (stored?.blob) {
        await putAttachmentRecord({ ...stored, ...nextAttachmentMeta, blob: stored.blob });
      }
    } catch {
      // Metadata has already been saved. Full ZIP import can restore the original blob if needed.
    }
  };

  const deleteAttachment = async (recordKey: string, attachmentKey: string) => {
    if (!confirm("이 파일을 파일함에서 삭제할까요? 원본 파일도 이 브라우저 저장소에서 삭제됩니다.")) return;
    const records = data[collectionKey] as AnyRecord[];
    const targetRecord = records.find((item, itemIndex) => recordId(item, itemIndex) === recordKey);
    const targetAttachment = asArray(targetRecord?.attachments).find((attachment, attachmentIndex) => recordId(attachment, attachmentIndex) === attachmentKey);
    const attachmentId = targetAttachment ? firstText(targetAttachment, ["id"]) : "";

    try {
      if (attachmentId) await deleteAttachmentRecord(attachmentId);
      updateRecordAttachments(
        recordKey,
        (attachments) => attachments.filter((attachment, attachmentIndex) => recordId(attachment, attachmentIndex) !== attachmentKey),
        `${reasonLabel} 삭제`
      );
    } catch (error) {
      alert(`파일을 삭제하지 못했습니다.\n${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return { uploadAttachments, updateAttachmentMeta, deleteAttachment };
}

function GenericWorkPortal({
  title,
  records,
  query,
  type,
  data,
  onPersist,
  focusTarget
}: {
  title: string;
  records: AnyRecord[];
  query: string;
  type: "settlement" | "output" | "other";
  data: WorkNoteData;
  onPersist: (updater: (current: WorkNoteData) => WorkNoteData, reason: string) => void;
  focusTarget: { portal: PortalId; id: string; nonce?: number } | null;
}) {
  const [filePanel, setFilePanel] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<AnyRecord | null>(null);
  const fileHandlers = createAttachmentHandlers({
    data,
    onPersist,
    collectionKey: workAttachmentCollectionKey(type),
    ownerType: type,
    reasonLabel: `${title} 파일`
  });
  const filtered = records
    .map((record, originalIndex) => ({ record, originalIndex, id: recordId(record, originalIndex) }))
    .filter(({ record }) => matchesRecord(record, query));
  const counts = getWorkModeCounts(filtered.map(({ record }) => record));

  useEffect(() => {
    if (focusTarget?.portal !== type) return;
    const exists = filtered.some(({ id }) => id === focusTarget.id);
    if (!exists) return;
    scrollRecordIntoView(focusTarget.id);
  }, [focusTarget, filtered, type]);

  const saveWorkRecord = (draft: AnyRecord) => {
    const normalized = normalizeWorkDraft(draft, type, data);
    if (!isWorkDraftValid(normalized, type)) {
      alert(type === "other" ? "업무명 또는 메모를 입력해 주세요." : "관련 업체, 업무 내용, 메모 중 하나는 입력해 주세요.");
      return;
    }
    if (!isValidDateRange(firstText(normalized, ["startDate"]), firstText(normalized, ["endDate"]))) {
      alert("기한 종료일은 시작일보다 빠를 수 없습니다.");
      return;
    }

    const collectionKey = workAttachmentCollectionKey(type);
    onPersist((current) => {
      const now = new Date().toISOString();
      const items = current[collectionKey] as AnyRecord[];
      const previous = items.find((item, itemIndex) => recordId(item, itemIndex) === normalized.id);
      const record = {
        ...previous,
        ...normalized,
        attachments: previous ? asArray(previous.attachments) : asArray(draft.attachments),
        history: previous ? asArray(previous.history) : [],
        createdAt: firstText(previous || {}, ["createdAt"]) || now,
        updatedAt: now
      };
      const exists = items.some((item, itemIndex) => recordId(item, itemIndex) === normalized.id);
      return {
        ...current,
        [collectionKey]: exists
          ? items.map((item, itemIndex) => (recordId(item, itemIndex) === normalized.id ? record : item))
          : [record, ...items]
      } as WorkNoteData;
    }, `${title} 업무 ${firstText(draft, ["id"]) ? "수정" : "등록"}`);
    setEditingRecord(null);
  };

  const deleteWorkRecord = async (record: AnyRecord, id: string) => {
    if (!confirm(`${workTitle(record, type)} 업무를 삭제할까요? 첨부 원본 파일도 이 브라우저 저장소에서 삭제됩니다.`)) return;
    try {
      await Promise.all(asArray(record.attachments).map((attachment) => deleteAttachmentRecord(firstText(attachment, ["id"]))));
    } catch (error) {
      if (!confirm(`첨부 파일 원본을 모두 삭제하지 못했습니다.\n${error instanceof Error ? error.message : String(error)}\n\n업무 목록에서만 삭제할까요?`)) return;
    }
    const collectionKey = workAttachmentCollectionKey(type);
    onPersist((current) => ({
      ...current,
      [collectionKey]: (current[collectionKey] as AnyRecord[]).filter((item, itemIndex) => recordId(item, itemIndex) !== id)
    } as WorkNoteData), `${title} 업무 삭제`);
    if (filePanel === id) setFilePanel(null);
    if (firstText(editingRecord || {}, ["id"]) === id) setEditingRecord(null);
  };

  return (
    <section className="panel">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">{title.toUpperCase()}</p>
          <h2>{title} 업무</h2>
        </div>
        <div className="toolbar-cluster">
          <div className="mini-counts" aria-label={`${title} 업무 현황`}>
            <span>진행 {counts.active}</span>
            <span>보류 {counts.hold}</span>
            <span>완료 {counts.closed}</span>
          </div>
          <button type="button" onClick={() => setEditingRecord(createBlankWorkTask(type))}>
            <Plus size={16} />
            새 업무
          </button>
        </div>
      </div>
      {editingRecord && (
        <EditorDrawer onClose={() => setEditingRecord(null)}>
          <WorkEditor
            draft={editingRecord}
            setDraft={setEditingRecord}
            type={type}
            title={title}
            data={data}
            onSave={saveWorkRecord}
            onCancel={() => setEditingRecord(null)}
          />
        </EditorDrawer>
      )}
      <div className="task-list">
        {filtered.map(({ record, originalIndex, id }) => {
          const attachments = asArray(record.attachments);
          const linkedSales = getLinkedSalesForWork(record, data.notes);
          return (
            <article className={`task-card ${type} ${focusTarget?.portal === type && focusTarget.id === id ? "is-focus-target" : ""}`} key={id} data-record-id={id}>
              <div className="card-heading">
                <div>
                  <strong>{workTitle(record, type)}</strong>
                  <small>{linkedSales ? `관련 영업: ${salesCustomer(linkedSales)}` : relatedSalesFallback(record)}</small>
                </div>
                <div className="badge-stack">
                  <Badge tone={statusTone(firstText(record, ["status", "progressStatus"]))}>
                    {firstText(record, ["status", "progressStatus"]) || "상태 미정"}
                  </Badge>
                  {firstText(record, ["priority", "importance"]) && (
                    <Badge tone={priorityTone(firstText(record, ["priority", "importance"]))}>
                      {firstText(record, ["priority", "importance"])}
                    </Badge>
                  )}
                </div>
              </div>
              <WorkTaskDetails record={record} type={type} linkedSales={linkedSales} />
              <div className="card-actions">
                <button type="button" onClick={() => setFilePanel(filePanel === id ? null : id)}>
                  <FileText size={15} />
                  파일 {attachments.length}
                </button>
                <button type="button" onClick={() => setEditingRecord(prepareWorkDraft(record, originalIndex, type))}>
                  <Pencil size={15} />
                  수정
                </button>
                <button type="button" className="danger-button" onClick={() => deleteWorkRecord(record, id)}>
                  <Trash2 size={15} />
                  삭제
                </button>
              </div>
              {filePanel === id && (
                <div className="inline-file-panel">
                  <SalesFileManager
                    noteId={id}
                    attachments={attachments}
                    onUpload={fileHandlers.uploadAttachments}
                    onUpdateMeta={fileHandlers.updateAttachmentMeta}
                    onDelete={fileHandlers.deleteAttachment}
                    emptyDetail={`${title} 업무에 필요한 관련 파일을 업로드해 두면 다시 다운로드할 수 있습니다.`}
                  />
                </div>
              )}
            </article>
          );
        })}
        {!filtered.length && <EmptyState title={`${title} 업무 없음`} detail="검색 조건에 맞는 업무가 없습니다." />}
      </div>
    </section>
  );
}

function WorkEditor({
  draft,
  setDraft,
  type,
  title,
  data,
  onSave,
  onCancel
}: {
  draft: AnyRecord;
  setDraft: (draft: AnyRecord) => void;
  type: "settlement" | "output" | "other";
  title: string;
  data: WorkNoteData;
  onSave: (draft: AnyRecord) => void;
  onCancel: () => void;
}) {
  const updateField = (key: string, value: string | boolean | AnyRecord[]) => setDraft({ ...draft, [key]: value });
  const updateFields = (values: AnyRecord) => setDraft({ ...draft, ...values });
  const selectedCompany = firstText(draft, ["companyId"])
    ? data.companies.find((company, index) => recordId(company, index) === firstText(draft, ["companyId"]))
    : null;
  const contacts = selectedCompany ? asArray(selectedCompany.contacts) : [];
  const selectedSales = firstText(draft, ["salesNoteId"])
    ? data.notes.find((note, index) => recordId(note, index) === firstText(draft, ["salesNoteId"]))
    : null;
  const [companySearch, setCompanySearch] = useState("");
  const [salesSearch, setSalesSearch] = useState("");
  const companyOptions = useMemo(
    () => data.companies.filter((company) => matchesText(company, companySearch)).slice(0, 80),
    [data.companies, companySearch]
  );
  const salesOptions = useMemo(
    () => data.notes.filter((note) => matchesText(note, salesSearch)).slice(0, 80),
    [data.notes, salesSearch]
  );

  const selectCompany = (value: string) => {
    if (value === "__unknown") {
      setDraft({ ...draft, companyId: "", contactId: "", companyUnknown: true, company: "", contactName: "", contactPhone: "", contactEmail: "" });
      return;
    }
    const company = data.companies.find((item, index) => recordId(item, index) === value) || null;
    const primaryContact = company ? asArray(company.contacts).find((contact) => Boolean(contact.isPrimary)) || asArray(company.contacts)[0] : null;
    setDraft({
      ...draft,
      companyId: value,
      contactId: primaryContact ? recordId(primaryContact, 0) : "",
      companyUnknown: false,
      company: company ? companyName(company) : firstText(draft, ["company"]),
      contactName: primaryContact ? firstText(primaryContact, ["name", "contactName"]) : firstText(draft, ["contactName"]),
      contactPhone: primaryContact ? firstText(primaryContact, ["phone", "contactPhone"]) : firstText(draft, ["contactPhone"]),
      contactEmail: primaryContact ? firstText(primaryContact, ["email", "contactEmail"]) : firstText(draft, ["contactEmail"])
    });
  };

  const selectContact = (value: string) => {
    const contact = contacts.find((item, index) => recordId(item, index) === value) || null;
    setDraft({
      ...draft,
      contactId: value,
      contactName: contact ? firstText(contact, ["name", "contactName"]) : firstText(draft, ["contactName"]),
      contactPhone: contact ? firstText(contact, ["phone", "contactPhone"]) : firstText(draft, ["contactPhone"]),
      contactEmail: contact ? firstText(contact, ["email", "contactEmail"]) : firstText(draft, ["contactEmail"])
    });
  };

  const selectSales = (value: string) => {
    if (value === "__unknown") {
      setDraft({ ...draft, salesNoteId: "", salesLinkUnknown: true });
      return;
    }
    const note = data.notes.find((item, index) => recordId(item, index) === value) || null;
    setDraft({
      ...draft,
      salesNoteId: value,
      salesLinkUnknown: false,
      companyId: note && !note.companyUnknown ? firstText(note, ["companyId"]) : firstText(draft, ["companyId"]),
      contactId: note && !note.companyUnknown ? firstText(note, ["contactId"]) : firstText(draft, ["contactId"]),
      companyUnknown: note ? Boolean(note.companyUnknown) : Boolean(draft.companyUnknown),
      company: note ? salesCustomer(note) : firstText(draft, ["company"]),
      contactName: note ? firstText(note, ["contactName", "managerName"]) : firstText(draft, ["contactName"]),
      contactPhone: note ? firstText(note, ["contactPhone", "phone", "contact", "mobile"]) : firstText(draft, ["contactPhone"]),
      contactEmail: note ? firstText(note, ["contactEmail", "email"]) : firstText(draft, ["contactEmail"])
    });
  };

  return (
    <section className="editor-panel">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">{type.toUpperCase()}</p>
          <h2>{firstText(draft, ["id"]) ? `${title} 업무 수정` : `${title} 업무 등록`}</h2>
        </div>
        <button type="button" onClick={onCancel} aria-label={`${title} 업무 편집 닫기`}>
          <X size={17} />
        </button>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>업체 검색</span>
          <input
            type="search"
            value={companySearch}
            onChange={(event) => setCompanySearch(event.target.value)}
            placeholder="업체명, 담당자, 연락처, 이메일"
          />
        </label>
        <label className="field">
          <span>관련 업체</span>
          <select value={draft.companyUnknown ? "__unknown" : firstText(draft, ["companyId"])} onChange={(event) => selectCompany(event.target.value)}>
            <option value="">직접 입력 / 연결 안 함</option>
            <option value="__unknown">미정</option>
            {companyOptions.map((company, index) => (
              <option key={recordId(company, index)} value={recordId(company, index)}>
                {companyName(company) || "업체명 미입력"}
              </option>
            ))}
          </select>
        </label>
        <div className="selection-summary wide-field">
          <strong>{selectedCompany ? companyName(selectedCompany) : (draft.companyUnknown ? "업체 미정" : "직접 입력")}</strong>
          <span>
            {[firstText(draft, ["contactName"]), firstText(draft, ["contactPhone"]), firstText(draft, ["contactEmail"])]
              .filter(Boolean)
              .join(" · ") || "담당자 정보 없음"}
          </span>
        </div>
        <TextField label="업체명" value={firstText(draft, ["company"])} onChange={(value) => updateField("company", value)} placeholder="업체명 또는 미정" />
        {contacts.length > 0 && (
          <label className="field">
            <span>담당자 선택</span>
            <select value={firstText(draft, ["contactId"])} onChange={(event) => selectContact(event.target.value)}>
              <option value="">직접 입력</option>
              {contacts.map((contact, index) => (
                <option key={recordId(contact, index)} value={recordId(contact, index)}>
                  {companyContactSummary(contact) || "담당자"}
                </option>
              ))}
            </select>
          </label>
        )}
        <TextField label={type === "output" ? "담당자(요청자)" : "담당자"} value={firstText(draft, ["contactName"])} onChange={(value) => updateField("contactName", value)} placeholder="담당자명" />
        <TextField label="담당자 연락처" value={firstText(draft, ["contactPhone"])} onChange={(value) => updateField("contactPhone", value)} placeholder="010-0000-0000" />
        <TextField label="담당자 이메일" value={firstText(draft, ["contactEmail"])} onChange={(value) => updateField("contactEmail", value)} placeholder="name@example.com" />

        {(type === "settlement" || type === "output") && (
          <>
            <label className="field wide-field">
              <span>관련 영업건 검색</span>
              <input
                type="search"
                value={salesSearch}
                onChange={(event) => setSalesSearch(event.target.value)}
                placeholder="업체, 담당자, 관심제품, 다음 액션"
              />
            </label>
            <label className="field wide-field">
              <span>관련 영업건</span>
              <select value={draft.salesLinkUnknown ? "__unknown" : firstText(draft, ["salesNoteId"])} onChange={(event) => selectSales(event.target.value)}>
                <option value="">연결 안 함</option>
                <option value="__unknown">미정</option>
                {salesOptions.map((note, index) => (
                  <option key={recordId(note, index)} value={recordId(note, index)}>
                    {salesCustomer(note)} · {salesInterest(note) || firstText(note, ["nextAction"]) || "영업 메모"}
                  </option>
                ))}
              </select>
            </label>
            <div className="selection-summary wide-field">
              <strong>{selectedSales ? salesCustomer(selectedSales) : (draft.salesLinkUnknown ? "영업건 미정" : "영업건 연결 안 함")}</strong>
              <span>{selectedSales ? joinParts([salesInterest(selectedSales), firstText(selectedSales, ["nextAction"])], " · ") : "검색 후 관련 영업건을 선택할 수 있습니다."}</span>
            </div>
          </>
        )}

        {type === "settlement" && (
          <SettlementFields draft={draft} updateField={updateField} updateFields={updateFields} />
        )}

        {type === "output" && (
          <>
            <TextField label="기한 시작" type="date" value={firstText(draft, ["startDate"])} onChange={(value) => updateField("startDate", value)} />
            <TextField
              label="기한 종료"
              type="date"
              value={firstText(draft, ["endDate"])}
              onChange={(value) => updateField("endDate", value)}
              option={<FieldCheck label="주말 포함" checked={Boolean(draft.includeWeekends)} onChange={(checked) => updateField("includeWeekends", checked)} />}
            />
            <SelectField label="진행 상태" value={firstText(draft, ["status"]) || "대기"} onChange={(value) => updateField("status", value)} options={WORK_STATUS_OPTIONS} />
            <SelectField label="중요도" value={firstText(draft, ["priority"]) || "보통"} onChange={(value) => updateField("priority", value)} options={PRIORITY_OPTIONS} />
            <TextField label="출력 종류" value={firstText(draft, ["outputType"])} onChange={(value) => updateField("outputType", value)} placeholder="예: 샘플 출력, BMT, 제작물" />
          </>
        )}

        {type === "other" && (
          <>
            <TextField label="업무명" value={firstText(draft, ["title"])} onChange={(value) => updateField("title", value)} placeholder="예: 사내 요청사항 확인" />
            <TextField label="구분" value={firstText(draft, ["category"])} onChange={(value) => updateField("category", value)} placeholder="예: 내부, 구매, 행정" />
            <TextField label="담당/요청자" value={firstText(draft, ["owner"])} onChange={(value) => updateField("owner", value)} placeholder="담당자 또는 요청자" />
            <TextField label="기한 시작" type="date" value={firstText(draft, ["startDate"])} onChange={(value) => updateField("startDate", value)} />
            <TextField
              label="기한 종료"
              type="date"
              value={firstText(draft, ["endDate"])}
              onChange={(value) => updateField("endDate", value)}
              option={<FieldCheck label="주말 포함" checked={Boolean(draft.includeWeekends)} onChange={(checked) => updateField("includeWeekends", checked)} />}
            />
            <SelectField label="진행 상태" value={firstText(draft, ["status"]) || "대기"} onChange={(value) => updateField("status", value)} options={WORK_STATUS_OPTIONS} />
            <SelectField label="중요도" value={firstText(draft, ["priority"]) || "보통"} onChange={(value) => updateField("priority", value)} options={PRIORITY_OPTIONS} />
          </>
        )}

        <TextAreaField label="업무 메모" value={firstText(draft, ["memo"])} onChange={(value) => updateField("memo", value)} placeholder="업무 조건, 주의사항, 진행 내용" wide />
      </div>
      <div className="form-actions">
        <button type="button" className="icon-text-button primary" onClick={() => onSave(draft)}>
          저장
        </button>
        <button type="button" className="icon-text-button" onClick={onCancel}>
          취소
        </button>
      </div>
    </section>
  );
}

function SettlementFields({
  draft,
  updateField,
  updateFields
}: {
  draft: AnyRecord;
  updateField: (key: string, value: string | boolean | AnyRecord[]) => void;
  updateFields: (values: AnyRecord) => void;
}) {
  const schedule = asArray(draft.paymentSchedule);
  const [scheduleStart, setScheduleStart] = useState(firstText(draft, ["nextActionDate"]) || toDateKey(new Date()));
  const [scheduleInterval, setScheduleInterval] = useState("14");
  const [scheduleCount, setScheduleCount] = useState("");
  const [scheduleAmount, setScheduleAmount] = useState("");
  const [scheduleAmountVatIncluded, setScheduleAmountVatIncluded] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const isAdvance = firstText(draft, ["paymentType"]).includes("선금");
  const scheduleStats = getSettlementScheduleStats(schedule, isAdvance);

  const setSchedule = (rows: AnyRecord[]) => updateField("paymentSchedule", rows);
  const updateRow = (index: number, key: string, value: string | boolean) => {
    setSchedule(schedule.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)));
  };
  const addRow = () => {
    setSchedule([...schedule, { id: createId("pay_"), round: String(schedule.length + 1), dueDate: toDateKey(new Date()), amount: "", amountVatIncluded: false, status: "예정", item: "" }]);
  };
  const removeRow = (index: number) => setSchedule(schedule.filter((_, rowIndex) => rowIndex !== index));
  const generateRows = () => {
    const count = Math.max(0, Number(scheduleCount) || 0);
    const interval = Math.max(1, Number(scheduleInterval) || 14);
    const start = parseDate(scheduleStart || toDateKey(new Date()));
    if (!count) {
      alert("예정 회차를 입력해 주세요.");
      return;
    }
    const rows = Array.from({ length: count }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + interval * index);
      return {
        id: createId("pay_"),
        round: String(index + 1),
        dueDate: toDateKey(date),
        amount: normalizeAmountString(scheduleAmount),
        amountVatIncluded: scheduleAmountVatIncluded,
        status: "예정",
        item: ""
      };
    });
    setSchedule(rows);
  };
  const parsePasteRows = () => {
    const rows = parseSettlementSchedulePaste(pasteText);
    if (!rows.length) {
      alert("붙여넣은 일정이 없습니다.");
      return;
    }
    setSchedule(rows);
    setPasteText("");
  };
  const syncScheduleProgress = () => {
    const nextValues: AnyRecord = {
      installmentProgress: schedule.length ? `${scheduleStats.completedCount}/${schedule.length}` : "",
      nextActionDate: firstText(scheduleStats.nextRow || {}, ["dueDate"]),
      nextAction: scheduleStats.nextRow
        ? `${firstText(scheduleStats.nextRow, ["round"]) || scheduleStats.completedCount + 1}회차 ${isAdvance ? "차감" : "결제"} 예정`
        : "정산 완료 확인"
    };
    if (isAdvance) {
      nextValues.deductedAmount = String(scheduleStats.completedAmount || "");
    } else {
      nextValues.receivedAmount = String(scheduleStats.completedAmount || "");
    }
    updateFields(nextValues);
  };

  return (
    <>
      <SelectField label="결제 유형" value={firstText(draft, ["paymentType"]) || "분할 결제"} onChange={(value) => updateField("paymentType", value)} options={SETTLEMENT_PAYMENT_OPTIONS} />
      <SelectField label="진행 상태" value={firstText(draft, ["status"]) || "예정"} onChange={(value) => updateField("status", value)} options={SETTLEMENT_STATUS_OPTIONS} />
      <TextField
        label={isAdvance ? "선금/예치금" : "총 관리 금액"}
        value={firstText(draft, ["totalAmount", "advanceAmount"])}
        onChange={(value) => updateField(isAdvance ? "advanceAmount" : "totalAmount", value)}
        placeholder="예: 10000000"
        option={<FieldCheck label="VAT 포함" checked={Boolean(isAdvance ? draft.advanceAmountVatIncluded : draft.totalAmountVatIncluded)} onChange={(checked) => updateField(isAdvance ? "advanceAmountVatIncluded" : "totalAmountVatIncluded", checked)} />}
      />
      <TextField
        label={isAdvance ? "차감 완료액" : "회차 입금 완료액"}
        value={firstText(draft, [isAdvance ? "deductedAmount" : "receivedAmount"])}
        onChange={(value) => updateField(isAdvance ? "deductedAmount" : "receivedAmount", value)}
        placeholder="예: 5000000"
        option={<FieldCheck label="VAT 포함" checked={Boolean(isAdvance ? draft.deductedAmountVatIncluded : draft.receivedAmountVatIncluded)} onChange={(checked) => updateField(isAdvance ? "deductedAmountVatIncluded" : "receivedAmountVatIncluded", checked)} />}
      />
      {!isAdvance && (
        <TextField
          label="기타 차감 금액"
          value={firstText(draft, ["deductedAmount"])}
          onChange={(value) => updateField("deductedAmount", value)}
          placeholder="예: 1000000"
          option={<FieldCheck label="VAT 포함" checked={Boolean(draft.deductedAmountVatIncluded)} onChange={(checked) => updateField("deductedAmountVatIncluded", checked)} />}
        />
      )}
      <TextField label="현재 회차 / 총 회차" value={firstText(draft, ["installmentProgress"])} onChange={(value) => updateField("installmentProgress", value)} placeholder="예: 8/25" />
      <TextField label="다음 처리일" type="date" value={firstText(draft, ["nextActionDate"])} onChange={(value) => updateField("nextActionDate", value)} />
      <TextField label="다음 처리" value={firstText(draft, ["nextAction"])} onChange={(value) => updateField("nextAction", value)} placeholder="예: 9회차 청구" />
      <TextAreaField label="회차/차감 계획" value={firstText(draft, ["plan"])} onChange={(value) => updateField("plan", value)} placeholder="정산 조건, 남은 금액 처리 계획" wide />

      <section className="work-schedule-editor wide-field">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">PAYMENT TABLE</p>
            <h3>{isAdvance ? "차감 목록" : "회차별 결제 일정"}</h3>
          </div>
          <span className="count-label">{schedule.length}건</span>
        </div>
        <div className="schedule-tool-grid">
          <TextField label="시작일" type="date" value={scheduleStart} onChange={setScheduleStart} />
          <TextField label="간격(일)" type="number" value={scheduleInterval} onChange={setScheduleInterval} />
          <TextField label="예정 회차" type="number" value={scheduleCount} onChange={setScheduleCount} />
          <TextField label="회차별 금액" value={scheduleAmount} onChange={setScheduleAmount} option={<FieldCheck label="VAT 포함" checked={scheduleAmountVatIncluded} onChange={setScheduleAmountVatIncluded} />} />
          <button type="button" className="icon-text-button" onClick={generateRows}>일정 자동 생성</button>
          <button type="button" className="icon-text-button" onClick={addRow}>회차 추가</button>
        </div>
        <div className="settlement-summary-grid">
          <div>
            <span>예정 합계</span>
            <strong>{formatMoney(String(scheduleStats.totalAmount))}</strong>
          </div>
          <div>
            <span>{isAdvance ? "차감 완료" : "입금 완료"}</span>
            <strong>{formatMoney(String(scheduleStats.completedAmount))}</strong>
          </div>
          <div>
            <span>회차 잔액</span>
            <strong>{formatMoney(String(scheduleStats.remainingAmount))}</strong>
          </div>
          <div>
            <span>다음 일정</span>
            <strong>{scheduleStats.nextRow ? joinParts([`${firstText(scheduleStats.nextRow, ["round"])}회차`, formatOptionalDate(firstText(scheduleStats.nextRow, ["dueDate"]))], " · ") : "없음"}</strong>
          </div>
        </div>
        <TextAreaField label="엑셀 일정 붙여넣기" value={pasteText} onChange={setPasteText} placeholder="예: 1회차	2026-07-08	1980000	예정	품목" wide />
        <div className="form-actions compact-actions">
          <button type="button" className="icon-text-button" onClick={parsePasteRows}>붙여넣은 일정 불러오기</button>
          <button type="button" className="icon-text-button primary" onClick={syncScheduleProgress}>회차표 완료액 반영</button>
        </div>
        <div className="payment-row-list">
          {schedule.map((row, index) => {
            const rowStatus = firstText(row, ["status"]) || "예정";
            return (
            <div className="payment-row" key={recordId(row, index)}>
              <TextField label="회차" value={firstText(row, ["round"])} onChange={(value) => updateRow(index, "round", value)} />
              <TextField label="예정일" type="date" value={firstText(row, ["dueDate"])} onChange={(value) => updateRow(index, "dueDate", value)} />
              <TextField label="금액" value={firstText(row, ["amount"])} onChange={(value) => updateRow(index, "amount", value)} option={<FieldCheck label="VAT 포함" checked={Boolean(row.amountVatIncluded)} onChange={(checked) => updateRow(index, "amountVatIncluded", checked)} />} />
              <TextField label={isAdvance ? "차감 품목" : "품목/메모"} value={firstText(row, ["item"])} onChange={(value) => updateRow(index, "item", value)} />
              <label className="field">
                <span>상태</span>
                <select value={rowStatus} onChange={(event) => updateRow(index, "status", event.target.value)}>
                  {!SETTLEMENT_ROW_STATUS_OPTIONS.includes(rowStatus) && <option value={rowStatus}>{rowStatus}</option>}
                  {SETTLEMENT_ROW_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="danger-button" onClick={() => removeRow(index)}>삭제</button>
            </div>
            );
          })}
          {!schedule.length && <div className="empty-inline"><strong>일정 없음</strong><span>자동 생성, 회차 추가, 엑셀 붙여넣기로 일정을 만들 수 있습니다.</span></div>}
        </div>
      </section>
    </>
  );
}

function WorkTaskDetails({
  record,
  type,
  linkedSales
}: {
  record: AnyRecord;
  type: "settlement" | "output" | "other";
  linkedSales: AnyRecord | null;
}) {
  if (type === "settlement") {
    const schedule = asArray(record.paymentSchedule);
    const isAdvance = firstText(record, ["paymentType"]).includes("선금");
    return (
      <>
        <div className="task-card-grid">
          <InfoLine label="결제" value={firstText(record, ["paymentType"]) || "분할 결제"} />
          <InfoLine label="업체" value={companyName(record) || (linkedSales ? salesCustomer(linkedSales) : "")} />
          <InfoLine label="담당" value={contactBundle(record)} />
          <InfoLine label="진행" value={firstText(record, ["installmentProgress"])} />
          <InfoLine label={isAdvance ? "선금" : "총금액"} value={formatMoneyWithVat(firstText(record, ["totalAmount", "advanceAmount"]), record.totalAmountVatIncluded)} />
          <InfoLine label={isAdvance ? "차감" : "입금"} value={formatMoneyWithVat(firstText(record, ["deductedAmount", "receivedAmount"]), isAdvance ? record.deductedAmountVatIncluded : record.receivedAmountVatIncluded)} />
          <InfoLine label="잔액" value={settlementRemainingText(record)} />
          <InfoLine label="다음" value={joinParts([formatOptionalDate(firstText(record, ["nextActionDate"])), firstText(record, ["nextAction"])], " · ")} />
          <InfoLine label="파일" value={attachmentCountText(record)} />
          <InfoLine label="수정" value={formatDateTime(firstText(record, ["updatedAt"]))} />
        </div>
        <SchedulePreview rows={schedule} isAdvance={isAdvance} />
        <AttachmentPreview record={record} />
        {firstText(record, ["plan"]) && <p className="muted-preview">{firstText(record, ["plan"])}</p>}
        {firstText(record, ["memo", "description", "note"]) && <p className="muted-preview">{firstText(record, ["memo", "description", "note"])}</p>}
      </>
    );
  }

  if (type === "output") {
    return (
      <>
        <div className="task-card-grid">
          <InfoLine label="업체" value={companyName(record) || (linkedSales ? salesCustomer(linkedSales) : "")} />
          <InfoLine label="요청자" value={contactBundle(record)} />
          <InfoLine label="기한" value={deadlineText(record)} />
          <InfoLine label="출력" value={firstText(record, ["outputType", "category", "taskType"])} />
          <InfoLine label="주말" value={record.includeWeekends ? "포함" : "제외"} />
          <InfoLine label="파일" value={attachmentCountText(record)} />
          <InfoLine label="수정" value={formatDateTime(firstText(record, ["updatedAt"]))} />
        </div>
        <AttachmentPreview record={record} />
        {firstText(record, ["memo", "description", "note"]) && <p className="muted-preview">{firstText(record, ["memo", "description", "note"])}</p>}
      </>
    );
  }

  return (
    <>
      <div className="task-card-grid">
        <InfoLine label="업체" value={companyName(record) || (linkedSales ? salesCustomer(linkedSales) : "")} />
        <InfoLine label="담당" value={contactBundle(record) || firstText(record, ["owner", "assignee", "managerName"])} />
        <InfoLine label="분류" value={firstText(record, ["category", "taskType"])} />
        <InfoLine label="기한" value={deadlineText(record)} />
        <InfoLine label="주말" value={record.includeWeekends ? "포함" : "제외"} />
        <InfoLine label="파일" value={attachmentCountText(record)} />
        <InfoLine label="수정" value={formatDateTime(firstText(record, ["updatedAt"]))} />
      </div>
      <AttachmentPreview record={record} />
      {firstText(record, ["memo", "description", "note"]) && <p className="muted-preview">{firstText(record, ["memo", "description", "note"])}</p>}
    </>
  );
}

function SchedulePreview({ rows, isAdvance }: { rows: AnyRecord[]; isAdvance: boolean }) {
  if (!rows.length) return null;
  const completed = rows.filter((row) => firstText(row, ["status"]).includes("완료")).length;
  return (
    <div className="schedule-preview">
      <div className="preview-title">
        <strong>{isAdvance ? "차감 목록" : "회차 일정"}</strong>
        <span>{completed}/{rows.length}</span>
      </div>
      {rows.slice(0, 4).map((row, index) => (
        <div className="schedule-preview-row" key={recordId(row, index)}>
          <span>{firstText(row, ["round"]) || `${index + 1}`}회차</span>
          <strong>{joinParts([formatOptionalDate(firstText(row, ["dueDate"])), formatMoneyWithVat(firstText(row, ["amount"]), row.amountVatIncluded), firstText(row, ["item"])], " · ")}</strong>
          <small>{firstText(row, ["status"]) || "예정"}</small>
        </div>
      ))}
      {rows.length > 4 && <small className="more-line">외 {rows.length - 4}건</small>}
    </div>
  );
}

function AttachmentPreview({ record }: { record: AnyRecord }) {
  const attachments = asArray(record.attachments);
  if (!attachments.length) return null;
  return (
    <div className="attachment-preview">
      {attachments.slice(0, 3).map((file, index) => (
        <div className="attachment-chip" key={recordId(file, index)}>
          <span>{firstText(file, ["name", "fileName", "filename"]) || `파일 ${index + 1}`}</span>
          <AttachmentActions attachment={file} compact />
        </div>
      ))}
      {attachments.length > 3 && <div className="attachment-chip more-chip">+{attachments.length - 3}</div>}
    </div>
  );
}

function AttachmentActions({ attachment, compact = false }: { attachment: AnyRecord; compact?: boolean }) {
  const [preview, setPreview] = useState<{ url: string; name: string; fileType: string; zoom: number } | null>(null);
  const canPreview = isPreviewableAttachment(attachment);
  const fileName = firstText(attachment, ["fileName", "name", "filename"]) || "attachment";

  const handleDownload = async () => {
    try {
      const record = await getAttachmentRecord(firstText(attachment, ["id"]));
      if (!record?.blob) {
        alert("파일 원본을 찾지 못했습니다. JSON 백업만 불러온 경우 전체 ZIP 백업을 불러와야 다운로드할 수 있습니다.");
        return;
      }
      downloadBlob(record.blob, record.fileName || fileName, record.fileType || "application/octet-stream");
    } catch (error) {
      alert(`첨부자료를 다운로드하지 못했습니다.\n${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handlePreview = async () => {
    try {
      const record = await getAttachmentRecord(firstText(attachment, ["id"]));
      if (!record?.blob) {
        alert("이 파일의 원본을 현재 브라우저 저장소에서 찾지 못했습니다. 전체 ZIP 백업을 불러오면 미리보기와 다운로드가 가능합니다.");
        return;
      }
      const url = URL.createObjectURL(record.blob);
      setPreview({
        url,
        name: record.fileName || fileName,
        fileType: record.fileType || firstText(attachment, ["fileType"]),
        zoom: 1
      });
    } catch (error) {
      alert(`파일을 미리볼 수 없습니다.\n${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const closePreview = () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  return (
    <>
      <div className={`attachment-actions ${compact ? "compact" : ""}`}>
        {canPreview && (
          <button type="button" title="미리보기" onClick={handlePreview}>
            <Eye size={compact ? 14 : 15} />
            {!compact && "미리보기"}
          </button>
        )}
        <button type="button" title="다운로드" onClick={handleDownload}>
          <Download size={compact ? 14 : 15} />
          {!compact && "다운로드"}
        </button>
      </div>
      {preview && (
        <div className="file-preview-overlay" role="dialog" aria-modal="true" aria-label={`${preview.name} 미리보기`}>
          <div className="file-preview-modal">
            <div className="file-preview-header">
              <div>
                <strong>{preview.name}</strong>
                <span>{formatFileSize(Number(attachment.fileSize) || 0)}</span>
              </div>
              <div className="file-preview-controls">
                {isImageAttachmentType(preview.fileType, preview.name) && (
                  <>
                    <button type="button" onClick={() => setPreview({ ...preview, zoom: Math.max(0.5, preview.zoom - 0.25) })}>
                      <ZoomOut size={16} />
                    </button>
                    <button type="button" onClick={() => setPreview({ ...preview, zoom: 1 })}>
                      {Math.round(preview.zoom * 100)}%
                    </button>
                    <button type="button" onClick={() => setPreview({ ...preview, zoom: Math.min(3, preview.zoom + 0.25) })}>
                      <ZoomIn size={16} />
                    </button>
                  </>
                )}
                <button type="button" onClick={closePreview} aria-label="미리보기 닫기">
                  <X size={17} />
                </button>
              </div>
            </div>
            <div className="file-preview-body">
              {isImageAttachmentType(preview.fileType, preview.name) ? (
                <div className="file-preview-image-stage">
                  <img src={preview.url} alt={preview.name} style={{ transform: `scale(${preview.zoom})` }} />
                </div>
              ) : (
                <iframe src={preview.url} title={preview.name} />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AccountPortal({
  data,
  query,
  onPersist
}: {
  data: WorkNoteData;
  query: string;
  onPersist: (updater: (current: WorkNoteData) => WorkNoteData, reason: string) => void;
}) {
  const [editingAccount, setEditingAccount] = useState<AnyRecord | null>(null);
  const filtered = data.accounts.filter((account) => matchesRecord(account, query));
  const saveAccount = (draft: AnyRecord) => {
    const normalized = normalizeAccountDraft(draft);
    const hasValue = ["siteName", "siteUrl", "username", "password", "purpose", "owner", "memo"].some((key) => firstText(normalized, [key]));
    if (!hasValue) {
      alert("저장할 계정 정보를 입력해 주세요.");
      return;
    }

    onPersist((current) => {
      const now = new Date().toISOString();
      const previous = current.accounts.find((account, index) => recordId(account, index) === normalized.id);
      const account = {
        ...previous,
        ...normalized,
        createdAt: firstText(previous || {}, ["createdAt"]) || now,
        updatedAt: now
      };
      const exists = current.accounts.some((item, index) => recordId(item, index) === normalized.id);
      return {
        ...current,
        accounts: exists
          ? current.accounts.map((item, index) => (recordId(item, index) === normalized.id ? account : item))
          : [account, ...current.accounts]
      };
    }, firstText(draft, ["id"]) ? "계정 수정" : "계정 등록");
    setEditingAccount(null);
  };

  const deleteAccount = (account: AnyRecord, index: number) => {
    const id = recordId(account, index);
    const label = firstText(account, ["siteName", "homepageName", "name"]) || "선택한 계정";
    if (!confirm(`${label} 계정을 삭제할까요?`)) return;
    onPersist((current) => ({
      ...current,
      accounts: current.accounts.filter((item, itemIndex) => recordId(item, itemIndex) !== id)
    }), "계정 삭제");
  };

  return (
    <section className="panel">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">ACCOUNTS</p>
          <h2>계정 보관함</h2>
        </div>
        <div className="toolbar-cluster">
          <span className="count-label">{filtered.length}개</span>
          <button type="button" onClick={() => setEditingAccount(createBlankAccount())}>
            <Plus size={16} />
            새 계정
          </button>
        </div>
      </div>
      {editingAccount && (
        <EditorDrawer onClose={() => setEditingAccount(null)}>
          <AccountEditor
            draft={editingAccount}
            setDraft={setEditingAccount}
            onSave={saveAccount}
            onCancel={() => setEditingAccount(null)}
          />
        </EditorDrawer>
      )}
      <div className="account-grid">
        {filtered.map((account, index) => {
          const password = firstText(account, ["password"]);
          const username = firstText(account, ["username", "accountId"]);
          const siteUrl = normalizeUrl(firstText(account, ["siteUrl", "homepageUrl", "url"]));
          return (
            <article className="account-card" key={recordId(account, index)}>
              <div className="card-heading">
                <div>
                  <strong>{firstText(account, ["siteName", "homepageName", "name"]) || "홈페이지 이름 미입력"}</strong>
                  <small>{firstText(account, ["purpose"]) || "용도 미입력"}</small>
                </div>
                <KeyRound size={20} />
              </div>
              <InfoLine label="아이디" value={username || "-"} />
              <InfoLine label="비밀번호" value={password ? "숨김 처리됨" : "-"} />
              <InfoLine label="담당" value={firstText(account, ["owner"])} />
              <div className="account-actions">
                {siteUrl && (
                  <a href={siteUrl} target="_blank" rel="noreferrer">
                    열기
                    <ExternalLink size={15} />
                  </a>
                )}
                <CopyButton label="아이디" value={username} />
                <CopyButton label="비밀번호" value={password} />
                <button type="button" onClick={() => setEditingAccount(prepareAccountDraft(account, index))}>
                  <Pencil size={15} />
                  수정
                </button>
                <button type="button" className="danger-button" onClick={() => deleteAccount(account, index)}>
                  <Trash2 size={15} />
                  삭제
                </button>
              </div>
            </article>
          );
        })}
        {!filtered.length && <EmptyState title="계정 없음" detail="검색 조건에 맞는 계정이 없습니다." />}
      </div>
    </section>
  );
}

function AccountEditor({
  draft,
  setDraft,
  onSave,
  onCancel
}: {
  draft: AnyRecord;
  setDraft: (draft: AnyRecord) => void;
  onSave: (draft: AnyRecord) => void;
  onCancel: () => void;
}) {
  const updateField = (key: string, value: string) => setDraft({ ...draft, [key]: value });
  return (
    <section className="editor-panel">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">ACCOUNT</p>
          <h2>{firstText(draft, ["id"]) ? "계정 수정" : "계정 등록"}</h2>
        </div>
        <button type="button" onClick={onCancel} aria-label="계정 편집 닫기">
          <X size={17} />
        </button>
      </div>
      <div className="form-grid">
        <TextField label="홈페이지 이름" value={firstText(draft, ["siteName"])} onChange={(value) => updateField("siteName", value)} placeholder="예: 장비 포털" />
        <TextField label="홈페이지 링크" value={firstText(draft, ["siteUrl"])} onChange={(value) => updateField("siteUrl", value)} placeholder="https://example.com" />
        <TextField label="아이디" value={firstText(draft, ["username"])} onChange={(value) => updateField("username", value)} placeholder="아이디" />
        <TextField label="비밀번호" value={firstText(draft, ["password"])} onChange={(value) => updateField("password", value)} placeholder="비밀번호" />
        <TextField label="계정 용도" value={firstText(draft, ["purpose"])} onChange={(value) => updateField("purpose", value)} placeholder="장비 포털, 소재 주문 등" />
        <TextField label="담당자/소유자" value={firstText(draft, ["owner"])} onChange={(value) => updateField("owner", value)} placeholder="계정 만든 사람" />
        <TextField label="생성일" type="date" value={firstText(draft, ["accountCreatedDate"])} onChange={(value) => updateField("accountCreatedDate", value)} />
        <TextField label="비밀번호 변경일" type="date" value={firstText(draft, ["passwordChangedDate"])} onChange={(value) => updateField("passwordChangedDate", value)} />
        <TextAreaField label="메모" value={firstText(draft, ["memo"])} onChange={(value) => updateField("memo", value)} placeholder="계정 관련 메모" wide />
      </div>
      <div className="form-actions">
        <button type="button" className="icon-text-button primary" onClick={() => onSave(draft)}>
          저장
        </button>
        <button type="button" className="icon-text-button" onClick={onCancel}>
          취소
        </button>
      </div>
    </section>
  );
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      disabled={!value}
      onClick={async () => {
        if (!value) return;
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      }}
    >
      <Copy size={15} />
      {copied ? "복사됨" : `${label} 복사`}
    </button>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder = "",
  type = "text",
  wide = false,
  disabled = false,
  option
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  wide?: boolean;
  disabled?: boolean;
  option?: React.ReactNode;
}) {
  return (
    <label className={`field ${wide ? "wide-field" : ""}`}>
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} disabled={disabled} />
      {option && <span className="field-option-row">{option}</span>}
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder = "",
  wide = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <label className={`field ${wide ? "wide-field" : ""}`}>
      <span>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={4} />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option || "__empty"} value={option}>
            {option || placeholder || "선택 안 함"}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="field check-field">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function FieldCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <span className="inline-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </span>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <p className="info-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </p>
  );
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "blue" | "green" | "orange" | "red" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <FileText size={22} />
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

function loadWorkNoteData(): WorkNoteData {
  const base: WorkNoteData = {
    version: "unknown",
    updatedAt: "",
    companies: [],
    notes: [],
    settlementTasks: [],
    outputTasks: [],
    otherTasks: [],
    accounts: [],
    loadedAt: new Date().toISOString()
  };

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return base;
    }
    const parsed = JSON.parse(stored) as AnyRecord;
    return {
      ...base,
      version: firstText(parsed, ["version"]) || "unknown",
      updatedAt: firstText(parsed, ["updatedAt"]),
      companies: asArray(parsed.companies),
      notes: asArray(parsed.notes),
      settlementTasks: asArray(parsed.settlementTasks),
      outputTasks: asArray(parsed.outputTasks),
      otherTasks: asArray(parsed.otherTasks),
      accounts: asArray(parsed.accounts)
    };
  } catch (error) {
    return {
      ...base,
      error: error instanceof Error ? error.message : "데이터를 읽지 못했습니다."
    };
  }
}

function saveWorkNoteData(data: WorkNoteData, reason: string): WorkNoteData {
  const now = new Date().toISOString();
  const existing = safeParseStoredData();
  const payload = {
    ...existing,
    version: data.version && data.version !== "unknown" ? data.version : "react-work-note-v1",
    updatedAt: now,
    companies: asArray(data.companies),
    notes: asArray(data.notes),
    settlementTasks: asArray(data.settlementTasks),
    outputTasks: asArray(data.outputTasks),
    otherTasks: asArray(data.otherTasks),
    accounts: asArray(data.accounts)
  };

  validateWorkNotePayload(payload);
  createReactAutoSnapshot(reason);
  const raw = JSON.stringify(payload);
  JSON.parse(raw);
  window.localStorage.setItem(STORAGE_KEY, raw);
  return loadWorkNoteData();
}

function safeParseStoredData(): AnyRecord {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) as AnyRecord : {};
  } catch {
    return {};
  }
}

function createReactAutoSnapshot(reason: string) {
  const currentRaw = window.localStorage.getItem(STORAGE_KEY);
  if (!currentRaw) return;

  try {
    const snapshots = JSON.parse(window.localStorage.getItem(REACT_AUTOSNAPSHOT_KEY) || "[]");
    const next = [
      {
        at: new Date().toISOString(),
        reason,
        raw: currentRaw
      },
      ...(Array.isArray(snapshots) ? snapshots : [])
    ].slice(0, 3);
    window.localStorage.setItem(REACT_AUTOSNAPSHOT_KEY, JSON.stringify(next));
  } catch {
    window.localStorage.removeItem(REACT_AUTOSNAPSHOT_KEY);
  }
}

function validateWorkNotePayload(payload: AnyRecord) {
  const arrayKeys = ["companies", "notes", "settlementTasks", "outputTasks", "otherTasks", "accounts"];
  const invalidKey = arrayKeys.find((key) => !Array.isArray(payload[key]));
  if (invalidKey) {
    throw new Error(`${invalidKey} 데이터 형식이 올바르지 않습니다.`);
  }
}

function createEmptyWorkNoteData(): WorkNoteData {
  const now = new Date().toISOString();
  return {
    version: "react-work-note-v1",
    updatedAt: now,
    companies: [],
    notes: [],
    settlementTasks: [],
    outputTasks: [],
    otherTasks: [],
    accounts: [],
    loadedAt: now
  };
}

function createBackupPayload(data: WorkNoteData, reason: string, options: AnyRecord = {}): AnyRecord {
  const state = cloneBackupState(data);
  return {
    app: "work-note",
    version: data.version && data.version !== "unknown" ? data.version : "react-work-note-v1",
    backupCreatedAt: new Date().toISOString(),
    reason,
    updatedAt: data.updatedAt,
    backupType: firstText(options, ["backupType"]) || "records-json",
    attachmentStorage: firstText(options, ["attachmentStorage"]) || "indexedDB",
    fileOriginalsIncluded: Boolean(options.fileOriginalsIncluded),
    missingFileOriginals: Number(options.missingFileOriginals) || 0,
    companies: Array.isArray(options.companies) ? options.companies : state.companies,
    notes: Array.isArray(options.notes) ? options.notes : state.notes,
    settlementTasks: Array.isArray(options.settlementTasks) ? options.settlementTasks : state.settlementTasks,
    outputTasks: Array.isArray(options.outputTasks) ? options.outputTasks : state.outputTasks,
    otherTasks: Array.isArray(options.otherTasks) ? options.otherTasks : state.otherTasks,
    accounts: Array.isArray(options.accounts) ? options.accounts : state.accounts
  };
}

function cloneBackupState(data: WorkNoteData): Pick<WorkNoteData, "companies" | "notes" | "settlementTasks" | "outputTasks" | "otherTasks" | "accounts"> {
  return {
    companies: JSON.parse(JSON.stringify(asArray(data.companies))),
    notes: JSON.parse(JSON.stringify(asArray(data.notes))),
    settlementTasks: JSON.parse(JSON.stringify(asArray(data.settlementTasks))),
    outputTasks: JSON.parse(JSON.stringify(asArray(data.outputTasks))),
    otherTasks: JSON.parse(JSON.stringify(asArray(data.otherTasks))),
    accounts: JSON.parse(JSON.stringify(asArray(data.accounts)))
  };
}

function downloadJson(payload: AnyRecord, filename: string) {
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), filename, "application/json");
}

function downloadPreImportBackup(data: WorkNoteData, reason: string) {
  const payload = createBackupPayload(data, reason);
  downloadJson(payload, `work-note-${reason}-${getFilenameTimestamp()}.json`);
}

async function auditAttachmentStorage(data: WorkNoteData): Promise<{
  totalCount: number;
  foundCount: number;
  missing: Array<{ id: string; ownerTitle: string; fileName: string }>;
}> {
  const attachments = collectAttachmentMetadata(data);
  const missing: Array<{ id: string; ownerTitle: string; fileName: string }> = [];
  let foundCount = 0;

  for (const attachment of attachments) {
    const record = await getAttachmentRecord(attachment.id);
    if (record?.blob) {
      foundCount += 1;
    } else {
      missing.push(attachment);
    }
  }

  return {
    totalCount: attachments.length,
    foundCount,
    missing
  };
}

function collectAttachmentMetadata(data: WorkNoteData): Array<{ id: string; ownerTitle: string; fileName: string }> {
  const items: Array<{ id: string; ownerTitle: string; fileName: string }> = [];
  getAttachmentOwnerGroups(data).forEach((ownerGroup) => {
    ownerGroup.items.forEach((owner) => {
      const ownerTitle = attachmentOwnerTitle(ownerGroup.type, owner);
      asArray(owner.attachments).forEach((attachment) => {
        const id = firstText(attachment, ["id"]);
        if (!id) return;
        items.push({
          id,
          ownerTitle,
          fileName: firstText(attachment, ["fileName", "name", "filename"]) || "attachment"
        });
      });
    });
  });
  return items;
}

function attachmentOwnerTitle(type: AttachmentOwnerType, owner: AnyRecord): string {
  if (type === "company") return companyName(owner) || "업체";
  if (type === "sales") return salesCustomer(owner);
  if (type === "settlement") return workTitle(owner, "settlement");
  if (type === "output") return workTitle(owner, "output");
  return workTitle(owner, "other");
}

function getBackupRecordCounts(data: Pick<WorkNoteData, "companies" | "notes" | "settlementTasks" | "outputTasks" | "otherTasks" | "accounts">): Record<string, number> {
  return {
    companies: asArray(data.companies).length,
    notes: asArray(data.notes).length,
    settlementTasks: asArray(data.settlementTasks).length,
    outputTasks: asArray(data.outputTasks).length,
    otherTasks: asArray(data.otherTasks).length,
    accounts: asArray(data.accounts).length
  };
}

function compareBackupCounts(expected: Record<string, number>, actual: Record<string, number>): string[] {
  return Object.keys(expected)
    .filter((key) => expected[key] !== actual[key])
    .map((key) => `${key}: 예상 ${expected[key]}건 / 확인 ${actual[key]}건`);
}

function downloadWorkNoteCsv(data: WorkNoteData) {
  const headers = [
    "구분",
    "제목/업체",
    "담당자",
    "연락처",
    "이메일",
    "상태",
    "중요도",
    "시작일",
    "종료/다음일",
    "금액/요약",
    "관련 내용",
    "첨부 수",
    "최종 수정",
    "메모"
  ];
  const rows: string[][] = [];
  const addRow = (values: Array<string | number | boolean | null | undefined>) => {
    rows.push(values.map((value) => clean(value)));
  };

  asArray(data.companies).forEach((company) => {
    const contacts = asArray(company.contacts);
    const primary = contacts.find((contact) => Boolean(contact.isPrimary)) || contacts[0] || {};
    addRow([
      "업체",
      companyName(company),
      firstText(primary, ["name", "contactName"]),
      firstText(primary, ["phone", "contactPhone", "mobile"]) || firstText(company, ["mainPhone", "phone"]),
      firstText(primary, ["email", "contactEmail"]) || firstText(company, ["mainEmail", "email"]),
      firstText(company, ["status", "tradeStatus"]),
      "",
      "",
      "",
      firstText(company, ["businessType", "category"]),
      firstText(company, ["address", "businessNumber"]),
      asArray(company.attachments).length,
      firstText(company, ["updatedAt"]),
      summarizeForCsv(firstText(company, ["memo", "note"]))
    ]);
  });

  asArray(data.notes).forEach((note) => {
    addRow([
      "영업",
      salesCustomer(note),
      firstText(note, ["contactName", "managerName"]),
      firstText(note, ["contactPhone", "phone", "contact", "mobile"]),
      firstText(note, ["contactEmail", "email"]),
      firstText(note, ["status", "progressStatus"]),
      firstText(note, ["priority", "importance"]),
      firstText(note, ["lastContactDate"]),
      firstText(note, ["meetingDate", "nextContactDate"]),
      joinParts([
        formatMoneyWithVat(firstText(note, ["expectedRevenueAmount"]), note.expectedRevenueVatIncluded),
        formatMoneyWithVat(firstText(note, ["revenueAmount"]), note.revenueAmountVatIncluded),
        firstText(note, ["revenueType"])
      ], " / "),
      joinParts([salesInterest(note), firstText(note, ["itemCategory"]), firstText(note, ["quoteStatus"]), firstText(note, ["purchasePossibility"]), firstText(note, ["nextAction"])], " / "),
      asArray(note.attachments).length,
      firstText(note, ["updatedAt"]),
      summarizeForCsv(firstText(note, ["memo", "description", "note"]))
    ]);
  });

  asArray(data.settlementTasks).forEach((record) => {
    addRow([
      "정산",
      workTitle(record, "settlement"),
      firstText(record, ["contactName", "requester", "assignee", "owner"]),
      firstText(record, ["contactPhone", "phone", "mobile"]),
      firstText(record, ["contactEmail", "email"]),
      firstText(record, ["status", "progressStatus"]),
      firstText(record, ["priority", "importance"]),
      firstText(record, ["startDate"]),
      firstText(record, ["nextActionDate", "endDate", "dueDate"]),
      joinParts([
        formatMoneyWithVat(firstText(record, ["totalAmount", "advanceAmount"]), record.totalAmountVatIncluded || record.advanceAmountVatIncluded),
        formatMoneyWithVat(firstText(record, ["receivedAmount", "deductedAmount"]), record.receivedAmountVatIncluded || record.deductedAmountVatIncluded)
      ], " / "),
      joinParts([companyName(record), firstText(record, ["paymentType"]), firstText(record, ["nextAction"])], " / "),
      asArray(record.attachments).length,
      firstText(record, ["updatedAt"]),
      summarizeForCsv(joinParts([firstText(record, ["memo", "description", "note"]), firstText(record, ["plan"])], "\n"))
    ]);
  });

  asArray(data.outputTasks).forEach((record) => {
    addRow([
      "출력",
      workTitle(record, "output"),
      firstText(record, ["contactName", "requester", "assignee", "owner"]),
      firstText(record, ["contactPhone", "phone", "mobile"]),
      firstText(record, ["contactEmail", "email"]),
      firstText(record, ["status", "progressStatus"]),
      firstText(record, ["priority", "importance"]),
      firstText(record, ["startDate", "dueStartDate"]),
      firstText(record, ["endDate", "dueEndDate", "deadline", "dueDate"]),
      firstText(record, ["outputType", "category", "taskType"]),
      companyName(record),
      asArray(record.attachments).length,
      firstText(record, ["updatedAt"]),
      summarizeForCsv(firstText(record, ["memo", "description", "note"]))
    ]);
  });

  asArray(data.otherTasks).forEach((record) => {
    addRow([
      "기타",
      workTitle(record, "other"),
      firstText(record, ["contactName", "requester", "assignee", "owner"]),
      firstText(record, ["contactPhone", "phone", "mobile"]),
      firstText(record, ["contactEmail", "email"]),
      firstText(record, ["status", "progressStatus"]),
      firstText(record, ["priority", "importance"]),
      firstText(record, ["startDate", "dueStartDate"]),
      firstText(record, ["endDate", "dueEndDate", "deadline", "dueDate"]),
      firstText(record, ["category", "taskType"]),
      companyName(record),
      asArray(record.attachments).length,
      firstText(record, ["updatedAt"]),
      summarizeForCsv(firstText(record, ["memo", "description", "note"]))
    ]);
  });

  asArray(data.accounts).forEach((account) => {
    addRow([
      "계정",
      firstText(account, ["siteName", "name"]),
      firstText(account, ["owner"]),
      "",
      "",
      "",
      "",
      firstText(account, ["accountCreatedDate", "createdDate"]),
      firstText(account, ["passwordChangedDate"]),
      firstText(account, ["purpose"]),
      joinParts([firstText(account, ["siteUrl", "url"]), firstText(account, ["username", "id"])], " / "),
      "",
      firstText(account, ["updatedAt"]),
      summarizeForCsv(firstText(account, ["memo", "note"]))
    ]);
  });

  const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
  downloadBlob(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }), `work-note-export-${getFilenameTimestamp()}.csv`, "text/csv;charset=utf-8");
}

function escapeCsv(value: string): string {
  const text = clean(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function summarizeForCsv(value: string): string {
  return clean(value).replace(/\s+/g, " ").slice(0, 500);
}

function getFilenameTimestamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

async function createFullBackupZipBlob(data: WorkNoteData): Promise<{ blob: Blob; totalCount: number; missingCount: number }> {
  const backupState = cloneBackupState(data);
  const fileEntries: Array<{ path: string; data: Uint8Array }> = [];
  let totalCount = 0;
  let missingCount = 0;

  for (const ownerGroup of getAttachmentOwnerGroups(backupState)) {
    for (const owner of ownerGroup.items) {
      const attachments = asArray(owner.attachments);
      owner.attachments = attachments;
      for (const attachment of attachments) {
        totalCount += 1;
        const backupPath = createAttachmentBackupPath(ownerGroup.type, owner, attachment);
        attachment.backupPath = backupPath;
        try {
          const record = await getAttachmentRecord(firstText(attachment, ["id"]));
          if (!record?.blob) {
            attachment.missingOriginal = true;
            missingCount += 1;
            continue;
          }
          fileEntries.push({
            path: backupPath,
            data: new Uint8Array(await record.blob.arrayBuffer())
          });
        } catch {
          attachment.missingOriginal = true;
          missingCount += 1;
        }
      }
    }
  }

  const payload = createBackupPayload(data, "full-zip", {
    backupType: "full-zip",
    attachmentStorage: "zip/attachments",
    fileOriginalsIncluded: missingCount === 0,
    missingFileOriginals: missingCount,
    companies: backupState.companies,
    notes: backupState.notes,
    settlementTasks: backupState.settlementTasks,
    outputTasks: backupState.outputTasks,
    otherTasks: backupState.otherTasks,
    accounts: backupState.accounts
  });

  return {
    blob: createZipBlob([
      { path: "backup.json", data: textToBytes(JSON.stringify(payload, null, 2)) },
      ...fileEntries
    ]),
    totalCount,
    missingCount
  };
}

function getAttachmentOwnerGroups(data: Pick<WorkNoteData, "companies" | "notes" | "settlementTasks" | "outputTasks" | "otherTasks">): Array<{ type: AttachmentOwnerType; items: AnyRecord[] }> {
  return [
    { type: "company", items: asArray(data.companies) },
    { type: "sales", items: asArray(data.notes) },
    { type: "settlement", items: asArray(data.settlementTasks) },
    { type: "output", items: asArray(data.outputTasks) },
    { type: "other", items: asArray(data.otherTasks) }
  ];
}

function collectAttachmentIdsFromData(data: Pick<WorkNoteData, "companies" | "notes" | "settlementTasks" | "outputTasks" | "otherTasks">): Set<string> {
  const ids = new Set<string>();
  getAttachmentOwnerGroups(data).forEach((ownerGroup) => {
    ownerGroup.items.forEach((owner) => {
      asArray(owner.attachments).forEach((attachment) => {
        const id = firstText(attachment, ["id"]);
        if (id) ids.add(id);
      });
    });
  });
  return ids;
}

function createAttachmentBackupPath(type: AttachmentOwnerType, owner: AnyRecord, attachment: AnyRecord): string {
  const ownerId = sanitizePathSegment(firstText(owner, ["id"]) || "unknown");
  const fileId = sanitizePathSegment(firstText(attachment, ["id"]) || createId("file_"));
  const fileName = sanitizeFileName(firstText(attachment, ["fileName", "name", "filename"]) || "attachment");
  return `attachments/${type}/${ownerId}/${fileId}-${fileName}`;
}

function sanitizePathSegment(value: string): string {
  return clean(value)
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120) || "item";
}

function sanitizeFileName(value: string): string {
  return sanitizePathSegment((value || "attachment").split(/[\\/]/).pop() || "attachment");
}

function createZipBlob(entries: Array<{ path: string; data: Uint8Array | string }>): Blob {
  const chunks: BlobPart[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;
  const now = new Date();
  const dosTime = getDosTime(now);
  const dosDate = getDosDate(now);

  entries.forEach((entry) => {
    const nameBytes = textToBytes(entry.path);
    const data = entry.data instanceof Uint8Array ? entry.data : textToBytes(String(entry.data || ""));
    const crc = calculateCrc32(data);
    const size = data.length;
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);

    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, size, true);
    localView.setUint32(22, size, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);
    chunks.push(bytesToBlobPart(localHeader), bytesToBlobPart(data));

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, size, true);
    centralView.setUint32(24, size, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralDirectory.push(centralHeader);
    offset += localHeader.length + data.length;
  });

  const centralOffset = offset;
  let centralSize = 0;
  centralDirectory.forEach((header) => {
    chunks.push(bytesToBlobPart(header));
    centralSize += header.length;
  });

  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  endView.setUint16(20, 0, true);
  chunks.push(bytesToBlobPart(endRecord));

  return new Blob(chunks, { type: "application/zip" });
}

function bytesToBlobPart(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}

function calculateCrc32(data: Uint8Array): number {
  const table = getZipCrcTable();
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    crc = (crc >>> 8) ^ table[(crc ^ data[index]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getZipCrcTable(): Uint32Array {
  if (zipCrcTable) return zipCrcTable;
  zipCrcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    zipCrcTable[index] = value >>> 0;
  }
  return zipCrcTable;
}

function textToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function getDosTime(date: Date): number {
  return (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
}

function getDosDate(date: Date): number {
  return ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
}

async function readFullBackupZip(file: Blob): Promise<{ data: WorkNoteData; files: { records: AttachmentRecord[]; missingCount: number } }> {
  const zipEntries = parseZipArchive(new Uint8Array(await file.arrayBuffer()));
  const backupEntry = findZipBackupJson(zipEntries);
  if (!backupEntry) {
    throw new Error("ZIP 안에서 backup.json을 찾지 못했습니다.");
  }
  const parsed = JSON.parse(new TextDecoder().decode(backupEntry.data)) as AnyRecord;
  const data = normalizeBackupToWorkNote(extractBackupData(parsed));
  validateWorkNotePayload(data);
  return { data, files: collectZipAttachmentRecords(data, zipEntries) };
}

function parseZipArchive(bytes: Uint8Array): Map<string, { path: string; data: Uint8Array }> {
  const entries = new Map<string, { path: string; data: Uint8Array }>();
  const decoder = new TextDecoder();
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    const signature = readZipUint32(bytes, offset);
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    if (signature !== 0x04034b50) {
      if (offset === 0) throw new Error("ZIP 파일 형식이 아닙니다.");
      break;
    }

    const flags = readZipUint16(bytes, offset + 6);
    const method = readZipUint16(bytes, offset + 8);
    const compressedSize = readZipUint32(bytes, offset + 18);
    const fileNameLength = readZipUint16(bytes, offset + 26);
    const extraLength = readZipUint16(bytes, offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + fileNameLength;
    const dataStart = nameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;

    if (flags & 0x0008) {
      throw new Error("데이터 설명자가 포함된 ZIP은 아직 불러올 수 없습니다. Work Note에서 만든 전체 ZIP을 사용해 주세요.");
    }
    if (method !== 0) {
      throw new Error("압축된 ZIP 항목은 아직 불러올 수 없습니다. Work Note에서 만든 전체 ZIP을 사용해 주세요.");
    }
    if (dataEnd > bytes.length) {
      throw new Error("ZIP 파일이 손상되었거나 일부가 누락되었습니다.");
    }

    const path = decoder.decode(bytes.slice(nameStart, nameEnd)).replace(/\\/g, "/");
    entries.set(path, { path, data: bytes.slice(dataStart, dataEnd) });
    offset = dataEnd;
  }

  return entries;
}

function findZipBackupJson(zipEntries: Map<string, { path: string; data: Uint8Array }>): { path: string; data: Uint8Array } | null {
  return zipEntries.get("backup.json")
    || Array.from(zipEntries.values()).find((entry) => entry.path.toLowerCase().endsWith("/backup.json") || entry.path.toLowerCase() === "backup.json")
    || null;
}

function readZipUint16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readZipUint32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function extractBackupData(parsed: AnyRecord): AnyRecord {
  return parsed && parsed.data && Array.isArray((parsed.data as AnyRecord).notes) ? parsed.data as AnyRecord : parsed;
}

function normalizeBackupToWorkNote(backupData: AnyRecord): WorkNoteData {
  return {
    version: firstText(backupData, ["version"]) || "react-work-note-v1",
    updatedAt: firstText(backupData, ["updatedAt", "backupCreatedAt"]) || new Date().toISOString(),
    companies: asArray(backupData.companies),
    notes: asArray(backupData.notes),
    settlementTasks: asArray(backupData.settlementTasks),
    outputTasks: asArray(backupData.outputTasks),
    otherTasks: asArray(backupData.otherTasks),
    accounts: asArray(backupData.accounts),
    loadedAt: new Date().toISOString()
  };
}

function collectZipAttachmentRecords(
  backupData: Pick<WorkNoteData, "companies" | "notes" | "settlementTasks" | "outputTasks" | "otherTasks">,
  zipEntries: Map<string, { path: string; data: Uint8Array }>
): { records: AttachmentRecord[]; missingCount: number } {
  const records: AttachmentRecord[] = [];
  let missingCount = 0;

  getAttachmentOwnerGroups(backupData).forEach((ownerGroup) => {
    ownerGroup.items.forEach((owner) => {
      asArray(owner.attachments).forEach((attachment) => {
        const id = firstText(attachment, ["id"]);
        if (!id) return;
        const backupPath = firstText(attachment, ["backupPath"]).replace(/\\/g, "/");
        const entry = backupPath ? zipEntries.get(backupPath) : null;
        if (!entry) {
          missingCount += 1;
          return;
        }
        records.push({
          ...attachment,
          id,
          fileName: firstText(attachment, ["fileName", "name", "filename"]) || "attachment",
          fileType: firstText(attachment, ["fileType"]) || "application/octet-stream",
          fileSize: Number(attachment.fileSize) || entry.data.length,
          backupOwnerType: ownerGroup.type,
          backupOwnerId: firstText(owner, ["id"]),
          blob: new Blob([bytesToBlobPart(entry.data)], { type: firstText(attachment, ["fileType"]) || "application/octet-stream" })
        });
      });
    });
  });

  return { records, missingCount };
}

async function restoreZipAttachmentRecords(
  files: { records: AttachmentRecord[]; missingCount: number },
  targetData: Pick<WorkNoteData, "companies" | "notes" | "settlementTasks" | "outputTasks" | "otherTasks">
): Promise<void> {
  const targetIds = collectAttachmentIdsFromData(targetData);
  for (const record of files.records) {
    if (!targetIds.has(record.id)) continue;
    const { backupOwnerType, backupOwnerId, backupPath, missingOriginal, ...recordData } = record;
    await putAttachmentRecord(recordData as AttachmentRecord);
  }
}

function mergeBackupData(current: WorkNoteData, incomingRaw: AnyRecord): WorkNoteData {
  const incoming = normalizeBackupToWorkNote(incomingRaw);
  const next: WorkNoteData = {
    ...normalizeBackupToWorkNote(current),
    version: incoming.version || current.version || "react-work-note-v1",
    updatedAt: new Date().toISOString(),
    companies: mergeRecordList("company", current.companies, incoming.companies),
    notes: [],
    settlementTasks: [],
    outputTasks: [],
    otherTasks: [],
    accounts: [],
    loadedAt: new Date().toISOString()
  };

  const companyIdMap = createIdMap(current.companies, incoming.companies, next.companies, "company");
  remapCompanyLinks(incoming.notes, companyIdMap);
  remapCompanyLinks(incoming.settlementTasks, companyIdMap);
  remapCompanyLinks(incoming.outputTasks, companyIdMap);
  remapCompanyLinks(incoming.otherTasks, companyIdMap);

  next.notes = mergeRecordList("sales", current.notes, incoming.notes);
  const salesIdMap = createIdMap(current.notes, incoming.notes, next.notes, "sales");
  remapSalesLinks(incoming.settlementTasks, salesIdMap);
  remapSalesLinks(incoming.outputTasks, salesIdMap);

  next.settlementTasks = mergeRecordList("settlement", current.settlementTasks, incoming.settlementTasks);
  next.outputTasks = mergeRecordList("output", current.outputTasks, incoming.outputTasks);
  next.otherTasks = mergeRecordList("other", current.otherTasks, incoming.otherTasks);
  next.accounts = mergeRecordList("account", current.accounts, incoming.accounts);
  return next;
}

function createIdMap(current: AnyRecord[], incoming: AnyRecord[], merged: AnyRecord[], type: string): Map<string, string> {
  const map = new Map<string, string>();
  incoming.forEach((item, index) => {
    const originalId = firstText(item, ["id"]) || recordId(item, index);
    const key = createMergeKey(type, item, index);
    const mergedItem = merged.find((candidate, candidateIndex) => firstText(candidate, ["id"]) === originalId || createMergeKey(type, candidate, candidateIndex) === key)
      || current.find((candidate, candidateIndex) => firstText(candidate, ["id"]) === originalId || createMergeKey(type, candidate, candidateIndex) === key);
    if (originalId && mergedItem) map.set(originalId, firstText(mergedItem, ["id"]) || originalId);
  });
  return map;
}

function remapCompanyLinks(records: AnyRecord[], companyIdMap: Map<string, string>) {
  records.forEach((record) => {
    const companyId = firstText(record, ["companyId"]);
    if (companyId && companyIdMap.has(companyId)) record.companyId = companyIdMap.get(companyId);
  });
}

function remapSalesLinks(records: AnyRecord[], salesIdMap: Map<string, string>) {
  records.forEach((record) => {
    const salesNoteId = firstText(record, ["salesNoteId"]);
    if (salesNoteId && salesIdMap.has(salesNoteId)) record.salesNoteId = salesIdMap.get(salesNoteId);
  });
}

function mergeRecordList(type: string, currentList: AnyRecord[], incomingList: AnyRecord[]): AnyRecord[] {
  const next = JSON.parse(JSON.stringify(asArray(currentList))) as AnyRecord[];
  const usedIds = new Set(next.map((item) => firstText(item, ["id"])).filter(Boolean));

  asArray(incomingList).forEach((incomingItem, index) => {
    const item = JSON.parse(JSON.stringify(incomingItem)) as AnyRecord;
    const itemId = firstText(item, ["id"]);
    const itemKey = createMergeKey(type, item, index);
    const existingIndex = next.findIndex((candidate, candidateIndex) => (
      (itemId && firstText(candidate, ["id"]) === itemId) || (itemKey && createMergeKey(type, candidate, candidateIndex) === itemKey)
    ));

    if (existingIndex >= 0) {
      const existing = next[existingIndex];
      next[existingIndex] = {
        ...existing,
        ...item,
        id: firstText(existing, ["id"]) || itemId || createId(`${type}_`),
        createdAt: firstText(existing, ["createdAt"]) || firstText(item, ["createdAt"]),
        memo: mergeLongText(firstText(existing, ["memo"]), firstText(item, ["memo"])),
        plan: mergeLongText(firstText(existing, ["plan"]), firstText(item, ["plan"])),
        contacts: type === "company" ? mergeContactList(asArray(existing.contacts), asArray(item.contacts)) : item.contacts || existing.contacts,
        attachments: mergeAttachmentList(asArray(existing.attachments), asArray(item.attachments))
      };
      return;
    }

    if (!item.id || usedIds.has(firstText(item, ["id"]))) {
      item.id = createUniqueImportedId(type, usedIds);
    }
    usedIds.add(firstText(item, ["id"]));
    next.push(item);
  });

  return next;
}

function createMergeKey(type: string, item: AnyRecord, index: number): string {
  if (type === "company") return normalizeMergeText(companyName(item));
  if (type === "account") {
    return normalizeMergeText([firstText(item, ["siteUrl", "url"]), firstText(item, ["siteName", "name"]), firstText(item, ["username", "id"])].join("|"));
  }
  if (type === "sales") {
    return normalizeMergeText([firstText(item, ["companyId"]), salesCustomer(item), firstText(item, ["contactName"]), salesInterest(item)].join("|"));
  }
  return normalizeMergeText([firstText(item, ["companyId"]), companyName(item), firstText(item, ["title", "outputType", "paymentType"]), firstText(item, ["startDate", "nextActionDate", "endDate"])].join("|")) || `${type}-${index}`;
}

function normalizeMergeText(value: string): string {
  return clean(value).toLowerCase().replace(/\s+/g, "");
}

function createUniqueImportedId(type: string, usedIds: Set<string>): string {
  let id = createId(`${type}_`);
  while (usedIds.has(id)) id = createId(`${type}_`);
  usedIds.add(id);
  return id;
}

function mergeLongText(current: string, incoming: string): string {
  const before = clean(current);
  const after = clean(incoming);
  if (!before) return after;
  if (!after) return before;
  if (after.includes(before)) return after;
  if (before.includes(after)) return before;
  return `${after}\n\n--- 기존 메모 ---\n${before}`;
}

function mergeContactList(currentContacts: AnyRecord[], incomingContacts: AnyRecord[]): AnyRecord[] {
  const next = JSON.parse(JSON.stringify(asArray(currentContacts))) as AnyRecord[];
  const bySignature = new Map<string, AnyRecord>();
  next.forEach((contact) => {
    const signature = createContactSignature(contact);
    if (signature) bySignature.set(signature, contact);
  });
  asArray(incomingContacts).forEach((contact, index) => {
    const item = { ...contact };
    const signature = createContactSignature(item) || `contact-${index}`;
    const existing = bySignature.get(signature);
    if (existing) {
      Object.assign(existing, item, { id: firstText(existing, ["id"]) || firstText(item, ["id"]) || createId("contact_") });
      return;
    }
    if (!firstText(item, ["id"])) item.id = createId("contact_");
    next.push(item);
    bySignature.set(signature, item);
  });
  return next;
}

function createContactSignature(contact: AnyRecord): string {
  return normalizeMergeText([firstText(contact, ["name", "contactName"]), firstText(contact, ["phone", "contactPhone", "mobile"]), firstText(contact, ["email", "contactEmail"])].join("|"));
}

function mergeAttachmentList(currentAttachments: AnyRecord[], incomingAttachments: AnyRecord[]): AnyRecord[] {
  const next = JSON.parse(JSON.stringify(asArray(currentAttachments))) as AnyRecord[];
  const byId = new Map<string, AnyRecord>();
  const bySignature = new Map<string, AnyRecord>();
  next.forEach((attachment) => {
    const id = firstText(attachment, ["id"]);
    const signature = createAttachmentSignature(attachment);
    if (id) byId.set(id, attachment);
    if (signature) bySignature.set(signature, attachment);
  });
  const usedIds = new Set(next.map((attachment) => firstText(attachment, ["id"])).filter(Boolean));

  asArray(incomingAttachments).forEach((attachment) => {
    const item = { ...attachment };
    const id = firstText(item, ["id"]);
    const signature = createAttachmentSignature(item);
    const existing = (id && byId.get(id)) || (signature && bySignature.get(signature)) || null;
    if (existing) {
      Object.assign(existing, item, { id: firstText(existing, ["id"]) || id });
      return;
    }
    if (!item.id || usedIds.has(firstText(item, ["id"]))) {
      item.id = createUniqueImportedId("file", usedIds);
    }
    usedIds.add(firstText(item, ["id"]));
    next.push(item);
  });

  return next;
}

function createAttachmentSignature(attachment: AnyRecord): string {
  return normalizeMergeText([firstText(attachment, ["fileName", "name", "filename"]), firstText(attachment, ["fileSize"]), firstText(attachment, ["category"]), firstText(attachment, ["sentDate"])].join("|"));
}

function createBlankSalesNote(): AnyRecord {
  return {
    id: "",
    companyId: "",
    contactId: "",
    companyUnknown: false,
    company: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    interest: "",
    itemCategory: "장비",
    status: SALES_STATUS_OPTIONS[0],
    priority: "보통",
    meetingDate: "",
    nextAction: "",
    nextContactDate: "",
    nextContactUnknown: false,
    lastContactDate: "",
    quoteStatus: "미진행",
    purchasePossibility: "미정",
    expectedRevenueAmount: "",
    expectedRevenueVatIncluded: false,
    revenueAmount: "",
    revenueAmountVatIncluded: false,
    revenueType: "",
    memo: "",
    attachments: []
  };
}

function prepareSalesDraft(note: AnyRecord, index: number): AnyRecord {
  return {
    ...createBlankSalesNote(),
    ...note,
    id: recordId(note, index),
    company: salesCustomer(note) === "고객 미정" ? "" : salesCustomer(note),
    contactName: firstText(note, ["contactName", "managerName"]),
    contactPhone: firstText(note, ["contactPhone", "phone", "contact", "mobile"]),
    contactEmail: firstText(note, ["contactEmail", "email"]),
    itemCategory: salesCategory(note) || "장비",
    status: salesStatus(note) || SALES_STATUS_OPTIONS[0],
    priority: salesPriority(note) || "보통",
    interest: salesInterest(note),
    quoteStatus: firstText(note, ["quoteStatus"]) || "미진행",
    purchasePossibility: firstText(note, ["purchasePossibility"]) || "미정",
    expectedRevenueAmount: firstText(note, ["expectedRevenueAmount"]),
    revenueAmount: firstText(note, ["revenueAmount"]),
    revenueType: firstText(note, ["revenueType"]),
    memo: firstText(note, ["memo", "description", "note"])
  };
}

function normalizeSalesDraft(draft: AnyRecord, companies: AnyRecord[]): AnyRecord {
  const company = firstText(draft, ["companyId"])
    ? companies.find((item, index) => recordId(item, index) === firstText(draft, ["companyId"]))
    : null;
  const contact = company && firstText(draft, ["contactId"])
    ? asArray(company.contacts).find((item, index) => recordId(item, index) === firstText(draft, ["contactId"]))
    : null;
  const companyUnknown = Boolean(draft.companyUnknown);

  return {
    id: firstText(draft, ["id"]) || createId("note_"),
    companyId: companyUnknown ? "" : firstText(draft, ["companyId"]),
    contactId: companyUnknown ? "" : firstText(draft, ["contactId"]),
    companyUnknown,
    company: companyUnknown ? "" : (company ? companyName(company) : firstText(draft, ["company"])),
    contactName: companyUnknown ? "" : (contact ? firstText(contact, ["name", "contactName"]) : firstText(draft, ["contactName"])),
    contactPhone: companyUnknown ? "" : (contact ? firstText(contact, ["phone", "contactPhone"]) : firstText(draft, ["contactPhone"])),
    contactEmail: companyUnknown ? "" : (contact ? firstText(contact, ["email", "contactEmail"]) : firstText(draft, ["contactEmail"])),
    interest: firstText(draft, ["interest"]),
    itemCategory: normalizeSalesItemCategory(firstText(draft, ["itemCategory"])),
    status: normalizeSalesStatus(firstText(draft, ["status"])),
    priority: PRIORITY_OPTIONS.includes(firstText(draft, ["priority"])) ? firstText(draft, ["priority"]) : "보통",
    meetingDate: firstText(draft, ["meetingDate"]),
    nextAction: firstText(draft, ["nextAction"]),
    nextContactDate: Boolean(draft.nextContactUnknown) ? "" : firstText(draft, ["nextContactDate"]),
    nextContactUnknown: Boolean(draft.nextContactUnknown),
    lastContactDate: firstText(draft, ["lastContactDate"]),
    memo: firstText(draft, ["memo"]),
    quoteStatus: firstText(draft, ["quoteStatus"]),
    purchasePossibility: firstText(draft, ["purchasePossibility"]),
    expectedRevenueAmount: normalizeAmountString(firstText(draft, ["expectedRevenueAmount"])),
    expectedRevenueVatIncluded: Boolean(draft.expectedRevenueVatIncluded),
    revenueAmount: normalizeAmountString(firstText(draft, ["revenueAmount"])),
    revenueAmountVatIncluded: Boolean(draft.revenueAmountVatIncluded),
    revenueType: firstText(draft, ["revenueType"])
  };
}

function normalizeSalesStatus(value: string): string {
  if (value === "자료 발송" || value === "견적 진행") return "1차 대응 완료";
  return SALES_STATUS_OPTIONS.includes(value) ? value : SALES_STATUS_OPTIONS[0];
}

function normalizeSalesItemCategory(value: string): string {
  return SALES_ITEM_CATEGORY_OPTIONS.includes(value) ? value : "장비";
}

function normalizeAmountString(value: string): string {
  const text = clean(value).replace(/,/g, "");
  if (!text) return "";
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0) return "";
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2)));
}

function createBlankCompany(): AnyRecord {
  return {
    id: "",
    name: "",
    businessNumber: "",
    representative: "",
    businessType: "",
    status: "검토중",
    address: "",
    mainPhone: "",
    mainEmail: "",
    memo: "",
    contacts: []
  };
}

function prepareCompanyDraft(company: AnyRecord, index: number): AnyRecord {
  return {
    ...createBlankCompany(),
    ...company,
    id: recordId(company, index),
    name: companyName(company),
    representative: firstText(company, ["representative", "representativeName", "ceoName", "owner"]),
    mainPhone: firstText(company, ["mainPhone", "phone", "contact"]),
    mainEmail: firstText(company, ["mainEmail", "email"]),
    contacts: asArray(company.contacts).map((contact, contactIndex) => ({
      id: recordId(contact, contactIndex),
      name: firstText(contact, ["name", "contactName"]),
      department: firstText(contact, ["department"]),
      title: firstText(contact, ["title"]),
      phone: firstText(contact, ["phone", "contactPhone"]),
      email: firstText(contact, ["email", "contactEmail"]),
      memo: firstText(contact, ["memo"]),
      isPrimary: Boolean(contact.isPrimary)
    }))
  };
}

function normalizeCompanyDraft(draft: AnyRecord): AnyRecord {
  const contacts = asArray(draft.contacts)
    .map((contact, index) => ({
      id: firstText(contact, ["id"]) || createId("contact_"),
      name: firstText(contact, ["name"]),
      department: firstText(contact, ["department"]),
      title: firstText(contact, ["title"]),
      phone: firstText(contact, ["phone"]),
      email: firstText(contact, ["email"]),
      memo: firstText(contact, ["memo"]),
      isPrimary: index === 0
    }))
    .filter((contact) => ["name", "department", "title", "phone", "email", "memo"].some((key) => firstText(contact, [key])));

  return {
    id: firstText(draft, ["id"]) || createId("company_"),
    name: firstText(draft, ["name"]),
    businessNumber: firstText(draft, ["businessNumber"]),
    representative: firstText(draft, ["representative"]),
    businessType: firstText(draft, ["businessType"]),
    status: firstText(draft, ["status"]) || "검토중",
    address: firstText(draft, ["address"]),
    mainPhone: firstText(draft, ["mainPhone"]),
    mainEmail: firstText(draft, ["mainEmail"]),
    memo: firstText(draft, ["memo"]),
    contacts
  };
}

function createBlankAccount(): AnyRecord {
  return {
    id: "",
    siteName: "",
    siteUrl: "",
    username: "",
    password: "",
    purpose: "",
    owner: "",
    accountCreatedDate: "",
    passwordChangedDate: "",
    memo: ""
  };
}

function prepareAccountDraft(account: AnyRecord, index: number): AnyRecord {
  return {
    ...createBlankAccount(),
    ...account,
    id: recordId(account, index),
    siteName: firstText(account, ["siteName", "homepageName", "name"]),
    siteUrl: firstText(account, ["siteUrl", "homepageUrl", "url"]),
    username: firstText(account, ["username", "accountId"])
  };
}

function normalizeAccountDraft(draft: AnyRecord): AnyRecord {
  return {
    id: firstText(draft, ["id"]) || createId("account_"),
    siteName: firstText(draft, ["siteName", "homepageName", "name"]),
    siteUrl: firstText(draft, ["siteUrl", "homepageUrl", "url"]),
    username: firstText(draft, ["username", "accountId"]),
    password: firstText(draft, ["password"]),
    purpose: firstText(draft, ["purpose"]),
    owner: firstText(draft, ["owner"]),
    accountCreatedDate: firstText(draft, ["accountCreatedDate", "createdDate"]),
    passwordChangedDate: firstText(draft, ["passwordChangedDate"]),
    memo: firstText(draft, ["memo"])
  };
}

function createBlankWorkTask(type: "settlement" | "output" | "other"): AnyRecord {
  const today = toDateKey(new Date());
  const common = {
    id: "",
    companyId: "",
    contactId: "",
    companyUnknown: false,
    company: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    startDate: today,
    endDate: today,
    includeWeekends: false,
    status: "대기",
    priority: "보통",
    memo: "",
    attachments: []
  };
  if (type === "settlement") {
    return {
      ...common,
      status: "예정",
      salesNoteId: "",
      salesLinkUnknown: false,
      paymentType: "분할 결제",
      totalAmount: "",
      totalAmountVatIncluded: false,
      advanceAmount: "",
      advanceAmountVatIncluded: false,
      receivedAmount: "",
      receivedAmountVatIncluded: false,
      deductedAmount: "",
      deductedAmountVatIncluded: false,
      installmentProgress: "",
      nextActionDate: today,
      nextAction: "",
      paymentSchedule: [],
      plan: ""
    };
  }
  if (type === "output") {
    return {
      ...common,
      salesNoteId: "",
      salesLinkUnknown: false,
      outputType: ""
    };
  }
  return {
    ...common,
    title: "",
    category: "",
    owner: ""
  };
}

function prepareWorkDraft(record: AnyRecord, index: number, type: "settlement" | "output" | "other"): AnyRecord {
  const blank = createBlankWorkTask(type);
  return {
    ...blank,
    ...record,
    id: recordId(record, index),
    company: companyName(record) === "고객 미정" ? "" : companyName(record),
    contactName: firstText(record, ["contactName", "requester", "assignee", "owner", "managerName"]),
    contactPhone: firstText(record, ["contactPhone", "phone", "mobile"]),
    contactEmail: firstText(record, ["contactEmail", "email"]),
    startDate: firstText(record, ["startDate", "dueStartDate"]),
    endDate: firstText(record, ["endDate", "dueEndDate", "deadline", "dueDate"]),
    status: firstText(record, ["status", "progressStatus"]) || firstText(blank, ["status"]),
    priority: firstText(record, ["priority", "importance"]) || "보통",
    memo: firstText(record, ["memo", "description", "note"]),
    paymentSchedule: asArray(record.paymentSchedule)
  };
}

function normalizeWorkDraft(draft: AnyRecord, type: "settlement" | "output" | "other", data: WorkNoteData): AnyRecord {
  const company = firstText(draft, ["companyId"])
    ? data.companies.find((item, index) => recordId(item, index) === firstText(draft, ["companyId"]))
    : null;
  const contact = company && firstText(draft, ["contactId"])
    ? asArray(company.contacts).find((item, index) => recordId(item, index) === firstText(draft, ["contactId"]))
    : null;
  const companyUnknown = Boolean(draft.companyUnknown);
  const common = {
    id: firstText(draft, ["id"]) || createId(`${type}_`),
    companyId: companyUnknown ? "" : firstText(draft, ["companyId"]),
    contactId: companyUnknown ? "" : firstText(draft, ["contactId"]),
    companyUnknown,
    company: companyUnknown ? "" : (company ? companyName(company) : firstText(draft, ["company"])),
    contactName: companyUnknown ? "" : (contact ? firstText(contact, ["name", "contactName"]) : firstText(draft, ["contactName"])),
    contactPhone: companyUnknown ? "" : (contact ? firstText(contact, ["phone", "contactPhone"]) : firstText(draft, ["contactPhone"])),
    contactEmail: companyUnknown ? "" : (contact ? firstText(contact, ["email", "contactEmail"]) : firstText(draft, ["contactEmail"])),
    startDate: firstText(draft, ["startDate"]),
    endDate: firstText(draft, ["endDate"]),
    includeWeekends: Boolean(draft.includeWeekends),
    memo: firstText(draft, ["memo"])
  };

  if (type === "settlement") {
    const paymentType = SETTLEMENT_PAYMENT_OPTIONS.includes(firstText(draft, ["paymentType"])) ? firstText(draft, ["paymentType"]) : "분할 결제";
    const isAdvance = paymentType.includes("선금");
    return {
      ...common,
      salesNoteId: Boolean(draft.salesLinkUnknown) ? "" : firstText(draft, ["salesNoteId"]),
      salesLinkUnknown: Boolean(draft.salesLinkUnknown),
      paymentType,
      status: SETTLEMENT_STATUS_OPTIONS.includes(firstText(draft, ["status"])) ? firstText(draft, ["status"]) : "예정",
      totalAmount: isAdvance ? "" : normalizeAmountString(firstText(draft, ["totalAmount", "advanceAmount"])),
      totalAmountVatIncluded: Boolean(draft.totalAmountVatIncluded),
      advanceAmount: isAdvance ? normalizeAmountString(firstText(draft, ["advanceAmount", "totalAmount"])) : "",
      advanceAmountVatIncluded: Boolean(draft.advanceAmountVatIncluded),
      receivedAmount: isAdvance ? "" : normalizeAmountString(firstText(draft, ["receivedAmount"])),
      receivedAmountVatIncluded: Boolean(draft.receivedAmountVatIncluded),
      deductedAmount: normalizeAmountString(firstText(draft, ["deductedAmount"])),
      deductedAmountVatIncluded: Boolean(draft.deductedAmountVatIncluded),
      installmentProgress: firstText(draft, ["installmentProgress"]),
      nextActionDate: firstText(draft, ["nextActionDate"]),
      nextAction: firstText(draft, ["nextAction"]),
      paymentSchedule: normalizePaymentSchedule(asArray(draft.paymentSchedule)),
      plan: firstText(draft, ["plan"])
    };
  }

  if (type === "output") {
    return {
      ...common,
      salesNoteId: Boolean(draft.salesLinkUnknown) ? "" : firstText(draft, ["salesNoteId"]),
      salesLinkUnknown: Boolean(draft.salesLinkUnknown),
      status: WORK_STATUS_OPTIONS.includes(firstText(draft, ["status"])) ? firstText(draft, ["status"]) : "대기",
      priority: PRIORITY_OPTIONS.includes(firstText(draft, ["priority"])) ? firstText(draft, ["priority"]) : "보통",
      outputType: firstText(draft, ["outputType"])
    };
  }

  return {
    ...common,
    title: firstText(draft, ["title"]),
    category: firstText(draft, ["category"]),
    owner: firstText(draft, ["owner"]),
    status: WORK_STATUS_OPTIONS.includes(firstText(draft, ["status"])) ? firstText(draft, ["status"]) : "대기",
    priority: PRIORITY_OPTIONS.includes(firstText(draft, ["priority"])) ? firstText(draft, ["priority"]) : "보통"
  };
}

function normalizePaymentSchedule(rows: AnyRecord[]): AnyRecord[] {
  return rows
    .map((row, index) => ({
      id: firstText(row, ["id"]) || createId("pay_"),
      round: firstText(row, ["round"]) || String(index + 1),
      dueDate: parseDateKey(firstText(row, ["dueDate"])) || firstText(row, ["dueDate"]),
      amount: normalizeAmountString(firstText(row, ["amount"])),
      amountVatIncluded: Boolean(row.amountVatIncluded),
      status: firstText(row, ["status"]) || "예정",
      item: firstText(row, ["item", "memo", "description"])
    }))
    .filter((row) => ["dueDate", "amount", "status", "item"].some((key) => firstText(row, [key])));
}

function parseSettlementSchedulePaste(text: string): AnyRecord[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split(/\t|,|;|\||\s{2,}/).map(clean).filter(Boolean);
      const datePart = parts.find((part) => Boolean(parseDateKey(part))) || "";
      const date = parseDateKey(datePart);
      const amountPart = parts.find((part) => parseAmountNumber(part) !== null && !parseDateKey(part) && !/^\d+\s*회?차?$/.test(part));
      const roundPart = parts.find((part) => /회차|^\d+$/.test(part) && !parseDateKey(part) && part !== amountPart);
      const statusPart = parts.find(isLikelySettlementStatus) || "예정";
      const consumed = new Set([datePart, amountPart || "", roundPart || "", statusPart].filter(Boolean));
      const item = parts.filter((part) => !consumed.has(part)).join(" ");
      return {
        id: createId("pay_"),
        round: clean(roundPart).replace(/회차/g, "") || String(index + 1),
        dueDate: date,
        amount: normalizeAmountString(amountPart || ""),
        amountVatIncluded: false,
        status: statusPart,
        item
      };
    })
    .filter((row) => ["dueDate", "amount", "status", "item"].some((key) => firstText(row, [key])));
}

function getSettlementScheduleStats(rows: AnyRecord[], isAdvance: boolean) {
  const normalized = normalizePaymentSchedule(rows);
  const totalAmount = normalized.reduce((sum, row) => sum + (parseAmountNumber(firstText(row, ["amount"])) || 0), 0);
  const completedRows = normalized.filter((row) => isSettlementScheduleRowCompleted(row, isAdvance));
  const completedAmount = completedRows.reduce((sum, row) => sum + (parseAmountNumber(firstText(row, ["amount"])) || 0), 0);
  const nextRow = normalized
    .filter((row) => !isSettlementScheduleRowCompleted(row, isAdvance))
    .sort((a, b) => firstText(a, ["dueDate"]).localeCompare(firstText(b, ["dueDate"])))[0] || null;
  return {
    totalAmount,
    completedAmount,
    remainingAmount: Math.max(0, totalAmount - completedAmount),
    completedCount: completedRows.length,
    nextRow
  };
}

function isLikelySettlementStatus(value: string): boolean {
  const text = clean(value);
  return SETTLEMENT_ROW_STATUS_OPTIONS.includes(text) || /예정|완료|입금|차감|처리|보류|확인|청구|대기|진행/.test(text);
}

function isSettlementScheduleRowCompleted(row: AnyRecord, isAdvance: boolean): boolean {
  const status = firstText(row, ["status"]);
  if (!status || status.includes("청구")) return false;
  if (isAdvance && status.includes("차감")) return true;
  return /입금|처리|결제|완료/.test(status);
}

function isWorkDraftValid(record: AnyRecord, type: "settlement" | "output" | "other"): boolean {
  if (type === "settlement") {
    return Boolean(companyName(record) || record.companyUnknown || firstText(record, ["paymentType", "totalAmount", "advanceAmount", "nextAction", "memo"]));
  }
  if (type === "output") {
    return Boolean(companyName(record) || record.companyUnknown || firstText(record, ["outputType", "memo"]));
  }
  return Boolean(firstText(record, ["title", "memo"]));
}

function countLinkedCompanyRecords(data: WorkNoteData, companyId: string): number {
  return [data.notes, data.settlementTasks, data.outputTasks, data.otherTasks]
    .flat()
    .filter((record) => firstText(record, ["companyId"]) === companyId).length;
}

function clearCompanyLinks(records: AnyRecord[], companyId: string, fallbackName: string): AnyRecord[] {
  return records.map((record) => {
    if (firstText(record, ["companyId"]) !== companyId) return record;
    return {
      ...record,
      companyId: "",
      contactId: "",
      company: companyName(record) || fallbackName
    };
  });
}

function findSimilarCompanies(companies: AnyRecord[], name: string, ownId: string): AnyRecord[] {
  const target = normalizeCompanySimilarityKey(name);
  if (!target) return [];
  return companies.filter((company, index) => {
    const id = recordId(company, index);
    if (id === ownId) return false;
    const key = normalizeCompanySimilarityKey(companyName(company));
    return key && (key === target || isSimilarCompanyNameKey(key, target));
  }).slice(0, 3);
}

function normalizeCompanySimilarityKey(value: string): string {
  return clean(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/주식회사|유한회사|합자회사|합명회사|재단법인|사단법인|\(주\)|㈜|주\)/g, "");
}

function isSimilarCompanyNameKey(a: string, b: string): boolean {
  if (!a || !b || a === b) return false;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (shorter.length >= 3 && longer.includes(shorter) && shorter.length / longer.length >= 0.55) return true;
  const maxLength = Math.max(a.length, b.length);
  if (maxLength < 4) return false;
  return calculateEditDistance(a, b) <= Math.max(1, Math.floor(maxLength * 0.25));
}

function calculateEditDistance(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array(right.length + 1);
  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    for (let j = 0; j <= right.length; j += 1) {
      previous[j] = current[j];
    }
  }
  return previous[right.length];
}

function createId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function collectScheduleItems(data: WorkNoteData): ScheduleItem[] {
  const items: ScheduleItem[] = [];

  data.notes.forEach((note, index) => {
    const company = salesCustomer(note);
    const status = firstText(note, ["status", "progressStatus"]);
    const priority = firstText(note, ["priority", "importance"]);
    addScheduleItem(items, note, index, firstText(note, ["nextContactDate"]), `[영업] ${company} 연락`, firstText(note, ["nextAction", "memo"]), "sales", status, priority);
    addScheduleItem(items, note, index, firstText(note, ["meetingDate"]), `[영업] ${company} 미팅`, firstText(note, ["nextAction", "memo"]), "sales", status, priority);
  });

  data.settlementTasks.forEach((task, index) => {
    if (isClosed(firstText(task, ["status", "progressStatus"]))) return;
    const status = firstText(task, ["status", "progressStatus"]);
    const priority = firstText(task, ["priority", "importance"]);
    const title = workTitle(task, "settlement");
    const isAdvance = firstText(task, ["paymentType"]).includes("선금");
    const rows = normalizePaymentSchedule(asArray(task.paymentSchedule));
    rows
      .filter((row) => !isSettlementScheduleRowCompleted(row, isAdvance))
      .forEach((row, rowIndex) => {
        const rowStatus = firstText(row, ["status"]);
        const round = firstText(row, ["round"]);
        const amount = formatMoney(firstText(row, ["amount"]));
        const item = firstText(row, ["item"]);
        addScheduleItem(
          items,
          task,
          index,
          firstText(row, ["dueDate"]),
          `[정산] ${title} ${round ? `${round}회차` : isAdvance ? "차감" : "결제"}`,
          joinParts([amount, item, rowStatus], " · "),
          "settlement",
          rowStatus || status,
          priority,
          `pay-${recordId(row, rowIndex)}`
        );
      });
    if (!rows.length) {
      addScheduleItem(items, task, index, firstText(task, ["nextActionDate", "nextProcessDate", "nextDate", "dueDate", "dueEndDate", "endDate"]), `[정산] ${title} 처리`, firstText(task, ["nextAction", "memo", "description"]), "settlement", status, priority);
    }
  });

  data.outputTasks.forEach((task, index) => {
    if (isClosed(firstText(task, ["status", "progressStatus"]))) return;
    addWorkDateRangeItems(items, task, index, "output", `[출력] ${workTitle(task, "output")}`, firstText(task, ["memo", "description"]));
  });

  data.otherTasks.forEach((task, index) => {
    if (isClosed(firstText(task, ["status", "progressStatus"]))) return;
    addWorkDateRangeItems(items, task, index, "other", `[기타] ${workTitle(task, "other")}`, firstText(task, ["memo", "description"]));
  });

  return items.sort((a, b) => a.date.localeCompare(b.date) || priorityScoreFromText(b.priority) - priorityScoreFromText(a.priority));
}

function addScheduleItem(
  target: ScheduleItem[],
  record: AnyRecord,
  index: number,
  dateValue: string,
  title: string,
  detail: string,
  type: ScheduleItem["type"],
  status: string,
  priority: string,
  idSuffix = ""
) {
  const date = parseDateKey(dateValue);
  if (!date) return;
  target.push({
    id: `${type}-${recordId(record, index)}-${idSuffix ? `${idSuffix}-` : ""}${date}-${target.length}`,
    date,
    title,
    detail,
    type,
    portal: type,
    recordKey: recordId(record, index),
    status,
    priority
  });
}

function addWorkDateRangeItems(
  target: ScheduleItem[],
  record: AnyRecord,
  index: number,
  type: "output" | "other",
  titlePrefix: string,
  detail: string
) {
  const startKey = parseDateKey(firstText(record, ["startDate", "dueStartDate"])) || parseDateKey(firstText(record, ["dueEndDate", "deadline", "dueDate", "endDate"]));
  const endKey = parseDateKey(firstText(record, ["endDate", "dueEndDate", "deadline", "dueDate"])) || startKey;
  const status = firstText(record, ["status", "progressStatus"]);
  const priority = firstText(record, ["priority", "importance"]);
  if (!startKey || !endKey || endKey < startKey) {
    addScheduleItem(target, record, index, endKey || startKey, `${titlePrefix} 기한`, detail, type, status, priority);
    return;
  }

  const days = getDateRangeKeys(startKey, endKey, Boolean(record.includeWeekends));
  days.forEach((date, dayIndex) => {
    const rangeLabel = days.length > 1 ? `${dayIndex + 1}/${days.length}` : "기한";
    addScheduleItem(target, record, index, date, `${titlePrefix} ${rangeLabel}`, detail || deadlineText(record), type, status, priority, `range-${dayIndex}`);
  });
}

function scrollRecordIntoView(id: string) {
  window.setTimeout(() => {
    const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, "\\$&");
    document.querySelector(`[data-record-id="${escaped}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 80);
}

function collectGlobalResults(data: WorkNoteData, query: string) {
  if (!query.trim()) return [];
  const groups: Array<{ portal: PortalId; records: AnyRecord[]; title: (record: AnyRecord) => string; meta: (record: AnyRecord) => string }> = [
    { portal: "company", records: data.companies, title: companyName, meta: (record) => firstText(record, ["status", "tradeStatus", "phone", "email"]) },
    { portal: "sales", records: data.notes, title: salesCustomer, meta: (record) => firstText(record, ["nextAction", "status", "product"]) },
    { portal: "settlement", records: data.settlementTasks, title: (record) => workTitle(record, "settlement"), meta: deadlineText },
    { portal: "output", records: data.outputTasks, title: (record) => workTitle(record, "output"), meta: deadlineText },
    { portal: "other", records: data.otherTasks, title: (record) => workTitle(record, "other"), meta: deadlineText },
    { portal: "account", records: data.accounts, title: (record) => firstText(record, ["siteName", "homepageName", "siteUrl"]) || "계정", meta: (record) => firstText(record, ["username", "purpose", "owner"]) }
  ];

  return groups.flatMap((group) =>
    group.records
      .filter((record) => matchesRecord(record, query))
      .map((record, index) => ({
        id: `${group.portal}-${recordId(record, index)}`,
        portal: group.portal,
        title: group.title(record),
        meta: group.meta(record) || portals.find((portal) => portal.id === group.portal)?.label || ""
      }))
  );
}

function asArray(value: unknown): AnyRecord[] {
  return Array.isArray(value) ? value.filter((item): item is AnyRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function clean(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function firstText(record: AnyRecord, keys: string[]): string {
  for (const key of keys) {
    const value = clean(record[key]);
    if (value) return value;
  }
  return "";
}

function recordId(record: AnyRecord, index: number): string {
  return firstText(record, ["id", "uuid"]) || `record-${index}`;
}

function companyName(record: AnyRecord): string {
  return firstText(record, ["company", "companyName", "name", "clientName", "relatedCompany", "customerName"]);
}

function companyContactSummary(contact: AnyRecord): string {
  return joinParts(
    [
      firstText(contact, ["name", "contactName"]),
      firstText(contact, ["department"]),
      firstText(contact, ["title"]),
      firstText(contact, ["phone", "contactPhone"]),
      firstText(contact, ["email", "contactEmail"])
    ],
    " · "
  );
}

function getLinkedCompanyForSales(note: AnyRecord, companies: AnyRecord[]): AnyRecord | null {
  const linkedId = firstText(note, ["companyId", "salesCompanyId", "relatedCompanyId"]);
  if (linkedId) {
    const byId = companies.find((company, index) => recordId(company, index) === linkedId || firstText(company, ["id"]) === linkedId);
    if (byId) return byId;
  }

  const name = salesCustomer(note).toLowerCase();
  if (!name || name === "고객 미정") {
    return null;
  }

  return companies.find((company) => companyName(company).toLowerCase() === name) || null;
}

function getLinkedSalesForWork(record: AnyRecord, notes: AnyRecord[]): AnyRecord | null {
  const linkedId = firstText(record, ["salesNoteId", "relatedSalesId", "salesId"]);
  if (linkedId) {
    const byId = notes.find((note, index) => recordId(note, index) === linkedId || firstText(note, ["id"]) === linkedId);
    if (byId) return byId;
  }

  const name = companyName(record).toLowerCase();
  if (!name) return null;
  return notes.find((note) => salesCustomer(note).toLowerCase() === name) || null;
}

function relatedSalesFallback(record: AnyRecord): string {
  if (Boolean(record.salesLinkUnknown)) return "관련 영업: 미정";
  if (firstText(record, ["salesNoteId", "relatedSalesId", "salesId"])) return "관련 영업: 연결 정보 확인 필요";
  return "";
}

function salesCustomer(note: AnyRecord): string {
  return companyName(note) || firstText(note, ["customer", "organization"]) || "고객 미정";
}

function workTitle(record: AnyRecord, type: "settlement" | "output" | "other"): string {
  if (type === "settlement") {
    return companyName(record) || firstText(record, ["title", "taskName"]) || "정산 업무";
  }
  if (type === "output") {
    return firstText(record, ["title", "taskName", "outputName"]) || companyName(record) || "출력 업무";
  }
  return firstText(record, ["title", "taskName", "name"]) || companyName(record) || "기타 업무";
}

function matchesRecord(record: AnyRecord, query: string): boolean {
  if (!query.trim()) return true;
  return JSON.stringify(record).toLowerCase().includes(query.trim().toLowerCase());
}

function matchesText(value: unknown, query: string): boolean {
  if (!query.trim()) return true;
  return JSON.stringify(value).toLowerCase().includes(query.trim().toLowerCase());
}

function getWorkModeCounts(records: AnyRecord[]): { active: number; hold: number; closed: number } {
  return records.reduce<{ active: number; hold: number; closed: number }>(
    (counts, record) => {
      const status = firstText(record, ["status", "progressStatus"]);
      if (isClosed(status)) {
        counts.closed += 1;
      } else if (status.includes("보류")) {
        counts.hold += 1;
      } else {
        counts.active += 1;
      }
      return counts;
    },
    { active: 0, hold: 0, closed: 0 }
  );
}

function workAttachmentCollectionKey(type: "settlement" | "output" | "other"): AttachmentCollectionKey {
  if (type === "settlement") return "settlementTasks";
  if (type === "output") return "outputTasks";
  return "otherTasks";
}

function isClosed(status: string): boolean {
  return completedWords.some((word) => status.includes(word));
}

function priorityScore(record: AnyRecord): number {
  return priorityScoreFromText(firstText(record, ["priority", "importance"]));
}

function priorityScoreFromText(priority: string): number {
  if (highPriorityWords.some((word) => priority.includes(word))) return 3;
  if (priority.includes("보통")) return 2;
  if (priority.includes("낮")) return 1;
  return 0;
}

function statusTone(status: string): "neutral" | "blue" | "green" | "orange" | "red" {
  if (status.includes("완료")) return "green";
  if (status.includes("보류") || status.includes("확인")) return "orange";
  if (status.includes("실패") || status.includes("종료")) return "red";
  if (status) return "blue";
  return "neutral";
}

function priorityTone(priority: string): "neutral" | "blue" | "green" | "orange" | "red" {
  if (priority.includes("긴급") || priority.includes("높음") || priority.includes("중요")) return "orange";
  if (priority.includes("낮")) return "green";
  return "neutral";
}

function salesStatus(note: AnyRecord): string {
  return firstText(note, ["status", "progressStatus"]);
}

function salesCategory(note: AnyRecord): string {
  return firstText(note, ["itemCategory", "productCategory", "category", "salesCategory"]);
}

function salesPriority(note: AnyRecord): string {
  return firstText(note, ["priority", "importance"]);
}

function salesInterest(note: AnyRecord): string {
  return firstText(note, ["interest", "product", "interestProduct", "interestedProduct"]);
}

function attachmentCountText(record: AnyRecord): string {
  const count = asArray(record.attachments).length;
  return count ? `${count}개` : "없음";
}

function openAttachmentDb(): Promise<IDBDatabase> {
  if (!window.indexedDB) {
    return Promise.reject(new Error("이 브라우저에서는 IndexedDB 첨부파일 저장소를 사용할 수 없습니다."));
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(ATTACHMENT_DB_NAME, ATTACHMENT_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ATTACHMENT_STORE_NAME)) {
        db.createObjectStore(ATTACHMENT_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("첨부파일 저장소를 열지 못했습니다."));
  });
}

async function getAttachmentRecord(id: string): Promise<AttachmentRecord | null> {
  if (!id) return null;
  const db = await openAttachmentDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ATTACHMENT_STORE_NAME, "readonly");
    const request = transaction.objectStore(ATTACHMENT_STORE_NAME).get(id);
    request.onsuccess = () => resolve((request.result as AttachmentRecord | undefined) || null);
    request.onerror = () => reject(request.error || new Error("첨부파일을 읽지 못했습니다."));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => db.close();
  });
}

async function putAttachmentRecord(record: AttachmentRecord): Promise<void> {
  if (!record.id) throw new Error("파일 ID가 없습니다.");
  const db = await openAttachmentDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ATTACHMENT_STORE_NAME, "readwrite");
    transaction.objectStore(ATTACHMENT_STORE_NAME).put(record);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error("첨부 파일을 저장하지 못했습니다."));
    };
  });
}

async function deleteAttachmentRecord(id: string): Promise<void> {
  if (!id) return;
  const db = await openAttachmentDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ATTACHMENT_STORE_NAME, "readwrite");
    transaction.objectStore(ATTACHMENT_STORE_NAME).delete(id);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error("첨부 파일을 삭제하지 못했습니다."));
    };
  });
}

async function clearAttachmentStore(): Promise<void> {
  const db = await openAttachmentDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ATTACHMENT_STORE_NAME, "readwrite");
    transaction.objectStore(ATTACHMENT_STORE_NAME).clear();
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error("첨부파일 저장소 초기화에 실패했습니다."));
    };
  });
}

function downloadBlob(blob: Blob, filename: string, mimeType: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "attachment";
  if (mimeType) link.type = mimeType;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 100);
}

function isImageFile(attachment: AnyRecord): boolean {
  return isImageAttachmentType(firstText(attachment, ["fileType"]), firstText(attachment, ["fileName", "name", "filename"]));
}

function isPdfFile(attachment: AnyRecord): boolean {
  const fileType = firstText(attachment, ["fileType"]).toLowerCase();
  const fileName = firstText(attachment, ["fileName", "name", "filename"]).toLowerCase();
  return fileType === "application/pdf" || fileName.endsWith(".pdf");
}

function isPreviewableAttachment(attachment: AnyRecord): boolean {
  return isImageFile(attachment) || isPdfFile(attachment);
}

function isImageAttachmentType(fileType: string, fileName: string): boolean {
  const type = clean(fileType).toLowerCase();
  const name = clean(fileName).toLowerCase();
  return type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
}

function formatFileSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "크기 미상";
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}

function moneyLine(record: AnyRecord): string {
  const amount = firstText(record, ["revenueAmount", "expectedRevenue", "salesAmount", "amount"]);
  const type = firstText(record, ["revenueCategory", "salesType"]);
  if (!amount && !type) return "";
  return [formatMoney(amount), type].filter(Boolean).join(" · ");
}

function hasAmountValue(value: string): boolean {
  return parseAmountNumber(value) !== null;
}

function parseAmountNumber(value: string): number | null {
  const text = clean(value).replace(/,/g, "");
  if (!text) return null;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function formatMoney(value: string): string {
  const number = parseAmountNumber(value);
  if (number === null) return value;
  return `${number.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`;
}

function booleanFlag(value: unknown): boolean {
  if (value === true) return true;
  const text = clean(value).toLowerCase();
  return text === "true" || text === "1" || text === "vat" || text.includes("포함");
}

function formatVatStatus(value: unknown): string {
  return booleanFlag(value) ? "VAT 포함" : "VAT 별도";
}

function formatMoneyWithVat(value: string, vatIncluded: unknown): string {
  const money = formatMoney(value);
  return money ? `${money} · ${formatVatStatus(vatIncluded)}` : "";
}

function formatRevenueForDisplay(note: AnyRecord): string {
  return [
    hasAmountValue(firstText(note, ["revenueAmount"])) ? formatMoneyWithVat(firstText(note, ["revenueAmount"]), note.revenueAmountVatIncluded) : "",
    firstText(note, ["revenueType"])
  ].filter(Boolean).join(" · ") || "-";
}

function contactBundle(record: AnyRecord): string {
  return joinParts(
    [
      firstText(record, ["contactName", "requester", "assignee", "owner", "managerName"]),
      firstText(record, ["contactPhone", "phone", "mobile"]),
      firstText(record, ["contactEmail", "email"])
    ],
    " · "
  );
}

function settlementRemainingText(record: AnyRecord): string {
  const explicit = firstText(record, ["remainingAmount", "balanceAmount"]);
  if (hasAmountValue(explicit)) return formatMoney(explicit);

  const total = parseAmountNumber(firstText(record, ["totalAmount", "advanceAmount"]));
  if (total === null) return "";

  const paymentType = firstText(record, ["paymentType"]);
  const isAdvance = paymentType.includes("선금");
  const scheduleStats = getSettlementScheduleStats(asArray(record.paymentSchedule), isAdvance);
  const received = isAdvance ? 0 : parseAmountNumber(firstText(record, ["receivedAmount"])) || scheduleStats.completedAmount || 0;
  const deducted = parseAmountNumber(firstText(record, ["deductedAmount"])) || (isAdvance ? scheduleStats.completedAmount : 0) || 0;
  return formatMoney(String(total - received - deducted));
}

function joinParts(parts: string[], separator: string): string {
  return parts.map(clean).filter(Boolean).join(separator);
}

function formatNextContact(note: AnyRecord): string {
  if (Boolean(note.nextContactUnknown) || clean(note.nextContactDate) === "") {
    return "미정";
  }
  return formatOptionalDate(firstText(note, ["nextContactDate"])) || "-";
}

function deadlineText(record: AnyRecord): string {
  const start = formatOptionalDate(firstText(record, ["dueStartDate", "startDate"]));
  const end = formatOptionalDate(firstText(record, ["dueEndDate", "deadline", "dueDate", "endDate"]));
  if (start && end && start !== end) return `${start} ~ ${end}`;
  return end || start || "미정";
}

function isValidDateRange(startDate: string, endDate: string): boolean {
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  if (!start || !end) return true;
  return start <= end;
}

function compareDate(a: string, b: string): number {
  return new Date(a || 0).getTime() - new Date(b || 0).getTime();
}

function normalizeUrl(value: string): string {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDate(value: string): Date {
  const key = parseDateKey(value);
  if (!key) return startOfDay(new Date(0));
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function parseDateKey(value: string): string {
  const cleanValue = clean(value);
  if (!cleanValue || cleanValue === "미정") return "";
  const match = cleanValue.match(/(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})/);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatOptionalDate(value: string): string {
  const key = parseDateKey(value);
  return key ? formatDateForDisplay(key) : value === "미정" ? "미정" : "";
}

function formatDateForDisplay(value: string): string {
  const key = parseDateKey(value) || value;
  if (!key) return "";
  return key.replace(/-/g, ".");
}

function formatDateTime(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}.${`${date.getMonth() + 1}`.padStart(2, "0")}.${`${date.getDate()}`.padStart(2, "0")} ${`${date.getHours()}`.padStart(2, "0")}:${`${date.getMinutes()}`.padStart(2, "0")}`;
}

function formatMonthTitle(date: Date): string {
  return `${date.getFullYear()}년 ${`${date.getMonth() + 1}`.padStart(2, "0")}월`;
}

function getCalendarMonthDays(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function getCalendarWeekDays(cursor: Date): Date[] {
  const start = new Date(cursor);
  start.setDate(cursor.getDate() - cursor.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function getDateRangeKeys(startKey: string, endKey: string, includeWeekends: boolean): string[] {
  const start = parseDate(startKey);
  const end = parseDate(endKey);
  if (start.getTime() <= 0 || end.getTime() <= 0 || end < start) return [];
  const days: string[] = [];
  for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
    if (includeWeekends || !isWeekend) days.push(toDateKey(day));
  }
  return days;
}

function moveCalendar(cursor: Date, mode: CalendarMode, amount: number): Date {
  const next = new Date(cursor);
  if (mode === "month") {
    next.setMonth(cursor.getMonth() + amount);
  } else {
    next.setDate(cursor.getDate() + amount * 7);
  }
  return next;
}

function isSameWeek(a: Date, b: Date): boolean {
  if (a.getTime() <= 0) return false;
  const aStart = new Date(a);
  aStart.setDate(a.getDate() - a.getDay());
  const bStart = new Date(b);
  bStart.setDate(b.getDate() - b.getDay());
  return toDateKey(aStart) === toDateKey(bStart);
}

function groupByDate(items: ScheduleItem[]): Map<string, ScheduleItem[]> {
  const map = new Map<string, ScheduleItem[]>();
  items.forEach((item) => {
    const current = map.get(item.date) || [];
    current.push(item);
    map.set(item.date, current);
  });
  return map;
}
