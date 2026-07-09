import {
  Archive,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  WalletCards
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type PortalId = "schedule" | "company" | "sales" | "settlement" | "output" | "other" | "account";
type CalendarMode = "month" | "week";
type SalesPanelMode = "detail" | "company" | "files";
type AnyRecord = Record<string, unknown>;

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

const STORAGE_KEY = "salesNoteAppDataV1";
const LEGACY_APP_PATH = "../sales-note-app/";

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
        <span>읽기 전용 프리뷰</span>
        <small>현재 React 버전은 기존 저장 데이터를 덮어쓰지 않습니다. 수정과 백업은 기존 앱에서 계속 처리합니다.</small>
      </section>

      <nav className="portal-nav" aria-label="업무 포탈">
        <div className="portal-nav-group schedule-group">
          <PortalButton id="schedule" activePortal={activePortal} setActivePortal={setActivePortal} />
        </div>
        <div className="portal-nav-group work-group">
          {(["company", "sales", "settlement", "output", "other"] as PortalId[]).map((id) => (
            <PortalButton key={id} id={id} activePortal={activePortal} setActivePortal={setActivePortal} />
          ))}
        </div>
        <div className="portal-nav-group account-group">
          <PortalButton id="account" activePortal={activePortal} setActivePortal={setActivePortal} />
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
        {activePortal === "company" && <CompanyPortal data={data} query={query} />}
        {activePortal === "sales" && <SalesPortal data={data} query={query} />}
        {activePortal === "settlement" && <GenericWorkPortal title="정산" records={data.settlementTasks} query={query} type="settlement" />}
        {activePortal === "output" && <GenericWorkPortal title="출력" records={data.outputTasks} query={query} type="output" />}
        {activePortal === "other" && <GenericWorkPortal title="기타" records={data.otherTasks} query={query} type="other" />}
        {activePortal === "account" && <AccountPortal accounts={data.accounts} query={query} />}
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

function CompanyPortal({ data, query }: { data: WorkNoteData; query: string }) {
  const companies = data.companies.filter((company) => matchesRecord(company, query));
  return (
    <section className="panel">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">COMPANIES</p>
          <h2>업체 관리</h2>
        </div>
        <span>{companies.length}개</span>
      </div>
      <div className="card-grid">
        {companies.map((company, index) => {
          const contacts = asArray(company.contacts);
          return (
            <article className="company-card" key={recordId(company, index)}>
              <div className="card-heading">
                <strong>{companyName(company) || "업체명 미입력"}</strong>
                <Badge>{firstText(company, ["status", "dealStatus", "tradeStatus"]) || "상태 미정"}</Badge>
              </div>
              <InfoLine label="대표" value={firstText(company, ["representativeName", "ceoName", "owner"])} />
              <InfoLine label="연락처" value={firstText(company, ["phone", "mainPhone", "contact"])} />
              <InfoLine label="이메일" value={firstText(company, ["email", "mainEmail"])} />
              <InfoLine label="담당자" value={contacts.map((contact) => firstText(contact, ["name", "contactName"])).filter(Boolean).join(", ")} />
            </article>
          );
        })}
        {!companies.length && <EmptyState title="업체 없음" detail="검색 조건에 맞는 업체가 없습니다." />}
      </div>
    </section>
  );
}

function SalesPortal({ data, query }: { data: WorkNoteData; query: string }) {
  const [salesPanel, setSalesPanel] = useState<{ id: string; mode: SalesPanelMode } | null>(null);
  const notes = data.notes
    .filter((note) => matchesRecord(note, query))
    .sort((a, b) => priorityScore(b) - priorityScore(a) || compareDate(firstText(b, ["updatedAt"]), firstText(a, ["updatedAt"])));

  const toggleSalesPanel = (id: string, mode: SalesPanelMode) => {
    setSalesPanel((current) => (current?.id === id && current.mode === mode ? null : { id, mode }));
  };

  return (
    <section className="panel">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">SALES</p>
          <h2>영업 메모</h2>
        </div>
        <span>{notes.length}건</span>
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
                  <a href={LEGACY_APP_PATH} title="기존 앱에서 수정/삭제" target="_blank" rel="noreferrer">기존 앱</a>
                  <small>{formatDateTime(firstText(note, ["updatedAt"]))}</small>
                </div>
              </article>
              {expanded && <SalesDetailPanel note={note} company={linkedCompany} mode={activeMode || "detail"} />}
            </div>
          );
        })}
        {!notes.length && <EmptyState title="영업 메모 없음" detail="검색 조건에 맞는 영업 메모가 없습니다." />}
      </div>
    </section>
  );
}

function SalesDetailPanel({ note, company, mode }: { note: AnyRecord; company: AnyRecord | null; mode: SalesPanelMode }) {
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
            <div className="attachment-detail-list">
              {attachments.map((attachment, index) => (
                <article key={recordId(attachment, index)}>
                  <strong>{firstText(attachment, ["fileName", "name"]) || "첨부자료"}</strong>
                  <span>{[firstText(attachment, ["category"]), formatOptionalDate(firstText(attachment, ["sentDate"])), firstText(attachment, ["memo"])].filter(Boolean).join(" · ") || "파일 정보 없음"}</span>
                </article>
              ))}
              {!attachments.length && <article><strong>첨부자료 없음</strong><span>기존 앱 파일함에서 첨부자료를 추가할 수 있습니다.</span></article>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function GenericWorkPortal({
  title,
  records,
  query,
  type
}: {
  title: string;
  records: AnyRecord[];
  query: string;
  type: "settlement" | "output" | "other";
}) {
  const filtered = records.filter((record) => matchesRecord(record, query));
  return (
    <section className="panel">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">{title.toUpperCase()}</p>
          <h2>{title} 업무</h2>
        </div>
        <span>{filtered.length}건</span>
      </div>
      <div className="task-list">
        {filtered.map((record, index) => (
          <article className={`task-card ${type}`} key={recordId(record, index)}>
            <div className="card-heading">
              <strong>{workTitle(record, type)}</strong>
              <Badge tone={statusTone(firstText(record, ["status", "progressStatus"]))}>
                {firstText(record, ["status", "progressStatus"]) || "상태 미정"}
              </Badge>
            </div>
            <div className="task-card-grid">
              <InfoLine label="업체" value={firstText(record, ["companyName", "relatedCompany", "clientName"])} />
              <InfoLine label="담당" value={firstText(record, ["assignee", "requester", "owner", "managerName"])} />
              <InfoLine label="기한" value={deadlineText(record)} />
              <InfoLine label="파일" value={attachmentCountText(record)} />
            </div>
            {firstText(record, ["memo", "description", "note"]) && <p className="muted-preview">{firstText(record, ["memo", "description", "note"])}</p>}
          </article>
        ))}
        {!filtered.length && <EmptyState title={`${title} 업무 없음`} detail="검색 조건에 맞는 업무가 없습니다." />}
      </div>
    </section>
  );
}

function AccountPortal({ accounts, query }: { accounts: AnyRecord[]; query: string }) {
  const filtered = accounts.filter((account) => matchesRecord(account, query));
  return (
    <section className="panel">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">ACCOUNTS</p>
          <h2>계정 보관함</h2>
        </div>
        <span>{filtered.length}개</span>
      </div>
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
              </div>
            </article>
          );
        })}
        {!filtered.length && <EmptyState title="계정 없음" detail="검색 조건에 맞는 계정이 없습니다." />}
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
