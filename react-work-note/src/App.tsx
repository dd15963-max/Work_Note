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
import { useEffect, useMemo, useState } from "react";

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
          <p className="eyebrow">WORK NOTE REACT PREVIEW</p>
          <h1>업무 메모장</h1>
          <p className="header-note">
            기존 데이터를 안전하게 읽어서 일정, 검색, 목록 파악을 먼저 개선한 React 프리뷰입니다.
          </p>
        </div>
        <div className="header-actions">
          <StatusBadge data={data} />
          <button className="icon-text-button" type="button" onClick={refreshData}>
            <RefreshCw size={17} />
            새로고침
          </button>
          <a className="icon-text-button primary" href={LEGACY_APP_PATH}>
            기존 앱
            <ExternalLink size={16} />
          </a>
        </div>
      </header>

      <section className="safety-strip" aria-label="데이터 안전 안내">
        <ShieldCheck size={18} />
        <span>안전 저장 모드</span>
        <small>
          계정, 업체, 영업 메모를 React에서 저장합니다. 저장 전 최근 데이터 스냅샷을 브라우저에 남기고, 나머지 업무 수정은 아직 기존 앱에서 처리합니다.
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
          />
        )}
        {activePortal === "company" && <CompanyPortal data={data} query={query} onPersist={persistData} />}
        {activePortal === "sales" && <SalesPortal data={data} query={query} onPersist={persistData} />}
        {activePortal === "settlement" && <GenericWorkPortal title="정산" records={data.settlementTasks} query={query} type="settlement" data={data} onPersist={persistData} />}
        {activePortal === "output" && <GenericWorkPortal title="출력" records={data.outputTasks} query={query} type="output" data={data} onPersist={persistData} />}
        {activePortal === "other" && <GenericWorkPortal title="기타" records={data.otherTasks} query={query} type="other" data={data} onPersist={persistData} />}
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

function SchedulePortal({
  counts,
  items,
  todayItems,
  calendarCursor,
  setCalendarCursor,
  calendarMode,
  setCalendarMode
}: {
  counts: Record<string, number>;
  items: ScheduleItem[];
  todayItems: ScheduleItem[];
  calendarCursor: Date;
  setCalendarCursor: (date: Date) => void;
  calendarMode: CalendarMode;
  setCalendarMode: (mode: CalendarMode) => void;
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
          <CalendarGrid cursor={calendarCursor} mode={calendarMode} items={items} />
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
            <ScheduleListItem item={item} key={item.id} />
          ))}
          {!todayItems.length && <EmptyState title="오늘 일정 없음" detail="오늘 날짜에 연결된 업무가 없습니다." />}
        </div>
      </aside>
    </div>
  );
}

