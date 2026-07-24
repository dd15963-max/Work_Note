import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
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
  FolderOpen,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Upload,
  WalletCards,
  X,
  ZoomIn,
  ZoomOut,
  Star
} from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type PortalId = "schedule" | "company" | "sales" | "settlement" | "output" | "other" | "account";
type CalendarMode = "month" | "week";
type SalesPanelMode = "detail" | "company" | "files";
type ListMode = "all" | "active" | "hold" | "closed" | "failed";
type SalesSortKey = "priority" | "updated" | "nextContact" | "company";
type SortDirection = "asc" | "desc";
type AnyRecord = Record<string, unknown>;
type AttachmentCollectionKey = "companies" | "notes" | "materialSalesNotes" | "settlementTasks" | "outputTasks" | "otherTasks";
type AttachmentOwnerType = "company" | "sales" | "materialSales" | "settlement" | "output" | "other";
type TaskCollectionKey = Exclude<AttachmentCollectionKey, "companies">;
type TaskPreset = "today" | "week" | "important" | "all";
type TaskPeriodFilter = "today" | "week" | "month" | "all" | "custom";
type TaskTypeFilter = "sales" | "settlement" | "output" | "other";
type TaskStatusFilter = "all" | "active" | "completed" | "incomplete" | "hold";
type TaskStatusGroup = "pending" | "active" | "completed" | "hold";
type TaskSortKey = "default" | "dateAsc" | "dateDesc" | "recent" | "oldest" | "important" | "incomplete";
type TaskFilters = {
  period: TaskPeriodFilter;
  types: TaskTypeFilter[];
  status: TaskStatusFilter;
  importantOnly: boolean;
  assignee: string;
  query: string;
  startDate: string;
  endDate: string;
  sort: TaskSortKey;
};

type WorkNoteData = {
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
  sourceType: Extract<PortalId, "sales" | "settlement" | "output" | "other">;
  sourceId: string;
  taxInvoiceItemId?: string;
  status: string;
  priority: string;
  collectionKey: TaskCollectionKey;
  isImportant: boolean;
};

type UnifiedWorkItem = {
  id: string;
  sourceId: string;
  collectionKey: TaskCollectionKey;
  portal: Extract<PortalId, "sales" | "settlement" | "output" | "other">;
  salesKind?: "equipment" | "material";
  badge: "영업" | "정산" | "출력" | "기타";
  subtype: string;
  title: string;
  contact: string;
  assignee: string;
  searchText: string;
  hasAttachments: boolean;
  status: string;
  statusGroup: TaskStatusGroup;
  schedule: string;
  scheduleDates: string[];
  primaryDate: string;
  startDate: string;
  endDate: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
  isImportant: boolean;
  isCompleted: boolean;
  isToday: boolean;
  isThisWeek: boolean;
};

type FocusTarget = {
  portal: PortalId;
  id: string;
  taxInvoiceItemId?: string;
  salesKind?: "equipment" | "material";
  openEditor?: boolean;
  nonce?: number;
};

type CompanyHistoryItem = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  date: string;
  tone: "neutral" | "blue" | "green" | "orange" | "red";
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
const TASKS_SCROLL_KEY = "workNoteTasksScrollY";
const LEGACY_APP_PATH = "../sales-note-app/";
const ATTACHMENT_DB_NAME = "salesNoteAttachmentDbV1";
const ATTACHMENT_STORE_NAME = "files";
const ATTACHMENT_DB_VERSION = 1;
let zipCrcTable: Uint32Array | null = null;
const SALES_STATUS_OPTIONS = ["신규 문의", "1차 대응 완료", "미팅 예정", "샘플/BMT 진행", "검토 중", "수주 가능성 높음", "보류", "완료", "실패/종료"];
const SALES_ITEM_CATEGORY_OPTIONS = ["장비", "타사 장비", "기타"];
const PRIORITY_OPTIONS = ["긴급", "높음", "보통", "낮음"];
const PURCHASE_POSSIBILITY_OPTIONS = ["미정", "낮음", "보통", "높음"];
const QUOTE_STATUS_OPTIONS = ["미진행", "발송 완료", "진행 중", "불필요"];
const REVENUE_TYPE_OPTIONS = ["장비 매출", "타사 장비", "기타"];

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
const DEFAULT_LIST_MODE_OPTIONS: Array<{ id: ListMode; label: string }> = [
  { id: "all", label: "전체" },
  { id: "active", label: "진행" },
  { id: "hold", label: "보류" },
  { id: "closed", label: "완료" }
];
const SALES_LIST_MODE_OPTIONS: Array<{ id: ListMode; label: string }> = [
  ...DEFAULT_LIST_MODE_OPTIONS,
  { id: "failed", label: "실패/종료" }
];
const MATERIAL_SALES_STATUS_OPTIONS = ["신규 문의", "1차 대응 완료", "검토 중", "납품 완료", "입금 확인 완료"];
const MATERIAL_QUOTE_STATUS_OPTIONS = ["견적 전", "견적 완료", "견적 불필요"];
const MATERIAL_REVENUE_TYPE_OPTIONS = ["소재/소모품", "출력서비스", "타사 상품", "기타"];
const BILLING_METHOD_OPTIONS = ["세금계산서", "카드결제", "불필요"];
const TAX_INVOICE_STATUS_OPTIONS = ["", "발행 예정", "발행 완료", "발행 취소", "재발행 완료"];
const CARD_PAYMENT_STATUS_OPTIONS = ["발행 예정", "발행 완료", "결제 완료"];
const LEGACY_MATERIAL_SALES_CATEGORIES = ["소재", "타사 소재"];
const SALES_SORT_OPTIONS: Array<{ id: SalesSortKey; label: string }> = [
  { id: "priority", label: "중요도순" },
  { id: "updated", label: "최종 수정일" },
  { id: "nextContact", label: "다음 연락일" },
  { id: "company", label: "고객사명" }
];

const DEFAULT_TASK_FILTERS: TaskFilters = {
  period: "all",
  types: [],
  status: "all",
  importantOnly: false,
  assignee: "",
  query: "",
  startDate: "",
  endDate: "",
  sort: "default"
};

function getTaskPreset(preset: TaskPreset): TaskFilters {
  if (preset === "today") return { ...DEFAULT_TASK_FILTERS, period: "today", status: "incomplete" };
  if (preset === "week") return { ...DEFAULT_TASK_FILTERS, period: "week" };
  if (preset === "important") return { ...DEFAULT_TASK_FILTERS, importantOnly: true };
  return { ...DEFAULT_TASK_FILTERS };
}

function isTasksLocation(): boolean {
  return /^#\/tasks(?:\?|$)/.test(window.location.hash);
}

function legacyTaskPresetFromLocation(): TaskPreset | null {
  const match = window.location.hash.match(/^#\/schedule\/(today|week|important|all)\/?$/);
  return match ? match[1] as TaskPreset : null;
}

function readTaskFiltersFromLocation(): TaskFilters {
  if (!isTasksLocation()) return { ...DEFAULT_TASK_FILTERS };
  const queryString = window.location.hash.split("?")[1] || "";
  const params = new URLSearchParams(queryString);
  const periodValue = params.get("period") || "all";
  const period = (["today", "week", "month", "all", "custom"] as TaskPeriodFilter[]).includes(periodValue as TaskPeriodFilter)
    ? periodValue as TaskPeriodFilter
    : "all";
  const statusValue = params.get("status") || "all";
  const status = (["all", "active", "completed", "incomplete", "hold"] as TaskStatusFilter[]).includes(statusValue as TaskStatusFilter)
    ? statusValue as TaskStatusFilter
    : "all";
  const sortValue = params.get("sort") || "default";
  const sort = (["default", "dateAsc", "dateDesc", "recent", "oldest", "important", "incomplete"] as TaskSortKey[]).includes(sortValue as TaskSortKey)
    ? sortValue as TaskSortKey
    : "default";
  const validTypes = new Set<TaskTypeFilter>(["sales", "settlement", "output", "other"]);
  const types = (params.get("types") || "").split(",").filter((value): value is TaskTypeFilter => validTypes.has(value as TaskTypeFilter));
  return {
    period,
    types,
    status,
    importantOnly: params.get("important") === "true",
    assignee: params.get("assignee") || "",
    query: params.get("q") || "",
    startDate: parseDateKey(params.get("from") || ""),
    endDate: parseDateKey(params.get("to") || ""),
    sort
  };
}

function taskFiltersHash(filters: TaskFilters): string {
  const params = new URLSearchParams();
  if (filters.period !== "all") params.set("period", filters.period);
  if (filters.types.length) params.set("types", filters.types.join(","));
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.importantOnly) params.set("important", "true");
  if (filters.assignee) params.set("assignee", filters.assignee);
  if (filters.query) params.set("q", filters.query);
  if (filters.period === "custom" && filters.startDate) params.set("from", filters.startDate);
  if (filters.period === "custom" && filters.endDate) params.set("to", filters.endDate);
  if (filters.sort !== "default") params.set("sort", filters.sort);
  const query = params.toString();
  return `#/tasks${query ? `?${query}` : ""}`;
}

function readTaskDetailFromLocation(): { portal: UnifiedWorkItem["portal"]; id: string; salesKind?: "equipment" | "material" } | null {
  const match = window.location.hash.match(/^#\/task\/(sales|settlement|output|other)\/([^?]+)(?:\?(.*))?$/);
  if (!match) return null;
  const params = new URLSearchParams(match[3] || "");
  return {
    portal: match[1] as UnifiedWorkItem["portal"],
    id: decodeURIComponent(match[2]),
    salesKind: match[1] === "sales" ? (params.get("kind") === "material" ? "material" : "equipment") : undefined
  };
}
export function App() {
  const [activePortal, setActivePortal] = useState<PortalId>("schedule");
  const [companyView, setCompanyView] = useState<"customer" | "headquarters">("customer");
  const [tasksOpen, setTasksOpen] = useState(() => isTasksLocation());
  const [taskFilters, setTaskFilters] = useState<TaskFilters>(() => readTaskFiltersFromLocation());
  const [query, setQuery] = useState("");
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("month");
  const [calendarCursor, setCalendarCursor] = useState(() => startOfDay(new Date()));
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
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

  useEffect(() => {
    const handleLocationChange = () => {
      const legacyPreset = legacyTaskPresetFromLocation();
      if (legacyPreset) {
        const filters = getTaskPreset(legacyPreset);
        window.history.replaceState({ workNoteTasks: true, restoreTasksScroll: false }, "", taskFiltersHash(filters));
        setTaskFilters(filters);
        setTasksOpen(true);
        setActivePortal("schedule");
        return;
      }
      if (isTasksLocation()) {
        setTaskFilters(readTaskFiltersFromLocation());
        setTasksOpen(true);
        setActivePortal("schedule");
        if (window.history.state?.restoreTasksScroll) {
          const scrollY = Number(window.sessionStorage.getItem(TASKS_SCROLL_KEY) || 0);
          window.setTimeout(() => window.scrollTo({ top: scrollY, behavior: "auto" }), 120);
        }
        return;
      }
      const detail = readTaskDetailFromLocation();
      if (detail) {
        setTasksOpen(false);
        setActivePortal(detail.portal);
        setFocusTarget({ portal: detail.portal, id: detail.id, salesKind: detail.salesKind, openEditor: true, nonce: Date.now() });
        return;
      }
      setTasksOpen(false);
      if (!window.location.hash || window.location.hash === "#/schedule") {
        setActivePortal("schedule");
      }
    };
    window.addEventListener("popstate", handleLocationChange);
    window.addEventListener("hashchange", handleLocationChange);
    handleLocationChange();
    return () => {
      window.removeEventListener("popstate", handleLocationChange);
      window.removeEventListener("hashchange", handleLocationChange);
    };
  }, []);

  const scheduleItems = useMemo(() => collectScheduleItems(data), [data]);
  const filteredScheduleItems = useMemo(
    () => scheduleItems.filter((item) => matchesText(item, query)),
    [scheduleItems, query]
  );
  const todayItems = useMemo(
    () =>
      filteredScheduleItems
        .filter((item) => item.date === toDateKey(new Date()))
        .sort((a, b) => Number(b.isImportant) - Number(a.isImportant) || priorityScoreFromText(b.priority) - priorityScoreFromText(a.priority)),
    [filteredScheduleItems]
  );
  const unifiedWorkItems = useMemo(() => collectUnifiedWorkItems(data, scheduleItems), [data, scheduleItems]);
  const globalResults = useMemo(() => collectGlobalResults(data, query), [data, query]);

  const refreshData = () => setData(loadWorkNoteData());
  const clearTaskRoute = () => {
    if (/^#\/(tasks|schedule|task\/)/.test(window.location.hash)) {
      window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);
    }
    setTasksOpen(false);
  };
  const navigateTaskPreset = (preset: TaskPreset) => {
    const filters = getTaskPreset(preset);
    window.sessionStorage.setItem(TASKS_SCROLL_KEY, "0");
    window.history.pushState({ workNoteTasks: true, restoreTasksScroll: false }, "", taskFiltersHash(filters));
    setFocusTarget(null);
    setQuery("");
    setTaskFilters(filters);
    setTasksOpen(true);
    setActivePortal("schedule");
    window.scrollTo({ top: 0, behavior: "auto" });
  };
  const updateTaskFilters = (filters: TaskFilters) => {
    window.history.replaceState({ workNoteTasks: true, restoreTasksScroll: false }, "", taskFiltersHash(filters));
    setTaskFilters(filters);
  };
  const backToScheduleMain = () => {
    if (window.history.state?.workNoteTasks) {
      window.history.back();
      return;
    }
    window.history.replaceState({}, "", "#/schedule");
    setTasksOpen(false);
    setActivePortal("schedule");
  };
  const selectPortal = (portal: PortalId) => {
    setFocusTarget(null);
    if (portal === "schedule") {
      if (window.location.hash !== "#/schedule") window.history.pushState({}, "", "#/schedule");
      setTasksOpen(false);
      setActivePortal("schedule");
      return;
    }
    clearTaskRoute();
    setActivePortal(portal);
  };
  const addTaskFromTasksPage = () => {
    clearTaskRoute();
    setFocusTarget(null);
    setActivePortal("sales");
  };
  const openScheduleItem = (item: ScheduleItem) => {
    clearTaskRoute();
    setQuery("");
    setFocusTarget({
      portal: item.sourceType,
      id: item.sourceId,
      taxInvoiceItemId: item.taxInvoiceItemId,
      salesKind: item.collectionKey === "materialSalesNotes" ? "material" : item.sourceType === "sales" ? "equipment" : undefined,
      nonce: Date.now()
    });
    setActivePortal(item.sourceType);
  };
  const openUnifiedWorkItem = (item: UnifiedWorkItem) => {
    if (tasksOpen || isTasksLocation()) {
      window.sessionStorage.setItem(TASKS_SCROLL_KEY, String(window.scrollY));
      window.history.replaceState({ workNoteTasks: true, restoreTasksScroll: true }, "", window.location.hash);
      const kind = item.salesKind ? `?kind=${item.salesKind}` : "";
      window.history.pushState({ workNoteTaskDetail: true }, "", `#/task/${item.portal}/${encodeURIComponent(item.sourceId)}${kind}`);
      setTasksOpen(false);
    } else {
      clearTaskRoute();
    }
    setQuery("");
    setFocusTarget({
      portal: item.portal,
      id: item.sourceId,
      salesKind: item.salesKind,
      openEditor: true,
      nonce: Date.now()
    });
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
  const toggleImportant = (collectionKey: TaskCollectionKey, id: string) => {
    persistData((current) => ({
      ...current,
      [collectionKey]: (current[collectionKey] as AnyRecord[]).map((record, index) =>
        recordId(record, index) === id ? { ...record, isImportant: !Boolean(record.isImportant) } : record
      )
    } as WorkNoteData), "중요 업무");
  };
  const toggleTaskCompleted = (collectionKey: TaskCollectionKey, id: string, completed: boolean) => {
    persistData((current) => ({
      ...current,
      [collectionKey]: (current[collectionKey] as AnyRecord[]).map((record, index) =>
        recordId(record, index) === id ? setRecordCompleted(record, collectionKey, completed) : record
      )
    } as WorkNoteData), completed ? "업무 완료" : "업무 완료 해제");
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
      </header>

      <nav className="portal-nav" aria-label="업무 포탈">
        <div className="portal-nav-group schedule-group">
          <PortalButton id="schedule" activePortal={activePortal} setActivePortal={selectPortal} suppressActive={tasksOpen} />
          <button
            className={`portal-button ${tasksOpen ? "is-active" : ""}`}
            type="button"
            aria-current={tasksOpen ? "page" : undefined}
            onClick={() => navigateTaskPreset("all")}
          >
            <ListChecks size={17} />
            업무
          </button>
        </div>
        <div className="portal-nav-group work-group">
          {(["sales", "settlement", "output", "other"] as PortalId[]).map((id) => (
            <PortalButton key={id} id={id} activePortal={activePortal} setActivePortal={selectPortal} />
          ))}
        </div>
        <div className="portal-nav-group account-group">
          {(["company", "account"] as PortalId[]).map((id) => (
            <PortalButton key={id} id={id} activePortal={activePortal} setActivePortal={selectPortal} />
          ))}
        </div>
      </nav>

      <section className="command-bar">
        <label className="search-box">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="고객사, 본사 담당자, 영업, 계정, 일정, 메모 통합 검색"
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
                onClick={() => {
                  if (result.companyView) setCompanyView(result.companyView);
                  selectPortal(result.portal);
                }}
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
            tasksOpen={tasksOpen}
            taskFilters={taskFilters}
            items={filteredScheduleItems}
            todayItems={todayItems}
            workItems={unifiedWorkItems}
            calendarCursor={calendarCursor}
            setCalendarCursor={setCalendarCursor}
            calendarMode={calendarMode}
            setCalendarMode={setCalendarMode}
            onNavigatePreset={navigateTaskPreset}
            onChangeFilters={updateTaskFilters}
            onBack={backToScheduleMain}
            onAddTask={addTaskFromTasksPage}
            onOpenItem={openScheduleItem}
            onOpenWorkItem={openUnifiedWorkItem}
            onToggleImportant={toggleImportant}
            onToggleCompleted={toggleTaskCompleted}
          />
        )}
        {activePortal === "company" && <CompanyPortal data={data} query={query} view={companyView} setView={setCompanyView} onPersist={persistData} />}
        {activePortal === "sales" && <SalesPortal data={data} query={query} onPersist={persistData} focusTarget={focusTarget} />}
        {activePortal === "settlement" && <GenericWorkPortal title="정산" records={data.settlementTasks} query={query} type="settlement" data={data} onPersist={persistData} focusTarget={focusTarget} onClearFocusTarget={() => setFocusTarget(null)} />}
        {activePortal === "output" && <GenericWorkPortal title="출력" records={data.outputTasks} query={query} type="output" data={data} onPersist={persistData} focusTarget={focusTarget} onClearFocusTarget={() => setFocusTarget(null)} />}
        {activePortal === "other" && <GenericWorkPortal title="기타" records={data.otherTasks} query={query} type="other" data={data} onPersist={persistData} focusTarget={focusTarget} onClearFocusTarget={() => setFocusTarget(null)} />}
        {activePortal === "account" && <AccountPortal data={data} query={query} onPersist={persistData} />}
      </main>

      <footer className="utility-footer" aria-label="보조 기능">
        <section className="utility-panel">
          <div className="utility-safety">
            <ShieldCheck size={16} />
            <div>
              <strong>안전 저장 모드</strong>
              <small>
                이 브라우저에 저장된 업무 데이터를 사용합니다. 교체/병합 불러오기 전에는 자동 스냅샷을 남기고, 전체 ZIP 백업으로 첨부 원본까지 보관할 수 있습니다.
                {saveMessage && <b> {saveMessage}</b>}
              </small>
            </div>
          </div>
          <div className="utility-actions">
            <StatusBadge data={data} />
            <BackupCenter data={data} setData={setData} setSaveMessage={setSaveMessage} />
            <button className="icon-text-button subtle" type="button" onClick={refreshData}>
              <RefreshCw size={16} />
              새로고침
            </button>
            <a className="icon-text-button subtle" href={LEGACY_APP_PATH}>
              이전 버전
              <ExternalLink size={15} />
            </a>
          </div>
        </section>
      </footer>
    </div>
  );
}

function PortalButton({
  id,
  activePortal,
  setActivePortal,
  suppressActive = false
}: {
  id: PortalId;
  activePortal: PortalId;
  setActivePortal: (id: PortalId) => void;
  suppressActive?: boolean;
}) {
  const portal = portals.find((item) => item.id === id)!;
  const Icon = portal.icon;
  return (
    <button
      className={`portal-button ${activePortal === id && !suppressActive ? "is-active" : ""}`}
      type="button"
      onClick={() => setActivePortal(id)}
    >
      <Icon size={17} />
      {portal.label}
    </button>
  );
}

function MemoListControls({
  mode,
  onModeChange,
  counts,
  options = DEFAULT_LIST_MODE_OPTIONS
}: {
  mode: ListMode;
  onModeChange: (mode: ListMode) => void;
  counts: Record<ListMode, number>;
  options?: Array<{ id: ListMode; label: string }>;
}) {
  return (
    <div className="memo-list-controls segmented" aria-label="메모 보기">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={mode === option.id ? "is-active" : ""}
          aria-pressed={mode === option.id}
          onClick={() => onModeChange(option.id)}
        >
          {option.label}
          <span>{counts[option.id]}</span>
        </button>
      ))}
    </div>
  );
}

function EditorDrawer({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.querySelector(".inline-file-panel, .sales-detail-panel.file-modal-panel")) return;
      onClose();
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

function EditorActionBar({
  onSave,
  onCancel,
  onOpenFiles,
  fileAvailable = false
}: {
  onSave: () => void;
  onCancel: () => void;
  onOpenFiles?: () => void;
  fileAvailable?: boolean;
}) {
  const disabledMessage = "메모를 먼저 저장하면 파일함을 사용할 수 있습니다.";
  return (
    <div className="editor-action-bar" aria-label="편집 작업">
      <div className="editor-action-start">
        {onOpenFiles && (
          <span className="editor-file-button-wrap" title={fileAvailable ? "현재 메모의 파일함 열기" : disabledMessage}>
            <button
              type="button"
              className="icon-text-button"
              onClick={onOpenFiles}
              disabled={!fileAvailable}
              aria-label={fileAvailable ? "현재 메모의 파일함 열기" : disabledMessage}
            >
              <FolderOpen size={17} />
              파일함
            </button>
          </span>
        )}
      </div>
      <div className="editor-action-end">
        <button type="button" className="icon-text-button" onClick={onCancel}>취소</button>
        <button type="button" className="icon-text-button primary" onClick={onSave}>저장</button>
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
    downloadWorkNoteCsvZip(data);
    setSaveMessage(`CSV ZIP 내보내기 완료 · ${formatDateTime(new Date().toISOString())}`);
  };

  const exportXlsx = () => {
    downloadWorkNoteXlsx(data);
    setSaveMessage(`엑셀 내보내기 완료 · ${formatDateTime(new Date().toISOString())}`);
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
    const ok = confirm("전체 메모장을 초기화할까요?\n\n영업, 정산, 출력, 기타, 고객사, 본사 담당자, 계정 기록과 이 브라우저에 저장된 첨부 원본 파일이 모두 삭제됩니다.\n필요한 자료가 있으면 먼저 전체 ZIP 백업을 만들어 주세요.");
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
          <button type="button" onClick={exportCsv} disabled={Boolean(busy)}>CSV ZIP 내보내기</button>
          <button type="button" onClick={exportXlsx} disabled={Boolean(busy)}>엑셀 내보내기</button>
          <button className="danger backup-reset-button" type="button" onClick={resetWorkspace} disabled={Boolean(busy)}>전체 메모장 초기화</button>
        </div>
        <small>{busy || "ZIP은 원본 파일까지, JSON은 기록만 저장합니다."}</small>
      </div>
      <input ref={jsonInputRef} type="file" accept="application/json,.json" hidden onChange={handleJsonFile} />
      <input ref={zipInputRef} type="file" accept="application/zip,.zip" hidden onChange={handleZipFile} />
    </details>
  );
}

function SchedulePortal({
  tasksOpen,
  taskFilters,
  items,
  todayItems,
  workItems,
  calendarCursor,
  setCalendarCursor,
  calendarMode,
  setCalendarMode,
  onNavigatePreset,
  onChangeFilters,
  onBack,
  onAddTask,
  onOpenItem,
  onOpenWorkItem,
  onToggleImportant,
  onToggleCompleted
}: {
  tasksOpen: boolean;
  taskFilters: TaskFilters;
  items: ScheduleItem[];
  todayItems: ScheduleItem[];
  workItems: UnifiedWorkItem[];
  calendarCursor: Date;
  setCalendarCursor: (date: Date) => void;
  calendarMode: CalendarMode;
  setCalendarMode: (mode: CalendarMode) => void;
  onNavigatePreset: (preset: TaskPreset) => void;
  onChangeFilters: (filters: TaskFilters) => void;
  onBack: () => void;
  onAddTask: () => void;
  onOpenItem: (item: ScheduleItem) => void;
  onOpenWorkItem: (item: UnifiedWorkItem) => void;
  onToggleImportant: (collectionKey: TaskCollectionKey, id: string) => void;
  onToggleCompleted: (collectionKey: TaskCollectionKey, id: string, completed: boolean) => void;
}) {
  const counts = useMemo(
    () => ({
      today: filterUnifiedTasks(workItems, getTaskPreset("today")).length,
      week: filterUnifiedTasks(workItems, getTaskPreset("week")).length,
      important: filterUnifiedTasks(workItems, getTaskPreset("important")).length,
      all: workItems.length
    }),
    [workItems]
  );
  const quickCards: Array<{ id: TaskPreset; label: string; value: number }> = [
    { id: "today", label: "오늘 업무", value: counts.today },
    { id: "week", label: "이번 주 일정", value: counts.week },
    { id: "important", label: "중요 업무", value: counts.important },
    { id: "all", label: "전체 업무", value: counts.all }
  ];

  if (tasksOpen) {
    return (
      <UnifiedTasksPage
        filters={taskFilters}
        workItems={workItems}
        onChangeFilters={onChangeFilters}
        onBack={onBack}
        onAddTask={onAddTask}
        onOpenWorkItem={onOpenWorkItem}
        onToggleImportant={onToggleImportant}
        onToggleCompleted={onToggleCompleted}
      />
    );
  }

  return (
    <div className="schedule-layout">
      <section className="schedule-main">
        <div className="summary-grid schedule-summary-grid" aria-label="업무 통합 페이지 바로가기">
          {quickCards.map((card) => (
            <MetricCard key={card.id} label={card.label} value={card.value} active={false} onClick={() => onNavigatePreset(card.id)} />
          ))}
        </div>
        <div className="panel calendar-panel">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">CALENDAR</p>
              <h2>{formatMonthTitle(calendarCursor)}</h2>
            </div>
            <div className="toolbar-cluster">
              <button type="button" onClick={() => setCalendarCursor(moveCalendar(calendarCursor, calendarMode, -1))}>이전</button>
              <button type="button" onClick={() => setCalendarCursor(startOfDay(new Date()))}>오늘</button>
              <button type="button" onClick={() => setCalendarCursor(moveCalendar(calendarCursor, calendarMode, 1))}>다음</button>
              <div className="segmented">
                <button type="button" className={calendarMode === "month" ? "is-active" : ""} onClick={() => setCalendarMode("month")}>월간</button>
                <button type="button" className={calendarMode === "week" ? "is-active" : ""} onClick={() => setCalendarMode("week")}>주간</button>
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
            <ScheduleListItem item={item} key={item.id} onOpenItem={onOpenItem} onToggleImportant={onToggleImportant} />
          ))}
          {!todayItems.length && <EmptyState title="오늘 일정 없음" detail="오늘 날짜에 연결된 업무가 없습니다." />}
        </div>
      </aside>
    </div>
  );
}

function UnifiedTasksPage({
  filters,
  workItems,
  onChangeFilters,
  onBack,
  onAddTask,
  onOpenWorkItem,
  onToggleImportant,
  onToggleCompleted
}: {
  filters: TaskFilters;
  workItems: UnifiedWorkItem[];
  onChangeFilters: (filters: TaskFilters) => void;
  onBack: () => void;
  onAddTask: () => void;
  onOpenWorkItem: (item: UnifiedWorkItem) => void;
  onToggleImportant: (collectionKey: TaskCollectionKey, id: string) => void;
  onToggleCompleted: (collectionKey: TaskCollectionKey, id: string, completed: boolean) => void;
}) {
  const filteredItems = useMemo(
    () => sortUnifiedTasks(filterUnifiedTasks(workItems, filters), filters.sort, filters.period),
    [workItems, filters]
  );
  const assignees = useMemo(
    () => [...new Set(workItems.map((item) => item.assignee.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko")),
    [workItems]
  );
  const completedCount = filteredItems.filter((item) => item.isCompleted).length;
  const importantCount = filteredItems.filter((item) => item.isImportant).length;

  return (
    <section className="unified-tasks-page">
      <header className="tasks-page-header panel">
        <button type="button" className="schedule-back-button" onClick={onBack}>
          <ArrowLeft size={18} />
          일정으로
        </button>
        <div className="tasks-page-heading">
          <div>
            <p className="eyebrow">TASKS</p>
            <h2>업무</h2>
            {(filters.period === "week" || filters.period === "month") && <p className="tasks-period-label">{formatTaskPeriodRangeLabel(filters.period)}</p>}
            <p>{describeTaskFilters(filters)}</p>
          </div>
        </div>
        <div className="tasks-page-stats" aria-label="검색 결과 요약">
          <span>검색 결과 <strong>{filteredItems.length}</strong></span>
          <span>미완료 <strong>{filteredItems.length - completedCount}</strong></span>
          <span>완료 <strong>{completedCount}</strong></span>
          <span>중요 <strong>{importantCount}</strong></span>
        </div>
      </header>

      <TaskFilterPanel filters={filters} assignees={assignees} resultCount={filteredItems.length} onChange={onChangeFilters} />

      <div className="unified-task-list" aria-live="polite">
        {filteredItems.map((item) => (
          <UnifiedTaskCard
            key={item.id}
            item={item}
            onOpen={onOpenWorkItem}
            onToggleImportant={onToggleImportant}
            onToggleCompleted={onToggleCompleted}
          />
        ))}
      </div>

      {!filteredItems.length && (
        <div className="panel tasks-empty-panel">
          <EmptyState title="조건에 맞는 업무가 없습니다." detail="필터를 초기화하거나 새 업무를 등록해 보세요." />
          <div className="tasks-empty-actions">
            <button type="button" onClick={() => onChangeFilters(getTaskPreset("all"))}>필터 초기화</button>
            <button type="button" className="primary-button" onClick={onAddTask}><Plus size={16} />새 업무 등록</button>
          </div>
        </div>
      )}
    </section>
  );
}

function TaskFilterPanel({
  filters,
  assignees,
  resultCount,
  onChange
}: {
  filters: TaskFilters;
  assignees: string[];
  resultCount: number;
  onChange: (filters: TaskFilters) => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const update = (patch: Partial<TaskFilters>) => onChange({ ...filters, ...patch });
  const toggleType = (type: TaskTypeFilter) => {
    const types = filters.types.includes(type)
      ? filters.types.filter((value) => value !== type)
      : [...filters.types, type];
    update({ types });
  };
  const activeChips = taskFilterChips(filters);

  return (
    <section className="task-filter-shell panel">
      <div className="task-filter-search-row">
        <label className="task-filter-search">
          <Search size={18} />
          <input
            value={filters.query}
            onChange={(event) => update({ query: event.target.value })}
            placeholder="업무명, 업체, 담당자, 품목, 상태, 메모 검색"
          />
        </label>
        <span className="task-filter-result-summary">{resultCount}건</span>
        <button type="button" className="task-filter-mobile-button" onClick={() => setMobileOpen(true)}>
          <SlidersHorizontal size={17} />필터{activeChips.length ? ` ${activeChips.length}` : ""}
        </button>
      </div>

      <div className={`task-filter-details ${mobileOpen ? "is-open" : ""}`} role={mobileOpen ? "dialog" : undefined} aria-modal={mobileOpen || undefined} aria-label="업무 필터">
        <div className="task-filter-mobile-heading">
          <strong>필터</strong>
          <button type="button" className="icon-button" title="닫기" onClick={() => setMobileOpen(false)}><X size={19} /></button>
        </div>
        <div className="task-filter-section">
          <span className="task-filter-label">기간</span>
          <div className="task-filter-button-group">
            {(["today", "week", "month", "all", "custom"] as TaskPeriodFilter[]).map((period) => (
              <button key={period} type="button" className={filters.period === period ? "is-active" : ""} onClick={() => update({ period })}>
                {taskPeriodLabel(period)}
              </button>
            ))}
          </div>
        </div>
        {filters.period === "custom" && (
          <div className="task-custom-dates">
            <label><span>시작일</span><input type="date" value={filters.startDate} onChange={(event) => update({ startDate: event.target.value })} /></label>
            <span>~</span>
            <label><span>종료일</span><input type="date" value={filters.endDate} onChange={(event) => update({ endDate: event.target.value })} /></label>
          </div>
        )}
        <div className="task-filter-section">
          <span className="task-filter-label">업무 유형</span>
          <div className="task-filter-button-group type-group">
            {(["sales", "settlement", "output", "other"] as TaskTypeFilter[]).map((type) => (
              <button key={type} type="button" className={filters.types.includes(type) ? "is-active" : ""} aria-pressed={filters.types.includes(type)} onClick={() => toggleType(type)}>
                {taskTypeLabel(type)}
              </button>
            ))}
          </div>
        </div>
        <div className="task-filter-select-grid">
          <label><span>상태</span><select value={filters.status} onChange={(event) => update({ status: event.target.value as TaskStatusFilter })}><option value="all">전체</option><option value="active">진행 중</option><option value="completed">완료</option><option value="incomplete">미완료</option><option value="hold">보류</option></select></label>
          <label><span>중요 업무</span><select value={filters.importantOnly ? "important" : "all"} onChange={(event) => update({ importantOnly: event.target.value === "important" })}><option value="all">전체</option><option value="important">중요 업무만</option></select></label>
          {assignees.length > 0 && <label><span>담당자</span><select value={filters.assignee} onChange={(event) => update({ assignee: event.target.value })}><option value="">전체</option>{assignees.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>}
          <label><span>정렬</span><select value={filters.sort} onChange={(event) => update({ sort: event.target.value as TaskSortKey })}><option value="default">기본 정렬</option><option value="dateAsc">날짜 빠른 순</option><option value="dateDesc">날짜 늦은 순</option><option value="recent">최근 등록 순</option><option value="oldest">오래된 등록 순</option><option value="important">중요 업무 우선</option><option value="incomplete">미완료 우선</option></select></label>
        </div>
        <div className="task-filter-sheet-actions">
          <button type="button" onClick={() => onChange(getTaskPreset("all"))}>전체 초기화</button>
          <button type="button" className="primary-button" onClick={() => setMobileOpen(false)}>{resultCount}건 보기</button>
        </div>
      </div>
      {mobileOpen && <button type="button" className="task-filter-backdrop" aria-label="필터 닫기" onClick={() => setMobileOpen(false)} />}

      {activeChips.length > 0 && (
        <div className="active-filter-chips" aria-label="적용된 필터">
          {activeChips.map((chip) => (
            <button type="button" key={chip.id} onClick={() => onChange(chip.remove(filters))} title={`${chip.label} 필터 해제`}>
              {chip.label}<X size={13} />
            </button>
          ))}
          <button type="button" className="reset-chip" onClick={() => onChange(getTaskPreset("all"))}>전체 초기화</button>
        </div>
      )}
    </section>
  );
}

type TaskFilterChip = { id: string; label: string; remove: (filters: TaskFilters) => TaskFilters };

function taskFilterChips(filters: TaskFilters): TaskFilterChip[] {
  const chips: TaskFilterChip[] = [];
  if (filters.period !== "all") {
    const customLabel = filters.period === "custom" ? `${filters.startDate || "시작 미정"} ~ ${filters.endDate || "종료 미정"}` : taskPeriodLabel(filters.period);
    chips.push({ id: "period", label: `기간: ${customLabel}`, remove: (current) => ({ ...current, period: "all", startDate: "", endDate: "" }) });
  }
  filters.types.forEach((type) => chips.push({ id: `type-${type}`, label: taskTypeLabel(type), remove: (current) => ({ ...current, types: current.types.filter((value) => value !== type) }) }));
  if (filters.status !== "all") chips.push({ id: "status", label: `상태: ${taskStatusFilterLabel(filters.status)}`, remove: (current) => ({ ...current, status: "all" }) });
  if (filters.importantOnly) chips.push({ id: "important", label: "중요 업무", remove: (current) => ({ ...current, importantOnly: false }) });
  if (filters.assignee) chips.push({ id: "assignee", label: `담당자: ${filters.assignee}`, remove: (current) => ({ ...current, assignee: "" }) });
  if (filters.query) chips.push({ id: "query", label: `검색: ${filters.query}`, remove: (current) => ({ ...current, query: "" }) });
  if (filters.sort !== "default") chips.push({ id: "sort", label: taskSortLabel(filters.sort), remove: (current) => ({ ...current, sort: "default" }) });
  return chips;
}

function UnifiedTaskCard({
  item,
  onOpen,
  onToggleImportant,
  onToggleCompleted
}: {
  item: UnifiedWorkItem;
  onOpen: (item: UnifiedWorkItem) => void;
  onToggleImportant: (collectionKey: TaskCollectionKey, id: string) => void;
  onToggleCompleted: (collectionKey: TaskCollectionKey, id: string, completed: boolean) => void;
}) {
  return (
    <article className={`schedule-task-card ${item.isImportant ? "is-important" : ""} ${item.isCompleted ? "is-completed" : ""}`} data-collection-key={item.collectionKey} data-source-id={item.sourceId}>
      <button type="button" className="schedule-task-card-main" onClick={() => onOpen(item)}>
        <span className={`work-type-badge ${item.portal}`}>{item.badge}</span>
        <span className="schedule-task-card-copy">
          <strong>{item.title}</strong>
          <small>{joinParts([item.subtype, item.contact], " · ") || "담당자 미지정"}</small>
          {item.memo && <p>{summarizeForList(item.memo, 130)}</p>}
        </span>
        <span className="schedule-task-card-meta">
          <span className={`task-status-badge ${item.statusGroup}`}>{item.status || "상태 미정"}</span>
          <strong>{item.schedule || "일정 미정"}</strong>
          <span className="task-card-indicators">
            {item.hasAttachments && <small><FolderOpen size={14} />첨부파일</small>}
            {item.isCompleted && <small className="completed-label">완료</small>}
          </span>
        </span>
      </button>
      <div className="schedule-task-card-actions">
        <ImportantToggle active={item.isImportant} onToggle={() => onToggleImportant(item.collectionKey, item.sourceId)} />
        <button
          type="button"
          className={`task-complete-button ${item.isCompleted ? "is-completed" : ""}`}
          title={item.isCompleted ? "완료 상태 해제" : "업무 완료 처리"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleCompleted(item.collectionKey, item.sourceId, !item.isCompleted);
          }}
        >
          <CheckCircle2 size={16} />
          {item.isCompleted ? "완료 해제" : "완료"}
        </button>
        <button type="button" className="icon-text-button" onClick={() => onOpen(item)}><Pencil size={15} />수정</button>
      </div>
    </article>
  );
}

function taskPeriodLabel(period: TaskPeriodFilter): string {
  if (period === "today") return "오늘";
  if (period === "week") return "이번 주";
  if (period === "month") return "이번 달";
  if (period === "custom") return "직접 지정";
  return "전체";
}

function taskTypeLabel(type: TaskTypeFilter): string {
  if (type === "sales") return "영업";
  if (type === "settlement") return "정산";
  if (type === "output") return "출력";
  return "기타";
}

function taskStatusFilterLabel(status: TaskStatusFilter): string {
  if (status === "active") return "진행 중";
  if (status === "completed") return "완료";
  if (status === "incomplete") return "미완료";
  if (status === "hold") return "보류";
  return "전체";
}

function taskSortLabel(sort: TaskSortKey): string {
  if (sort === "dateAsc") return "날짜 빠른 순";
  if (sort === "dateDesc") return "날짜 늦은 순";
  if (sort === "recent") return "최근 등록 순";
  if (sort === "oldest") return "오래된 등록 순";
  if (sort === "important") return "중요 업무 우선";
  if (sort === "incomplete") return "미완료 우선";
  return "기본 정렬";
}

function describeTaskFilters(filters: TaskFilters): string {
  if (filters.period === "all" && !filters.types.length && filters.status === "all" && !filters.importantOnly && !filters.assignee && !filters.query) {
    return "전체 업무를 확인합니다.";
  }
  const parts: string[] = [];
  if (filters.period === "today") parts.push("오늘 예정된");
  else if (filters.period === "week") parts.push("이번 주");
  else if (filters.period === "month") parts.push("이번 달");
  else if (filters.period === "custom") parts.push(`${filters.startDate || "시작 미정"}부터 ${filters.endDate || "종료 미정"}까지`);
  if (filters.types.length) parts.push(filters.types.map(taskTypeLabel).join(", "));
  if (filters.importantOnly) parts.push("중요");
  if (filters.status !== "all") parts.push(taskStatusFilterLabel(filters.status));
  if (filters.assignee) parts.push(`${filters.assignee} 담당`);
  parts.push("업무를 확인합니다.");
  return parts.join(" ");
}

function taskPeriodRange(filters: TaskFilters): { start: string; end: string } | null {
  const today = startOfDay(new Date());
  if (filters.period === "all") return null;
  if (filters.period === "today") {
    const key = toDateKey(today);
    return { start: key, end: key };
  }
  if (filters.period === "week") return getCurrentWeekRange(today);
  if (filters.period === "month") return getCurrentMonthRange(today);
  return { start: filters.startDate || "0000-01-01", end: filters.endDate || "9999-12-31" };
}

function taskOverlapsPeriod(item: UnifiedWorkItem, filters: TaskFilters): boolean {
  const range = taskPeriodRange(filters);
  if (!range) return true;
  if (item.scheduleDates.some((date) => range.start <= date && date <= range.end)) return true;
  return Boolean(item.startDate && item.endDate && item.startDate <= range.end && item.endDate >= range.start);
}

function filterUnifiedTasks(items: UnifiedWorkItem[], filters: TaskFilters): UnifiedWorkItem[] {
  const query = filters.query.trim().toLocaleLowerCase("ko");
  return items.filter((item) => {
    if (!taskOverlapsPeriod(item, filters)) return false;
    if (filters.types.length && !filters.types.includes(item.portal)) return false;
    if (filters.status === "completed" && !item.isCompleted) return false;
    if (filters.status === "incomplete" && item.isCompleted) return false;
    if (filters.status === "hold" && item.statusGroup !== "hold") return false;
    if (filters.status === "active" && !["pending", "active"].includes(item.statusGroup)) return false;
    if (filters.importantOnly && !item.isImportant) return false;
    if (filters.assignee && item.assignee !== filters.assignee) return false;
    if (query && !item.searchText.toLocaleLowerCase("ko").includes(query)) return false;
    return true;
  });
}

function sortUnifiedTasks(items: UnifiedWorkItem[], sort: TaskSortKey, period: TaskPeriodFilter = "all"): UnifiedWorkItem[] {
  const dateValue = (item: UnifiedWorkItem) => item.primaryDate || "9999-12-31";
  const updatedValue = (item: UnifiedWorkItem) => item.createdAt || item.updatedAt || "";
  const base = (a: UnifiedWorkItem, b: UnifiedWorkItem) => Number(a.isCompleted) - Number(b.isCompleted)
    || Number(b.isImportant) - Number(a.isImportant)
    || dateValue(a).localeCompare(dateValue(b))
    || compareDate(b.updatedAt, a.updatedAt);
  return [...items].sort((a, b) => {
    if (sort === "default" && period === "week") {
      return dateValue(a).localeCompare(dateValue(b))
        || Number(b.isImportant) - Number(a.isImportant)
        || weeklyTaskTypeRank(a) - weeklyTaskTypeRank(b)
        || Number(a.isCompleted) - Number(b.isCompleted)
        || compareDate(b.updatedAt, a.updatedAt)
        || a.title.localeCompare(b.title, "ko");
    }
    if (sort === "dateAsc") return dateValue(a).localeCompare(dateValue(b)) || base(a, b);
    if (sort === "dateDesc") {
      if (!a.primaryDate && b.primaryDate) return 1;
      if (a.primaryDate && !b.primaryDate) return -1;
      return dateValue(b).localeCompare(dateValue(a)) || base(a, b);
    }
    if (sort === "recent") return compareDate(updatedValue(b), updatedValue(a)) || base(a, b);
    if (sort === "oldest") return compareDate(updatedValue(a), updatedValue(b)) || base(a, b);
    if (sort === "important") return Number(b.isImportant) - Number(a.isImportant) || base(a, b);
    if (sort === "incomplete") return Number(a.isCompleted) - Number(b.isCompleted) || base(a, b);
    return base(a, b);
  });
}

function weeklyTaskTypeRank(item: UnifiedWorkItem): number {
  if (item.portal === "sales" && `${item.subtype} ${item.schedule}`.includes("미팅")) return 0;
  if (item.portal === "sales") return 1;
  if (item.portal === "settlement") return 2;
  if (item.portal === "output") return 3;
  return 4;
}
function formatKoreanFullDate(dateKey: string): string {
  const date = parseDate(dateKey);
  if (!date) return formatDateForDisplay(dateKey);
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(date);
}
function CalendarGrid({ cursor, mode, items, onOpenItem }: { cursor: Date; mode: CalendarMode; items: ScheduleItem[]; onOpenItem: (item: ScheduleItem) => void }) {
  const days = mode === "month" ? getCalendarMonthDays(cursor) : getCalendarWeekDays(cursor);
  const itemsByDate = groupByDate(items);
  const weekdayLabels = mode === "week" ? ["월", "화", "수", "목", "금", "토", "일"] : ["일", "월", "화", "수", "목", "금", "토"];
  return (
    <div className={`calendar-grid ${mode === "week" ? "week-mode" : ""}`}>
      {weekdayLabels.map((day) => (
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
                <button type="button" className={`calendar-chip ${item.type} ${item.isImportant ? "is-important" : ""}`} key={item.id} title={`${item.title} ${item.detail}`} onClick={() => onOpenItem(item)}>
                  {item.isImportant ? "⭐ " : ""}{item.title}
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

function ScheduleListItem({
  item,
  onOpenItem,
  onToggleImportant
}: {
  item: ScheduleItem;
  onOpenItem: (item: ScheduleItem) => void;
  onToggleImportant: (collectionKey: TaskCollectionKey, id: string) => void;
}) {
  return (
    <article
      className={`schedule-list-item ${item.type} ${item.isImportant ? "is-important" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpenItem(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenItem(item);
        }
      }}
    >
      <div>
        <strong>{item.isImportant ? "⭐ " : ""}{item.title}</strong>
        <p>{item.detail || "상세 내용 없음"}</p>
      </div>
      <div className="schedule-item-actions">
        <ImportantToggle
          active={item.isImportant}
          onToggle={() => onToggleImportant(item.collectionKey, item.sourceId)}
        />
        <div className="stacked-meta">
          <span>{formatDateForDisplay(item.date)}</span>
          {item.status && <small>{item.status}</small>}
        </div>
      </div>
    </article>
  );
}

function ImportantToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`important-toggle ${active ? "is-active" : ""}`}
      title={active ? "중요 업무 해제" : "중요 업무로 설정"}
      aria-label={active ? "중요 업무 해제" : "중요 업무로 설정"}
      aria-pressed={active}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Star size={18} fill={active ? "currentColor" : "none"} />
    </button>
  );
}
function persistImportantToggle(
  onPersist: (updater: (current: WorkNoteData) => WorkNoteData, reason: string) => void,
  collectionKey: TaskCollectionKey,
  id: string
) {
  onPersist((current) => ({
    ...current,
    [collectionKey]: (current[collectionKey] as AnyRecord[]).map((record, index) =>
      recordId(record, index) === id ? { ...record, isImportant: !Boolean(record.isImportant) } : record
    )
  } as WorkNoteData), "중요 업무");
}

function CompanyPortal({
  data,
  query,
  view,
  setView,
  onPersist
}: {
  data: WorkNoteData;
  query: string;
  view: "customer" | "headquarters";
  setView: (view: "customer" | "headquarters") => void;
  onPersist: (updater: (current: WorkNoteData) => WorkNoteData, reason: string) => void;
}) {
  return (
    <div className="company-master-portal">
      <section className="company-master-nav panel" aria-label="업체 관리 구분">
        <div>
          <p className="eyebrow">COMPANY MASTER</p>
          <h2>업체</h2>
        </div>
        <div className="segmented company-master-tabs">
          <button type="button" className={view === "customer" ? "is-active" : ""} onClick={() => setView("customer")}>
            <Building2 size={16} />고객사
          </button>
          <button type="button" className={view === "headquarters" ? "is-active" : ""} onClick={() => setView("headquarters")}>
            <BriefcaseBusiness size={16} />본사
          </button>
        </div>
      </section>
      {view === "customer" ? (
        <CustomerCompanyPortal data={data} query={query} onPersist={onPersist} />
      ) : (
        <InternalContactPortal data={data} query={query} onPersist={onPersist} />
      )}
    </div>
  );
}
function CustomerCompanyPortal({
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
      materialSalesNotes: clearCompanyLinks(current.materialSalesNotes, id, name),
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
          <h2>고객사 관리</h2>
        </div>
        <div className="toolbar-cluster">
          <span className="count-label">{companies.length}개</span>
          <button type="button" onClick={() => setEditingCompany(createBlankCompany())}>
            <Plus size={16} />
            새 고객사
          </button>
        </div>
      </div>
      {editingCompany && (
        <EditorDrawer onClose={() => setEditingCompany(null)}>
          <CompanyEditor
            draft={editingCompany}
            setDraft={setEditingCompany}
            internalContacts={data.internalContacts}
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
          const historyItems = collectCompanyHistoryItems(data, company, originalIndex);
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
              {primaryContact && <CustomerInternalOwners contact={primaryContact} internalContacts={data.internalContacts} />}
              {extraContacts.length > 0 && (
                <details className="company-contact-details">
                  <summary>추가 담당자 {extraContacts.length}명</summary>
                  <div>
                    {extraContacts.map((contact, contactIndex) => (
                      <span key={recordId(contact, contactIndex)}>{companyContactSummary(contact) || "담당자"}{internalOwnerInlineSummary(contact, data.internalContacts) ? ` · 본사: ${internalOwnerInlineSummary(contact, data.internalContacts)}` : ""}</span>
                    ))}
                  </div>
                </details>
              )}
              <AttachmentPreview record={company} />
              {firstText(company, ["memo"]) && <p className="muted-preview">{firstText(company, ["memo"])}</p>}
              <details className="company-history-block">
                <summary>히스토리 {historyItems.length}건</summary>
                <div className="company-history-list">
                  {historyItems.slice(0, 12).map((item) => (
                    <article key={item.id} className={`company-history-item ${item.tone}`}>
                      <div>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </div>
                      <div>
                        <Badge tone={item.tone}>{item.kind}</Badge>
                        <small>{formatDateTime(item.date)}</small>
                      </div>
                    </article>
                  ))}
                  {!historyItems.length && <p>연결된 업무 이력이 없습니다.</p>}
                </div>
              </details>
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
        {!companies.length && <EmptyState title="고객사 없음" detail="검색 조건에 맞는 고객사가 없습니다." />}
      </div>
    </section>
  );
}

const INTERNAL_DUTY_SUGGESTIONS = ["장비 설치", "A/S", "출력 테스트", "샘플 제작", "기술 지원", "견적 검토", "계약 검토"];
const CUSTOMER_OWNER_FIELDS = [
  { key: "salesOwnerId", label: "담당 영업", shortLabel: "영업" },
  { key: "technicalOwnerId", label: "기술 담당", shortLabel: "기술" },
  { key: "printOwnerId", label: "출력 담당", shortLabel: "출력" },
  { key: "otherOwnerId", label: "기타 담당", shortLabel: "기타" }
] as const;

function InternalContactPortal({
  data,
  query,
  onPersist
}: {
  data: WorkNoteData;
  query: string;
  onPersist: (updater: (current: WorkNoteData) => WorkNoteData, reason: string) => void;
}) {
  const [editingContact, setEditingContact] = useState<AnyRecord | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [internalQuery, setInternalQuery] = useState("");
  const departments = useMemo(
    () => [...new Set(data.internalContacts.map((contact) => firstText(contact, ["department"])).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "ko")),
    [data.internalContacts]
  );
  useEffect(() => {
    if (departmentFilter !== "all" && !departments.includes(departmentFilter)) setDepartmentFilter("all");
  }, [departmentFilter, departments]);
  const contacts = data.internalContacts
    .map((contact, index) => ({ contact, index, id: recordId(contact, index) }))
    .filter(({ contact }) => departmentFilter === "all" || firstText(contact, ["department"]) === departmentFilter)
    .filter(({ contact }) => !query || matchesRecord(contact, query))
    .filter(({ contact }) => !internalQuery || matchesRecord(contact, internalQuery))
    .sort((a, b) => firstText(a.contact, ["department"]).localeCompare(firstText(b.contact, ["department"]), "ko") || firstText(a.contact, ["name"]).localeCompare(firstText(b.contact, ["name"]), "ko"));

  const saveContact = (draft: AnyRecord) => {
    const normalized = normalizeInternalContactDraft(draft);
    if (!firstText(normalized, ["name"])) {
      alert("이름을 입력해 주세요.");
      return;
    }
    onPersist((current) => {
      const now = new Date().toISOString();
      const previous = current.internalContacts.find((contact, index) => recordId(contact, index) === normalized.id);
      const contact = {
        ...previous,
        ...normalized,
        createdAt: firstText(previous || {}, ["createdAt"]) || now,
        updatedAt: now
      };
      const exists = current.internalContacts.some((item, index) => recordId(item, index) === normalized.id);
      return {
        ...current,
        internalContacts: exists
          ? current.internalContacts.map((item, index) => recordId(item, index) === normalized.id ? contact : item)
          : [contact, ...current.internalContacts]
      };
    }, firstText(draft, ["id"]) ? "본사 담당자 수정" : "본사 담당자 등록");
    setEditingContact(null);
  };

  const deleteContact = (contact: AnyRecord, index: number) => {
    const id = recordId(contact, index);
    const label = internalContactLabel(contact) || "선택한 담당자";
    const linkedCount = countInternalContactLinks(data.companies, id);
    const message = linkedCount
      ? `${label} 담당자를 삭제할까요?\n\n고객사 담당자 연결 ${linkedCount}건도 함께 해제됩니다.`
      : `${label} 담당자를 삭제할까요?`;
    if (!confirm(message)) return;
    onPersist((current) => ({
      ...current,
      internalContacts: current.internalContacts.filter((item, itemIndex) => recordId(item, itemIndex) !== id),
      companies: clearInternalContactLinks(current.companies, id)
    }), "본사 담당자 삭제");
  };

  return (
    <section className="panel internal-contact-portal">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">HEADQUARTERS CONTACTS</p>
          <h2>본사 담당자</h2>
        </div>
        <div className="toolbar-cluster">
          <span className="count-label">{contacts.length}/{data.internalContacts.length}명</span>
          <button type="button" onClick={() => setEditingContact(createBlankInternalContact())}>
            <Plus size={16} />담당자 등록
          </button>
        </div>
      </div>

      <div className="internal-contact-filters">
        <label className="task-filter-search">
          <Search size={17} />
          <input value={internalQuery} onChange={(event) => setInternalQuery(event.target.value)} placeholder="이름, 부서, 직급, 담당 업무, 메모 검색" />
        </label>
        <div className="department-filter-row" aria-label="부서 필터">
          <button type="button" className={departmentFilter === "all" ? "is-active" : ""} onClick={() => setDepartmentFilter("all")}>전체</button>
          {departments.map((department) => (
            <button type="button" key={department} className={departmentFilter === department ? "is-active" : ""} onClick={() => setDepartmentFilter(department)}>
              {department}
            </button>
          ))}
        </div>
      </div>

      {editingContact && (
        <EditorDrawer onClose={() => setEditingContact(null)}>
          <InternalContactEditor draft={editingContact} setDraft={setEditingContact} departmentOptions={departments} onSave={saveContact} onCancel={() => setEditingContact(null)} />
        </EditorDrawer>
      )}

      <div className="internal-contact-grid">
        {contacts.map(({ contact, index, id }) => {
          const duties = asTextArray(contact.duties);
          const linkedCount = countInternalContactLinks(data.companies, id);
          return (
            <article className="internal-contact-card" key={id}>
              <div className="card-heading">
                <strong>{internalContactLabel(contact) || "이름 미입력"}</strong>
                <Badge tone="blue">{firstText(contact, ["department"]) || "부서 미지정"}</Badge>
              </div>
              <InfoLine label="휴대폰" value={firstText(contact, ["mobile", "phone"])} />
              <InfoLine label="내선" value={firstText(contact, ["extension"])} />
              <InfoLine label="이메일" value={firstText(contact, ["email"])} />
              <InfoLine label="고객사 연결" value={linkedCount ? `${linkedCount}건` : ""} />
              {duties.length > 0 && <div className="internal-duty-chips">{duties.map((duty) => <span key={duty}>{duty}</span>)}</div>}
              {firstText(contact, ["memo"]) && <p className="muted-preview">{firstText(contact, ["memo"])}</p>}
              <div className="card-actions">
                <button type="button" onClick={() => setEditingContact(prepareInternalContactDraft(contact, index))}><Pencil size={15} />수정</button>
                <button type="button" className="danger-button" onClick={() => deleteContact(contact, index)}><Trash2 size={15} />삭제</button>
              </div>
            </article>
          );
        })}
        {!contacts.length && <EmptyState title="본사 담당자 없음" detail="검색 또는 부서 조건에 맞는 담당자가 없습니다." />}
      </div>
    </section>
  );
}

function InternalContactEditor({
  draft,
  setDraft,
  departmentOptions,
  onSave,
  onCancel
}: {
  draft: AnyRecord;
  setDraft: (draft: AnyRecord) => void;
  departmentOptions: string[];
  onSave: (draft: AnyRecord) => void;
  onCancel: () => void;
}) {
  const [dutyInput, setDutyInput] = useState("");
  const duties = asTextArray(draft.duties);
  const updateField = (key: string, value: string) => setDraft({ ...draft, [key]: value });
  const addDuty = (value = dutyInput) => {
    const duty = clean(value);
    if (!duty || duties.includes(duty)) return;
    setDraft({ ...draft, duties: [...duties, duty] });
    setDutyInput("");
  };
  const removeDuty = (duty: string) => setDraft({ ...draft, duties: duties.filter((item) => item !== duty) });

  return (
    <section className="editor-panel internal-contact-editor">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">HEADQUARTERS CONTACT</p>
          <h2>{firstText(draft, ["id"]) ? "본사 담당자 수정" : "본사 담당자 등록"}</h2>
        </div>
        <button type="button" onClick={onCancel} aria-label="본사 담당자 편집 닫기"><X size={17} /></button>
      </div>
      <div className="form-grid">
        <TextField label="이름" value={firstText(draft, ["name"])} onChange={(value) => updateField("name", value)} placeholder="예: 홍길동" />
        <TextField label="직급" value={firstText(draft, ["title"])} onChange={(value) => updateField("title", value)} placeholder="예: 책임" />
        <label className="field">
          <span>부서</span>
          <input list="internal-department-options" value={firstText(draft, ["department"])} onChange={(event) => updateField("department", event.target.value)} placeholder="선택 또는 직접 입력" />
          <datalist id="internal-department-options">{departmentOptions.map((department) => <option key={department} value={department} />)}</datalist>
        </label>
        <TextField label="휴대폰" value={firstText(draft, ["mobile"])} onChange={(value) => updateField("mobile", value)} placeholder="010-0000-0000" />
        <TextField label="내선번호" value={firstText(draft, ["extension"])} onChange={(value) => updateField("extension", value)} placeholder="예: 1234" />
        <TextField label="이메일" value={firstText(draft, ["email"])} onChange={(value) => updateField("email", value)} placeholder="name@example.com" />
        <TextAreaField label="메모" value={rawText(draft, ["memo"])} onChange={(value) => updateField("memo", value)} placeholder="담당 범위, 협업 시 참고사항" wide />
      </div>
      <div className="editor-subsection internal-duty-editor">
        <div className="section-title-row">
          <div><p className="eyebrow">RESPONSIBILITIES</p><h2>담당 업무</h2></div>
          <span className="count-label">{duties.length}개</span>
        </div>
        <div className="duty-input-row">
          <input
            list="internal-duty-options"
            value={dutyInput}
            onChange={(event) => setDutyInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              addDuty();
            }}
            placeholder="담당 업무를 선택하거나 직접 입력"
          />
          <datalist id="internal-duty-options">{INTERNAL_DUTY_SUGGESTIONS.map((duty) => <option key={duty} value={duty} />)}</datalist>
          <button type="button" onClick={() => addDuty()}><Plus size={16} />추가</button>
        </div>
        <div className="internal-duty-chips editable">
          {duties.map((duty) => <button type="button" key={duty} onClick={() => removeDuty(duty)} title={`${duty} 제거`}>{duty}<X size={13} /></button>)}
          {!duties.length && <span className="duty-empty-copy">등록된 담당 업무가 없습니다.</span>}
        </div>
      </div>
      <EditorActionBar onSave={() => onSave(draft)} onCancel={onCancel} />
    </section>
  );
}

function CustomerInternalOwners({ contact, internalContacts }: { contact: AnyRecord; internalContacts: AnyRecord[] }) {
  const owners = CUSTOMER_OWNER_FIELDS.map((field) => ({
    ...field,
    contact: internalContacts.find((item, index) => recordId(item, index) === firstText(contact, [field.key])) || null
  })).filter((item) => item.contact);
  if (!owners.length) return null;
  return (
    <div className="customer-internal-owners">
      <strong>본사 담당자</strong>
      <div>
        {owners.map((owner) => <span key={owner.key}><small>{owner.shortLabel}</small>{internalContactLabel(owner.contact || {})}</span>)}
      </div>
    </div>
  );
}

function InternalOwnerSelect({
  label,
  value,
  internalContacts,
  onChange
}: {
  label: string;
  value: string;
  internalContacts: AnyRecord[];
  onChange: (value: string) => void;
}) {
  const sorted = [...internalContacts].sort((a, b) => firstText(a, ["department"]).localeCompare(firstText(b, ["department"]), "ko") || firstText(a, ["name"]).localeCompare(firstText(b, ["name"]), "ko"));
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">미지정</option>
        {sorted.map((contact, index) => {
          const id = recordId(contact, index);
          return <option key={id} value={id}>{joinParts([firstText(contact, ["department"]), internalContactLabel(contact)], " · ")}</option>;
        })}
      </select>
    </label>
  );
}
function CompanyEditor({
  draft,
  setDraft,
  internalContacts,
  onSave,
  onCancel
}: {
  draft: AnyRecord;
  setDraft: (draft: AnyRecord) => void;
  internalContacts: AnyRecord[];
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
      contacts: [...contacts, { id: createId("contact_"), name: "", department: "", title: "", phone: "", email: "", memo: "", salesOwnerId: "", technicalOwnerId: "", printOwnerId: "", otherOwnerId: "" }]
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
        <TextAreaField label="메모" value={rawText(draft, ["memo"])} onChange={(value) => updateField("memo", value)} placeholder="업체 관련 메모" wide />
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
              <div className="internal-owner-selector-grid">
                <strong className="internal-owner-selector-title">본사 담당자 연결</strong>
                {CUSTOMER_OWNER_FIELDS.map((field) => (
                  <InternalOwnerSelect
                    key={field.key}
                    label={field.label}
                    value={firstText(contact, [field.key])}
                    internalContacts={internalContacts}
                    onChange={(value) => updateContact(index, field.key, value)}
                  />
                ))}
              </div>
              <button type="button" className="danger-button contact-remove-button" onClick={() => removeContact(index)}>
                <Trash2 size={15} />
                삭제
              </button>
            </div>
          ))}
          {!contacts.length && <EmptyState title="담당자 없음" detail="필요하면 담당자를 추가해 주세요." />}
        </div>
      </div>
      <EditorActionBar onSave={() => onSave(draft)} onCancel={onCancel} />
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
  focusTarget: FocusTarget | null;
}) {
  const [salesSection, setSalesSection] = useState<"equipment" | "material">("equipment");
  const [salesPanel, setSalesPanel] = useState<{ id: string; mode: SalesPanelMode } | null>(null);
  const [editingNote, setEditingNote] = useState<AnyRecord | null>(null);
  const [salesMode, setSalesMode] = useState<ListMode>("all");
  const [salesStatusFilter, setSalesStatusFilter] = useState("all");
  const [salesCategoryFilter, setSalesCategoryFilter] = useState("all");
  const [salesPriorityFilter, setSalesPriorityFilter] = useState("all");
  const [salesSortKey, setSalesSortKey] = useState<SalesSortKey>("priority");
  const [salesSortDirection, setSalesSortDirection] = useState<SortDirection>("desc");
  const handledFocusTargetRef = useRef("");
  const searchedNotes = useMemo(
    () => data.notes.filter((note) => matchesRecord(note, query)),
    [data.notes, query]
  );
  const filteredNotes = useMemo(
    () =>
      searchedNotes.filter((note) => {
        const matchesStatus = salesStatusFilter === "all" || salesStatus(note) === salesStatusFilter;
        const matchesCategory = salesCategoryFilter === "all"
          || (salesCategoryFilter === "uncategorized" ? !salesCategory(note) : salesCategory(note) === salesCategoryFilter);
        const matchesPriority = salesPriorityFilter === "all" || salesPriority(note) === salesPriorityFilter;
        return matchesStatus && matchesCategory && matchesPriority;
      }),
    [searchedNotes, salesStatusFilter, salesCategoryFilter, salesPriorityFilter]
  );
  const salesCounts = useMemo(() => getListModeCounts(filteredNotes), [filteredNotes]);
  const notes = useMemo(
    () =>
      filteredNotes
        .filter((note) => matchesListMode(note, salesMode))
        .sort((a, b) => compareSalesNotes(a, b, salesSortKey, salesSortDirection)),
    [filteredNotes, salesMode, salesSortKey, salesSortDirection]
  );

  useEffect(() => {
    if (focusTarget?.portal === "sales" && focusTarget.salesKind === "material") {
      setSalesSection("material");
    }
  }, [focusTarget]);
  useEffect(() => {
    if (focusTarget?.portal !== "sales" || focusTarget.salesKind === "material") return;
    const focusKey = `${focusTarget.portal}:${focusTarget.id}:${focusTarget.nonce ?? ""}`;
    if (handledFocusTargetRef.current === focusKey) return;
    const focusedNote = searchedNotes.find((note, index) => recordId(note, index) === focusTarget.id);
    if (!focusedNote) return;
    handledFocusTargetRef.current = focusKey;
    setSalesSection("equipment");
    setSalesStatusFilter("all");
    setSalesCategoryFilter("all");
    setSalesPriorityFilter("all");
    setSalesMode(getListMode(focusedNote));
    if (focusTarget.openEditor) setEditingNote(prepareSalesDraft(focusedNote, data.notes.indexOf(focusedNote)));
    else setSalesPanel((current) => (current?.id === focusTarget.id && current.mode === "detail" ? current : { id: focusTarget.id, mode: "detail" }));
    window.setTimeout(() => scrollRecordIntoView(focusTarget.id), 0);
  }, [focusTarget, searchedNotes, data.notes]);
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
          <h2>영업 관리</h2>
        </div>
        <div className="toolbar-cluster">
          {salesSection === "equipment" && <span className="count-label">{notes.length}/{filteredNotes.length}건</span>}
          {salesSection === "equipment" && (
            <button type="button" onClick={() => setEditingNote(createBlankSalesNote())}>
              <Plus size={16} />
              새 장비 영업
            </button>
          )}
        </div>
      </div>
      <div className="sales-section-tabs segmented" aria-label="영업건 구분">
        <button
          type="button"
          className={salesSection === "equipment" ? "is-active" : ""}
          onClick={() => setSalesSection("equipment")}
        >
          장비 영업건
        </button>
        <button
          type="button"
          className={salesSection === "material" ? "is-active" : ""}
          onClick={() => setSalesSection("material")}
        >
          소재/소모품 및 기타
        </button>
      </div>      {editingNote && (
        <EditorDrawer onClose={() => setEditingNote(null)}>
          <SalesEditor
            draft={editingNote}
            setDraft={setEditingNote}
            data={data}
            onSave={saveNote}
            onCancel={() => setEditingNote(null)}
            fileAvailable={data.notes.some((note, index) => recordId(note, index) === firstText(editingNote, ["id"]))}
            onOpenFiles={() => {
              const id = firstText(editingNote, ["id"]);
              if (id) setSalesPanel({ id, mode: "files" });
            }}
          />
        </EditorDrawer>
      )}
      {salesSection === "equipment" && (
        <>
      <MemoListControls mode={salesMode} onModeChange={setSalesMode} counts={salesCounts} options={SALES_LIST_MODE_OPTIONS} />
      <div className="list-toolbar">
        <label className="compact-field">
          <span>진행상태</span>
          <select value={salesStatusFilter} onChange={(event) => setSalesStatusFilter(event.target.value)}>
            <option value="all">전체</option>
            {SALES_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </label>
        <label className="compact-field">
          <span>구분</span>
          <select value={salesCategoryFilter} onChange={(event) => setSalesCategoryFilter(event.target.value)}>
            <option value="all">전체</option>
            <option value="uncategorized">미지정</option>
            {SALES_ITEM_CATEGORY_OPTIONS.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </label>
        <label className="compact-field">
          <span>중요도</span>
          <select value={salesPriorityFilter} onChange={(event) => setSalesPriorityFilter(event.target.value)}>
            <option value="all">전체</option>
            {PRIORITY_OPTIONS.map((priority) => (
              <option key={priority} value={priority}>{priority}</option>
            ))}
          </select>
        </label>
        <label className="compact-field">
          <span>정렬</span>
          <select value={salesSortKey} onChange={(event) => setSalesSortKey(event.target.value as SalesSortKey)}>
            {SALES_SORT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="icon-text-button sort-direction-button"
          onClick={() => setSalesSortDirection((current) => (current === "desc" ? "asc" : "desc"))}
          title={salesSortKey === "priority" ? (salesSortDirection === "desc" ? "중요도 높은 순" : "중요도 낮은 순") : salesSortDirection === "desc" ? "내림차순" : "오름차순"}
        >
          {salesSortDirection === "desc" ? <ArrowDown size={17} /> : <ArrowUp size={17} />}
        </button>
      </div>
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
            <div className={`sales-row-group ${note.isImportant ? "is-important" : ""} ${focusTarget?.portal === "sales" && focusTarget.id === id ? "is-focus-target" : ""}`} key={id} data-record-id={id}>
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
                <div className="record-title-with-star">
                  <ImportantToggle active={Boolean(note.isImportant)} onToggle={() => persistImportantToggle(onPersist, "notes", id)} />
                  <div>
                    <strong>{salesCustomer(note)}</strong>
                    <div className="contact-lines">
                      <span>{firstText(note, ["contactName", "managerName"]) || "담당자 미입력"}</span>
                      <span>{firstText(note, ["contactPhone", "phone", "contact", "mobile"]) || "연락처 미입력"}</span>
                      <span>{firstText(note, ["contactEmail", "email"]) || "이메일 미입력"}</span>
                    </div>
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
        </>
      )}
      {salesSection === "material" && (
        <MaterialSalesSection data={data} query={query} onPersist={onPersist} focusTarget={focusTarget} />
      )}
    </section>
  );
}

function MaterialSalesSection({
  data,
  query,
  onPersist,
  focusTarget
}: {
  data: WorkNoteData;
  query: string;
  onPersist: (updater: (current: WorkNoteData) => WorkNoteData, reason: string) => void;
  focusTarget: FocusTarget | null;
}) {
  const [editingRecord, setEditingRecord] = useState<AnyRecord | null>(null);
  const [filePanel, setFilePanel] = useState<string | null>(null);
  const [mode, setMode] = useState<ListMode>("all");
  const handledFocusTargetRef = useRef("");
  const fileHandlers = createAttachmentHandlers({
    data,
    onPersist,
    collectionKey: "materialSalesNotes",
    ownerType: "materialSales",
    reasonLabel: "소재/소모품 파일"
  });
  const searched = useMemo(
    () => asArray(data.materialSalesNotes).filter((record) => matchesRecord(record, query)),
    [data.materialSalesNotes, query]
  );
  const counts = useMemo(() => getMaterialSalesModeCounts(searched), [searched]);
  const records = useMemo(
    () => searched.filter((record) => matchesMaterialSalesMode(record, mode)).sort((a, b) => compareUpdatedAt(a, b, "desc")),
    [searched, mode]
  );

  useEffect(() => {
    if (focusTarget?.portal !== "sales" || focusTarget.salesKind !== "material") return;
    const focusKey = focusTarget.id + ":" + (focusTarget.nonce ?? "");
    if (handledFocusTargetRef.current === focusKey) return;
    const index = asArray(data.materialSalesNotes).findIndex((record, recordIndex) => recordId(record, recordIndex) === focusTarget.id);
    if (index < 0) return;
    handledFocusTargetRef.current = focusKey;
    const record = data.materialSalesNotes[index];
    setMode(getMaterialSalesMode(record));
    setEditingRecord(prepareMaterialSalesDraft(record, index));
    window.setTimeout(() => scrollRecordIntoView(focusTarget.id), 0);
  }, [focusTarget, data.materialSalesNotes]);

  const saveRecord = (draft: AnyRecord) => {
    const normalized = normalizeMaterialSalesDraft(draft, data.companies);
    if (!normalized.company && !normalized.companyUnknown && !asArray(normalized.items).length) {
      alert("업체 또는 판매 품목을 입력해 주세요.");
      return;
    }

    onPersist((current) => {
      const now = new Date().toISOString();
      const previous = asArray(current.materialSalesNotes).find((record, index) => recordId(record, index) === normalized.id);
      const record = {
        ...previous,
        ...normalized,
        createdAt: firstText(previous || {}, ["createdAt"]) || now,
        updatedAt: now
      };
      const exists = asArray(current.materialSalesNotes).some((item, index) => recordId(item, index) === normalized.id);
      return {
        ...current,
        materialSalesNotes: exists
          ? asArray(current.materialSalesNotes).map((item, index) => (recordId(item, index) === normalized.id ? record : item))
          : [record, ...asArray(current.materialSalesNotes)]
      };
    }, firstText(draft, ["id"]) ? "소재/소모품 영업건 수정" : "소재/소모품 영업건 등록");
    setEditingRecord(null);
  };

  const deleteRecord = async (record: AnyRecord, index: number) => {
    const id = recordId(record, index);
    if (!confirm(`${salesCustomer(record)} 소재/소모품 영업건을 삭제할까요? 첨부 원본 파일도 이 브라우저 저장소에서 삭제됩니다.`)) return;
    try {
      await Promise.all(asArray(record.attachments).map((attachment) => deleteAttachmentRecord(firstText(attachment, ["id"]))));
    } catch (error) {
      if (!confirm(`첨부 파일 원본을 모두 삭제하지 못했습니다.\n${error instanceof Error ? error.message : String(error)}\n\n영업건 목록에서만 삭제할까요?`)) return;
    }
    onPersist((current) => ({
      ...current,
      materialSalesNotes: asArray(current.materialSalesNotes).filter((item, itemIndex) => recordId(item, itemIndex) !== id)
    }), "소재/소모품 영업건 삭제");
    if (filePanel === id) setFilePanel(null);
  };

  const updateQuickField = (id: string, key: string, value: string) => {
    onPersist((current) => {
      const now = new Date().toISOString();
      return {
        ...current,
        materialSalesNotes: asArray(current.materialSalesNotes).map((item, itemIndex) =>
          recordId(item, itemIndex) === id ? { ...item, [key]: value, updatedAt: now } : item
        )
      };
    }, "소재/소모품 영업건 빠른 수정");
  };

  return (
    <div className="material-sales-section">
      <div className="section-title-row compact-section-title">
        <div>
          <p className="eyebrow">MATERIAL / OTHER SALES</p>
          <h3>소재/소모품 및 기타 영업건</h3>
        </div>
        <div className="toolbar-cluster">
          <span className="count-label">{records.length}/{searched.length}건</span>
          <button type="button" onClick={() => setEditingRecord(createBlankMaterialSalesNote())}>
            <Plus size={16} />
            새 영업건
          </button>
        </div>
      </div>
      {editingRecord && (
        <EditorDrawer onClose={() => setEditingRecord(null)}>
          <MaterialSalesEditor
            draft={editingRecord}
            setDraft={setEditingRecord}
            data={data}
            onSave={saveRecord}
            onCancel={() => setEditingRecord(null)}
            fileAvailable={data.materialSalesNotes.some((record, index) => recordId(record, index) === firstText(editingRecord, ["id"]))}
            onOpenFiles={() => {
              const id = firstText(editingRecord, ["id"]);
              if (id) setFilePanel(id);
            }}
          />
        </EditorDrawer>
      )}
      <MemoListControls mode={mode} onModeChange={setMode} counts={counts} />
      <div className="material-sales-list">
        {records.map((record, index) => {
          const id = recordId(record, index);
          const items = asArray(record.items);
          const attachments = asArray(record.attachments);
          return (
            <article className={`task-card material-sales-card ${record.isImportant ? "is-important" : ""}`} key={id} data-record-id={id}>
              <div className="card-heading">
                <div className="record-title-with-star">
                  <ImportantToggle active={Boolean(record.isImportant)} onToggle={() => persistImportantToggle(onPersist, "materialSalesNotes", id)} />
                  <div>
                    <strong>{salesCustomer(record)}</strong>
                    <small>{contactBundle(record) || "담당자 정보 미입력"}</small>
                  </div>
                </div>
                <div className="badge-stack inline-select-stack">
                  <select value={materialSalesStatus(record)} onChange={(event) => updateQuickField(id, "status", event.target.value)}>
                    {MATERIAL_SALES_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                  <select value={materialSalesQuoteStatus(record)} onChange={(event) => updateQuickField(id, "quoteStatus", event.target.value)}>
                    {MATERIAL_QUOTE_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </div>
              </div>
              <div className="material-sales-summary">
                <InfoLine label="문의일자" value={formatOptionalDate(firstText(record, ["inquiryDate"])) || "-"} />
                <InfoLine label="판매품목" value={materialSalesItemsSummary(record) || "품목 없음"} />
                <InfoLine label="예상매출" value={formatMoney(firstText(record, ["expectedRevenueAmount"])) || formatMoney(String(calculateMaterialSalesTotal(items)))} />
                <InfoLine label="종합매출" value={formatMoney(firstText(record, ["revenueAmount"])) || "-"} />
                <InfoLine label="매출구분" value={firstText(record, ["revenueType"]) || "-"} />
                <InfoLine label="파일" value={attachmentCountText(record)} />
                <InfoLine label="메모" value={firstText(record, ["memo"])} />
              </div>
              <div className="card-actions">
                <button type="button" onClick={() => setFilePanel(filePanel === id ? null : id)}>
                  <FileText size={15} />
                  파일 {attachments.length}
                </button>
                <button type="button" onClick={() => setEditingRecord(prepareMaterialSalesDraft(record, index))}>
                  <Pencil size={15} />
                  수정
                </button>
                <button type="button" className="danger-button" onClick={() => deleteRecord(record, index)}>
                  <Trash2 size={15} />
                  삭제
                </button>
                <small>{formatDateTime(firstText(record, ["updatedAt"]))}</small>
              </div>
              {filePanel === id && (
                <div className="inline-file-panel">
                  <SalesFileManager
                    noteId={id}
                    attachments={attachments}
                    onUpload={fileHandlers.uploadAttachments}
                    onUpdateMeta={fileHandlers.updateAttachmentMeta}
                    onDelete={fileHandlers.deleteAttachment}
                    emptyDetail="소재/소모품 영업건에 보낸 견적서, 세금계산서, 메일 캡처와 관련 자료를 업로드해 두면 다시 다운로드할 수 있습니다."
                  />
                </div>
              )}
            </article>
          );
        })}
        {!records.length && <EmptyState title="소재/소모품 영업건 없음" detail="검색 조건에 맞는 영업건이 없습니다." />}
      </div>
    </div>
  );
}

function CompanyCombobox({
  draft,
  setDraft,
  companies,
  companyLabel = "업체명",
  contactLabel = "담당자 선택",
  allowNoCompany = false
}: {
  draft: AnyRecord;
  setDraft: (draft: AnyRecord) => void;
  companies: AnyRecord[];
  companyLabel?: string;
  contactLabel?: string;
  allowNoCompany?: boolean;
}) {
  const selectedCompany = firstText(draft, ["companyId"])
    ? companies.find((company, index) => recordId(company, index) === firstText(draft, ["companyId"]))
    : null;
  const contacts = selectedCompany ? asArray(selectedCompany.contacts) : [];
  const selectedName = selectedCompany ? companyName(selectedCompany) : firstText(draft, ["company"]);
  const [query, setQuery] = useState(selectedName);
  const [open, setOpen] = useState(false);
  const options = useMemo(
    () => companies.filter((company) => matchesText(company, query)).slice(0, 80),
    [companies, query]
  );

  useEffect(() => {
    if (!open) setQuery(selectedName);
  }, [open, selectedName]);

  const selectCompany = (value: string) => {
    if (value === "__unknown") {
      setDraft({ ...draft, companyId: "", contactId: "", companyUnknown: true, company: "", contactName: "", contactPhone: "", contactEmail: "" });
      setQuery("업체 미정");
      setOpen(false);
      return;
    }
    if (!value) {
      setDraft({ ...draft, companyId: "", contactId: "", companyUnknown: false, company: "", contactName: "", contactPhone: "", contactEmail: "" });
      setQuery("");
      setOpen(false);
      return;
    }
    const company = companies.find((item, index) => recordId(item, index) === value) || null;
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
    setQuery(company ? companyName(company) : "");
    setOpen(false);
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
    <div className="company-combobox wide-field" onBlur={() => window.setTimeout(() => setOpen(false), 120)}>
      <label className="field company-combobox-search">
        <span>업체 검색/선택</span>
        <div className="combo-input-wrap">
          <input
            type="search"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            placeholder="업체명, 담당자, 연락처, 이메일 검색"
          />
          <button type="button" aria-label="업체 목록 열기" onMouseDown={(event) => event.preventDefault()} onClick={() => {
              setOpen((current) => {
                if (!current) setQuery("");
                return !current;
              });
            }}>
            ▾
          </button>
        </div>
      </label>
      {open && (
        <div className="combo-options" role="listbox">
          <button type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => selectCompany("")}>
            <strong>{allowNoCompany ? "관련 업체 없음" : "직접 입력 / 연결 안 함"}</strong>
            <span>{allowNoCompany ? "업체를 연결하지 않고 업무를 등록" : "업체 목록과 연결하지 않고 직접 작성"}</span>
          </button>
          <button type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => selectCompany("__unknown")}>
            <strong>미정</strong>
            <span>관련 업체를 아직 모르는 상태</span>
          </button>
          {options.map((company, index) => {
            const id = recordId(company, index);
            const primary = asArray(company.contacts).find((contact) => Boolean(contact.isPrimary)) || asArray(company.contacts)[0] || {};
            return (
              <button type="button" role="option" key={id} onMouseDown={(event) => event.preventDefault()} onClick={() => selectCompany(id)}>
                <strong>{companyName(company) || "업체명 미입력"}</strong>
                <span>{joinParts([firstText(primary, ["name", "contactName"]), firstText(primary, ["phone", "contactPhone"]), firstText(primary, ["email", "contactEmail"]), firstText(company, ["status", "tradeStatus"])], " · ") || "담당자 정보 없음"}</span>
              </button>
            );
          })}
          {!options.length && <p>검색 결과가 없습니다.</p>}
        </div>
      )}
      <div className="selection-summary">
        <strong>{selectedCompany ? companyName(selectedCompany) : (draft.companyUnknown ? "업체 미정" : allowNoCompany && !firstText(draft, ["company"]) ? "관련 업체 없음" : "직접 입력")}</strong>
        <span>{[firstText(draft, ["contactName"]), firstText(draft, ["contactPhone"]), firstText(draft, ["contactEmail"])].filter(Boolean).join(" · ") || "담당자 정보 없음"}</span>
      </div>
      <TextField label={companyLabel} value={firstText(draft, ["company"])} onChange={(value) => setDraft({ ...draft, company: value, companyUnknown: false })} placeholder="업체명 또는 고객명" />
      {contacts.length > 0 && (
        <label className="field">
          <span>{contactLabel}</span>
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
    </div>
  );
}
function MaterialSalesEditor({
  draft,
  setDraft,
  data,
  onSave,
  onCancel,
  onOpenFiles,
  fileAvailable
}: {
  draft: AnyRecord;
  setDraft: (draft: AnyRecord) => void;
  data: WorkNoteData;
  onSave: (draft: AnyRecord) => void;
  onCancel: () => void;
  onOpenFiles: () => void;
  fileAvailable: boolean;
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
  const items = asArray(draft.items);
  const calculatedTotal = calculateMaterialSalesTotal(items);
  const updateField = (key: string, value: string | boolean | AnyRecord[]) => setDraft({ ...draft, [key]: value });

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

  const updateItem = (index: number, key: string, value: string) => {
    updateField("items", items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  };
  const addItem = () => updateField("items", [...items, createBlankMaterialSalesItem()]);
  const removeItem = (index: number) => updateField("items", items.filter((_, itemIndex) => itemIndex !== index));

  return (
    <section className="editor-panel">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">MATERIAL / OTHER SALES</p>
          <h2>{firstText(draft, ["id"]) ? "소재/소모품 영업건 수정" : "소재/소모품 영업건 등록"}</h2>
        </div>
        <button type="button" onClick={onCancel} aria-label="소재/소모품 영업건 편집 닫기">
          <X size={17} />
        </button>
      </div>
      <div className="form-grid">
        <CompanyCombobox
          draft={draft}
          setDraft={setDraft}
          companies={data.companies}
          companyLabel="고객/업체명"
          contactLabel="담당자 선택"
        />
        <TextField label="담당자" value={firstText(draft, ["contactName"])} onChange={(value) => updateField("contactName", value)} placeholder="담당자명" />
        <TextField label="연락처" value={firstText(draft, ["contactPhone"])} onChange={(value) => updateField("contactPhone", value)} placeholder="010-0000-0000" />
        <TextField label="이메일" value={firstText(draft, ["contactEmail"])} onChange={(value) => updateField("contactEmail", value)} placeholder="name@example.com" />
        <TextField label="문의 일자" type="date" value={firstText(draft, ["inquiryDate"])} onChange={(value) => updateField("inquiryDate", value)} />
        <SelectField label="진행 상태" value={materialSalesStatus(draft)} onChange={(value) => updateField("status", value)} options={MATERIAL_SALES_STATUS_OPTIONS} />
        <SelectField label="견적 여부" value={materialSalesQuoteStatus(draft)} onChange={(value) => updateField("quoteStatus", value)} options={MATERIAL_QUOTE_STATUS_OPTIONS} />
        <SelectField label="매출 구분" value={firstText(draft, ["revenueType"]) || MATERIAL_REVENUE_TYPE_OPTIONS[0]} onChange={(value) => updateField("revenueType", value)} options={MATERIAL_REVENUE_TYPE_OPTIONS} />
        <TextField label="예상 매출" value={firstText(draft, ["expectedRevenueAmount"])} onChange={(value) => updateField("expectedRevenueAmount", value)} placeholder={String(calculatedTotal || "")} />
        <TextField label="종합 매출" value={firstText(draft, ["revenueAmount"])} onChange={(value) => updateField("revenueAmount", value)} placeholder={String(calculatedTotal || "")} />
        <div className="material-total-tools wide-field">
          <strong>품목 합계 {formatMoney(String(calculatedTotal))}</strong>
          <button type="button" onClick={() => updateField("expectedRevenueAmount", String(calculatedTotal || ""))}>예상 매출에 적용</button>
          <button type="button" onClick={() => updateField("revenueAmount", String(calculatedTotal || ""))}>종합 매출에 적용</button>
        </div>
        <section className="material-items-editor wide-field">
          <div className="section-title-row compact-section-title">
            <h3>판매 품목</h3>
            <button type="button" onClick={addItem}><Plus size={15} /> 품목 추가</button>
          </div>
          {items.map((item, index) => (
            <div className="material-item-row" key={firstText(item, ["id"]) || index}>
              <TextField label="품목명" value={firstText(item, ["name"])} onChange={(value) => updateItem(index, "name", value)} placeholder="예: 레진, 필름, 소모품" />
              <TextField label="가격" value={firstText(item, ["price"])} onChange={(value) => updateItem(index, "price", value)} placeholder="예: 100000" />
              <TextField label="수량" value={firstText(item, ["quantity"])} onChange={(value) => updateItem(index, "quantity", value)} placeholder="예: 2" />
              <TextField label="품목별 메모" value={rawText(item, ["memo"])} onChange={(value) => updateItem(index, "memo", value)} placeholder="품목 조건, 비고" />
              <button type="button" className="danger-button" onClick={() => removeItem(index)}>삭제</button>
            </div>
          ))}
          {!items.length && <EmptyState title="판매 품목 없음" detail="품목 추가를 눌러 판매 품목을 등록해 주세요." />}
        </section>
        <TextAreaField label="상세 메모" value={rawText(draft, ["memo"])} onChange={(value) => updateField("memo", value)} placeholder="상세 내용" wide />
      </div>
      <EditorActionBar
        onSave={() => onSave(draft)}
        onCancel={onCancel}
        onOpenFiles={onOpenFiles}
        fileAvailable={fileAvailable}
      />
    </section>
  );
}

function SalesEditor({
  draft,
  setDraft,
  data,
  onSave,
  onCancel,
  onOpenFiles,
  fileAvailable
}: {
  draft: AnyRecord;
  setDraft: (draft: AnyRecord) => void;
  data: WorkNoteData;
  onSave: (draft: AnyRecord) => void;
  onCancel: () => void;
  onOpenFiles: () => void;
  fileAvailable: boolean;
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
        <CompanyCombobox
          draft={draft}
          setDraft={setDraft}
          companies={data.companies}
          companyLabel="고객/업체명"
          contactLabel="담당자 선택"
        />
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
        <TextAreaField label="다음 액션" value={rawText(draft, ["nextAction"])} onChange={(value) => updateField("nextAction", value)} placeholder="다음에 할 일" wide />
        <TextAreaField label="상세 메모" value={rawText(draft, ["memo"])} onChange={(value) => updateField("memo", value)} placeholder="상세 내용" wide />
      </div>
      <EditorActionBar
        onSave={() => onSave(draft)}
        onCancel={onCancel}
        onOpenFiles={onOpenFiles}
        fileAvailable={fileAvailable}
      />
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
  focusTarget,
  onClearFocusTarget
}: {
  title: string;
  records: AnyRecord[];
  query: string;
  type: "settlement" | "output" | "other";
  data: WorkNoteData;
  onPersist: (updater: (current: WorkNoteData) => WorkNoteData, reason: string) => void;
  focusTarget: FocusTarget | null;
  onClearFocusTarget: () => void;
}) {
  const [filePanel, setFilePanel] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<AnyRecord | null>(null);
  const [focusedSettlementRowId, setFocusedSettlementRowId] = useState("");
  const [workMode, setWorkMode] = useState<ListMode>("all");
  const handledFocusTargetRef = useRef("");
  const fileHandlers = createAttachmentHandlers({
    data,
    onPersist,
    collectionKey: workAttachmentCollectionKey(type),
    ownerType: type,
    reasonLabel: `${title} 파일`
  });
  const searched = useMemo(
    () =>
      records
        .map((record, originalIndex) => ({ record, originalIndex, id: recordId(record, originalIndex) }))
        .filter(({ record }) => matchesRecord(record, query)),
    [records, query]
  );
  const counts = useMemo(() => getListModeCounts(searched.map(({ record }) => record)), [searched]);
  const filtered = useMemo(
    () => searched.filter(({ record }) => matchesListMode(record, workMode)),
    [searched, workMode]
  );

  const closeEditor = () => {
    setEditingRecord(null);
    setFocusedSettlementRowId("");
    onClearFocusTarget();
  };

  useEffect(() => {
    if (focusTarget?.portal !== type) return;
    const focusKey = `${focusTarget.portal}:${focusTarget.id}:${focusTarget.taxInvoiceItemId || ""}:${focusTarget.nonce ?? ""}`;
    if (handledFocusTargetRef.current === focusKey) return;
    const target = searched.find(({ id }) => id === focusTarget.id);
    if (!target) return;
    handledFocusTargetRef.current = focusKey;
    setFocusedSettlementRowId("");
    setWorkMode(getListMode(target.record));
    if (focusTarget.openEditor || (focusTarget.taxInvoiceItemId && (type === "settlement" || focusTarget.taxInvoiceItemId === "record-tax-invoice"))) {
      setEditingRecord(prepareWorkDraft(target.record, target.originalIndex, type));
    }
    window.setTimeout(() => scrollRecordIntoView(focusTarget.id), 0);
  }, [focusTarget, searched, type]);
  const saveWorkRecord = (draft: AnyRecord) => {
    const normalized = normalizeWorkDraft(draft, type, data);
    if (!isWorkDraftValid(normalized, type)) {
      if (type === "settlement") alert("관련 업체, 결제 내용, 메모 중 하나는 입력해 주세요.");
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
    closeEditor();
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
          <span className="count-label">{filtered.length}/{searched.length}건</span>
          <button type="button" onClick={() => { setFocusedSettlementRowId(""); setEditingRecord(createBlankWorkTask(type)); }}>
            <Plus size={16} />
            새 업무
          </button>
        </div>
      </div>
      {editingRecord && (
        <EditorDrawer onClose={closeEditor}>
          <WorkEditor
            draft={editingRecord}
            setDraft={setEditingRecord}
            type={type}
            title={title}
            data={data}
            focusTaxInvoiceItemId={focusTarget?.portal === type ? focusTarget.taxInvoiceItemId : undefined}
            focusSettlementRowId={focusedSettlementRowId}
            onSave={saveWorkRecord}
            onCancel={closeEditor}
            fileAvailable={records.some((record, index) => recordId(record, index) === firstText(editingRecord, ["id"]))}
            onOpenFiles={() => {
              const id = firstText(editingRecord, ["id"]);
              if (id) setFilePanel(id);
            }}
          />
        </EditorDrawer>
      )}
      <MemoListControls mode={workMode} onModeChange={setWorkMode} counts={counts} />
      <div className="task-list">
        {filtered.map(({ record, originalIndex, id }) => {
          const attachments = asArray(record.attachments);
          const linkedSales = getLinkedSalesForWork(record, data.notes, data.materialSalesNotes);
          return (
            <article className={`task-card ${type} ${record.isImportant ? "is-important" : ""} ${focusTarget?.portal === type && focusTarget.id === id ? "is-focus-target" : ""}`} key={id} data-record-id={id}>
              <div className="card-heading">
                <div className="record-title-with-star">
                  <ImportantToggle active={Boolean(record.isImportant)} onToggle={() => persistImportantToggle(onPersist, workAttachmentCollectionKey(type), id)} />
                  <div>
                    <strong>{workTitle(record, type)}</strong>
                    <small>{type === "settlement" ? (linkedSales ? `관련 영업: ${salesCustomer(linkedSales)}` : relatedSalesFallback(record)) : joinParts([`관련 업체: ${workCompanyDisplay(record, linkedSales)}`, linkedSales ? `관련 영업: ${salesCustomer(linkedSales)}` : relatedSalesFallback(record)], " · ")}</small>
                  </div>
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
              <WorkTaskDetails
                record={record}
                type={type}
                linkedSales={linkedSales}
                onOpenSettlementRow={(rowId) => {
                  setFocusedSettlementRowId(rowId);
                  setEditingRecord(prepareWorkDraft(record, originalIndex, type));
                }}
              />
              <div className="card-actions">
                <button type="button" onClick={() => setFilePanel(filePanel === id ? null : id)}>
                  <FileText size={15} />
                  파일 {attachments.length}
                </button>
                <button type="button" onClick={() => { setFocusedSettlementRowId(""); setEditingRecord(prepareWorkDraft(record, originalIndex, type)); }}>
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
  focusTaxInvoiceItemId,
  focusSettlementRowId,
  onSave,
  onCancel,
  onOpenFiles,
  fileAvailable
}: {
  draft: AnyRecord;
  setDraft: (draft: AnyRecord) => void;
  type: "settlement" | "output" | "other";
  title: string;
  data: WorkNoteData;
  focusTaxInvoiceItemId?: string;
  focusSettlementRowId?: string;
  onSave: (draft: AnyRecord) => void;
  onCancel: () => void;
  onOpenFiles: () => void;
  fileAvailable: boolean;
}) {
  const updateField = (key: string, value: string | boolean | AnyRecord[]) => setDraft({ ...draft, [key]: value });
  const updateFields = (values: AnyRecord) => setDraft({ ...draft, ...values });
  const selectedCompany = firstText(draft, ["companyId"])
    ? data.companies.find((company, index) => recordId(company, index) === firstText(draft, ["companyId"]))
    : null;
  const contacts = selectedCompany ? asArray(selectedCompany.contacts) : [];
  const linkedSalesOptions = useMemo(
    () => [
      ...data.notes.map((note, index) => ({
        note,
        type: "equipment" as const,
        id: recordId(note, index),
        value: `equipment::${recordId(note, index)}`
      })),
      ...data.materialSalesNotes.map((note, index) => ({
        note,
        type: "material" as const,
        id: recordId(note, index),
        value: `material::${recordId(note, index)}`
      }))
    ],
    [data.notes, data.materialSalesNotes]
  );
  const selectedSalesOption = firstText(draft, ["salesNoteId"])
    ? linkedSalesOptions.find((option) => option.id === firstText(draft, ["salesNoteId"]) && (!firstText(draft, ["salesNoteType"]) || option.type === firstText(draft, ["salesNoteType"]))) || null
    : null;
  const selectedSales = selectedSalesOption?.note || null;
  const [companySearch, setCompanySearch] = useState("");
  const [salesSearch, setSalesSearch] = useState("");
  const companyOptions = useMemo(
    () => data.companies.filter((company) => matchesText(company, companySearch)).slice(0, 80),
    [data.companies, companySearch]
  );
  const salesOptions = useMemo(
    () => linkedSalesOptions.filter((option) => matchesText(option.note, salesSearch) || matchesText({ type: option.type === "material" ? "소재 소모품 기타" : "장비" }, salesSearch)).slice(0, 80),
    [linkedSalesOptions, salesSearch]
  );
  const [titleError, setTitleError] = useState("");
  const requiresTaskTitle = type === "output" || type === "other";
  const handleSave = () => {
    if (requiresTaskTitle && !firstText(draft, ["title"])) {
      setTitleError("업무 제목을 입력해 주세요.");
      return;
    }
    setTitleError("");
    onSave(draft);
  };

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
      setDraft({ ...draft, salesNoteId: "", salesNoteType: "", salesLinkUnknown: true });
      return;
    }
    const option = linkedSalesOptions.find((item) => item.value === value) || null;
    const note = option?.note || null;
    setDraft({
      ...draft,
      salesNoteId: option?.id || "",
      salesNoteType: option?.type || "",
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
        {requiresTaskTitle && (
          <TextField
            label="업무 제목"
            value={firstText(draft, ["title"])}
            onChange={(value) => {
              updateField("title", value);
              if (clean(value)) setTitleError("");
            }}
            placeholder={type === "output" ? "예: IML16K 샘플 출력" : "예: 전시회 준비"}
            error={titleError}
            wide
          />
        )}
        <CompanyCombobox
          draft={draft}
          setDraft={setDraft}
          companies={data.companies}
          companyLabel={requiresTaskTitle ? "관련 업체 (선택)" : "업체명"}
          contactLabel="담당자 선택"
          allowNoCompany={requiresTaskTitle}
        />
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
                placeholder="업체, 담당자, 장비, 소재/소모품, 품목"
              />
            </label>
            <label className="field wide-field">
              <span>관련 영업건</span>
              <select value={draft.salesLinkUnknown ? "__unknown" : selectedSalesOption?.value || ""} onChange={(event) => selectSales(event.target.value)}>
                <option value="">연결 안 함</option>
                <option value="__unknown">미정</option>
                {salesOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    [{option.type === "material" ? "소재" : "장비"}] {salesCustomer(option.note)} · {option.type === "material" ? materialSalesItemsSummary(option.note) || firstText(option.note, ["revenueType"]) || "품목 미입력" : salesInterest(option.note) || firstText(option.note, ["nextAction"]) || "영업 메모"}
                  </option>
                ))}
              </select>
            </label>
            <div className="selection-summary wide-field">
              <strong>{selectedSales ? salesCustomer(selectedSales) : (draft.salesLinkUnknown ? "영업건 미정" : "영업건 연결 안 함")}</strong>
              <span>{selectedSales ? joinParts([selectedSalesOption?.type === "material" ? "소재/소모품" : "장비", selectedSalesOption?.type === "material" ? materialSalesItemsSummary(selectedSales) || firstText(selectedSales, ["revenueType"]) : salesInterest(selectedSales), firstText(selectedSales, ["nextAction"])], " · ") : "검색 후 장비 또는 소재/소모품 영업건을 선택할 수 있습니다."}</span>
            </div>
          </>
        )}

        {type === "settlement" && (
          <SettlementFields draft={draft} updateField={updateField} updateFields={updateFields} focusTaxInvoiceItemId={focusTaxInvoiceItemId} focusSettlementRowId={focusSettlementRowId} />
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

        {type === "output" && <TaxInvoiceFields draft={draft} updateField={updateField} />}
        <TextAreaField label="업무 메모" value={rawText(draft, ["memo"])} onChange={(value) => updateField("memo", value)} placeholder="업무 조건, 주의사항, 진행 내용" wide />
      </div>
      <EditorActionBar
        onSave={handleSave}
        onCancel={onCancel}
        onOpenFiles={onOpenFiles}
        fileAvailable={fileAvailable}
      />
    </section>
  );
}

function TaxInvoiceFields({
  draft,
  updateField
}: {
  draft: AnyRecord;
  updateField: (key: string, value: string | boolean | AnyRecord[]) => void;
}) {
  const method = billingMethodFor(draft);
  const statusOptions = billingStatusOptions(method);
  const rawStatus = firstText(draft, ["taxInvoiceStatus", "invoiceStatus"]);
  const invoiceStatus = statusOptions.includes(rawStatus) ? rawStatus : statusOptions[0] || "";
  const needsFollowUp = method === "세금계산서" && (invoiceStatus === "발행 취소" || invoiceStatus === "재발행 완료");
  const isCard = method === "카드결제";
  return (
    <section className="tax-invoice-fields wide-field">
      <div className="section-title-row compact-section-title">
        <div>
          <p className="eyebrow">BILLING</p>
          <h3>결제 및 증빙</h3>
        </div>
      </div>
      <div className="tax-invoice-grid">
        <SelectField label="처리 방식" value={method} onChange={(value) => updateField("billingMethod", value)} options={BILLING_METHOD_OPTIONS} />
        {method !== "불필요" && (
          <>
            <TextField label={isCard ? "결제 예정일" : "발행일"} type="date" value={firstText(draft, ["taxInvoiceIssueDate", "invoiceIssueDate"])} onChange={(value) => updateField("taxInvoiceIssueDate", value)} />
            <SelectField label="처리 상태" value={invoiceStatus} onChange={(value) => updateField("taxInvoiceStatus", value)} options={statusOptions} />
            {needsFollowUp && (
              <>
                <TextField label="취소 사유" value={firstText(draft, ["taxInvoiceCancelReason", "invoiceCancelReason"])} onChange={(value) => updateField("taxInvoiceCancelReason", value)} placeholder="취소 또는 재발행 사유" />
                <TextField label="재발행 일자" type="date" value={firstText(draft, ["taxInvoiceReissueDate", "invoiceReissueDate"])} onChange={(value) => updateField("taxInvoiceReissueDate", value)} />
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
function SettlementFields({
  draft,
  updateField,
  updateFields,
  focusTaxInvoiceItemId,
  focusSettlementRowId
}: {
  draft: AnyRecord;
  updateField: (key: string, value: string | boolean | AnyRecord[]) => void;
  updateFields: (values: AnyRecord) => void;
  focusTaxInvoiceItemId?: string;
  focusSettlementRowId?: string;
}) {
  const schedule = asArray(draft.paymentSchedule);
  const regularSchedule = schedule.filter((row) => !row.isTaxInvoiceOnly);
  const [scheduleStart, setScheduleStart] = useState(firstText(draft, ["nextActionDate"]) || toDateKey(new Date()));
  const [scheduleInterval, setScheduleInterval] = useState("14");
  const [scheduleCount, setScheduleCount] = useState("");
  const [scheduleAmount, setScheduleAmount] = useState("");
  const [scheduleAmountVatIncluded, setScheduleAmountVatIncluded] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [openInvoiceRowIds, setOpenInvoiceRowIds] = useState<string[]>([]);
  const [bulkBillingMethod, setBulkBillingMethod] = useState("");
  const [bulkInvoiceStatus, setBulkInvoiceStatus] = useState("");
  const [bulkPlannedDate, setBulkPlannedDate] = useState("");
  const [bulkIssuedDate, setBulkIssuedDate] = useState("");
  const isAdvance = firstText(draft, ["paymentType"]).includes("선금");
  const rowStatusOptions = ["예정", "청구 완료", "입금 완료", "처리 완료", "확인 필요", "보류"];
  const scheduleStats = getSettlementScheduleStats(schedule, isAdvance);
  const advanceAmount = parseAmountNumber(firstText(draft, ["advanceAmount", "totalAmount"])) || 0;
  const advanceDeductedAmount = scheduleStats.totalAmount;
  const advanceRemainingAmount = advanceAmount - advanceDeductedAmount;
  const rowIds = schedule.map((row, index) => recordId(row, index));
  const draftId = firstText(draft, ["id"]);
  const allSelected = Boolean(rowIds.length) && rowIds.every((id) => selectedRowIds.includes(id));
  const bulkStatusOptions = billingStatusOptions(bulkBillingMethod || "세금계산서");

  useEffect(() => {
    setSelectedRowIds([]);
    setOpenInvoiceRowIds([]);
  }, [draftId]);

  useEffect(() => {
    const focusedRowId = focusSettlementRowId || focusTaxInvoiceItemId;
    if (!focusedRowId || !rowIds.includes(focusedRowId)) return;
    if (focusTaxInvoiceItemId === focusedRowId) {
      setSelectedRowIds((current) => current.includes(focusedRowId) ? current : [...current, focusedRowId]);
      setOpenInvoiceRowIds((current) => current.includes(focusedRowId) ? current : [...current, focusedRowId]);
    }
    window.setTimeout(() => scrollTaxInvoiceItemIntoView(focusedRowId), 120);
  }, [focusSettlementRowId, focusTaxInvoiceItemId, schedule.length]);

  const setSchedule = (rows: AnyRecord[]) => updateField("paymentSchedule", rows);
  const updateRow = (index: number, key: string, value: string | boolean) => {
    setSchedule(schedule.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)));
  };
  const addRow = () => {
    setSchedule([
      ...schedule,
      {
        id: createId("pay_"),
        round: String(regularSchedule.length + 1),
        dueDate: toDateKey(new Date()),
        amount: "",
        amountVatIncluded: false,
        status: isAdvance ? "차감 완료" : "예정",
        item: "",
        memo: "",
        billingMethod: "세금계산서",
        taxInvoiceStatus: "",
        taxInvoicePlannedDate: "",
        taxInvoiceIssuedDate: "",
        taxInvoiceMemo: ""
      }
    ]);
  };
  const removeRow = (index: number) => {
    const id = recordId(schedule[index], index);
    setSelectedRowIds((current) => current.filter((item) => item !== id));
    setOpenInvoiceRowIds((current) => current.filter((item) => item !== id));
    setSchedule(schedule.filter((_, rowIndex) => rowIndex !== index));
  };
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
        item: "",
        memo: "",
        billingMethod: "세금계산서",
        taxInvoiceStatus: "",
        taxInvoicePlannedDate: "",
        taxInvoiceIssuedDate: "",
        taxInvoiceMemo: ""
      };
    });
    setSchedule([...rows, ...schedule.filter((row) => row.isTaxInvoiceOnly)]);
  };
  const parsePasteRows = () => {
    const rows = parseSettlementSchedulePaste(pasteText);
    if (!rows.length) {
      alert("붙여넣은 일정이 없습니다.");
      return;
    }
    setSchedule([...rows, ...schedule.filter((row) => row.isTaxInvoiceOnly)]);
    setPasteText("");
  };
  const syncScheduleProgress = () => {
    updateFields({
      installmentProgress: regularSchedule.length ? `${scheduleStats.completedCount}/${regularSchedule.length}` : "",
      nextActionDate: firstText(scheduleStats.nextRow || {}, ["dueDate"]),
      nextAction: scheduleStats.nextRow
        ? `${firstText(scheduleStats.nextRow, ["round"]) || scheduleStats.completedCount + 1}회차 결제 예정`
        : "정산 완료 확인",
      receivedAmount: String(scheduleStats.completedAmount || "")
    });
  };
  const toggleRowSelection = (id: string) => {
    setSelectedRowIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const toggleAllRows = () => setSelectedRowIds(allSelected ? [] : rowIds);
  const toggleInvoiceEditor = (id: string) => {
    setOpenInvoiceRowIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const applyBulkInvoice = () => {
    if (!selectedRowIds.length) {
      alert("결제 및 증빙 정보를 적용할 회차 또는 차감 항목을 선택해 주세요.");
      return;
    }
    if (!bulkBillingMethod && !bulkInvoiceStatus && !bulkPlannedDate && !bulkIssuedDate) {
      alert("일괄 적용할 결제 및 증빙 정보를 하나 이상 입력해 주세요.");
      return;
    }
    setSchedule(schedule.map((row, index) => {
      if (!selectedRowIds.includes(recordId(row, index))) return row;
      const billingMethod = bulkBillingMethod || billingMethodFor(row);
      if (billingMethod === "불필요") {
        return {
          ...row,
          billingMethod,
          taxInvoiceStatus: "",
          taxInvoicePlannedDate: "",
          taxInvoiceIssuedDate: "",
          taxInvoiceMemo: ""
        };
      }
      const allowedStatuses = billingStatusOptions(billingMethod);
      const currentStatus = firstText(row, ["taxInvoiceStatus"]);
      const nextStatus = bulkInvoiceStatus
        ? (allowedStatuses.includes(bulkInvoiceStatus) ? bulkInvoiceStatus : "")
        : (allowedStatuses.includes(currentStatus) ? currentStatus : "");
      return {
        ...row,
        billingMethod,
        taxInvoiceStatus: nextStatus,
        ...(bulkPlannedDate ? { taxInvoicePlannedDate: bulkPlannedDate } : {}),
        ...(bulkIssuedDate ? { taxInvoiceIssuedDate: bulkIssuedDate } : {})
      };
    }));
    setOpenInvoiceRowIds((current) => Array.from(new Set([...current, ...selectedRowIds])));
  };

  return (
    <>
      <SelectField label="결제 유형" value={firstText(draft, ["paymentType"]) || "분할 결제"} onChange={(value) => updateField("paymentType", value)} options={SETTLEMENT_PAYMENT_OPTIONS} />
      <SelectField label="진행 상태" value={firstText(draft, ["status"]) || "예정"} onChange={(value) => updateField("status", value)} options={SETTLEMENT_STATUS_OPTIONS} />
      <TextField
        label={isAdvance ? "선금액" : "총 관리 금액"}
        value={isAdvance ? firstText(draft, ["advanceAmount", "totalAmount"]) : firstText(draft, ["totalAmount", "advanceAmount"])}
        onChange={(value) => updateField(isAdvance ? "advanceAmount" : "totalAmount", value)}
        placeholder="예: 10000000"
        option={<FieldCheck label="VAT 포함" checked={Boolean(isAdvance ? draft.advanceAmountVatIncluded : draft.totalAmountVatIncluded)} onChange={(checked) => updateField(isAdvance ? "advanceAmountVatIncluded" : "totalAmountVatIncluded", checked)} />}
      />

      {isAdvance ? (
        <>
          <div className="settlement-summary-grid advance-balance-summary wide-field">
            <div><span>선금액</span><strong>{formatMoney(String(advanceAmount))}</strong></div>
            <div><span>누적 차감액</span><strong>{formatMoney(String(advanceDeductedAmount))}</strong></div>
            <div><span>잔여 선금</span><strong>{formatMoney(String(advanceRemainingAmount))}</strong></div>
          </div>
          <TextAreaField label="선금/차감 메모" value={rawText(draft, ["plan"])} onChange={(value) => updateField("plan", value)} placeholder="선금 조건이나 차감 관련 참고사항" wide />
        </>
      ) : (
        <>
          <TextField label="회차 입금 완료액" value={firstText(draft, ["receivedAmount"])} onChange={(value) => updateField("receivedAmount", value)} placeholder="예: 5000000" option={<FieldCheck label="VAT 포함" checked={Boolean(draft.receivedAmountVatIncluded)} onChange={(checked) => updateField("receivedAmountVatIncluded", checked)} />} />
          <TextField label="기타 차감 금액" value={firstText(draft, ["deductedAmount"])} onChange={(value) => updateField("deductedAmount", value)} placeholder="예: 1000000" option={<FieldCheck label="VAT 포함" checked={Boolean(draft.deductedAmountVatIncluded)} onChange={(checked) => updateField("deductedAmountVatIncluded", checked)} />} />
          <TextField label="현재 회차 / 총 회차" value={firstText(draft, ["installmentProgress"])} onChange={(value) => updateField("installmentProgress", value)} placeholder="예: 8/25" />
          <TextField label="다음 처리일" type="date" value={firstText(draft, ["nextActionDate"])} onChange={(value) => updateField("nextActionDate", value)} />
          <TextField label="다음 처리" value={firstText(draft, ["nextAction"])} onChange={(value) => updateField("nextAction", value)} placeholder="예: 9회차 청구" />
          <TextAreaField label="회차별 결제 계획" value={rawText(draft, ["plan"])} onChange={(value) => updateField("plan", value)} placeholder="정산 조건, 남은 금액 처리 계획" wide />
        </>
      )}

      <section className="work-schedule-editor wide-field">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">{isAdvance ? "DEDUCTION HISTORY" : "PAYMENT TABLE"}</p>
            <h3>{isAdvance ? "차감 내역" : "회차별 결제 일정"}</h3>
          </div>
          <span className="count-label">{schedule.length}건</span>
        </div>

        {isAdvance ? (
          <div className="form-actions compact-actions advance-deduction-actions">
            <button type="button" className="icon-text-button primary" onClick={addRow}>차감 항목 추가</button>
          </div>
        ) : (
          <>
            <div className="schedule-tool-grid">
              <TextField label="시작일" type="date" value={scheduleStart} onChange={setScheduleStart} />
              <TextField label="간격(일)" type="number" value={scheduleInterval} onChange={setScheduleInterval} />
              <TextField label="예정 회차" type="number" value={scheduleCount} onChange={setScheduleCount} />
              <TextField label="회차별 금액" value={scheduleAmount} onChange={setScheduleAmount} option={<FieldCheck label="VAT 포함" checked={scheduleAmountVatIncluded} onChange={setScheduleAmountVatIncluded} />} />
              <button type="button" className="icon-text-button" onClick={generateRows}>일정 자동 생성</button>
              <button type="button" className="icon-text-button" onClick={addRow}>회차 추가</button>
            </div>
            <div className="settlement-summary-grid">
              <div><span>예정 합계</span><strong>{formatMoney(String(scheduleStats.totalAmount))}</strong></div>
              <div><span>입금 완료</span><strong>{formatMoney(String(scheduleStats.completedAmount))}</strong></div>
              <div><span>회차 잔액</span><strong>{formatMoney(String(scheduleStats.remainingAmount))}</strong></div>
              <div><span>다음 일정</span><strong>{scheduleStats.nextRow ? joinParts([`${firstText(scheduleStats.nextRow, ["round"])}회차`, formatOptionalDate(firstText(scheduleStats.nextRow, ["dueDate"]))], " · ") : "없음"}</strong></div>
            </div>
            <TextAreaField label="엑셀 일정 붙여넣기" value={pasteText} onChange={setPasteText} placeholder="예: 1회차  2026-07-08  1980000  예정  품목" wide />
            <div className="form-actions compact-actions">
              <button type="button" className="icon-text-button" onClick={parsePasteRows}>붙여넣은 일정 불러오기</button>
              <button type="button" className="icon-text-button primary" onClick={syncScheduleProgress}>회차표 완료액 반영</button>
            </div>
          </>
        )}

        <section className="settlement-invoice-bulk-panel">
          <div className="settlement-select-all">
            <label className="row-select-check">
              <input type="checkbox" checked={allSelected} onChange={toggleAllRows} />
              <span>전체 선택</span>
            </label>
            <strong>{selectedRowIds.length}건 선택</strong>
          </div>
          <label className="field">
            <span>처리 방식</span>
            <select
              value={bulkBillingMethod}
              onChange={(event) => {
                const method = event.target.value;
                setBulkBillingMethod(method);
                if (bulkInvoiceStatus && !billingStatusOptions(method || "세금계산서").includes(bulkInvoiceStatus)) setBulkInvoiceStatus("");
              }}
            >
              <option value="">변경 안 함</option>
              {BILLING_METHOD_OPTIONS.map((method) => <option key={method} value={method}>{method}</option>)}
            </select>
          </label>
          {bulkBillingMethod !== "불필요" && (
            <>
              <label className="field">
                <span>처리 상태</span>
                <select value={bulkInvoiceStatus} onChange={(event) => setBulkInvoiceStatus(event.target.value)}>
                  <option value="">변경 안 함</option>
                  {bulkStatusOptions.filter(Boolean).map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <TextField label={bulkBillingMethod === "카드결제" ? "결제 예정일" : "발행 예정일"} type="date" value={bulkPlannedDate} onChange={setBulkPlannedDate} />
              <TextField label={bulkBillingMethod === "카드결제" ? "결제 완료일" : "실제 발행일"} type="date" value={bulkIssuedDate} onChange={setBulkIssuedDate} />
            </>
          )}
          <button type="button" className="icon-text-button primary" onClick={applyBulkInvoice}>선택 항목에 적용</button>
        </section>

        <div className="payment-row-list">
          {schedule.map((row, index) => {
            const rowId = recordId(row, index);
            const rowStatus = firstText(row, ["status"]) || (isAdvance ? "차감 완료" : "예정");
            const rowBillingMethod = billingMethodFor(row);
            const rowBillingStatus = firstText(row, ["taxInvoiceStatus"]);
            const invoiceOpen = openInvoiceRowIds.includes(rowId);
            const focusClass = focusTaxInvoiceItemId === rowId
              ? "is-tax-invoice-focus"
              : focusSettlementRowId === rowId
                ? "is-settlement-row-focus"
                : "";
            return (
              <div
                className={`payment-row ${isAdvance ? "advance-deduction-row" : "installment-payment-row"} ${focusClass}`}
                key={rowId}
                data-tax-invoice-item-id={rowId}
              >
                <label className="row-select-check payment-row-select">
                  <input type="checkbox" checked={selectedRowIds.includes(rowId)} onChange={() => toggleRowSelection(rowId)} />
                  <span>선택</span>
                </label>
                {isAdvance ? (
                  <>
                    <TextField label="차감일" type="date" value={firstText(row, ["dueDate"])} onChange={(value) => updateRow(index, "dueDate", value)} />
                    <TextField label="차감 품목" value={firstText(row, ["item"])} onChange={(value) => updateRow(index, "item", value)} placeholder="예: 레진 10kg" />
                    <TextField label="차감 금액" value={firstText(row, ["amount"])} onChange={(value) => updateRow(index, "amount", value)} option={<FieldCheck label="VAT 포함" checked={Boolean(row.amountVatIncluded)} onChange={(checked) => updateRow(index, "amountVatIncluded", checked)} />} />
                    <TextField label="메모" value={firstText(row, ["memo"])} onChange={(value) => updateRow(index, "memo", value)} placeholder="차감 근거 또는 참고사항" />
                  </>
                ) : (
                  <>
                    <TextField label="회차" value={firstText(row, ["round"])} onChange={(value) => updateRow(index, "round", value)} />
                    <TextField label="예정일" type="date" value={firstText(row, ["dueDate"])} onChange={(value) => updateRow(index, "dueDate", value)} />
                    <TextField label="금액" value={firstText(row, ["amount"])} onChange={(value) => updateRow(index, "amount", value)} option={<FieldCheck label="VAT 포함" checked={Boolean(row.amountVatIncluded)} onChange={(checked) => updateRow(index, "amountVatIncluded", checked)} />} />
                    <TextField label="품목/메모" value={firstText(row, ["item"])} onChange={(value) => updateRow(index, "item", value)} />
                    <label className="field">
                      <span>상태</span>
                      <select value={rowStatus} onChange={(event) => updateRow(index, "status", event.target.value)}>
                        {!rowStatusOptions.includes(rowStatus) && <option value={rowStatus}>{rowStatus}</option>}
                        {rowStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </label>
                  </>
                )}
                <button type="button" className={`invoice-row-toggle ${rowBillingStatus || rowBillingMethod !== "세금계산서" ? "has-invoice" : ""}`} onClick={() => toggleInvoiceEditor(rowId)}>
                  {rowBillingMethod}{rowBillingStatus ? ` · ${rowBillingStatus}` : ""}
                </button>
                <button type="button" className="danger-button" onClick={() => removeRow(index)}>삭제</button>
                {invoiceOpen && (
                  <SettlementRowTaxInvoiceEditor row={row} onChange={(key, value) => updateRow(index, key, value)} />
                )}
              </div>
            );
          })}
          {!schedule.length && (
            <div className="empty-inline">
              <strong>{isAdvance ? "차감 내역 없음" : "일정 없음"}</strong>
              <span>{isAdvance ? "차감이 발생하면 차감 항목을 추가해 주세요." : "자동 생성, 회차 추가, 엑셀 붙여넣기로 일정을 만들 수 있습니다."}</span>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function SettlementRowTaxInvoiceEditor({
  row,
  onChange
}: {
  row: AnyRecord;
  onChange: (key: string, value: string) => void;
}) {
  const method = billingMethodFor(row);
  const statusOptions = billingStatusOptions(method);
  const rawStatus = firstText(row, ["taxInvoiceStatus"]);
  const status = statusOptions.includes(rawStatus) ? rawStatus : statusOptions[0] || "";
  const isCard = method === "카드결제";
  return (
    <section className="settlement-row-tax-invoice">
      <div className="settlement-row-tax-heading">
        <div>
          <p className="eyebrow">BILLING</p>
          <strong>이 항목의 결제 및 증빙</strong>
        </div>
        <span>{joinParts([firstText(row, ["round"]) ? `${firstText(row, ["round"])}회차` : "", firstText(row, ["item"]), formatMoney(firstText(row, ["amount"]))], " · ") || "항목 정보 미정"}</span>
      </div>
      <SelectField label="처리 방식" value={method} onChange={(value) => onChange("billingMethod", value)} options={BILLING_METHOD_OPTIONS} />
      {method !== "불필요" && (
        <>
          <SelectField label="처리 상태" value={status} onChange={(value) => onChange("taxInvoiceStatus", value)} options={statusOptions} />
          <TextField label={isCard ? "결제 예정일" : "발행 예정일"} type="date" value={firstText(row, ["taxInvoicePlannedDate"])} onChange={(value) => onChange("taxInvoicePlannedDate", value)} />
          <TextField label={isCard ? "결제 완료일" : "실제 발행일"} type="date" value={firstText(row, ["taxInvoiceIssuedDate"])} onChange={(value) => onChange("taxInvoiceIssuedDate", value)} />
          <TextField label="메모" value={firstText(row, ["taxInvoiceMemo"])} onChange={(value) => onChange("taxInvoiceMemo", value)} placeholder="발행·결제 관련 메모" />
        </>
      )}
    </section>
  );
}

function WorkTaskDetails({
  record,
  type,
  linkedSales,
  onOpenSettlementRow
}: {
  record: AnyRecord;
  type: "settlement" | "output" | "other";
  linkedSales: AnyRecord | null;
  onOpenSettlementRow?: (rowId: string) => void;
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
          {!isAdvance && <InfoLine label="진행" value={firstText(record, ["installmentProgress"])} />}
          <InfoLine label={isAdvance ? "선금" : "총금액"} value={formatMoneyWithVat(firstText(record, [isAdvance ? "advanceAmount" : "totalAmount"]), isAdvance ? record.advanceAmountVatIncluded : record.totalAmountVatIncluded)} />
          <InfoLine label={isAdvance ? "누적 차감" : "입금"} value={isAdvance ? formatMoney(firstText(record, ["deductedAmount"])) : formatMoneyWithVat(firstText(record, ["receivedAmount"]), record.receivedAmountVatIncluded)} />
          <InfoLine label="잔액" value={settlementRemainingText(record)} />
          {!isAdvance && <InfoLine label="다음" value={joinParts([formatOptionalDate(firstText(record, ["nextActionDate"])), firstText(record, ["nextAction"])], " · ")} />}
          <InfoLine label="결제/증빙" value={settlementTaxInvoiceSummary(record)} />
          <InfoLine label="파일" value={attachmentCountText(record)} />
          <InfoLine label="수정" value={formatDateTime(firstText(record, ["updatedAt"]))} />
        </div>
        <SchedulePreview rows={schedule} isAdvance={isAdvance} onOpenRow={onOpenSettlementRow} />
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
          <InfoLine label="관련 업체" value={workCompanyDisplay(record, linkedSales)} />
          <InfoLine label="요청자" value={contactBundle(record)} />
          <InfoLine label="기한" value={deadlineText(record)} />
          <InfoLine label="출력" value={firstText(record, ["outputType", "category", "taskType"])} />
          <InfoLine label="주말" value={record.includeWeekends ? "포함" : "제외"} />
          <InfoLine label="결제/증빙" value={taxInvoiceSummary(record)} />
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
        <InfoLine label="관련 업체" value={workCompanyDisplay(record, linkedSales)} />
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

function SchedulePreview({ rows, isAdvance, onOpenRow }: { rows: AnyRecord[]; isAdvance: boolean; onOpenRow?: (rowId: string) => void }) {
  const entries = getSettlementPreviewEntries(rows, isAdvance);
  if (!entries.length) return null;
  const visibleEntries = getVisibleSettlementPreviewEntries(entries, isAdvance);
  const completed = isAdvance ? entries.length : entries.filter(({ row }) => isSettlementScheduleRowCompleted(row, false)).length;
  return (
    <div className="schedule-preview">
      <div className="preview-title">
        <strong>{isAdvance ? "차감 내역" : "회차 일정"}</strong>
        <span>{isAdvance ? entries.length + "건" : completed + "/" + entries.length}</span>
      </div>
      {visibleEntries.map(({ row, index, id }) => {
        const roundLabel = `${firstText(row, ["round"]) || index + 1}회차`;
        return (
          <button
            type="button"
            className="schedule-preview-row"
            key={id}
            onClick={() => onOpenRow?.(id)}
            aria-label={isAdvance ? `${formatOptionalDate(firstText(row, ["dueDate"])) || "일자 미정"} 차감 내역 수정` : `${roundLabel} 수정`}
          >
            <span>{isAdvance ? formatOptionalDate(firstText(row, ["dueDate"])) || "일자 미정" : roundLabel}</span>
            <strong>{isAdvance
              ? joinParts([firstText(row, ["item"]) || "품목 미정", formatMoneyWithVat(firstText(row, ["amount"]), row.amountVatIncluded)], " · ")
              : joinParts([formatOptionalDate(firstText(row, ["dueDate"])), formatMoneyWithVat(firstText(row, ["amount"]), row.amountVatIncluded), firstText(row, ["item"])], " · ")}</strong>
            <small>{isAdvance ? firstText(row, ["memo"]) || "차감 완료" : firstText(row, ["status"]) || "예정"}</small>
          </button>
        );
      })}
      {entries.length > visibleEntries.length && <small className="more-line">외 {entries.length - visibleEntries.length}건</small>}
    </div>
  );
}

function getSettlementPreviewEntries(rows: AnyRecord[], isAdvance: boolean): Array<{ row: AnyRecord; index: number; id: string }> {
  const entries = rows
    .map((row, index) => ({ row, index, id: recordId(row, index) }))
    .filter(({ row }) => !row.isTaxInvoiceOnly);
  if (isAdvance) return entries;
  return [...entries].sort((a, b) => {
    const roundA = Number(firstText(a.row, ["round"]));
    const roundB = Number(firstText(b.row, ["round"]));
    if (Number.isFinite(roundA) && roundA > 0 && Number.isFinite(roundB) && roundB > 0 && roundA !== roundB) return roundA - roundB;
    const dateA = parseDateKey(firstText(a.row, ["dueDate"])) || "9999-12-31";
    const dateB = parseDateKey(firstText(b.row, ["dueDate"])) || "9999-12-31";
    return dateA.localeCompare(dateB) || a.index - b.index;
  });
}

function getVisibleSettlementPreviewEntries(entries: Array<{ row: AnyRecord; index: number; id: string }>, isAdvance: boolean) {
  if (isAdvance) return entries.slice(0, 4);
  let latestCompletedIndex = -1;
  entries.forEach(({ row }, index) => {
    if (isSettlementScheduleRowCompleted(row, false)) latestCompletedIndex = index;
  });
  return entries.slice(Math.max(0, latestCompletedIndex), Math.max(0, latestCompletedIndex) + 4);
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
        <TextAreaField label="메모" value={rawText(draft, ["memo"])} onChange={(value) => updateField("memo", value)} placeholder="계정 관련 메모" wide />
      </div>
      <EditorActionBar onSave={() => onSave(draft)} onCancel={onCancel} />
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

function MetricCard({
  label,
  value,
  active,
  onClick
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`metric-card ${active ? "is-active" : ""}`}
      aria-pressed={active}
      onClick={onClick}
    >
      <span>{label}</span>
      <strong key={value}>{value}</strong>
    </button>
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
  option,
  error = ""
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  wide?: boolean;
  disabled?: boolean;
  option?: React.ReactNode;
  error?: string;
}) {
  return (
    <label className={`field ${wide ? "wide-field" : ""} ${error ? "has-error" : ""}`}>
      <span className="field-title-row">
        <span>{label}</span>
        {option && <span className="field-option-row">{option}</span>}
      </span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} disabled={disabled} aria-invalid={Boolean(error)} />
      {error && <small className="field-error" role="alert">{error}</small>}
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
    internalContacts: [],
    notes: [],
    materialSalesNotes: [],
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
    return migrateWorkNoteData({
      ...base,
      version: firstText(parsed, ["version"]) || "unknown",
      updatedAt: firstText(parsed, ["updatedAt"]),
      companies: asArray(parsed.companies),
      internalContacts: asArray(parsed.internalContacts),
      notes: asArray(parsed.notes),
      materialSalesNotes: asArray(parsed.materialSalesNotes),
      settlementTasks: asArray(parsed.settlementTasks),
      outputTasks: asArray(parsed.outputTasks),
      otherTasks: asArray(parsed.otherTasks),
      accounts: asArray(parsed.accounts)
    });
  } catch (error) {
    return {
      ...base,
      error: error instanceof Error ? error.message : "데이터를 읽지 못했습니다."
    };
  }
}

function migrateWorkNoteData(data: WorkNoteData): WorkNoteData {
  return migrateImportantFlags(migrateWorkTaskTitles(migrateSettlementTaxInvoiceRows(migrateLegacyMaterialSalesNotes(migrateInternalContacts(data)))));
}

function migrateInternalContacts(data: WorkNoteData): WorkNoteData {
  return {
    ...data,
    internalContacts: asArray(data.internalContacts).map((contact, index) => ({
      ...contact,
      id: firstText(contact, ["id"]) || `internal_contact_legacy_${index}`,
      name: firstText(contact, ["name"]),
      title: firstText(contact, ["title"]),
      department: firstText(contact, ["department"]),
      mobile: firstText(contact, ["mobile", "phone"]),
      extension: firstText(contact, ["extension"]),
      email: firstText(contact, ["email"]),
      duties: asTextArray(contact.duties),
      memo: firstText(contact, ["memo"])
    }))
  };
}

function migrateWorkTaskTitles(data: WorkNoteData): WorkNoteData {
  let changed = false;
  const migrate = (records: AnyRecord[], type: "output" | "other") => records.map((record) => {
    if (firstText(record, ["title"])) return record;
    changed = true;
    return { ...record, title: deriveWorkTaskTitle(record, type) };
  });
  const outputTasks = migrate(asArray(data.outputTasks), "output");
  const otherTasks = migrate(asArray(data.otherTasks), "other");
  return changed ? { ...data, outputTasks, otherTasks } : data;
}

function deriveWorkTaskTitle(record: AnyRecord, type: "output" | "other"): string {
  const legacyTitle = type === "output"
    ? firstText(record, ["taskName", "workName", "outputName", "subject", "outputType"])
    : firstText(record, ["taskName", "workName", "subject", "name"]);
  if (legacyTitle) return legacyTitle;
  const memo = firstText(record, ["memo", "description", "note"]).replace(/\s+/g, " ").trim();
  if (memo) return memo.length > 40 ? `${memo.slice(0, 40).trim()}…` : memo;
  const company = companyName(record);
  if (company) return `${company} ${type === "output" ? "출력 업무" : "기타 업무"}`;
  return type === "output" ? "제목 없는 출력 업무" : "제목 없는 기타 업무";
}

function migrateImportantFlags(data: WorkNoteData): WorkNoteData {
  let changed = false;
  const taskCollections: TaskCollectionKey[] = ["notes", "materialSalesNotes", "settlementTasks", "outputTasks", "otherTasks"];
  const migrated = { ...data };

  taskCollections.forEach((collectionKey) => {
    migrated[collectionKey] = asArray(data[collectionKey]).map((record) => {
      if (typeof record.isImportant === "boolean") return record;
      changed = true;
      return { ...record, isImportant: false };
    });
  });

  return changed ? migrated : data;
}

function migrateSettlementTaxInvoiceRows(data: WorkNoteData): WorkNoteData {
  let changed = false;
  const settlementTasks = asArray(data.settlementTasks).map((record, recordIndex) => {
    const settlementId = recordId(record, recordIndex);
    const sourceRows = asArray(record.paymentSchedule).map((row, rowIndex) => ({
      ...row,
      id: firstText(row, ["id"]) || `${settlementId}-payment-${rowIndex + 1}`
    }));
    let rows = normalizePaymentSchedule(sourceRows);
    const legacyStatus = firstText(record, ["taxInvoiceStatus", "invoiceStatus"]);
    const legacyIssueDate = firstText(record, ["taxInvoiceIssueDate", "invoiceIssueDate"]);
    const legacyCancelReason = firstText(record, ["taxInvoiceCancelReason", "invoiceCancelReason"]);
    const legacyReissueDate = firstText(record, ["taxInvoiceReissueDate", "invoiceReissueDate"]);
    const hasLegacyInvoice = Boolean(legacyStatus || legacyIssueDate || legacyCancelReason || legacyReissueDate);
    const alreadyMigrated = Number(record.taxInvoiceRowMigrationVersion) >= 1;

    if (!alreadyMigrated && hasLegacyInvoice) {
      let targetIndex = rows.findIndex((row) => legacyIssueDate && firstText(row, ["dueDate"]) === legacyIssueDate);
      if (targetIndex < 0) targetIndex = rows.findIndex((row) => !firstText(row, ["taxInvoiceStatus", "taxInvoicePlannedDate", "taxInvoiceIssuedDate", "taxInvoiceMemo"]));
      if (targetIndex < 0) {
        rows = [
          ...rows,
          {
            id: `${settlementId}-legacy-tax-invoice`,
            round: "",
            dueDate: legacyIssueDate,
            amount: "",
            amountVatIncluded: false,
            status: firstText(record, ["paymentType"]).includes("선금") ? "차감 완료" : "예정",
            item: "기존 세금계산서",
            memo: "",
            isTaxInvoiceOnly: true,
            billingMethod: "세금계산서",
            taxInvoiceStatus: "",
            taxInvoicePlannedDate: "",
            taxInvoiceIssuedDate: "",
            taxInvoiceMemo: ""
          }
        ];
        targetIndex = rows.length - 1;
      }

      const migratedStatus = TAX_INVOICE_STATUS_OPTIONS.includes(legacyStatus)
        ? legacyStatus
        : legacyIssueDate
          ? "발행 예정"
          : "";
      const migratedMemo = joinParts([
        legacyCancelReason ? `취소 사유: ${legacyCancelReason}` : "",
        legacyReissueDate ? `재발행일: ${legacyReissueDate}` : ""
      ], " · ");
      rows = rows.map((row, rowIndex) => rowIndex === targetIndex ? {
        ...row,
        taxInvoiceStatus: firstText(row, ["taxInvoiceStatus"]) || migratedStatus,
        taxInvoicePlannedDate: firstText(row, ["taxInvoicePlannedDate"]) || legacyIssueDate,
        taxInvoiceIssuedDate: firstText(row, ["taxInvoiceIssuedDate"]) || (migratedStatus === "발행 완료" ? legacyIssueDate : migratedStatus === "재발행 완료" ? (legacyReissueDate || legacyIssueDate) : ""),
        taxInvoiceMemo: firstText(row, ["taxInvoiceMemo"]) || migratedMemo
      } : row);
      changed = true;
    }

    const idChanged = !firstText(record, ["id"]);
    const rowsChanged = JSON.stringify(sourceRows) !== JSON.stringify(rows);
    if (idChanged || rowsChanged || !alreadyMigrated) changed = true;
    return {
      ...record,
      id: firstText(record, ["id"]) || settlementId,
      paymentSchedule: rows,
      taxInvoiceRowMigrationVersion: 1
    };
  });

  return changed ? { ...data, settlementTasks } : data;
}
function migrateLegacyMaterialSalesNotes(data: WorkNoteData): WorkNoteData {
  const materialSalesNotes = [...asArray(data.materialSalesNotes)];
  const existingKeys = new Set(
    materialSalesNotes
      .map((record, index) => firstText(record, ["id"]) || createMergeKey("materialSales", record, index))
      .filter(Boolean)
  );
  const notes: AnyRecord[] = [];
  let movedCount = 0;

  asArray(data.notes).forEach((note, index) => {
    if (!isLegacyMaterialSalesNote(note)) {
      notes.push(note);
      return;
    }

    const converted = convertLegacyMaterialSalesNote(note, index);
    const convertedId = firstText(converted, ["id"]);
    const convertedKey = createMergeKey("materialSales", converted, materialSalesNotes.length + movedCount);
    if (!existingKeys.has(convertedId) && !existingKeys.has(convertedKey)) {
      materialSalesNotes.push(converted);
      existingKeys.add(convertedId);
      existingKeys.add(convertedKey);
      movedCount += 1;
    }
  });

  if (!movedCount && notes.length === asArray(data.notes).length) return data;
  return {
    ...data,
    notes,
    materialSalesNotes
  };
}

function isLegacyMaterialSalesNote(note: AnyRecord): boolean {
  return LEGACY_MATERIAL_SALES_CATEGORIES.includes(salesCategory(note));
}

function convertLegacyMaterialSalesNote(note: AnyRecord, index: number): AnyRecord {
  const sourceId = recordId(note, index);
  const category = salesCategory(note);
  const itemName = salesInterest(note) || firstText(note, ["nextAction", "action"]) || "이전 소재 영업 품목";
  const expectedRevenueAmount = normalizeAmountString(firstText(note, ["expectedRevenueAmount"])) || normalizeAmountString(firstText(note, ["revenueAmount"]));
  const revenueAmount = normalizeAmountString(firstText(note, ["revenueAmount"]));
  const nextAction = firstText(note, ["nextAction", "action"]);
  const purchasePossibility = firstText(note, ["purchasePossibility"]);
  const memo = joinParts(
    [
      rawText(note, ["memo", "description", "note"]),
      nextAction ? `이전 다음 액션: ${nextAction}` : "",
      purchasePossibility ? `구매 가능성: ${purchasePossibility}` : "",
      category ? `이전 구분: ${category}` : ""
    ],
    "\n"
  );

  return {
    ...note,
    id: firstText(note, ["materialSalesId"]) || `material_${sourceId}`,
    sourceSalesNoteId: sourceId,
    items: normalizeMaterialSalesItems([
      {
        id: `item_${sourceId}`,
        name: itemName,
        price: revenueAmount || expectedRevenueAmount,
        quantity: "1",
        memo: joinParts([firstText(note, ["quoteStatus"]), purchasePossibility], " / ")
      }
    ]),
    status: mapLegacySalesStatusToMaterialStatus(salesStatus(note)),
    quoteStatus: mapLegacyQuoteStatusToMaterialQuoteStatus(firstText(note, ["quoteStatus"])),
    expectedRevenueAmount,
    revenueAmount,
    revenueType: category === "타사 소재" ? "타사 상품" : "소재/소모품",
    memo,
    updatedAt: firstText(note, ["updatedAt"]) || new Date().toISOString()
  };
}

function mapLegacySalesStatusToMaterialStatus(status: string): string {
  const text = clean(status);
  if (text === "완료") return "입금 확인 완료";
  if (text === "1차 대응 완료") return "1차 대응 완료";
  if (text.includes("검토") || text.includes("샘플") || text.includes("BMT") || text.includes("미팅") || text.includes("수주")) return "검토 중";
  return "신규 문의";
}

function mapLegacyQuoteStatusToMaterialQuoteStatus(status: string): string {
  const text = clean(status);
  if (text.includes("불필요")) return "견적 불필요";
  if (text.includes("완료") || text.includes("발송")) return "견적 완료";
  return "견적 전";
}
function saveWorkNoteData(data: WorkNoteData, reason: string): WorkNoteData {
  const now = new Date().toISOString();
  const existing = safeParseStoredData();
  const payload = {
    ...existing,
    version: data.version && data.version !== "unknown" ? data.version : "react-work-note-v1",
    updatedAt: now,
    companies: asArray(data.companies),
    internalContacts: asArray(data.internalContacts),
    notes: asArray(data.notes),
    materialSalesNotes: asArray(data.materialSalesNotes),
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
  const arrayKeys = ["companies", "internalContacts", "notes", "materialSalesNotes", "settlementTasks", "outputTasks", "otherTasks", "accounts"];
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
    internalContacts: [],
    notes: [],
    materialSalesNotes: [],
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
    internalContacts: Array.isArray(options.internalContacts) ? options.internalContacts : state.internalContacts,
    notes: Array.isArray(options.notes) ? options.notes : state.notes,
    materialSalesNotes: Array.isArray(options.materialSalesNotes) ? options.materialSalesNotes : state.materialSalesNotes,
    settlementTasks: Array.isArray(options.settlementTasks) ? options.settlementTasks : state.settlementTasks,
    outputTasks: Array.isArray(options.outputTasks) ? options.outputTasks : state.outputTasks,
    otherTasks: Array.isArray(options.otherTasks) ? options.otherTasks : state.otherTasks,
    accounts: Array.isArray(options.accounts) ? options.accounts : state.accounts
  };
}

function cloneBackupState(data: WorkNoteData): Pick<WorkNoteData, "companies" | "internalContacts" | "notes" | "materialSalesNotes" | "settlementTasks" | "outputTasks" | "otherTasks" | "accounts"> {
  return {
    companies: JSON.parse(JSON.stringify(asArray(data.companies))),
    internalContacts: JSON.parse(JSON.stringify(asArray(data.internalContacts))),
    notes: JSON.parse(JSON.stringify(asArray(data.notes))),
    materialSalesNotes: JSON.parse(JSON.stringify(asArray(data.materialSalesNotes))),
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
  if (type === "materialSales") return salesCustomer(owner);
  if (type === "settlement") return workTitle(owner, "settlement");
  if (type === "output") return workTitle(owner, "output");
  return workTitle(owner, "other");
}

function getBackupRecordCounts(data: Pick<WorkNoteData, "companies" | "internalContacts" | "notes" | "materialSalesNotes" | "settlementTasks" | "outputTasks" | "otherTasks" | "accounts">): Record<string, number> {
  return {
    companies: asArray(data.companies).length,
    internalContacts: asArray(data.internalContacts).length,
    notes: asArray(data.notes).length,
    materialSalesNotes: asArray(data.materialSalesNotes).length,
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

const CSV_EXPORT_FILE_NAMES: Record<string, string> = {
  "업체": "companies.csv",
  "본사담당자": "internal-contacts.csv",
  "장비영업": "equipment-sales.csv",
  "소재영업": "material-sales.csv",
  "소재판매품목": "material-sales-items.csv",
  "정산": "settlements.csv",
  "정산일정_차감목록": "settlement-schedules.csv",
  "출력": "output-tasks.csv",
  "기타": "other-tasks.csv",
  "계정": "accounts.csv",
  "첨부파일목록": "attachments.csv"
};

function downloadWorkNoteCsvZip(data: WorkNoteData) {
  const entries = createWorkNoteXlsxSheets(data).map((sheet, index) => ({
    path: CSV_EXPORT_FILE_NAMES[sheet.name] || `sheet-${index + 1}.csv`,
    data: createCsvText(sheet.rows)
  }));
  const blob = createZipBlob(entries);
  downloadBlob(blob, `work-note-csv-${getFilenameTimestamp()}.zip`, "application/zip");
}

function createCsvText(rows: XlsxCellValue[][]): string {
  const csv = rows
    .map((row) => row.map((value) => escapeCsv(cleanXlsxText(value))).join(","))
    .join("\r\n");
  return `\uFEFF${csv}`;
}
type XlsxCellValue = string | number | boolean | null | undefined;
type XlsxSheet = { name: string; rows: XlsxCellValue[][] };

function downloadWorkNoteXlsx(data: WorkNoteData) {
  const sheets = createWorkNoteXlsxSheets(data);
  const blob = createXlsxWorkbookBlob(sheets);
  downloadBlob(blob, `work-note-export-${getFilenameTimestamp()}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

function createWorkNoteXlsxSheets(data: WorkNoteData): XlsxSheet[] {
  const sheets: XlsxSheet[] = [];
  const addSheet = (name: string, rows: XlsxCellValue[][]) => {
    sheets.push({ name, rows: rows.length > 1 ? rows : [...rows, ["데이터 없음"]] });
  };

  addSheet("업체", [
    ["업체명", "사업자번호", "대표자", "업종/분류", "거래상태", "주소", "대표 연락처", "대표 이메일", "기본 담당자", "담당자 연락처", "담당자 이메일", "담당 영업", "기술 담당", "출력 담당", "기타 담당", "담당자 수", "첨부 수", "최종 수정", "메모"],
    ...asArray(data.companies).map((company) => {
      const contacts = asArray(company.contacts);
      const primary = contacts.find((contact) => Boolean(contact.isPrimary)) || contacts[0] || {};
      return [
        companyName(company),
        firstText(company, ["businessNumber"]),
        firstText(company, ["representative", "representativeName", "ceoName", "owner"]),
        firstText(company, ["businessType", "category"]),
        firstText(company, ["status", "tradeStatus"]),
        firstText(company, ["address"]),
        firstText(company, ["mainPhone", "phone", "contact"]),
        firstText(company, ["mainEmail", "email"]),
        firstText(primary, ["name", "contactName"]),
        firstText(primary, ["phone", "contactPhone", "mobile"]),
        firstText(primary, ["email", "contactEmail"]),
        internalOwnerLabelById(firstText(primary, ["salesOwnerId"]), data.internalContacts),
        internalOwnerLabelById(firstText(primary, ["technicalOwnerId"]), data.internalContacts),
        internalOwnerLabelById(firstText(primary, ["printOwnerId"]), data.internalContacts),
        internalOwnerLabelById(firstText(primary, ["otherOwnerId"]), data.internalContacts),
        contacts.length,
        asArray(company.attachments).length,
        formatDateTime(firstText(company, ["updatedAt"])),
        summarizeForCsv(firstText(company, ["memo", "note"]))
      ];
    })
  ]);

  addSheet("본사담당자", [
    ["이름", "직급", "부서", "휴대폰", "내선번호", "이메일", "담당 업무", "최종 수정", "메모"],
    ...asArray(data.internalContacts).map((contact) => [
      firstText(contact, ["name"]),
      firstText(contact, ["title"]),
      firstText(contact, ["department"]),
      firstText(contact, ["mobile", "phone"]),
      firstText(contact, ["extension"]),
      firstText(contact, ["email"]),
      asTextArray(contact.duties).join(", "),
      formatDateTime(firstText(contact, ["updatedAt"])),
      summarizeForCsv(firstText(contact, ["memo"]))
    ])
  ]);
  addSheet("장비영업", [
    ["업체명", "담당자", "연락처", "이메일", "진행상태", "구분", "중요도", "중요 업무", "관심 장비", "견적 여부", "구매 가능성", "예상매출", "예상매출 VAT", "매출", "매출 VAT", "매출 구분", "다음 연락", "미팅 일정", "최근 연락", "결제/증빙 방식", "처리 상태", "발행/결제 예정일", "첨부 수", "최종 수정", "다음 액션", "메모"],
    ...asArray(data.notes).map((note) => [
      salesCustomer(note),
      firstText(note, ["contactName", "managerName"]),
      firstText(note, ["contactPhone", "phone", "contact", "mobile"]),
      firstText(note, ["contactEmail", "email"]),
      salesStatus(note),
      salesCategory(note),
      salesPriority(note),
      note.isImportant ? "예" : "아니오",
      salesInterest(note),
      firstText(note, ["quoteStatus"]),
      firstText(note, ["purchasePossibility"]),
      amountForXlsx(firstText(note, ["expectedRevenueAmount"])),
      formatVatStatus(note.expectedRevenueVatIncluded),
      amountForXlsx(firstText(note, ["revenueAmount"])),
      formatVatStatus(note.revenueAmountVatIncluded),
      firstText(note, ["revenueType"]),
      formatNextContact(note),
      firstText(note, ["meetingDate"]),
      firstText(note, ["lastContactDate"]),
      billingMethodFor(note),
      firstText(note, ["taxInvoiceStatus", "invoiceStatus"]),
      firstText(note, ["taxInvoiceIssueDate", "invoiceIssueDate"]),
      asArray(note.attachments).length,
      formatDateTime(firstText(note, ["updatedAt"])),
      summarizeForCsv(firstText(note, ["nextAction"])),
      summarizeForCsv(firstText(note, ["memo", "description", "note"]))
    ])
  ]);

  addSheet("소재영업", [
    ["업체명", "문의일자", "담당자", "연락처", "이메일", "진행상태", "중요 업무", "견적 여부", "판매 품목 요약", "예상매출", "종합매출", "매출 구분", "결제/증빙 방식", "처리 상태", "발행/결제 예정일", "첨부 수", "최종 수정", "메모"],
    ...asArray(data.materialSalesNotes).map((record) => [
      salesCustomer(record),
      firstText(record, ["inquiryDate"]),
      firstText(record, ["contactName", "managerName"]),
      firstText(record, ["contactPhone", "phone", "contact", "mobile"]),
      firstText(record, ["contactEmail", "email"]),
      materialSalesStatus(record),
      record.isImportant ? "예" : "아니오",
      materialSalesQuoteStatus(record),
      materialSalesItemsSummary(record),
      amountForXlsx(firstText(record, ["expectedRevenueAmount"])),
      amountForXlsx(firstText(record, ["revenueAmount"])),
      firstText(record, ["revenueType"]),
      billingMethodFor(record),
      firstText(record, ["taxInvoiceStatus", "invoiceStatus"]),
      firstText(record, ["taxInvoiceIssueDate", "invoiceIssueDate"]),
      asArray(record.attachments).length,
      formatDateTime(firstText(record, ["updatedAt"])),
      summarizeForCsv(firstText(record, ["memo", "description", "note"]))
    ])
  ]);

  addSheet("소재판매품목", [
    ["업체명", "영업건 ID", "품목명", "가격", "수량", "품목별 메모"],
    ...asArray(data.materialSalesNotes).flatMap((record, recordIndex) =>
      asArray(record.items).map((item) => [
        salesCustomer(record),
        recordId(record, recordIndex),
        firstText(item, ["name", "itemName"]),
        amountForXlsx(firstText(item, ["price", "amount"])),
        amountForXlsx(firstText(item, ["quantity", "qty"])),
        summarizeForCsv(firstText(item, ["memo", "note"]))
      ])
    )
  ]);

  addSheet("정산", [
    ["업체명", "담당자", "연락처", "이메일", "결제 유형", "진행상태", "중요도", "중요 업무", "총 관리/선금", "금액 VAT", "입금/차감 완료", "완료액 VAT", "잔액", "현재 진행", "다음 처리일", "다음 처리", "결제/증빙 요약", "첨부 수", "최종 수정", "계획", "메모"],
    ...asArray(data.settlementTasks).map((record) => {
      const isAdvance = firstText(record, ["paymentType"]).includes("선금");
      return [
        workTitle(record, "settlement"),
        firstText(record, ["contactName", "requester", "assignee", "owner"]),
        firstText(record, ["contactPhone", "phone", "mobile"]),
        firstText(record, ["contactEmail", "email"]),
        firstText(record, ["paymentType"]),
        firstText(record, ["status", "progressStatus"]),
        firstText(record, ["priority", "importance"]),
        record.isImportant ? "예" : "아니오",
        amountForXlsx(firstText(record, ["totalAmount", "advanceAmount"])),
        formatVatStatus(isAdvance ? record.advanceAmountVatIncluded : record.totalAmountVatIncluded),
        amountForXlsx(firstText(record, [isAdvance ? "deductedAmount" : "receivedAmount"])),
        formatVatStatus(isAdvance ? record.deductedAmountVatIncluded : record.receivedAmountVatIncluded),
        amountForXlsx(settlementRemainingText(record)),
        firstText(record, ["installmentProgress"]),
        firstText(record, ["nextActionDate"]),
        firstText(record, ["nextAction"]),
        settlementTaxInvoiceSummary(record),
        asArray(record.attachments).length,
        formatDateTime(firstText(record, ["updatedAt"])),
        summarizeForCsv(firstText(record, ["plan"])),
        summarizeForCsv(firstText(record, ["memo", "description", "note"]))
      ];
    })
  ]);

  addSheet("정산일정_차감목록", [
    ["업체명", "정산 ID", "결제 유형", "구분", "번호", "일자", "금액", "VAT", "상태", "품목", "메모", "결제/증빙 방식", "처리 상태", "발행/결제 예정일", "실제 발행/결제일", "결제/증빙 메모"],
    ...asArray(data.settlementTasks).flatMap((record, recordIndex) => {
      const isAdvance = firstText(record, ["paymentType"]).includes("선금");
      return asArray(record.paymentSchedule).map((row) => [
        workTitle(record, "settlement"),
        recordId(record, recordIndex),
        firstText(record, ["paymentType"]),
        isAdvance ? "차감" : "회차",
        firstText(row, ["round"]),
        firstText(row, ["dueDate"]),
        amountForXlsx(firstText(row, ["amount"])),
        formatVatStatus(row.amountVatIncluded),
        firstText(row, ["status"]),
        firstText(row, ["item"]),
        firstText(row, ["memo", "description"]),
        billingMethodFor(row),
        firstText(row, ["taxInvoiceStatus"]),
        firstText(row, ["taxInvoicePlannedDate"]),
        firstText(row, ["taxInvoiceIssuedDate"]),
        firstText(row, ["taxInvoiceMemo"])
      ]);
    })
  ]);

  addSheet("출력", [
    ["업무 제목", "관련 업체", "요청자", "연락처", "이메일", "관련 영업", "진행상태", "중요도", "중요 업무", "기한 시작", "기한 종료", "출력 종류", "주말 포함", "결제/증빙 방식", "처리 상태", "발행/결제 예정일", "첨부 수", "최종 수정", "메모"],
    ...asArray(data.outputTasks).map((record) => {
      const linkedSales = getLinkedSalesForWork(record, data.notes, data.materialSalesNotes);
      return [
        workTitle(record, "output"),
        workCompanyDisplay(record, linkedSales),
        firstText(record, ["contactName", "requester", "assignee", "owner"]),
        firstText(record, ["contactPhone", "phone", "mobile"]),
        firstText(record, ["contactEmail", "email"]),
        linkedSales ? salesCustomer(linkedSales) : relatedSalesFallback(record),
        firstText(record, ["status", "progressStatus"]),
        firstText(record, ["priority", "importance"]),
        record.isImportant ? "예" : "아니오",
        firstText(record, ["startDate", "dueStartDate"]),
        firstText(record, ["endDate", "dueEndDate", "deadline", "dueDate"]),
        firstText(record, ["outputType", "category", "taskType"]),
        record.includeWeekends ? "포함" : "제외",
        billingMethodFor(record),
        firstText(record, ["taxInvoiceStatus", "invoiceStatus"]),
        firstText(record, ["taxInvoiceIssueDate", "invoiceIssueDate"]),
        asArray(record.attachments).length,
        formatDateTime(firstText(record, ["updatedAt"])),
        summarizeForCsv(firstText(record, ["memo", "description", "note"]))
      ];
    })
  ]);

  addSheet("기타", [
    ["업무명", "관련 업체", "담당/요청자", "연락처", "이메일", "분류", "진행상태", "중요도", "중요 업무", "기한 시작", "기한 종료", "주말 포함", "첨부 수", "최종 수정", "메모"],
    ...asArray(data.otherTasks).map((record) => [
      workTitle(record, "other"),
      workCompanyDisplay(record),
      firstText(record, ["contactName", "requester", "assignee", "owner"]),
      firstText(record, ["contactPhone", "phone", "mobile"]),
      firstText(record, ["contactEmail", "email"]),
      firstText(record, ["category", "taskType"]),
      firstText(record, ["status", "progressStatus"]),
      firstText(record, ["priority", "importance"]),
      record.isImportant ? "예" : "아니오",
      firstText(record, ["startDate", "dueStartDate"]),
      firstText(record, ["endDate", "dueEndDate", "deadline", "dueDate"]),
      record.includeWeekends ? "포함" : "제외",
      asArray(record.attachments).length,
      formatDateTime(firstText(record, ["updatedAt"])),
      summarizeForCsv(firstText(record, ["memo", "description", "note"]))
    ])
  ]);

  addSheet("계정", [
    ["홈페이지 이름", "홈페이지 링크", "아이디", "비밀번호", "계정 용도", "담당자/소유자", "생성일", "비밀번호 변경일", "최종 수정", "메모"],
    ...asArray(data.accounts).map((account) => [
      firstText(account, ["siteName", "homepageName", "name"]),
      firstText(account, ["siteUrl", "homepageUrl", "url"]),
      firstText(account, ["username", "accountId"]),
      firstText(account, ["password"]),
      firstText(account, ["purpose"]),
      firstText(account, ["owner"]),
      firstText(account, ["accountCreatedDate", "createdDate"]),
      firstText(account, ["passwordChangedDate"]),
      formatDateTime(firstText(account, ["updatedAt"])),
      summarizeForCsv(firstText(account, ["memo", "note"]))
    ])
  ]);

  addSheet("첨부파일목록", [
    ["구분", "대상", "파일명", "분류", "발송/등록일", "메모", "파일 크기", "업로드일"],
    ...getAttachmentOwnerGroups(data).flatMap((group) =>
      group.items.flatMap((owner) =>
        asArray(owner.attachments).map((attachment) => [
          attachmentOwnerLabel(group.type),
          attachmentOwnerTitle(group.type, owner),
          firstText(attachment, ["fileName", "name", "filename"]),
          firstText(attachment, ["category"]),
          firstText(attachment, ["sentDate"]),
          summarizeForCsv(firstText(attachment, ["memo"])),
          formatFileSize(Number(attachment.fileSize) || 0),
          formatDateTime(firstText(attachment, ["uploadedAt"]))
        ])
      )
    )
  ]);

  return sheets;
}

function amountForXlsx(value: string): string | number {
  const amount = parseAmountNumber(value);
  return amount === null ? clean(value) : amount;
}

function attachmentOwnerLabel(type: AttachmentOwnerType): string {
  if (type === "company") return "업체";
  if (type === "sales") return "장비영업";
  if (type === "materialSales") return "소재영업";
  if (type === "settlement") return "정산";
  if (type === "output") return "출력";
  return "기타";
}


function createXlsxWorkbookBlob(sheets: XlsxSheet[]): Blob {
  const usedNames: string[] = [];
  const safeSheets = sheets.map((sheet) => {
    const name = uniqueSheetName(sheet.name, usedNames);
    usedNames.push(name);
    return { ...sheet, name };
  });
  const entries: Array<{ path: string; data: Uint8Array | string }> = [
    { path: "[Content_Types].xml", data: createXlsxContentTypesXml(safeSheets.length) },
    { path: "_rels/.rels", data: createXlsxRootRelsXml() },
    { path: "xl/workbook.xml", data: createXlsxWorkbookXml(safeSheets) },
    { path: "xl/_rels/workbook.xml.rels", data: createXlsxWorkbookRelsXml(safeSheets.length) },
    { path: "xl/styles.xml", data: createXlsxStylesXml() },
    ...safeSheets.map((sheet, index) => ({ path: `xl/worksheets/sheet${index + 1}.xml`, data: createXlsxWorksheetXml(sheet.rows) }))
  ];
  return new Blob([createZipBlob(entries)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function uniqueSheetName(name: string, previousNames: string[]): string {
  const base = sanitizeXlsxSheetName(name) || "Sheet";
  const used = new Set(previousNames.map((item) => sanitizeXlsxSheetName(item).toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let index = 2; index < 100; index += 1) {
    const suffix = `_${index}`;
    const candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `${base.slice(0, 28)}_${Date.now().toString(36).slice(-2)}`;
}

function sanitizeXlsxSheetName(name: string): string {
  return clean(name).replace(/[\\/?*\[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31);
}

function createXlsxContentTypesXml(sheetCount: number): string {
  const sheets = Array.from({ length: sheetCount }, (_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets}</Types>`;
}

function createXlsxRootRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

function createXlsxWorkbookXml(sheets: Array<{ name: string }>): string {
  const sheetXml = sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetXml}</sheets></workbook>`;
}

function createXlsxWorkbookRelsXml(sheetCount: number): string {
  const sheetRels = Array.from({ length: sheetCount }, (_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels}<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function createXlsxStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.##"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F6FEB"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD7E0EC"/></left><right style="thin"><color rgb="FFD7E0EC"/></right><top style="thin"><color rgb="FFD7E0EC"/></top><bottom style="thin"><color rgb="FFD7E0EC"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

function createXlsxWorksheetXml(rows: XlsxCellValue[][]): string {
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const cols = Array.from({ length: columnCount }, (_, index) => `<col min="${index + 1}" max="${index + 1}" width="${xlsxColumnWidth(rows, index)}" customWidth="1"/>`).join("");
  const rowXml = rows.map((row, rowIndex) => {
    const cells = Array.from({ length: columnCount }, (_, columnIndex) => createXlsxCell(row[columnIndex], rowIndex, columnIndex)).join("");
    return `<row r="${rowIndex + 1}"${rowIndex === 0 ? ' ht="24" customHeight="1"' : ""}>${cells}</row>`;
  }).join("");
  const dimension = `A1:${xlsxColumnName(columnCount)}${Math.max(1, rows.length)}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="${dimension}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${rowXml}</sheetData><autoFilter ref="${dimension}"/></worksheet>`;
}

function createXlsxCell(value: XlsxCellValue, rowIndex: number, columnIndex: number): string {
  const ref = `${xlsxColumnName(columnIndex + 1)}${rowIndex + 1}`;
  const style = rowIndex === 0 ? 1 : typeof value === "number" ? 3 : 2;
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  }
  const text = cleanXlsxText(value);
  if (!text) return `<c r="${ref}" s="${style}"/>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
}

function xlsxColumnWidth(rows: XlsxCellValue[][], columnIndex: number): number {
  const longest = rows.reduce((max, row) => {
    const text = cleanXlsxText(row[columnIndex]);
    const firstLine = text.split(/\r?\n/, 1)[0] || "";
    const visualLength = Array.from(firstLine).reduce((length, char) => length + (char.charCodeAt(0) > 255 ? 1.7 : 1), 0);
    return Math.max(max, visualLength);
  }, 0);
  return Math.min(42, Math.max(10, Math.ceil(longest + 2)));
}

function xlsxColumnName(index: number): string {
  let name = "";
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name || "A";
}

function cleanXlsxText(value: XlsxCellValue): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function xmlEscape(value: string): string {
  return cleanXlsxText(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeCsv(value: string): string {
  const text = clean(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function summarizeForCsv(value: string): string {
  return clean(value).replace(/\s+/g, " ").slice(0, 500);
}

function summarizeForList(value: string, maxLength = 110): string {
  const text = clean(value).replace(/\s+/g, " ");
  return text.length > maxLength ? text.slice(0, maxLength) + "..." : text;
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
    internalContacts: backupState.internalContacts,
    notes: backupState.notes,
    materialSalesNotes: backupState.materialSalesNotes,
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

function getAttachmentOwnerGroups(data: Pick<WorkNoteData, "companies" | "notes" | "materialSalesNotes" | "settlementTasks" | "outputTasks" | "otherTasks">): Array<{ type: AttachmentOwnerType; items: AnyRecord[] }> {
  return [
    { type: "company", items: asArray(data.companies) },
    { type: "sales", items: asArray(data.notes) },
    { type: "materialSales", items: asArray(data.materialSalesNotes) },
    { type: "settlement", items: asArray(data.settlementTasks) },
    { type: "output", items: asArray(data.outputTasks) },
    { type: "other", items: asArray(data.otherTasks) }
  ];
}

function collectAttachmentIdsFromData(data: Pick<WorkNoteData, "companies" | "notes" | "materialSalesNotes" | "settlementTasks" | "outputTasks" | "otherTasks">): Set<string> {
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
  return migrateWorkNoteData({
    version: firstText(backupData, ["version"]) || "react-work-note-v1",
    updatedAt: firstText(backupData, ["updatedAt", "backupCreatedAt"]) || new Date().toISOString(),
    companies: asArray(backupData.companies),
    internalContacts: asArray(backupData.internalContacts),
    notes: asArray(backupData.notes),
    materialSalesNotes: asArray(backupData.materialSalesNotes),
    settlementTasks: asArray(backupData.settlementTasks),
    outputTasks: asArray(backupData.outputTasks),
    otherTasks: asArray(backupData.otherTasks),
    accounts: asArray(backupData.accounts),
    loadedAt: new Date().toISOString()
  });
}

function collectZipAttachmentRecords(
  backupData: Pick<WorkNoteData, "companies" | "notes" | "materialSalesNotes" | "settlementTasks" | "outputTasks" | "otherTasks">,
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
  targetData: Pick<WorkNoteData, "companies" | "notes" | "materialSalesNotes" | "settlementTasks" | "outputTasks" | "otherTasks">
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
    companies: [],
    internalContacts: mergeRecordList("internalContact", current.internalContacts, incoming.internalContacts),
    notes: [],
    materialSalesNotes: [],
    settlementTasks: [],
    outputTasks: [],
    otherTasks: [],
    accounts: [],
    loadedAt: new Date().toISOString()
  };

  const internalContactIdMap = createIdMap(current.internalContacts, incoming.internalContacts, next.internalContacts, "internalContact");
  remapInternalContactLinks(incoming.companies, internalContactIdMap);
  next.companies = mergeRecordList("company", current.companies, incoming.companies);
  const companyIdMap = createIdMap(current.companies, incoming.companies, next.companies, "company");
  remapCompanyLinks(incoming.notes, companyIdMap);
  remapCompanyLinks(incoming.materialSalesNotes, companyIdMap);
  remapCompanyLinks(incoming.settlementTasks, companyIdMap);
  remapCompanyLinks(incoming.outputTasks, companyIdMap);
  remapCompanyLinks(incoming.otherTasks, companyIdMap);

  next.notes = mergeRecordList("sales", current.notes, incoming.notes);
  next.materialSalesNotes = mergeRecordList("materialSales", current.materialSalesNotes, incoming.materialSalesNotes);
  const salesIdMap = createIdMap(current.notes, incoming.notes, next.notes, "sales");
  const materialSalesIdMap = createIdMap(current.materialSalesNotes, incoming.materialSalesNotes, next.materialSalesNotes, "materialSales");
  remapSalesLinks(incoming.settlementTasks, salesIdMap, materialSalesIdMap);
  remapSalesLinks(incoming.outputTasks, salesIdMap, materialSalesIdMap);

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

function remapInternalContactLinks(companies: AnyRecord[], internalContactIdMap: Map<string, string>) {
  const keys = ["salesOwnerId", "technicalOwnerId", "printOwnerId", "otherOwnerId"];
  companies.forEach((company) => {
    company.contacts = asArray(company.contacts).map((contact) => {
      const next = { ...contact };
      keys.forEach((key) => {
        const id = firstText(next, [key]);
        if (id && internalContactIdMap.has(id)) next[key] = internalContactIdMap.get(id);
      });
      return next;
    });
  });
}
function remapCompanyLinks(records: AnyRecord[], companyIdMap: Map<string, string>) {
  records.forEach((record) => {
    const companyId = firstText(record, ["companyId"]);
    if (companyId && companyIdMap.has(companyId)) record.companyId = companyIdMap.get(companyId);
  });
}

function remapSalesLinks(records: AnyRecord[], salesIdMap: Map<string, string>, materialSalesIdMap: Map<string, string>) {
  records.forEach((record) => {
    const salesNoteId = firstText(record, ["salesNoteId"]);
    if (!salesNoteId) return;
    const preferredMap = firstText(record, ["salesNoteType"]) === "material" ? materialSalesIdMap : salesIdMap;
    const fallbackMap = preferredMap === salesIdMap ? materialSalesIdMap : salesIdMap;
    if (preferredMap.has(salesNoteId)) record.salesNoteId = preferredMap.get(salesNoteId);
    else if (fallbackMap.has(salesNoteId)) record.salesNoteId = fallbackMap.get(salesNoteId);
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
  if (type === "internalContact") return normalizeMergeText([firstText(item, ["name"]), firstText(item, ["department"]), firstText(item, ["mobile", "phone"]), firstText(item, ["email"])].join("|"));
  if (type === "company") return normalizeMergeText(companyName(item));
  if (type === "account") {
    return normalizeMergeText([firstText(item, ["siteUrl", "url"]), firstText(item, ["siteName", "name"]), firstText(item, ["username", "id"])].join("|"));
  }
  if (type === "sales") {
    return normalizeMergeText([firstText(item, ["companyId"]), salesCustomer(item), firstText(item, ["contactName"]), salesInterest(item)].join("|"));
  }
  if (type === "materialSales") {
    return normalizeMergeText([firstText(item, ["companyId"]), salesCustomer(item), firstText(item, ["contactName"]), materialSalesItemsSummary(item)].join("|"));
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
    billingMethod: "세금계산서",
    taxInvoiceIssueDate: "",
    taxInvoiceStatus: "",
    taxInvoiceCancelReason: "",
    taxInvoiceReissueDate: "",
    attachments: [],
    isImportant: false
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
    revenueType: firstText(draft, ["revenueType"]),
    isImportant: Boolean(draft.isImportant)
  };
}

function createBlankMaterialSalesItem(): AnyRecord {
  return {
    id: createId("item_"),
    name: "",
    price: "",
    quantity: "1",
    memo: ""
  };
}

function createBlankMaterialSalesNote(): AnyRecord {
  return {
    id: "",
    companyId: "",
    contactId: "",
    companyUnknown: false,
    company: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    inquiryDate: "",
    items: [createBlankMaterialSalesItem()],
    status: MATERIAL_SALES_STATUS_OPTIONS[0],
    quoteStatus: MATERIAL_QUOTE_STATUS_OPTIONS[0],
    expectedRevenueAmount: "",
    revenueAmount: "",
    revenueType: MATERIAL_REVENUE_TYPE_OPTIONS[0],
    memo: "",
    billingMethod: "세금계산서",
    taxInvoiceIssueDate: "",
    taxInvoiceStatus: "",
    taxInvoiceCancelReason: "",
    taxInvoiceReissueDate: "",
    attachments: [],
    isImportant: false
  };
}

function prepareMaterialSalesDraft(record: AnyRecord, index: number): AnyRecord {
  return {
    ...createBlankMaterialSalesNote(),
    ...record,
    id: recordId(record, index),
    company: salesCustomer(record) === "고객 미정" ? "" : salesCustomer(record),
    contactName: firstText(record, ["contactName", "managerName"]),
    contactPhone: firstText(record, ["contactPhone", "phone", "contact", "mobile"]),
    contactEmail: firstText(record, ["contactEmail", "email"]),
    inquiryDate: firstText(record, ["inquiryDate"]),
    items: normalizeMaterialSalesItems(asArray(record.items)),
    status: materialSalesStatus(record),
    quoteStatus: materialSalesQuoteStatus(record),
    expectedRevenueAmount: firstText(record, ["expectedRevenueAmount"]),
    revenueAmount: firstText(record, ["revenueAmount"]),
    revenueType: firstText(record, ["revenueType"]) || MATERIAL_REVENUE_TYPE_OPTIONS[0],
    memo: rawText(record, ["memo", "description", "note"]),
    attachments: asArray(record.attachments)
  };
}

function normalizeMaterialSalesDraft(draft: AnyRecord, companies: AnyRecord[]): AnyRecord {
  const company = firstText(draft, ["companyId"])
    ? companies.find((item, index) => recordId(item, index) === firstText(draft, ["companyId"]))
    : null;
  const contact = company && firstText(draft, ["contactId"])
    ? asArray(company.contacts).find((item, index) => recordId(item, index) === firstText(draft, ["contactId"]))
    : null;
  const companyUnknown = Boolean(draft.companyUnknown);

  return {
    id: firstText(draft, ["id"]) || createId("material_sales_"),
    companyId: companyUnknown ? "" : firstText(draft, ["companyId"]),
    contactId: companyUnknown ? "" : firstText(draft, ["contactId"]),
    companyUnknown,
    company: companyUnknown ? "" : (company ? companyName(company) : firstText(draft, ["company"])),
    contactName: companyUnknown ? "" : (contact ? firstText(contact, ["name", "contactName"]) : firstText(draft, ["contactName"])),
    contactPhone: companyUnknown ? "" : (contact ? firstText(contact, ["phone", "contactPhone"]) : firstText(draft, ["contactPhone"])),
    contactEmail: companyUnknown ? "" : (contact ? firstText(contact, ["email", "contactEmail"]) : firstText(draft, ["contactEmail"])),
    inquiryDate: firstText(draft, ["inquiryDate"]),
    items: normalizeMaterialSalesItems(asArray(draft.items)),
    status: MATERIAL_SALES_STATUS_OPTIONS.includes(firstText(draft, ["status"])) ? firstText(draft, ["status"]) : MATERIAL_SALES_STATUS_OPTIONS[0],
    quoteStatus: MATERIAL_QUOTE_STATUS_OPTIONS.includes(firstText(draft, ["quoteStatus"])) ? firstText(draft, ["quoteStatus"]) : MATERIAL_QUOTE_STATUS_OPTIONS[0],
    expectedRevenueAmount: normalizeAmountString(firstText(draft, ["expectedRevenueAmount"])),
    revenueAmount: normalizeAmountString(firstText(draft, ["revenueAmount"])),
    revenueType: MATERIAL_REVENUE_TYPE_OPTIONS.includes(firstText(draft, ["revenueType"])) ? firstText(draft, ["revenueType"]) : MATERIAL_REVENUE_TYPE_OPTIONS[0],
    memo: rawText(draft, ["memo"]),
    attachments: asArray(draft.attachments),
    isImportant: Boolean(draft.isImportant)
  };
}

function normalizeMaterialSalesItems(items: AnyRecord[]): AnyRecord[] {
  const normalized = asArray(items)
    .map((item) => ({
      id: firstText(item, ["id"]) || createId("item_"),
      name: firstText(item, ["name", "itemName"]),
      price: normalizeAmountString(firstText(item, ["price", "amount"])),
      quantity: firstText(item, ["quantity", "qty"]) || "1",
      memo: rawText(item, ["memo", "note"])
    }))
    .filter((item) => firstText(item, ["name"]) || firstText(item, ["price"]) || firstText(item, ["memo"]));
  return normalized.length ? normalized : [createBlankMaterialSalesItem()];
}

function calculateMaterialSalesTotal(items: AnyRecord[]): number {
  return asArray(items).reduce((sum, item) => {
    const price = parseAmountNumber(firstText(item, ["price"]));
    const quantity = parseAmountNumber(firstText(item, ["quantity"])) ?? 1;
    return sum + (price ?? 0) * quantity;
  }, 0);
}

function materialSalesItemsSummary(record: AnyRecord): string {
  return asArray(record.items)
    .map((item) => {
      const name = firstText(item, ["name"]);
      const quantity = firstText(item, ["quantity"]);
      const price = formatMoney(firstText(item, ["price"]));
      return [name, quantity ? `${quantity}개` : "", price].filter(Boolean).join(" · ");
    })
    .filter(Boolean)
    .join(" / ");
}

function materialSalesStatus(record: AnyRecord): string {
  const status = firstText(record, ["status", "progressStatus"]);
  return MATERIAL_SALES_STATUS_OPTIONS.includes(status) ? status : MATERIAL_SALES_STATUS_OPTIONS[0];
}

function materialSalesQuoteStatus(record: AnyRecord): string {
  const status = firstText(record, ["quoteStatus"]);
  return MATERIAL_QUOTE_STATUS_OPTIONS.includes(status) ? status : MATERIAL_QUOTE_STATUS_OPTIONS[0];
}

function getMaterialSalesMode(record: AnyRecord): ListMode {
  return materialSalesStatus(record) === "입금 확인 완료" ? "closed" : "active";
}

function matchesMaterialSalesMode(record: AnyRecord, mode: ListMode): boolean {
  if (mode === "all") return true;
  if (mode === "hold" || mode === "failed") return false;
  return getMaterialSalesMode(record) === mode;
}

function getMaterialSalesModeCounts(records: AnyRecord[]): Record<ListMode, number> {
  return records.reduce<Record<ListMode, number>>(
    (counts, record) => {
      counts.all += 1;
      counts[getMaterialSalesMode(record)] += 1;
      return counts;
    },
    { all: 0, active: 0, hold: 0, closed: 0, failed: 0 }
  );
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

function createBlankInternalContact(): AnyRecord {
  return {
    id: "",
    name: "",
    title: "",
    department: "",
    mobile: "",
    extension: "",
    email: "",
    duties: [],
    memo: ""
  };
}

function prepareInternalContactDraft(contact: AnyRecord, index: number): AnyRecord {
  return {
    ...createBlankInternalContact(),
    ...contact,
    id: recordId(contact, index),
    name: firstText(contact, ["name"]),
    title: firstText(contact, ["title"]),
    department: firstText(contact, ["department"]),
    mobile: firstText(contact, ["mobile", "phone"]),
    extension: firstText(contact, ["extension"]),
    email: firstText(contact, ["email"]),
    duties: asTextArray(contact.duties),
    memo: firstText(contact, ["memo"])
  };
}

function normalizeInternalContactDraft(draft: AnyRecord): AnyRecord {
  return {
    id: firstText(draft, ["id"]) || createId("internal_contact_"),
    name: firstText(draft, ["name"]),
    title: firstText(draft, ["title"]),
    department: firstText(draft, ["department"]),
    mobile: firstText(draft, ["mobile", "phone"]),
    extension: firstText(draft, ["extension"]),
    email: firstText(draft, ["email"]),
    duties: [...new Set(asTextArray(draft.duties))],
    memo: firstText(draft, ["memo"])
  };
}

function internalContactLabel(contact: AnyRecord): string {
  return joinParts([firstText(contact, ["name"]), firstText(contact, ["title"])], " ");
}

function countInternalContactLinks(companies: AnyRecord[], internalContactId: string): number {
  return companies.reduce((count, company) => count + asArray(company.contacts).reduce((contactCount, contact) => (
    contactCount + CUSTOMER_OWNER_FIELDS.filter((field) => firstText(contact, [field.key]) === internalContactId).length
  ), 0), 0);
}

function clearInternalContactLinks(companies: AnyRecord[], internalContactId: string): AnyRecord[] {
  return companies.map((company) => ({
    ...company,
    contacts: asArray(company.contacts).map((contact) => {
      const next = { ...contact };
      CUSTOMER_OWNER_FIELDS.forEach((field) => {
        if (firstText(next, [field.key]) === internalContactId) next[field.key] = "";
      });
      return next;
    })
  }));
}

function internalOwnerLabelById(id: string, internalContacts: AnyRecord[]): string {
  if (!id) return "";
  const contact = internalContacts.find((item, index) => recordId(item, index) === id);
  return contact ? joinParts([firstText(contact, ["department"]), internalContactLabel(contact)], " · ") : "";
}
function internalOwnerInlineSummary(contact: AnyRecord, internalContacts: AnyRecord[]): string {
  return CUSTOMER_OWNER_FIELDS.map((field) => {
    const id = firstText(contact, [field.key]);
    const owner = internalContacts.find((item, index) => recordId(item, index) === id);
    return owner ? `${field.shortLabel} ${internalContactLabel(owner)}` : "";
  }).filter(Boolean).join(", ");
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
      salesOwnerId: firstText(contact, ["salesOwnerId"]),
      technicalOwnerId: firstText(contact, ["technicalOwnerId"]),
      printOwnerId: firstText(contact, ["printOwnerId"]),
      otherOwnerId: firstText(contact, ["otherOwnerId"]),
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
      salesOwnerId: firstText(contact, ["salesOwnerId"]),
      technicalOwnerId: firstText(contact, ["technicalOwnerId"]),
      printOwnerId: firstText(contact, ["printOwnerId"]),
      otherOwnerId: firstText(contact, ["otherOwnerId"]),
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
    billingMethod: "세금계산서",
    taxInvoiceIssueDate: "",
    taxInvoiceStatus: "",
    taxInvoiceCancelReason: "",
    taxInvoiceReissueDate: "",
    attachments: [],
    isImportant: false
  };
  if (type === "settlement") {
    return {
      ...common,
      status: "예정",
      salesNoteId: "",
      salesNoteType: "",
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
      title: "",
      salesNoteId: "",
      salesNoteType: "",
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
    title: type === "settlement" ? firstText(record, ["title"]) : firstText(record, ["title"]) || deriveWorkTaskTitle(record, type),
    billingMethod: billingMethodFor(record),
    taxInvoiceIssueDate: firstText(record, ["taxInvoiceIssueDate", "invoiceIssueDate"]),
    taxInvoiceStatus: firstText(record, ["taxInvoiceStatus", "invoiceStatus"]),
    taxInvoiceCancelReason: firstText(record, ["taxInvoiceCancelReason", "invoiceCancelReason"]),
    taxInvoiceReissueDate: firstText(record, ["taxInvoiceReissueDate", "invoiceReissueDate"]),
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
    memo: firstText(draft, ["memo"]),
    isImportant: Boolean(draft.isImportant),
    ...normalizeTaxInvoiceDraft(draft)
  };

  if (type === "settlement") {
    const paymentType = SETTLEMENT_PAYMENT_OPTIONS.includes(firstText(draft, ["paymentType"])) ? firstText(draft, ["paymentType"]) : "분할 결제";
    const isAdvance = paymentType.includes("선금");
    const paymentSchedule = normalizePaymentSchedule(asArray(draft.paymentSchedule));
    const advanceDeductedAmount = paymentSchedule.reduce((sum, row) => sum + (parseAmountNumber(firstText(row, ["amount"])) || 0), 0);
    return {
      ...common,
      salesNoteId: Boolean(draft.salesLinkUnknown) ? "" : firstText(draft, ["salesNoteId"]),
      salesNoteType: Boolean(draft.salesLinkUnknown) ? "" : firstText(draft, ["salesNoteType"]),
      salesLinkUnknown: Boolean(draft.salesLinkUnknown),
      paymentType,
      status: SETTLEMENT_STATUS_OPTIONS.includes(firstText(draft, ["status"])) ? firstText(draft, ["status"]) : "예정",
      totalAmount: isAdvance ? "" : normalizeAmountString(firstText(draft, ["totalAmount", "advanceAmount"])),
      totalAmountVatIncluded: Boolean(draft.totalAmountVatIncluded),
      advanceAmount: isAdvance ? normalizeAmountString(firstText(draft, ["advanceAmount", "totalAmount"])) : "",
      advanceAmountVatIncluded: Boolean(draft.advanceAmountVatIncluded),
      receivedAmount: isAdvance ? "" : normalizeAmountString(firstText(draft, ["receivedAmount"])),
      receivedAmountVatIncluded: Boolean(draft.receivedAmountVatIncluded),
      deductedAmount: isAdvance ? normalizeAmountString(String(advanceDeductedAmount)) : normalizeAmountString(firstText(draft, ["deductedAmount"])),
      deductedAmountVatIncluded: isAdvance ? false : Boolean(draft.deductedAmountVatIncluded),
      installmentProgress: isAdvance ? (paymentSchedule.filter((row) => !row.isTaxInvoiceOnly).length ? paymentSchedule.filter((row) => !row.isTaxInvoiceOnly).length + "건" : "") : firstText(draft, ["installmentProgress"]),
      nextActionDate: isAdvance ? "" : firstText(draft, ["nextActionDate"]),
      nextAction: isAdvance ? "" : firstText(draft, ["nextAction"]),
      paymentSchedule: isAdvance ? paymentSchedule.map((row) => ({ ...row, status: "차감 완료" })) : paymentSchedule,
      plan: firstText(draft, ["plan"])
    };
  }

  if (type === "output") {
    return {
      ...common,
      salesNoteId: Boolean(draft.salesLinkUnknown) ? "" : firstText(draft, ["salesNoteId"]),
      salesNoteType: Boolean(draft.salesLinkUnknown) ? "" : firstText(draft, ["salesNoteType"]),
      salesLinkUnknown: Boolean(draft.salesLinkUnknown),
      title: firstText(draft, ["title"]),
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

function billingMethodFor(record: AnyRecord): string {
  const method = firstText(record, ["billingMethod", "invoiceMethod"]);
  return BILLING_METHOD_OPTIONS.includes(method) ? method : "세금계산서";
}

function billingStatusOptions(method: string): string[] {
  if (method === "카드결제") return CARD_PAYMENT_STATUS_OPTIONS;
  if (method === "불필요") return [];
  return TAX_INVOICE_STATUS_OPTIONS;
}

function normalizeTaxInvoiceDraft(draft: AnyRecord): AnyRecord {
  const billingMethod = billingMethodFor(draft);
  const status = firstText(draft, ["taxInvoiceStatus", "invoiceStatus"]);
  const normalizedStatus = billingStatusOptions(billingMethod).includes(status)
    ? status
    : billingMethod === "카드결제"
      ? "발행 예정"
      : "";
  const disabled = billingMethod === "불필요";
  return {
    billingMethod,
    taxInvoiceIssueDate: disabled ? "" : firstText(draft, ["taxInvoiceIssueDate", "invoiceIssueDate"]),
    taxInvoiceStatus: disabled ? "" : normalizedStatus,
    taxInvoiceCancelReason: !disabled && billingMethod === "세금계산서" && (normalizedStatus === "발행 취소" || normalizedStatus === "재발행 완료") ? firstText(draft, ["taxInvoiceCancelReason", "invoiceCancelReason"]) : "",
    taxInvoiceReissueDate: !disabled && billingMethod === "세금계산서" && normalizedStatus === "재발행 완료" ? firstText(draft, ["taxInvoiceReissueDate", "invoiceReissueDate"]) : ""
  };
}
function normalizePaymentSchedule(rows: AnyRecord[]): AnyRecord[] {
  return rows
    .map((row, index) => {
      const billingMethod = billingMethodFor(row);
      const taxInvoiceStatus = firstText(row, ["taxInvoiceStatus", "invoiceStatus"]);
      const disabled = billingMethod === "불필요";
      const normalizedStatus = billingStatusOptions(billingMethod).includes(taxInvoiceStatus)
        ? taxInvoiceStatus
        : billingMethod === "카드결제"
          ? "발행 예정"
          : "";
      return {
        id: firstText(row, ["id"]) || createId("pay_"),
        round: firstText(row, ["round"]) || (row.isTaxInvoiceOnly ? "" : String(index + 1)),
        dueDate: parseDateKey(firstText(row, ["dueDate"])) || firstText(row, ["dueDate"]),
        amount: normalizeAmountString(firstText(row, ["amount"])),
        amountVatIncluded: Boolean(row.amountVatIncluded),
        status: firstText(row, ["status"]) || "예정",
        item: firstText(row, ["item"]),
        memo: firstText(row, ["memo", "description"]),
        isTaxInvoiceOnly: Boolean(row.isTaxInvoiceOnly),
        billingMethod,
        taxInvoiceStatus: disabled ? "" : normalizedStatus,
        taxInvoicePlannedDate: disabled ? "" : (parseDateKey(firstText(row, ["taxInvoicePlannedDate", "invoicePlannedDate"])) || firstText(row, ["taxInvoicePlannedDate", "invoicePlannedDate"])),
        taxInvoiceIssuedDate: disabled ? "" : (parseDateKey(firstText(row, ["taxInvoiceIssuedDate", "invoiceIssuedDate"])) || firstText(row, ["taxInvoiceIssuedDate", "invoiceIssuedDate"])),
        taxInvoiceMemo: disabled ? "" : firstText(row, ["taxInvoiceMemo", "invoiceMemo"])
      };
    })
    .filter((row) => row.isTaxInvoiceOnly || ["dueDate", "amount", "status", "item", "memo", "billingMethod", "taxInvoiceStatus", "taxInvoicePlannedDate", "taxInvoiceIssuedDate", "taxInvoiceMemo"].some((key) => firstText(row, [key])));
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
  const normalized = normalizePaymentSchedule(rows).filter((row) => !row.isTaxInvoiceOnly);
  const totalAmount = normalized.reduce((sum, row) => sum + (parseAmountNumber(firstText(row, ["amount"])) || 0), 0);
  const completedRows = isAdvance ? normalized : normalized.filter((row) => isSettlementScheduleRowCompleted(row, false));
  const completedAmount = completedRows.reduce((sum, row) => sum + (parseAmountNumber(firstText(row, ["amount"])) || 0), 0);
  const nextRow = isAdvance
    ? null
    : normalized
      .filter((row) => !isSettlementScheduleRowCompleted(row, false))
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
  if (isAdvance) return true;
  const status = firstText(row, ["status"]);
  if (!status || status.includes("청구")) return false;
  return /입금|처리|결제|완료/.test(status);
}

function isWorkDraftValid(record: AnyRecord, type: "settlement" | "output" | "other"): boolean {
  if (type === "settlement") {
    return Boolean(companyName(record) || record.companyUnknown || firstText(record, ["paymentType", "totalAmount", "advanceAmount", "nextAction", "memo"]));
  }
  if (type === "output" || type === "other") {
    return Boolean(firstText(record, ["title"]));
  }
  return false;
}

function countLinkedCompanyRecords(data: WorkNoteData, companyId: string): number {
  return [data.notes, data.materialSalesNotes, data.settlementTasks, data.outputTasks, data.otherTasks]
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

function collectCompanyHistoryItems(data: WorkNoteData, company: AnyRecord, companyIndex: number): CompanyHistoryItem[] {
  const companyId = recordId(company, companyIndex);
  const items: CompanyHistoryItem[] = [];
  const add = (
    kind: string,
    tone: CompanyHistoryItem["tone"],
    type: string,
    records: AnyRecord[],
    title: (record: AnyRecord) => string,
    detail: (record: AnyRecord) => string,
    status: (record: AnyRecord) => string
  ) => {
    records.forEach((record, index) => {
      if (!isRecordLinkedToCompany(record, company, companyId, kind === "장비" || kind === "소재")) return;
      const date = firstText(record, ["updatedAt", "createdAt"]);
      items.push({
        id: `${type}-${recordId(record, index)}`,
        kind,
        tone,
        title: title(record) || `${kind} 업무`,
        detail: joinParts([status(record), detail(record)], " · ") || "상세 정보 없음",
        date,
      });
    });
  };

  add("장비", "blue", "sales", data.notes, (record) => salesInterest(record) || firstText(record, ["nextAction"]) || "장비 영업건", (record) => joinParts([firstText(record, ["quoteStatus"]), firstText(record, ["purchasePossibility"]), formatMoneyWithVat(firstText(record, ["expectedRevenueAmount"]), record.expectedRevenueVatIncluded)], " / "), salesStatus);
  add("소재", "green", "material", data.materialSalesNotes, (record) => materialSalesItemsSummary(record) || firstText(record, ["revenueType"]) || "소재 영업건", (record) => joinParts([materialSalesQuoteStatus(record), formatMoney(firstText(record, ["revenueAmount", "expectedRevenueAmount"]))], " / "), materialSalesStatus);
  add("정산", "orange", "settlement", data.settlementTasks, (record) => workTitle(record, "settlement"), (record) => joinParts([firstText(record, ["paymentType"]), settlementRemainingText(record)], " / "), (record) => firstText(record, ["status", "progressStatus"]));
  add("출력", "blue", "output", data.outputTasks, (record) => workTitle(record, "output"), (record) => joinParts([firstText(record, ["outputType"]), deadlineText(record)], " · "), (record) => firstText(record, ["status", "progressStatus"]));
  add("기타", "neutral", "other", data.otherTasks, (record) => workTitle(record, "other"), deadlineText, (record) => firstText(record, ["status", "progressStatus"]));

  return items.sort((a, b) => compareDate(a.date, b.date) * -1 || a.kind.localeCompare(b.kind, "ko"));
}

function isRecordLinkedToCompany(record: AnyRecord, company: AnyRecord, companyId: string, salesLike = false): boolean {
  const linkedId = firstText(record, ["companyId", "relatedCompanyId", "salesCompanyId"]);
  if (linkedId && linkedId === companyId) return true;
  const targetName = normalizeMergeText(companyName(company));
  if (!targetName) return false;
  const recordName = normalizeMergeText(salesLike ? salesCustomer(record) : companyName(record));
  return Boolean(recordName && recordName !== normalizeMergeText("고객 미정") && recordName === targetName);
}
function isUnifiedTaskCompleted(record: AnyRecord, collectionKey: TaskCollectionKey): boolean {
  const status = firstText(record, ["status", "progressStatus"]);
  if (collectionKey === "materialSalesNotes") return status === "입금 확인 완료";
  return status === "완료";
}

function unifiedTaskStatusGroup(status: string, completed: boolean): TaskStatusGroup {
  if (completed) return "completed";
  if (status.includes("보류")) return "hold";
  if (!status || /신규|예정|대기|문의/.test(status)) return "pending";
  return "active";
}

function completedStatusForCollection(collectionKey: TaskCollectionKey): string {
  return collectionKey === "materialSalesNotes" ? "입금 확인 완료" : "완료";
}

function defaultActiveStatusForCollection(collectionKey: TaskCollectionKey): string {
  if (collectionKey === "notes" || collectionKey === "materialSalesNotes") return "검토 중";
  if (collectionKey === "settlementTasks") return "예정";
  return "진행 중";
}

function setRecordCompleted(record: AnyRecord, collectionKey: TaskCollectionKey, completed: boolean): AnyRecord {
  const currentStatus = firstText(record, ["status", "progressStatus"]);
  if (completed) {
    return {
      ...record,
      schedulePreviousStatus: isUnifiedTaskCompleted(record, collectionKey) ? firstText(record, ["schedulePreviousStatus"]) : currentStatus,
      status: completedStatusForCollection(collectionKey),
      updatedAt: new Date().toISOString()
    };
  }
  const previousStatus = firstText(record, ["schedulePreviousStatus"]);
  return {
    ...record,
    schedulePreviousStatus: "",
    status: previousStatus && previousStatus !== completedStatusForCollection(collectionKey)
      ? previousStatus
      : defaultActiveStatusForCollection(collectionKey),
    updatedAt: new Date().toISOString()
  };
}

function safeRecordSearchText(record: AnyRecord): string {
  try {
    return JSON.stringify(record);
  } catch {
    return Object.values(record).filter((value) => typeof value === "string" || typeof value === "number").join(" ");
  }
}
function collectUnifiedWorkItems(data: WorkNoteData, scheduleItems: ScheduleItem[]): UnifiedWorkItem[] {
  const today = toDateKey(new Date());
  const { start: weekStart, end: weekEnd } = getCurrentWeekRange(new Date());
  const scheduleDates = new Map<string, string[]>();

  scheduleItems.forEach((item) => {
    const key = `${item.collectionKey}:${item.sourceId}`;
    const dates = scheduleDates.get(key) || [];
    if (!dates.includes(item.date)) dates.push(item.date);
    scheduleDates.set(key, dates);
  });

  const createItem = (
    record: AnyRecord,
    index: number,
    collectionKey: TaskCollectionKey,
    portal: UnifiedWorkItem["portal"],
    badge: UnifiedWorkItem["badge"],
    subtype: string,
    title: string,
    status: string,
    schedule: string,
    memo: string,
    salesKind?: UnifiedWorkItem["salesKind"]
  ): UnifiedWorkItem => {
    const sourceId = recordId(record, index);
    const key = `${collectionKey}:${sourceId}`;
    const dates = [...(scheduleDates.get(key) || [])];
    if (collectionKey !== "settlementTasks") {
      const billingDate = parseDateKey(firstText(record, ["taxInvoiceIssueDate", "invoiceIssueDate"]));
      if (firstText(record, ["taxInvoiceStatus", "invoiceStatus"]) === "발행 예정" && billingDate) {
        dates.push(billingDate);
      }
    }
    if (collectionKey === "settlementTasks") {
      normalizePaymentSchedule(asArray(record.paymentSchedule)).forEach((row) => {
        dates.push(parseDateKey(firstText(row, ["dueDate"])));
        if (firstText(row, ["taxInvoiceStatus"]) === "발행 예정") {
          dates.push(parseDateKey(firstText(row, ["taxInvoicePlannedDate"])));
        }
      });
    }
    const normalizedDates = [...new Set(dates.map(parseDateKey).filter(Boolean))].sort();
    const startDate = parseDateKey(firstText(record, ["startDate", "dueStartDate"]));
    const endDate = parseDateKey(firstText(record, ["endDate", "dueEndDate", "deadline", "dueDate"])) || startDate;
    const hasRange = (collectionKey === "outputTasks" || collectionKey === "otherTasks") && Boolean(startDate && endDate);
    const isToday = normalizedDates.includes(today) || Boolean(hasRange && startDate <= today && today <= endDate);
    const isThisWeek = normalizedDates.some((date) => weekStart <= date && date <= weekEnd)
      || Boolean(hasRange && startDate <= weekEnd && endDate >= weekStart);
    const isCompleted = isUnifiedTaskCompleted(record, collectionKey);

    return {
      id: key,
      sourceId,
      collectionKey,
      portal,
      salesKind,
      badge,
      subtype,
      title,
      contact: collectionKey === "outputTasks" || collectionKey === "otherTasks"
        ? joinParts([workCompanyDisplay(record), contactBundle(record)], " · ")
        : contactBundle(record),
      assignee: firstText(record, ["contactName", "managerName", "requester", "requesterName", "owner", "assignee"]),
      searchText: [title, subtype, status, schedule, memo, contactBundle(record), safeRecordSearchText(record)].filter(Boolean).join(" "),
      hasAttachments: asArray(record.attachments).length > 0,
      status,
      statusGroup: unifiedTaskStatusGroup(status, isCompleted),
      schedule,
      scheduleDates: normalizedDates,
      primaryDate: normalizedDates[0] || startDate || endDate,
      startDate,
      endDate,
      memo,
      createdAt: firstText(record, ["createdAt", "registeredAt", "inquiryDate", "updatedAt", "modifiedAt"]),
      updatedAt: firstText(record, ["updatedAt", "modifiedAt", "createdAt"]),
      isImportant: Boolean(record.isImportant),
      isCompleted,
      isToday,
      isThisWeek
    };
  };

  return [
    ...asArray(data.notes).map((record, index) =>
      createItem(
        record,
        index,
        "notes",
        "sales",
        "영업",
        "장비 영업",
        salesCustomer(record),
        salesStatus(record),
        equipmentSalesScheduleText(record),
        firstText(record, ["memo"]),
        "equipment"
      )
    ),
    ...asArray(data.materialSalesNotes).map((record, index) =>
      createItem(
        record,
        index,
        "materialSalesNotes",
        "sales",
        "영업",
        "소재/소모품",
        salesCustomer(record),
        materialSalesStatus(record),
        materialSalesScheduleText(record),
        firstText(record, ["memo"]),
        "material"
      )
    ),
    ...asArray(data.settlementTasks).map((record, index) =>
      createItem(
        record,
        index,
        "settlementTasks",
        "settlement",
        "정산",
        firstText(record, ["paymentType"]) || "정산",
        workTitle(record, "settlement"),
        firstText(record, ["status", "progressStatus"]),
        settlementUnifiedScheduleText(record, scheduleDates.get(`settlementTasks:${recordId(record, index)}`) || []),
        firstText(record, ["memo"])
      )
    ),
    ...asArray(data.outputTasks).map((record, index) =>
      createItem(
        record,
        index,
        "outputTasks",
        "output",
        "출력",
        firstText(record, ["outputType"]) || "출력 업무",
        workTitle(record, "output"),
        firstText(record, ["status", "progressStatus"]),
        deadlineText(record),
        firstText(record, ["memo"])
      )
    ),
    ...asArray(data.otherTasks).map((record, index) =>
      createItem(
        record,
        index,
        "otherTasks",
        "other",
        "기타",
        firstText(record, ["category"]) || "기타 업무",
        workTitle(record, "other"),
        firstText(record, ["status", "progressStatus"]),
        deadlineText(record),
        firstText(record, ["memo"])
      )
    )
  ];
}

function equipmentSalesScheduleText(record: AnyRecord): string {
  const parts = [
    firstText(record, ["nextContactDate"]) ? `다음 연락 ${formatOptionalDate(firstText(record, ["nextContactDate"]))}` : "",
    firstText(record, ["meetingDate"]) ? `미팅 ${formatOptionalDate(firstText(record, ["meetingDate"]))}` : "",
    firstText(record, ["taxInvoiceStatus", "invoiceStatus"]) === "발행 예정"
      ? `${billingMethodFor(record)} ${formatOptionalDate(firstText(record, ["taxInvoiceIssueDate", "invoiceIssueDate"]))}`
      : ""
  ];
  return joinParts(parts, " · ") || "일정 미정";
}

function materialSalesScheduleText(record: AnyRecord): string {
  if (firstText(record, ["taxInvoiceStatus", "invoiceStatus"]) === "발행 예정") {
    return `${billingMethodFor(record)} ${formatOptionalDate(firstText(record, ["taxInvoiceIssueDate", "invoiceIssueDate"])) || "예정일 미정"}`;
  }
  const inquiryDate = formatOptionalDate(firstText(record, ["inquiryDate"]));
  return inquiryDate ? `문의 ${inquiryDate}` : "일정 미정";
}

function settlementUnifiedScheduleText(record: AnyRecord, dates: string[]): string {
  const sortedDates = [...new Set(dates.filter(Boolean))].sort();
  if (sortedDates.length > 1) return `${formatDateForDisplay(sortedDates[0])} ~ ${formatDateForDisplay(sortedDates[sortedDates.length - 1])}`;
  if (sortedDates.length === 1) return formatDateForDisplay(sortedDates[0]);
  return formatOptionalDate(firstText(record, ["nextActionDate", "endDate"])) || "일정 미정";
}

function getCurrentWeekRange(baseDate = new Date()): { start: string; end: string } {
  const current = startOfDay(baseDate);
  const monday = new Date(current);
  monday.setDate(current.getDate() - ((current.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: toDateKey(monday), end: toDateKey(sunday) };
}

function getCurrentMonthRange(baseDate = new Date()): { start: string; end: string } {
  const current = startOfDay(baseDate);
  return {
    start: toDateKey(new Date(current.getFullYear(), current.getMonth(), 1)),
    end: toDateKey(new Date(current.getFullYear(), current.getMonth() + 1, 0))
  };
}

function formatTaskPeriodRangeLabel(period: TaskPeriodFilter, baseDate = new Date()): string {
  const range = period === "month" ? getCurrentMonthRange(baseDate) : getCurrentWeekRange(baseDate);
  return `${formatWeekDateLabel(range.start)} ~ ${formatWeekDateLabel(range.end)}`;
}

function formatWeekDateLabel(dateKey: string): string {
  const date = parseDate(dateKey);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  return `${formatDateForDisplay(dateKey)}(${weekday})`;
}

function compareUnifiedWorkItems(a: UnifiedWorkItem, b: UnifiedWorkItem): number {
  return Number(b.isImportant) - Number(a.isImportant)
    || Number(b.isToday) - Number(a.isToday)
    || Number(b.isThisWeek) - Number(a.isThisWeek)
    || compareDate(b.updatedAt, a.updatedAt)
    || a.title.localeCompare(b.title, "ko");
}
function collectScheduleItems(data: WorkNoteData): ScheduleItem[] {
  const items: ScheduleItem[] = [];

  data.notes.forEach((note, index) => {
    const company = salesCustomer(note);
    const status = firstText(note, ["status", "progressStatus"]);
    const priority = firstText(note, ["priority", "importance"]);
    addScheduleItem(items, note, index, firstText(note, ["nextContactDate"]), "[영업] 연락", joinParts([company, firstText(note, ["nextAction", "memo"])], " · "), "sales", status, priority);
    addScheduleItem(items, note, index, firstText(note, ["meetingDate"]), "[영업] 미팅", joinParts([company, firstText(note, ["nextAction", "memo"])], " · "), "sales", status, priority);
  });

  data.settlementTasks.forEach((task, index) => {
    const status = firstText(task, ["status", "progressStatus"]);
    const priority = firstText(task, ["priority", "importance"]);
    const title = workTitle(task, "settlement");
    const isAdvance = firstText(task, ["paymentType"]).includes("선금");
    const rows = normalizePaymentSchedule(asArray(task.paymentSchedule));
    const activeRows = rows.filter((row) => !row.isTaxInvoiceOnly);

    if (!isClosed(status)) {
      activeRows
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
            `[정산] ${title} ${round ? (isAdvance ? `${round}번 차감` : `${round}회차`) : isAdvance ? "차감" : "결제"}`,
            joinParts([amount, item, rowStatus], " · "),
            "settlement",
            rowStatus || status,
            priority,
            `pay-${recordId(row, rowIndex)}`
          );
        });
      if (!activeRows.length) {
        addScheduleItem(items, task, index, firstText(task, ["nextActionDate", "nextProcessDate", "nextDate", "dueDate", "dueEndDate", "endDate"]), `[정산] ${title} 처리`, firstText(task, ["nextAction", "memo", "description"]), "settlement", status, priority);
      }
    }

    rows.forEach((row, rowIndex) => {
      if (firstText(row, ["taxInvoiceStatus"]) !== "발행 예정") return;
      const billingMethod = billingMethodFor(row);
      if (billingMethod === "불필요") return;
      const rowId = recordId(row, rowIndex);
      const rowLabel = isAdvance
        ? firstText(row, ["item"]) || "차감 품목"
        : firstText(row, ["round"])
          ? `${firstText(row, ["round"])}회차`
          : firstText(row, ["item"]) || "결제 항목";
      addScheduleItem(
        items,
        task,
        index,
        firstText(row, ["taxInvoicePlannedDate"]),
        `[정산] ${title} ${rowLabel} ${billingMethod}`,
        joinParts([`${billingMethod} 발행 예정`, formatMoney(firstText(row, ["amount"])), firstText(row, ["taxInvoiceMemo"])], " · "),
        "settlement",
        status,
        priority,
        `tax-invoice-${rowId}`,
        rowId
      );
    });
  });
  data.outputTasks.forEach((task, index) => {
    if (isClosed(firstText(task, ["status", "progressStatus"]))) return;
    addWorkDateRangeItems(items, task, index, "output", `[출력] ${workTitle(task, "output")}`, joinParts([companyName(task) ? `업체: ${companyName(task)}` : task.companyUnknown ? "업체 미정" : "", firstText(task, ["outputType"]), firstText(task, ["memo", "description"])], " · "));
    addTaxInvoiceScheduleItem(items, task, index, "output", `[출력] ${workTitle(task, "output")}`, firstText(task, ["status", "progressStatus"]), firstText(task, ["priority", "importance"]));
  });

  data.otherTasks.forEach((task, index) => {
    if (isClosed(firstText(task, ["status", "progressStatus"]))) return;
    addWorkDateRangeItems(items, task, index, "other", `[기타] ${workTitle(task, "other")}`, joinParts([companyName(task) ? `업체: ${companyName(task)}` : task.companyUnknown ? "업체 미정" : "", firstText(task, ["memo", "description"])], " · "));
  });

  return items.sort((a, b) => a.date.localeCompare(b.date) || Number(b.isImportant) - Number(a.isImportant) || priorityScoreFromText(b.priority) - priorityScoreFromText(a.priority));
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
  idSuffix = "",
  taxInvoiceItemId = ""
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
    sourceType: type,
    sourceId: recordId(record, index),
    taxInvoiceItemId: taxInvoiceItemId || undefined,
    status,
    priority,
    collectionKey: type === "sales" ? "notes" : type === "settlement" ? "settlementTasks" : type === "output" ? "outputTasks" : "otherTasks",
    isImportant: Boolean(record.isImportant)
  });
}

function addTaxInvoiceScheduleItem(
  target: ScheduleItem[],
  record: AnyRecord,
  index: number,
  type: Extract<ScheduleItem["type"], "settlement" | "output">,
  title: string,
  status: string,
  priority: string
) {
  const billingMethod = billingMethodFor(record);
  if (billingMethod === "불필요") return;
  if (firstText(record, ["taxInvoiceStatus", "invoiceStatus"]) !== "발행 예정") return;
  addScheduleItem(target, record, index, firstText(record, ["taxInvoiceIssueDate", "invoiceIssueDate"]), `${title} ${billingMethod}`, `${billingMethod} 발행 예정`, type, status, priority, "tax-invoice", "record-tax-invoice");
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
    addScheduleItem(target, record, index, endKey || startKey, titlePrefix, detail, type, status, priority);
    return;
  }

  const days = getDateRangeKeys(startKey, endKey, Boolean(record.includeWeekends));
  days.forEach((date, dayIndex) => {
    addScheduleItem(target, record, index, date, titlePrefix, detail || deadlineText(record), type, status, priority, `range-${dayIndex}`);
  });
}

function scrollRecordIntoView(id: string) {
  window.setTimeout(() => {
    const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, "\\$&");
    document.querySelector(`[data-record-id="${escaped}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 80);
}

function scrollTaxInvoiceItemIntoView(id: string) {
  window.setTimeout(() => {
    const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, "\\$&");
    document.querySelector(`[data-tax-invoice-item-id="${escaped}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 80);
}
function collectGlobalResults(data: WorkNoteData, query: string) {
  if (!query.trim()) return [];
  const groups: Array<{ portal: PortalId; companyView?: "customer" | "headquarters"; records: AnyRecord[]; title: (record: AnyRecord) => string; meta: (record: AnyRecord) => string }> = [
    { portal: "company", companyView: "customer", records: data.companies, title: companyName, meta: (record) => firstText(record, ["status", "tradeStatus", "phone", "email"]) },
    { portal: "company", companyView: "headquarters", records: data.internalContacts, title: (record) => firstText(record, ["name"]) || "본사 담당자", meta: (record) => joinParts([firstText(record, ["department"]), firstText(record, ["title"]), asTextArray(record.duties).join(", ")], " · ") },
    { portal: "sales", records: data.notes, title: salesCustomer, meta: (record) => firstText(record, ["nextAction", "status", "product"]) },
    { portal: "sales", records: data.materialSalesNotes, title: salesCustomer, meta: (record) => materialSalesItemsSummary(record) || materialSalesStatus(record) },
    { portal: "settlement", records: data.settlementTasks, title: (record) => workTitle(record, "settlement"), meta: deadlineText },
    { portal: "output", records: data.outputTasks, title: (record) => workTitle(record, "output"), meta: deadlineText },
    { portal: "other", records: data.otherTasks, title: (record) => workTitle(record, "other"), meta: deadlineText },
    { portal: "account", records: data.accounts, title: (record) => firstText(record, ["siteName", "homepageName", "siteUrl"]) || "계정", meta: (record) => firstText(record, ["username", "purpose", "owner"]) }
  ];

  return groups.flatMap((group) =>
    group.records
      .filter((record) => matchesRecord(record, query))
      .map((record, index) => ({
        id: `${group.portal}-${group.companyView || "main"}-${recordId(record, index)}`,
        portal: group.portal,
        companyView: group.companyView,
        title: group.title(record),
        meta: group.meta(record) || portals.find((portal) => portal.id === group.portal)?.label || ""
      }))
  );
}

function asTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(clean).filter(Boolean);
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

function rawText(record: AnyRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (value !== null && value !== undefined) return String(value);
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

function getLinkedSalesForWork(record: AnyRecord, notes: AnyRecord[], materialSalesNotes: AnyRecord[] = []): AnyRecord | null {
  const linkedId = firstText(record, ["salesNoteId", "relatedSalesId", "salesId"]);
  const linkedType = firstText(record, ["salesNoteType"]);
  const collections = linkedType === "material"
    ? [materialSalesNotes, notes]
    : linkedType === "equipment"
      ? [notes, materialSalesNotes]
      : [notes, materialSalesNotes];

  if (linkedId) {
    for (const collection of collections) {
      const byId = collection.find((note, index) => recordId(note, index) === linkedId || firstText(note, ["id"]) === linkedId);
      if (byId) return byId;
    }
  }

  const name = companyName(record).toLowerCase();
  if (!name) return null;
  for (const collection of collections) {
    const byCompany = collection.find((note) => salesCustomer(note).toLowerCase() === name);
    if (byCompany) return byCompany;
  }
  return null;
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
  return firstText(record, ["title"]) || deriveWorkTaskTitle(record, type);
}

function workCompanyDisplay(record: AnyRecord, linkedSales: AnyRecord | null = null): string {
  const company = companyName(record) || (linkedSales ? salesCustomer(linkedSales) : "");
  if (company && company !== "고객 미정") return company;
  return record.companyUnknown ? "업체 미정" : "관련 업체 없음";
}

function matchesRecord(record: AnyRecord, query: string): boolean {
  if (!query.trim()) return true;
  return JSON.stringify(record).toLowerCase().includes(query.trim().toLowerCase());
}

function matchesText(value: unknown, query: string): boolean {
  if (!query.trim()) return true;
  return JSON.stringify(value).toLowerCase().includes(query.trim().toLowerCase());
}

function getListMode(record: AnyRecord): ListMode {
  const status = firstText(record, ["status", "progressStatus"]);
  if (isFailedListStatus(status)) return "failed";
  if (isClosedListStatus(status)) return "closed";
  if (status.includes("보류")) return "hold";
  return "active";
}

function matchesListMode(record: AnyRecord, mode: ListMode): boolean {
  return mode === "all" || getListMode(record) === mode;
}

function isClosedListStatus(status: string): boolean {
  return clean(status) === "완료";
}

function isFailedListStatus(status: string): boolean {
  const text = clean(status);
  return text === "실패" || text === "실패/종료" || text === "종료" || text === "취소";
}

function getListModeCounts(records: AnyRecord[]): Record<ListMode, number> {
  return records.reduce<Record<ListMode, number>>(
    (counts, record) => {
      counts.all += 1;
      counts[getListMode(record)] += 1;
      return counts;
    },
    { all: 0, active: 0, hold: 0, closed: 0, failed: 0 }
  );
}

function compareSalesNotes(a: AnyRecord, b: AnyRecord, sortKey: SalesSortKey, direction: SortDirection): number {
  if (sortKey === "priority") {
    const result = priorityScore(b) - priorityScore(a);
    return (direction === "desc" ? result : -result) || compareUpdatedAt(a, b, "desc");
  }
  if (sortKey === "updated") {
    return compareUpdatedAt(a, b, direction);
  }
  if (sortKey === "nextContact") {
    return compareNextContactDate(a, b, direction);
  }
  if (sortKey === "company") {
    return compareTextValue(salesCustomer(a), salesCustomer(b), direction) || compareUpdatedAt(a, b, "desc");
  }
  return priorityScore(b) - priorityScore(a) || compareUpdatedAt(a, b, "desc");
}

function compareUpdatedAt(a: AnyRecord, b: AnyRecord, direction: SortDirection): number {
  const result = compareDate(firstText(a, ["updatedAt"]), firstText(b, ["updatedAt"]));
  return direction === "desc" ? -result : result;
}

function compareTextValue(a: string, b: string, direction: SortDirection): number {
  const result = clean(a).localeCompare(clean(b), "ko");
  return direction === "desc" ? -result : result;
}

function compareNextContactDate(a: AnyRecord, b: AnyRecord, direction: SortDirection): number {
  const aDate = parseDateKey(firstText(a, ["nextContactDate"]));
  const bDate = parseDateKey(firstText(b, ["nextContactDate"]));
  const aMissing = !aDate;
  const bMissing = !bDate;
  if (aMissing !== bMissing) return aMissing ? 1 : -1;

  const result = aDate.localeCompare(bDate);
  return (direction === "desc" ? -result : result) || compareUpdatedAt(a, b, "desc");
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

function workAttachmentCollectionKey(type: "settlement" | "output" | "other"): TaskCollectionKey {
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

function settlementTaxInvoiceSummary(record: AnyRecord): string {
  const rows = normalizePaymentSchedule(asArray(record.paymentSchedule));
  const invoiceRows = rows.filter((row) => billingMethodFor(row) !== "불필요" && firstText(row, ["taxInvoiceStatus", "taxInvoicePlannedDate", "taxInvoiceIssuedDate"]));
  if (!invoiceRows.length) return "-";
  const planned = invoiceRows.filter((row) => firstText(row, ["taxInvoiceStatus"]) === "발행 예정").length;
  const completed = invoiceRows.filter((row) => ["발행 완료", "재발행 완료", "결제 완료"].includes(firstText(row, ["taxInvoiceStatus"]))).length;
  const nearestDate = invoiceRows
    .map((row) => firstText(row, ["taxInvoicePlannedDate"]))
    .filter(Boolean)
    .sort()[0] || "";
  return joinParts([
    planned ? `예정 ${planned}건` : "",
    completed ? `완료 ${completed}건` : "",
    invoiceRows.length > planned + completed ? `기타 ${invoiceRows.length - planned - completed}건` : "",
    nearestDate ? `가까운 예정 ${formatOptionalDate(nearestDate)}` : ""
  ], " · ");
}
function taxInvoiceSummary(record: AnyRecord): string {
  const billingMethod = billingMethodFor(record);
  if (billingMethod === "불필요") return "불필요";
  const status = firstText(record, ["taxInvoiceStatus", "invoiceStatus"]);
  const date = formatOptionalDate(firstText(record, ["taxInvoiceIssueDate", "invoiceIssueDate"]));
  const reissueDate = formatOptionalDate(firstText(record, ["taxInvoiceReissueDate", "invoiceReissueDate"]));
  const reason = firstText(record, ["taxInvoiceCancelReason", "invoiceCancelReason"]);
  if (!status && !date) return billingMethod;
  return joinParts([billingMethod, status || "상태 미정", date, reissueDate ? `재발행 ${reissueDate}` : "", reason], " · ");
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
  const paymentType = firstText(record, ["paymentType"]);
  const isAdvance = paymentType.includes("선금");
  const explicit = firstText(record, ["remainingAmount", "balanceAmount"]);
  if (!isAdvance && hasAmountValue(explicit)) return formatMoney(explicit);

  const total = parseAmountNumber(firstText(record, [isAdvance ? "advanceAmount" : "totalAmount", isAdvance ? "totalAmount" : "advanceAmount"]));
  if (total === null) return "";

  const scheduleStats = getSettlementScheduleStats(asArray(record.paymentSchedule), isAdvance);
  const received = isAdvance ? 0 : parseAmountNumber(firstText(record, ["receivedAmount"])) || scheduleStats.completedAmount || 0;
  const deducted = isAdvance
    ? scheduleStats.totalAmount || parseAmountNumber(firstText(record, ["deductedAmount"])) || 0
    : parseAmountNumber(firstText(record, ["deductedAmount"])) || 0;
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
  const start = parseDate(getCurrentWeekRange(cursor).start);
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
  return getCurrentWeekRange(a).start === getCurrentWeekRange(b).start;
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