function CalendarGrid({ cursor, mode, items }: { cursor: Date; mode: CalendarMode; items: ScheduleItem[] }) {
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
                <span className={`calendar-chip ${item.type}`} key={item.id} title={`${item.title} ${item.detail}`}>
                  {item.title}
                </span>
              ))}
              {dayItems.length > (mode === "week" ? 8 : 3) && <small>+{dayItems.length - (mode === "week" ? 8 : 3)}</small>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScheduleListItem({ item }: { item: ScheduleItem }) {
  return (
    <article className={`schedule-list-item ${item.type}`}>
      <div>
        <strong>{item.title}</strong>
        <p>{item.detail || "상세 내용 없음"}</p>
      </div>
      <div className="stacked-meta">
        <span>{formatDateForDisplay(item.date)}</span>
        {item.status && <small>{item.status}</small>}
      </div>
    </article>
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
    if (!normalized.name) {
      alert("업체명을 입력해 주세요.");
      return;
    }

    const similar = findSimilarCompanies(data.companies, normalized.name, normalized.id);
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
        createdAt: firstText(previous || {}, ["createdAt"]) || now,
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
        <CompanyEditor
          draft={editingCompany}
          setDraft={setEditingCompany}
          onSave={saveCompany}
          onCancel={() => setEditingCompany(null)}
        />
      )}
      <div className="card-grid">
        {companies.map(({ company, originalIndex, id }) => {
          const contacts = asArray(company.contacts);
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
              <InfoLine label="담당자" value={contacts.map(companyContactSummary).filter(Boolean).join(" / ")} />
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
  onPersist
}: {
  data: WorkNoteData;
  query: string;
  onPersist: (updater: (current: WorkNoteData) => WorkNoteData, reason: string) => void;
}) {
  const [salesPanel, setSalesPanel] = useState<{ id: string; mode: SalesPanelMode } | null>(null);
  const [editingNote, setEditingNote] = useState<AnyRecord | null>(null);
  const notes = data.notes
    .filter((note) => matchesRecord(note, query))
    .sort((a, b) => priorityScore(b) - priorityScore(a) || compareDate(firstText(b, ["updatedAt"]), firstText(a, ["updatedAt"])));

  const toggleSalesPanel = (id: string, mode: SalesPanelMode) => {
    setSalesPanel((current) => (current?.id === id && current.mode === mode ? null : { id, mode }));
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

    const attachmentId = updatedAttachment ? firstText(updatedAttachment, ["id"]) : "";
    if (!attachmentId) return;
    try {
      const stored = await getAttachmentRecord(attachmentId);
      if (stored?.blob) {
        await putAttachmentRecord({ ...stored, ...updatedAttachment, blob: stored.blob });
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
        <SalesEditor
          draft={editingNote}
          setDraft={setEditingNote}
          data={data}
          onSave={saveNote}
          onCancel={() => setEditingNote(null)}
        />
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
            <div className="sales-row-group" key={id}>
              <article className={`table-row sales-grid ${expanded ? "is-expanded" : ""}`}>
                <div>
                  <strong>{salesCustomer(note)}</strong>
                  <div className="contact-lines">
                    <span>{firstText(note, ["contactName", "managerName"]) || "담당자 미입력"}</span>
                    <span>{firstText(note, ["contactPhone", "phone", "contact", "mobile"]) || "연락처 미입력"}</span>
                    <span>{firstText(note, ["contactEmail", "email"]) || "이메일 미입력"}</span>
                  </div>
                </div>
                <div>
                  <Badge tone="blue">{salesStatus(note) || "미정"}</Badge>
                </div>
                <div>
                  <Badge tone="green">{salesCategory(note) || "미지정"}</Badge>
                </div>
                <div>
                  <Badge tone={priorityTone(salesPriority(note))}>{salesPriority(note) || "보통"}</Badge>
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
                <div className="sales-management-actions">
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
                  <button
                    type="button"
                    onClick={() => toggleSalesPanel(id, "detail")}
                    aria-expanded={activeMode === "detail"}
                  >
                    {activeMode === "detail" ? "접기" : "상세"}
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
          <span>업체 선택</span>
          <select
            value={draft.companyUnknown ? "__unknown" : firstText(draft, ["companyId"])}
            onChange={(event) => selectCompany(event.target.value)}
          >
            <option value="">직접 입력 / 연결 안 함</option>
            <option value="__unknown">미정</option>
            {data.companies.map((company, index) => (
              <option key={recordId(company, index)} value={recordId(company, index)}>
                {companyName(company) || "업체명 미입력"}
              </option>
            ))}
          </select>
        </label>
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
        <TextField label="예상매출" value={firstText(draft, ["expectedRevenueAmount"])} onChange={(value) => updateField("expectedRevenueAmount", value)} placeholder="예: 15000000" />
        <CheckField label="예상매출 VAT 포함" checked={Boolean(draft.expectedRevenueVatIncluded)} onChange={(checked) => updateField("expectedRevenueVatIncluded", checked)} />
        <TextField label="매출" value={firstText(draft, ["revenueAmount"])} onChange={(value) => updateField("revenueAmount", value)} placeholder="예: 10000000" />
        <CheckField label="매출 VAT 포함" checked={Boolean(draft.revenueAmountVatIncluded)} onChange={(checked) => updateField("revenueAmountVatIncluded", checked)} />
        <SelectField label="매출 구분" value={firstText(draft, ["revenueType"])} onChange={(value) => updateField("revenueType", value)} options={REVENUE_TYPE_OPTIONS} placeholder="선택 안 함" />
        <TextField label="다음 연락 예정일" type="date" value={firstText(draft, ["nextContactDate"])} onChange={(value) => updateField("nextContactDate", value)} />
        <CheckField label="다음 연락 미정" checked={Boolean(draft.nextContactUnknown)} onChange={(checked) => updateField("nextContactUnknown", checked)} />
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

    const attachmentId = updatedAttachment ? firstText(updatedAttachment, ["id"]) : "";
    if (!attachmentId) return;
    try {
      const stored = await getAttachmentRecord(attachmentId);
      if (stored?.blob) {
        await putAttachmentRecord({ ...stored, ...updatedAttachment, blob: stored.blob });
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
  onPersist
}: {
  title: string;
  records: AnyRecord[];
  query: string;
  type: "settlement" | "output" | "other";
  data: WorkNoteData;
  onPersist: (updater: (current: WorkNoteData) => WorkNoteData, reason: string) => void;
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
        <WorkEditor
          draft={editingRecord}
          setDraft={setEditingRecord}
          type={type}
          title={title}
          data={data}
          onSave={saveWorkRecord}
          onCancel={() => setEditingRecord(null)}
        />
      )}
      <div className="task-list">
        {filtered.map(({ record, originalIndex, id }) => {
          const attachments = asArray(record.attachments);
          const linkedSales = getLinkedSalesForWork(record, data.notes);
          return (
            <article className={`task-card ${type}`} key={id}>
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
  const selectedCompany = firstText(draft, ["companyId"])
    ? data.companies.find((company, index) => recordId(company, index) === firstText(draft, ["companyId"]))
    : null;
  const contacts = selectedCompany ? asArray(selectedCompany.contacts) : [];

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
          <span>관련 업체</span>
          <select value={draft.companyUnknown ? "__unknown" : firstText(draft, ["companyId"])} onChange={(event) => selectCompany(event.target.value)}>
            <option value="">직접 입력 / 연결 안 함</option>
            <option value="__unknown">미정</option>
            {data.companies.map((company, index) => (
              <option key={recordId(company, index)} value={recordId(company, index)}>
                {companyName(company) || "업체명 미입력"}
              </option>
            ))}
          </select>
        </label>
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
              <span>관련 영업건</span>
              <select value={draft.salesLinkUnknown ? "__unknown" : firstText(draft, ["salesNoteId"])} onChange={(event) => selectSales(event.target.value)}>
                <option value="">연결 안 함</option>
                <option value="__unknown">미정</option>
                {data.notes.map((note, index) => (
                  <option key={recordId(note, index)} value={recordId(note, index)}>
                    {salesCustomer(note)} · {salesInterest(note) || firstText(note, ["nextAction"]) || "영업 메모"}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {type === "settlement" && (
          <SettlementFields draft={draft} updateField={updateField} />
        )}

        {type === "output" && (
          <>
            <TextField label="기한 시작" type="date" value={firstText(draft, ["startDate"])} onChange={(value) => updateField("startDate", value)} />
            <TextField label="기한 종료" type="date" value={firstText(draft, ["endDate"])} onChange={(value) => updateField("endDate", value)} />
            <CheckField label="주말 포함" checked={Boolean(draft.includeWeekends)} onChange={(checked) => updateField("includeWeekends", checked)} />
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
            <TextField label="기한 종료" type="date" value={firstText(draft, ["endDate"])} onChange={(value) => updateField("endDate", value)} />
            <CheckField label="주말 포함" checked={Boolean(draft.includeWeekends)} onChange={(checked) => updateField("includeWeekends", checked)} />
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
  updateField
}: {
  draft: AnyRecord;
  updateField: (key: string, value: string | boolean | AnyRecord[]) => void;
}) {
  const schedule = asArray(draft.paymentSchedule);
  const [scheduleStart, setScheduleStart] = useState(firstText(draft, ["nextActionDate"]) || toDateKey(new Date()));
  const [scheduleInterval, setScheduleInterval] = useState("14");
  const [scheduleCount, setScheduleCount] = useState("");
  const [scheduleAmount, setScheduleAmount] = useState("");
  const [scheduleAmountVatIncluded, setScheduleAmountVatIncluded] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const isAdvance = firstText(draft, ["paymentType"]).includes("선금");

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
    const rows = pasteText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const parts = line.split(/\t|,|\s{2,}/).map(clean).filter(Boolean);
        return {
          id: createId("pay_"),
          round: parts[0]?.replace(/회차/g, "") || String(index + 1),
          dueDate: parseDateKey(parts[1] || "") || "",
          amount: normalizeAmountString(parts[2] || ""),
          amountVatIncluded: false,
          status: parts[3] || "예정",
          item: parts.slice(4).join(" ")
        };
      });
    if (!rows.length) {
      alert("붙여넣은 일정이 없습니다.");
      return;
    }
    setSchedule(rows);
    setPasteText("");
  };

  return (
    <>
      <SelectField label="결제 유형" value={firstText(draft, ["paymentType"]) || "분할 결제"} onChange={(value) => updateField("paymentType", value)} options={SETTLEMENT_PAYMENT_OPTIONS} />
      <SelectField label="진행 상태" value={firstText(draft, ["status"]) || "예정"} onChange={(value) => updateField("status", value)} options={SETTLEMENT_STATUS_OPTIONS} />
      <TextField label={isAdvance ? "선금/예치금" : "총 관리 금액"} value={firstText(draft, ["totalAmount", "advanceAmount"])} onChange={(value) => updateField(isAdvance ? "advanceAmount" : "totalAmount", value)} placeholder="예: 10000000" />
      <CheckField label={`${isAdvance ? "선금" : "총액"} VAT 포함`} checked={Boolean(isAdvance ? draft.advanceAmountVatIncluded : draft.totalAmountVatIncluded)} onChange={(checked) => updateField(isAdvance ? "advanceAmountVatIncluded" : "totalAmountVatIncluded", checked)} />
      <TextField label={isAdvance ? "차감 완료액" : "회차 입금 완료액"} value={firstText(draft, [isAdvance ? "deductedAmount" : "receivedAmount"])} onChange={(value) => updateField(isAdvance ? "deductedAmount" : "receivedAmount", value)} placeholder="예: 5000000" />
      <CheckField label={`${isAdvance ? "차감" : "입금"} VAT 포함`} checked={Boolean(isAdvance ? draft.deductedAmountVatIncluded : draft.receivedAmountVatIncluded)} onChange={(checked) => updateField(isAdvance ? "deductedAmountVatIncluded" : "receivedAmountVatIncluded", checked)} />
      {!isAdvance && <TextField label="기타 차감 금액" value={firstText(draft, ["deductedAmount"])} onChange={(value) => updateField("deductedAmount", value)} placeholder="예: 1000000" />}
      {!isAdvance && <CheckField label="기타 차감 VAT 포함" checked={Boolean(draft.deductedAmountVatIncluded)} onChange={(checked) => updateField("deductedAmountVatIncluded", checked)} />}
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
          <TextField label="회차별 금액" value={scheduleAmount} onChange={setScheduleAmount} />
          <CheckField label="회차 금액 VAT 포함" checked={scheduleAmountVatIncluded} onChange={setScheduleAmountVatIncluded} />
          <button type="button" className="icon-text-button" onClick={generateRows}>일정 자동 생성</button>
          <button type="button" className="icon-text-button" onClick={addRow}>회차 추가</button>
        </div>
        <TextAreaField label="엑셀 일정 붙여넣기" value={pasteText} onChange={setPasteText} placeholder="예: 1회차	2026-07-08	1980000	예정	품목" wide />
        <div className="form-actions compact-actions">
          <button type="button" className="icon-text-button" onClick={parsePasteRows}>붙여넣은 일정 불러오기</button>
        </div>
        <div className="payment-row-list">
          {schedule.map((row, index) => (
            <div className="payment-row" key={recordId(row, index)}>
              <TextField label="회차" value={firstText(row, ["round"])} onChange={(value) => updateRow(index, "round", value)} />
              <TextField label="예정일" type="date" value={firstText(row, ["dueDate"])} onChange={(value) => updateRow(index, "dueDate", value)} />
              <TextField label="금액" value={firstText(row, ["amount"])} onChange={(value) => updateRow(index, "amount", value)} />
              <CheckField label="VAT 포함" checked={Boolean(row.amountVatIncluded)} onChange={(checked) => updateRow(index, "amountVatIncluded", checked)} />
              <TextField label={isAdvance ? "차감 품목" : "품목/메모"} value={firstText(row, ["item"])} onChange={(value) => updateRow(index, "item", value)} />
              <TextField label="상태" value={firstText(row, ["status"])} onChange={(value) => updateRow(index, "status", value)} />
              <button type="button" className="danger-button" onClick={() => removeRow(index)}>삭제</button>
            </div>
          ))}
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
        <AccountEditor
          draft={editingAccount}
          setDraft={setEditingAccount}
          onSave={saveAccount}
          onCancel={() => setEditingAccount(null)}
        />
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
  wide = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  wide?: boolean;
}) {
  return (
    <label className={`field ${wide ? "wide-field" : ""}`}>
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
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
    addScheduleItem(items, task, index, firstText(task, ["nextProcessDate", "nextDate", "dueDate", "dueEndDate"]), `[정산] ${workTitle(task, "settlement")} 처리`, firstText(task, ["nextAction", "memo", "description"]), "settlement", firstText(task, ["status", "progressStatus"]), firstText(task, ["priority", "importance"]));
  });

  data.outputTasks.forEach((task, index) => {
    if (isClosed(firstText(task, ["status", "progressStatus"]))) return;
    addScheduleItem(items, task, index, firstText(task, ["dueEndDate", "deadline", "dueDate"]), `[출력] ${workTitle(task, "output")} 기한`, firstText(task, ["memo", "description"]), "output", firstText(task, ["status", "progressStatus"]), firstText(task, ["priority", "importance"]));
  });

  data.otherTasks.forEach((task, index) => {
    if (isClosed(firstText(task, ["status", "progressStatus"]))) return;
    addScheduleItem(items, task, index, firstText(task, ["dueEndDate", "deadline", "dueDate"]), `[기타] ${workTitle(task, "other")} 기한`, firstText(task, ["memo", "description"]), "other", firstText(task, ["status", "progressStatus"]), firstText(task, ["priority", "importance"]));
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
  priority: string
) {
  const date = parseDateKey(dateValue);
  if (!date) return;
  target.push({
    id: `${type}-${recordId(record, index)}-${date}-${target.length}`,
    date,
    title,
    detail,
    type,
    status,
    priority
  });
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

function getWorkModeCounts(records: AnyRecord[]) {
  return records.reduce(
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
  const received = isAdvance ? 0 : parseAmountNumber(firstText(record, ["receivedAmount"])) || 0;
  const deducted = parseAmountNumber(firstText(record, ["deductedAmount"])) || 0;
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
