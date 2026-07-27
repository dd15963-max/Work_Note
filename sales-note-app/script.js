(function () {
  "use strict";

  const APP_VERSION = "1.0.0";
  const STORAGE_KEY = "salesNoteAppDataV1";
  const TEMP_IMPORT_BACKUP_KEY = "salesNoteAppPreImportBackupV1";
  const DRAFT_KEY = "salesNoteAppDraftV1";
  const LAST_BACKUP_KEY = "salesNoteAppLastBackupAtV1";
  const ATTACHMENT_DB_NAME = "salesNoteAttachmentDbV1";
  const ATTACHMENT_STORE_NAME = "files";
  const ATTACHMENT_DB_VERSION = 1;

  const DEFAULT_STATUS_OPTIONS = [
    "신규 문의",
    "1차 대응 완료",
    "미팅 예정",
    "샘플/BMT 진행",
    "검토 중",
    "수주 가능성 높음",
    "보류",
    "완료",
    "실패/종료"
  ];

  const SALES_STATUS_RENAMES = {
    "자료 발송": "1차 대응 완료",
    "견적 진행": "1차 대응 완료"
  };

  const PRIORITY_WEIGHT = {
    "긴급": 4,
    "높음": 3,
    "보통": 2,
    "낮음": 1
  };

  const FILE_CATEGORY_OPTIONS = [
    "사업자등록증",
    "통장 사본",
    "회사 서류",
    "견적서",
    "발송자료",
    "메일 캡처",
    "출력 파일",
    "기타 파일",
    "정산자료",
    "세금계산서",
    "입금증",
    "샘플/BMT",
    "계약/발주",
    "기타"
  ];

  const SETTLEMENT_SCHEDULE_STATUS_OPTIONS = [
    "예정",
    "청구 완료",
    "결제 완료",
    "차감 완료",
    "연체",
    "보류"
  ];

  const SETTLEMENT_STATUS_OPTIONS = [
    "예정",
    "선금 예정",
    "선금 완료",
    "차감 진행 중",
    "확인 필요",
    "보류",
    "완료"
  ];

  const SETTLEMENT_PAYMENT_TYPE_INSTALLMENT = "분할 결제";
  const SETTLEMENT_PAYMENT_TYPE_ADVANCE = "선금 결제";
  const WORK_LIST_CATEGORIES = ["settlement", "output", "other"];
  const CLOSED_WORK_STATUSES = ["완료", "종료", "실패/종료"];
  const HELD_WORK_STATUSES = ["보류"];
  const PRIORITY_OPTIONS = ["긴급", "높음", "보통", "낮음"];
  const SALES_ITEM_CATEGORY_OPTIONS = ["장비", "소재", "타사 장비", "타사 소재", "기타"];
  const HISTORY_FIELD_LABELS = {
    name: "업체명",
    businessNumber: "사업자번호",
    representative: "대표자",
    businessType: "업종/분류",
    address: "주소",
    mainPhone: "대표 연락처",
    mainEmail: "대표 이메일",
    company: "업체",
    companyUnknown: "업체 미정",
    contactName: "담당자",
    contactPhone: "연락처",
    contactEmail: "이메일",
    contacts: "담당자",
    status: "상태",
    priority: "중요도",
    itemCategory: "구분",
    interest: "관심 제품",
    nextAction: "다음 액션",
    nextContactDate: "다음 연락",
    meetingDate: "미팅 일정",
    quoteStatus: "견적 여부",
    purchasePossibility: "구매 가능성",
    expectedRevenueAmount: "예상 매출",
    expectedRevenueVatIncluded: "예상 매출 VAT",
    revenueAmount: "매출",
    revenueAmountVatIncluded: "매출 VAT",
    revenueType: "매출 구분",
    salesNoteId: "관련 영업건",
    salesLinkUnknown: "영업건 미정",
    paymentType: "결제 유형",
    totalAmount: "총 금액",
    totalAmountVatIncluded: "총 금액 VAT",
    receivedAmount: "입금 완료액",
    receivedAmountVatIncluded: "입금 완료액 VAT",
    deductedAmount: "차감 금액",
    deductedAmountVatIncluded: "차감 금액 VAT",
    installmentProgress: "회차",
    nextActionDate: "다음 처리일",
    nextActionUnknown: "다음 처리 미정",
    includeWeekends: "주말 포함",
    outputType: "출력 종류",
    title: "업무명",
    category: "구분",
    owner: "담당/요청자",
    startDate: "기한 시작",
    endDate: "기한 종료",
    memo: "메모"
  };

  const elements = {
    portalTabs: Array.from(document.querySelectorAll(".portal-tab")),
    portalViews: Array.from(document.querySelectorAll(".portal-view")),
    editorPanel: document.getElementById("editorPanel"),
    panelBackdrop: document.getElementById("panelBackdrop"),
    fileDrawer: document.getElementById("fileDrawer"),
    closeFileDrawerButton: document.getElementById("closeFileDrawerButton"),
    fileDrawerTitle: document.getElementById("fileDrawerTitle"),
    fileDrawerSubtitle: document.getElementById("fileDrawerSubtitle"),
    fileDrawerCount: document.getElementById("fileDrawerCount"),
    fileDrawerHint: document.getElementById("fileDrawerHint"),
    fileDrawerFileInput: document.getElementById("fileDrawerFileInput"),
    fileDrawerCategory: document.getElementById("fileDrawerCategory"),
    fileDrawerSentDate: document.getElementById("fileDrawerSentDate"),
    fileDrawerSelectedFiles: document.getElementById("fileDrawerSelectedFiles"),
    fileDrawerUploadButton: document.getElementById("fileDrawerUploadButton"),
    fileDrawerClearSelectionButton: document.getElementById("fileDrawerClearSelectionButton"),
    fileDrawerList: document.getElementById("fileDrawerList"),
    customerDrawer: document.getElementById("customerDrawer"),
    closeCustomerDrawerButton: document.getElementById("closeCustomerDrawerButton"),
    customerDrawerTitle: document.getElementById("customerDrawerTitle"),
    customerDrawerSubtitle: document.getElementById("customerDrawerSubtitle"),
    customerProfileSummary: document.getElementById("customerProfileSummary"),
    customerProfileActions: document.getElementById("customerProfileActions"),
    customerTimelineCount: document.getElementById("customerTimelineCount"),
    customerTimelineList: document.getElementById("customerTimelineList"),
    customerRelatedCount: document.getElementById("customerRelatedCount"),
    customerRelatedList: document.getElementById("customerRelatedList"),
    customerFileCount: document.getElementById("customerFileCount"),
    customerAttachmentList: document.getElementById("customerAttachmentList"),
    filePreviewPanel: document.getElementById("filePreviewPanel"),
    closeFilePreviewButton: document.getElementById("closeFilePreviewButton"),
    filePreviewTitle: document.getElementById("filePreviewTitle"),
    filePreviewMeta: document.getElementById("filePreviewMeta"),
    filePreviewBody: document.getElementById("filePreviewBody"),
    filePreviewZoomControls: document.getElementById("filePreviewZoomControls"),
    filePreviewZoomOutButton: document.getElementById("filePreviewZoomOutButton"),
    filePreviewZoomResetButton: document.getElementById("filePreviewZoomResetButton"),
    filePreviewZoomInButton: document.getElementById("filePreviewZoomInButton"),
    filePreviewDownloadButton: document.getElementById("filePreviewDownloadButton"),
    noteForm: document.getElementById("noteForm"),
    noteId: document.getElementById("noteId"),
    salesCompanyId: document.getElementById("salesCompanyId"),
    salesContactId: document.getElementById("salesContactId"),
    salesCompanySearch: document.getElementById("salesCompanySearch"),
    salesCompanyUnknown: document.getElementById("salesCompanyUnknown"),
    salesCompanySelected: document.getElementById("salesCompanySelected"),
    salesCompanyResults: document.getElementById("salesCompanyResults"),
    salesCompanyLinkCount: document.getElementById("salesCompanyLinkCount"),
    salesContactPickerField: document.getElementById("salesContactPickerField"),
    salesContactPicker: document.getElementById("salesContactPicker"),
    company: document.getElementById("company"),
    contactName: document.getElementById("contactName"),
    contactPhone: document.getElementById("contactPhone"),
    contactEmail: document.getElementById("contactEmail"),
    interest: document.getElementById("interest"),
    itemCategory: document.getElementById("itemCategory"),
    status: document.getElementById("status"),
    priority: document.getElementById("priority"),
    meetingDateField: document.getElementById("meetingDateField"),
    meetingDate: document.getElementById("meetingDate"),
    nextAction: document.getElementById("nextAction"),
    nextContactDate: document.getElementById("nextContactDate"),
    nextContactUnknown: document.getElementById("nextContactUnknown"),
    lastContactDate: document.getElementById("lastContactDate"),
    memo: document.getElementById("memo"),
    quoteStatus: document.getElementById("quoteStatus"),
    purchasePossibility: document.getElementById("purchasePossibility"),
    expectedRevenueAmount: document.getElementById("expectedRevenueAmount"),
    expectedRevenueVatIncluded: document.getElementById("expectedRevenueVatIncluded"),
    revenueAmount: document.getElementById("revenueAmount"),
    revenueAmountVatIncluded: document.getElementById("revenueAmountVatIncluded"),
    revenueType: document.getElementById("revenueType"),
    attachmentPanel: document.getElementById("attachmentPanel"),
    attachmentHint: document.getElementById("attachmentHint"),
    attachmentCount: document.getElementById("attachmentCount"),
    attachmentFileInput: document.getElementById("attachmentFileInput"),
    attachmentCategory: document.getElementById("attachmentCategory"),
    attachmentSentDate: document.getElementById("attachmentSentDate"),
    attachmentMemo: document.getElementById("attachmentMemo"),
    uploadAttachmentButton: document.getElementById("uploadAttachmentButton"),
    attachmentList: document.getElementById("attachmentList"),
    openCurrentNoteFilesButton: document.getElementById("openCurrentNoteFilesButton"),
    saveButton: document.getElementById("saveButton"),
    deleteButton: document.getElementById("deleteButton"),
    resetFormButton: document.getElementById("resetFormButton"),
    closeEditorButton: document.getElementById("closeEditorButton"),
    newNoteButton: document.getElementById("newNoteButton"),
    salesListViewButton: document.getElementById("salesListViewButton"),
    salesBoardViewButton: document.getElementById("salesBoardViewButton"),
    formTitle: document.getElementById("formTitle"),
    draftStatus: document.getElementById("draftStatus"),
    totalCount: document.getElementById("totalCount"),
    activeSalesCount: document.getElementById("activeSalesCount"),
    completedSalesCount: document.getElementById("completedSalesCount"),
    failedSalesCount: document.getElementById("failedSalesCount"),
    summaryFilters: Array.from(document.querySelectorAll(".summary-filter")),
    searchInput: document.getElementById("searchInput"),
    statusFilter: document.getElementById("statusFilter"),
    itemCategoryFilter: document.getElementById("itemCategoryFilter"),
    priorityFilter: document.getElementById("priorityFilter"),
    sortSelect: document.getElementById("sortSelect"),
    sortDirectionButton: document.getElementById("sortDirectionButton"),
    followupBoard: document.getElementById("followupBoard"),
    salesPipelineBoard: document.getElementById("salesPipelineBoard"),
    notesTableWrap: document.getElementById("notesTableWrap"),
    notesTableBody: document.getElementById("notesTableBody"),
    mobileNotesList: document.getElementById("mobileNotesList"),
    emptyState: document.getElementById("emptyState"),
    saveStatus: document.getElementById("saveStatus"),
    backupReminder: document.getElementById("backupReminder"),
    backupMenu: document.getElementById("backupMenu"),
    exportJsonButton: document.getElementById("exportJsonButton"),
    exportFullBackupButton: document.getElementById("exportFullBackupButton"),
    importJsonButton: document.getElementById("importJsonButton"),
    mergeJsonButton: document.getElementById("mergeJsonButton"),
    importFileInput: document.getElementById("importFileInput"),
    importFullBackupButton: document.getElementById("importFullBackupButton"),
    mergeFullBackupButton: document.getElementById("mergeFullBackupButton"),
    importFullBackupInput: document.getElementById("importFullBackupInput"),
    exportCsvButton: document.getElementById("exportCsvButton"),
    backupHealthButton: document.getElementById("backupHealthButton"),
    resetWorkspaceButton: document.getElementById("resetWorkspaceButton"),
    followupItemTemplate: document.getElementById("followupItemTemplate"),
    globalSearchInput: document.getElementById("globalSearchInput"),
    globalSearchClearButton: document.getElementById("globalSearchClearButton"),
    globalSearchResults: document.getElementById("globalSearchResults"),
    calendarMonthViewButton: document.getElementById("calendarMonthViewButton"),
    calendarWeekViewButton: document.getElementById("calendarWeekViewButton"),
    calendarPrevButton: document.getElementById("calendarPrevButton"),
    calendarTodayButton: document.getElementById("calendarTodayButton"),
    calendarNextButton: document.getElementById("calendarNextButton"),
    calendarTitle: document.getElementById("calendarTitle"),
    calendarGrid: document.getElementById("calendarGrid"),
    todayTaskList: document.getElementById("todayTaskList"),
    workViewButtons: Array.from(document.querySelectorAll("[data-work-view-category]")),
    companyEditorPanel: document.getElementById("companyEditorPanel"),
    companyForm: document.getElementById("companyForm"),
    companyFormTitle: document.getElementById("companyFormTitle"),
    companyRecordId: document.getElementById("companyRecordId"),
    companyName: document.getElementById("companyName"),
    companyBusinessNumber: document.getElementById("companyBusinessNumber"),
    companyRepresentative: document.getElementById("companyRepresentative"),
    companyBusinessType: document.getElementById("companyBusinessType"),
    companyStatus: document.getElementById("companyStatus"),
    companyAddress: document.getElementById("companyAddress"),
    companyMainPhone: document.getElementById("companyMainPhone"),
    companyMainEmail: document.getElementById("companyMainEmail"),
    companyContactCount: document.getElementById("companyContactCount"),
    companyContactList: document.getElementById("companyContactList"),
    addCompanyContactButton: document.getElementById("addCompanyContactButton"),
    companyMemo: document.getElementById("companyMemo"),
    openCurrentCompanyFilesButton: document.getElementById("openCurrentCompanyFilesButton"),
    newCompanyButton: document.getElementById("newCompanyButton"),
    importCompaniesButton: document.getElementById("importCompaniesButton"),
    closeCompanyEditorButton: document.getElementById("closeCompanyEditorButton"),
    saveCompanyButton: document.getElementById("saveCompanyButton"),
    deleteCompanyButton: document.getElementById("deleteCompanyButton"),
    resetCompanyButton: document.getElementById("resetCompanyButton"),
    companyListTitle: document.getElementById("companyListTitle"),
    companySearchInput: document.getElementById("companySearchInput"),
    companyStatusFilter: document.getElementById("companyStatusFilter"),
    companySortSelect: document.getElementById("companySortSelect"),
    companyList: document.getElementById("companyList"),
    accountEditorPanel: document.getElementById("accountEditorPanel"),
    accountForm: document.getElementById("accountForm"),
    accountId: document.getElementById("accountId"),
    accountFormTitle: document.getElementById("accountFormTitle"),
    accountSiteName: document.getElementById("accountSiteName"),
    accountSiteUrl: document.getElementById("accountSiteUrl"),
    accountUsername: document.getElementById("accountUsername"),
    accountPassword: document.getElementById("accountPassword"),
    accountPurpose: document.getElementById("accountPurpose"),
    accountOwner: document.getElementById("accountOwner"),
    accountCreatedDate: document.getElementById("accountCreatedDate"),
    accountPasswordChangedDate: document.getElementById("accountPasswordChangedDate"),
    accountMemo: document.getElementById("accountMemo"),
    newAccountButton: document.getElementById("newAccountButton"),
    closeAccountEditorButton: document.getElementById("closeAccountEditorButton"),
    resetAccountButton: document.getElementById("resetAccountButton"),
    saveAccountButton: document.getElementById("saveAccountButton"),
    deleteAccountButton: document.getElementById("deleteAccountButton"),
    accountSearchInput: document.getElementById("accountSearchInput"),
    accountList: document.getElementById("accountList"),
    settlementEditorPanel: document.getElementById("settlementEditorPanel"),
    settlementForm: document.getElementById("settlementForm"),
    settlementFormTitle: document.getElementById("settlementFormTitle"),
    settlementTaskId: document.getElementById("settlementTaskId"),
    settlementCompanyId: document.getElementById("settlementCompanyId"),
    settlementContactId: document.getElementById("settlementContactId"),
    settlementCompanySearch: document.getElementById("settlementCompanySearch"),
    settlementCompanyUnknown: document.getElementById("settlementCompanyUnknown"),
    settlementCompanySelected: document.getElementById("settlementCompanySelected"),
    settlementCompanyResults: document.getElementById("settlementCompanyResults"),
    settlementCompanyLinkCount: document.getElementById("settlementCompanyLinkCount"),
    settlementContactPickerField: document.getElementById("settlementContactPickerField"),
    settlementContactPicker: document.getElementById("settlementContactPicker"),
    settlementCompany: document.getElementById("settlementCompany"),
    settlementContactName: document.getElementById("settlementContactName"),
    settlementContactPhone: document.getElementById("settlementContactPhone"),
    settlementContactEmail: document.getElementById("settlementContactEmail"),
    settlementSalesLink: document.getElementById("settlementSalesLink"),
    settlementSalesLinkUnknown: document.getElementById("settlementSalesLinkUnknown"),
    settlementPaymentType: document.getElementById("settlementPaymentType"),
    settlementStatus: document.getElementById("settlementStatus"),
    settlementTotalAmountLabel: document.getElementById("settlementTotalAmountLabel"),
    settlementTotalAmountText: document.getElementById("settlementTotalAmountText"),
    settlementTotalAmount: document.getElementById("settlementTotalAmount"),
    settlementTotalAmountVatIncluded: document.getElementById("settlementTotalAmountVatIncluded"),
    settlementAdvanceAmountLabel: document.getElementById("settlementAdvanceAmountLabel"),
    settlementAdvanceAmount: document.getElementById("settlementAdvanceAmount"),
    settlementAdvanceAmountVatIncluded: document.getElementById("settlementAdvanceAmountVatIncluded"),
    settlementReceivedAmountLabel: document.getElementById("settlementReceivedAmountLabel"),
    settlementReceivedAmountText: document.getElementById("settlementReceivedAmountText"),
    settlementReceivedAmount: document.getElementById("settlementReceivedAmount"),
    settlementReceivedAmountVatIncluded: document.getElementById("settlementReceivedAmountVatIncluded"),
    settlementDeductedAmountLabel: document.getElementById("settlementDeductedAmountLabel"),
    settlementDeductedAmountText: document.getElementById("settlementDeductedAmountText"),
    settlementDeductedAmount: document.getElementById("settlementDeductedAmount"),
    settlementDeductedAmountVatIncluded: document.getElementById("settlementDeductedAmountVatIncluded"),
    settlementRemainingAmountText: document.getElementById("settlementRemainingAmountText"),
    settlementRemainingAmount: document.getElementById("settlementRemainingAmount"),
    settlementInstallmentProgressLabel: document.getElementById("settlementInstallmentProgressLabel"),
    settlementInstallmentProgressText: document.getElementById("settlementInstallmentProgressText"),
    settlementInstallmentProgress: document.getElementById("settlementInstallmentProgress"),
    settlementNextActionDate: document.getElementById("settlementNextActionDate"),
    settlementNextAction: document.getElementById("settlementNextAction"),
    settlementScheduleStartDate: document.getElementById("settlementScheduleStartDate"),
    settlementScheduleStartDateText: document.getElementById("settlementScheduleStartDateText"),
    settlementScheduleIntervalDays: document.getElementById("settlementScheduleIntervalDays"),
    settlementScheduleIntervalDaysText: document.getElementById("settlementScheduleIntervalDaysText"),
    settlementScheduleCount: document.getElementById("settlementScheduleCount"),
    settlementScheduleCountText: document.getElementById("settlementScheduleCountText"),
    settlementScheduleAmount: document.getElementById("settlementScheduleAmount"),
    settlementScheduleAmountText: document.getElementById("settlementScheduleAmountText"),
    settlementScheduleAmountVatIncluded: document.getElementById("settlementScheduleAmountVatIncluded"),
    generateSettlementScheduleButton: document.getElementById("generateSettlementScheduleButton"),
    addSettlementScheduleRowButton: document.getElementById("addSettlementScheduleRowButton"),
    syncSettlementScheduleButton: document.getElementById("syncSettlementScheduleButton"),
    settlementSchedulePaste: document.getElementById("settlementSchedulePaste"),
    settlementSchedulePasteText: document.getElementById("settlementSchedulePasteText"),
    parseSettlementScheduleButton: document.getElementById("parseSettlementScheduleButton"),
    settlementScheduleTitle: document.getElementById("settlementScheduleTitle"),
    settlementScheduleSummary: document.getElementById("settlementScheduleSummary"),
    settlementScheduleList: document.getElementById("settlementScheduleList"),
    settlementPlan: document.getElementById("settlementPlan"),
    settlementMemo: document.getElementById("settlementMemo"),
    openCurrentSettlementFilesButton: document.getElementById("openCurrentSettlementFilesButton"),
    newSettlementTaskButton: document.getElementById("newSettlementTaskButton"),
    closeSettlementEditorButton: document.getElementById("closeSettlementEditorButton"),
    saveSettlementButton: document.getElementById("saveSettlementButton"),
    deleteSettlementButton: document.getElementById("deleteSettlementButton"),
    resetSettlementButton: document.getElementById("resetSettlementButton"),
    settlementListTitle: document.getElementById("settlementListTitle"),
    settlementSearchInput: document.getElementById("settlementSearchInput"),
    settlementStatusFilter: document.getElementById("settlementStatusFilter"),
    settlementSortSelect: document.getElementById("settlementSortSelect"),
    settlementSortDirectionButton: document.getElementById("settlementSortDirectionButton"),
    settlementActiveCount: document.getElementById("settlementActiveCount"),
    settlementHoldCount: document.getElementById("settlementHoldCount"),
    settlementClosedCount: document.getElementById("settlementClosedCount"),
    settlementTaskList: document.getElementById("settlementTaskList"),
    outputEditorPanel: document.getElementById("outputEditorPanel"),
    outputForm: document.getElementById("outputForm"),
    outputFormTitle: document.getElementById("outputFormTitle"),
    outputTaskId: document.getElementById("outputTaskId"),
    outputSalesNoteId: document.getElementById("outputSalesNoteId"),
    outputCompanyId: document.getElementById("outputCompanyId"),
    outputContactId: document.getElementById("outputContactId"),
    outputCompanySearch: document.getElementById("outputCompanySearch"),
    outputCompanyUnknown: document.getElementById("outputCompanyUnknown"),
    outputCompanySelected: document.getElementById("outputCompanySelected"),
    outputCompanyResults: document.getElementById("outputCompanyResults"),
    outputCompanyLinkCount: document.getElementById("outputCompanyLinkCount"),
    outputContactPickerField: document.getElementById("outputContactPickerField"),
    outputContactPicker: document.getElementById("outputContactPicker"),
    outputCompany: document.getElementById("outputCompany"),
    outputContactName: document.getElementById("outputContactName"),
    outputContactPhone: document.getElementById("outputContactPhone"),
    outputContactEmail: document.getElementById("outputContactEmail"),
    outputStartDate: document.getElementById("outputStartDate"),
    outputEndDate: document.getElementById("outputEndDate"),
    outputIncludeWeekends: document.getElementById("outputIncludeWeekends"),
    outputStatus: document.getElementById("outputStatus"),
    outputType: document.getElementById("outputType"),
    outputPriority: document.getElementById("outputPriority"),
    outputMemo: document.getElementById("outputMemo"),
    outputSalesLinkSearch: document.getElementById("outputSalesLinkSearch"),
    outputSalesLinkSelected: document.getElementById("outputSalesLinkSelected"),
    outputSalesLinkResults: document.getElementById("outputSalesLinkResults"),
    outputSalesLinkCount: document.getElementById("outputSalesLinkCount"),
    outputSalesLinkUnknown: document.getElementById("outputSalesLinkUnknown"),
    openCurrentOutputFilesButton: document.getElementById("openCurrentOutputFilesButton"),
    newOutputTaskButton: document.getElementById("newOutputTaskButton"),
    closeOutputEditorButton: document.getElementById("closeOutputEditorButton"),
    saveOutputButton: document.getElementById("saveOutputButton"),
    deleteOutputButton: document.getElementById("deleteOutputButton"),
    resetOutputButton: document.getElementById("resetOutputButton"),
    outputListTitle: document.getElementById("outputListTitle"),
    outputSearchInput: document.getElementById("outputSearchInput"),
    outputStatusFilter: document.getElementById("outputStatusFilter"),
    outputPriorityFilter: document.getElementById("outputPriorityFilter"),
    outputSortSelect: document.getElementById("outputSortSelect"),
    outputSortDirectionButton: document.getElementById("outputSortDirectionButton"),
    outputActiveCount: document.getElementById("outputActiveCount"),
    outputHoldCount: document.getElementById("outputHoldCount"),
    outputClosedCount: document.getElementById("outputClosedCount"),
    outputTaskList: document.getElementById("outputTaskList"),
    otherEditorPanel: document.getElementById("otherEditorPanel"),
    otherForm: document.getElementById("otherForm"),
    otherFormTitle: document.getElementById("otherFormTitle"),
    otherTaskId: document.getElementById("otherTaskId"),
    otherCompanyId: document.getElementById("otherCompanyId"),
    otherContactId: document.getElementById("otherContactId"),
    otherCompanySearch: document.getElementById("otherCompanySearch"),
    otherCompanyUnknown: document.getElementById("otherCompanyUnknown"),
    otherCompanySelected: document.getElementById("otherCompanySelected"),
    otherCompanyResults: document.getElementById("otherCompanyResults"),
    otherCompanyLinkCount: document.getElementById("otherCompanyLinkCount"),
    otherContactPickerField: document.getElementById("otherContactPickerField"),
    otherContactPicker: document.getElementById("otherContactPicker"),
    otherCompany: document.getElementById("otherCompany"),
    otherContactName: document.getElementById("otherContactName"),
    otherContactPhone: document.getElementById("otherContactPhone"),
    otherContactEmail: document.getElementById("otherContactEmail"),
    otherTitle: document.getElementById("otherTitle"),
    otherCategory: document.getElementById("otherCategory"),
    otherOwner: document.getElementById("otherOwner"),
    otherStartDate: document.getElementById("otherStartDate"),
    otherEndDate: document.getElementById("otherEndDate"),
    otherIncludeWeekends: document.getElementById("otherIncludeWeekends"),
    otherStatus: document.getElementById("otherStatus"),
    otherPriority: document.getElementById("otherPriority"),
    otherMemo: document.getElementById("otherMemo"),
    openCurrentOtherFilesButton: document.getElementById("openCurrentOtherFilesButton"),
    newOtherTaskButton: document.getElementById("newOtherTaskButton"),
    closeOtherEditorButton: document.getElementById("closeOtherEditorButton"),
    saveOtherButton: document.getElementById("saveOtherButton"),
    deleteOtherButton: document.getElementById("deleteOtherButton"),
    resetOtherButton: document.getElementById("resetOtherButton"),
    otherListTitle: document.getElementById("otherListTitle"),
    otherSearchInput: document.getElementById("otherSearchInput"),
    otherStatusFilter: document.getElementById("otherStatusFilter"),
    otherPriorityFilter: document.getElementById("otherPriorityFilter"),
    otherSortSelect: document.getElementById("otherSortSelect"),
    otherSortDirectionButton: document.getElementById("otherSortDirectionButton"),
    otherActiveCount: document.getElementById("otherActiveCount"),
    otherHoldCount: document.getElementById("otherHoldCount"),
    otherClosedCount: document.getElementById("otherClosedCount"),
    otherTaskList: document.getElementById("otherTaskList")
  };

  let state = createEmptyState();
  let formSnapshot = "";
  let draftTimer = null;
  let isApplyingFormValues = false;
  let attachmentDbPromise = null;
  let attachmentPreviewUrls = [];
  let activeSummaryFilter = "all";
  let activePortal = "schedule";
  let sortDirection = "asc";
  let salesViewMode = "list";
  const workListState = {
    settlement: { mode: "active", sortDirection: "asc" },
    output: { mode: "active", sortDirection: "asc" },
    other: { mode: "active", sortDirection: "asc" }
  };
  let calendarDate = new Date();
  let calendarViewMode = "month";
  let activeFileContext = null;
  let activeCustomerContext = null;
  let activeAttachmentPreviewUrl = "";
  let activePreviewAttachmentId = "";
  let filePreviewZoom = 1;
  let zipCrcTable = null;
  let pendingJsonImportMode = "replace";
  let pendingZipImportMode = "replace";

  function createEmptyState() {
    return {
      version: APP_VERSION,
      updatedAt: getLocalTimestamp(),
      statusOptions: DEFAULT_STATUS_OPTIONS.slice(),
      companies: [],
      notes: [],
      settlementTasks: [],
      outputTasks: [],
      otherTasks: [],
      accounts: []
    };
  }

  function init() {
    state = loadState();
    renderStatusOptions();
    updateFormSnapshot();
    offerDraftRestore();
    bindEvents();
    setupEditorSections();
    updateSortDirectionButton();
    WORK_LIST_CATEGORIES.forEach(updateWorkSortDirectionButton);
    updateSettlementPaymentTypeUI();
    renderBackupReminder();
    render();
    renderAttachmentSection(null);
  }

  function setupEditorSections() {
    sectionizeForm(elements.noteForm, [
      ["업체/담당자", ["salesCompanyLinkTitle", "company", "contactName", "contactEmail"]],
      ["영업 내용", ["interest", "itemCategory", "status", "meetingDateField", "nextAction"]],
      ["일정/견적", ["nextContactDate", "quoteStatus"]],
      ["금액", ["expectedRevenueAmount", "revenueAmount"]],
      ["메모/자료", ["memo", "attachmentPanel"]]
    ]);
    sectionizeForm(elements.companyForm, [
      ["업체 기본 정보", ["companyName", "companyBusinessNumber", "companyBusinessType", "companyAddress", "companyMainPhone"]],
      ["담당자", ["companyContactsTitle"]],
      ["메모", ["companyMemo"]]
    ]);
    sectionizeForm(elements.accountForm, [
      ["계정 기본 정보", ["accountSiteName", "accountSiteUrl", "accountUsername"]],
      ["관리 정보", ["accountOwner", "accountPasswordChangedDate"]],
      ["메모", ["accountMemo"]]
    ]);
    sectionizeForm(elements.settlementForm, [
      ["업체/영업 연결", ["settlementCompanyLinkTitle", "settlementCompany", "settlementContactPhone", "settlementSalesLink"]],
      ["정산 금액", ["settlementPaymentType", "settlementTotalAmount", "settlementReceivedAmount", "settlementRemainingAmount"]],
      ["일정/회차", ["settlementNextActionDate", "settlementScheduleTitle", "settlementPlan"]],
      ["메모", ["settlementMemo"]]
    ]);
    sectionizeForm(elements.outputForm, [
      ["업체/영업 연결", ["outputCompanyLinkTitle", "outputCompany", "outputContactPhone", "outputSalesLinkTitle"]],
      ["출력 조건", ["outputStartDate", "outputIncludeWeekends", "outputStatus", "outputPriority"]],
      ["메모", ["outputMemo"]]
    ]);
    sectionizeForm(elements.otherForm, [
      ["업무/업체", ["otherTitle", "otherCompanyLinkTitle", "otherCategory"]],
      ["일정/상태", ["otherStartDate", "otherIncludeWeekends", "otherStatus", "otherPriority"]],
      ["메모", ["otherMemo"]]
    ]);
  }

  function sectionizeForm(form, groups) {
    if (!form || form.dataset.sectionized === "true") {
      return;
    }
    form.dataset.sectionized = "true";
    groups.forEach(([title, ids], index) => {
      const blocks = [];
      ids.forEach((id) => {
        const block = findDirectFormBlock(form, id);
        if (block && !blocks.includes(block)) {
          blocks.push(block);
        }
      });
      if (!blocks.length) {
        return;
      }
      const details = document.createElement("details");
      details.className = "editor-section";
      details.open = index < 2;
      const summary = document.createElement("summary");
      summary.textContent = title;
      const body = document.createElement("div");
      body.className = "editor-section-body";
      blocks[0].before(details);
      details.append(summary, body);
      blocks.forEach((block) => body.appendChild(block));
    });
  }

  function findDirectFormBlock(form, id) {
    const target = document.getElementById(id);
    if (!target || !form.contains(target)) {
      return null;
    }
    let block = target;
    while (block && block.parentElement !== form) {
      block = block.parentElement;
    }
    if (!block || block === form || block.tagName === "INPUT" && block.type === "hidden") {
      return null;
    }
    return block;
  }

  function bindEvents() {
    elements.portalTabs.forEach((button) => {
      button.addEventListener("click", () => switchPortal(button.dataset.portal));
    });
    elements.noteForm.addEventListener("submit", handleFormSubmit);
    elements.noteForm.addEventListener("input", queueDraftSave);
    elements.noteForm.addEventListener("change", queueDraftSave);
    elements.salesCompanySearch.addEventListener("input", renderSalesCompanyPicker);
    elements.salesCompanyUnknown.addEventListener("change", handleSalesCompanyUnknownChange);
    elements.salesContactPicker.addEventListener("change", handleSalesContactPickerChange);
    elements.status.addEventListener("change", handleStatusChange);
    elements.nextContactUnknown.addEventListener("change", handleNextContactUnknownChange);
    elements.resetFormButton.addEventListener("click", () => resetForm());
    elements.newNoteButton.addEventListener("click", openNewNote);
    elements.salesListViewButton.addEventListener("click", () => switchSalesView("list"));
    elements.salesBoardViewButton.addEventListener("click", () => switchSalesView("board"));
    elements.closeEditorButton.addEventListener("click", () => closeEditorPanel());
    elements.panelBackdrop.addEventListener("click", handlePanelBackdropClick);
    elements.deleteButton.addEventListener("click", handleCurrentDelete);
    elements.uploadAttachmentButton.addEventListener("click", handleAttachmentUpload);
    elements.openCurrentNoteFilesButton.addEventListener("click", () => openCurrentFormFiles("sales"));
    elements.closeFileDrawerButton.addEventListener("click", closeFileDrawer);
    elements.fileDrawerFileInput.addEventListener("change", () => renderSelectedFileMemoInputs(elements.fileDrawerFileInput, elements.fileDrawerSelectedFiles));
    elements.fileDrawerUploadButton.addEventListener("click", handleFileDrawerUpload);
    elements.fileDrawerClearSelectionButton.addEventListener("click", clearFileDrawerSelection);
    elements.closeCustomerDrawerButton.addEventListener("click", closeCustomerDrawer);
    elements.closeFilePreviewButton.addEventListener("click", closeAttachmentPreview);
    elements.filePreviewZoomOutButton.addEventListener("click", () => setFilePreviewZoom(filePreviewZoom - 0.25));
    elements.filePreviewZoomResetButton.addEventListener("click", () => setFilePreviewZoom(1));
    elements.filePreviewZoomInButton.addEventListener("click", () => setFilePreviewZoom(filePreviewZoom + 0.25));
    elements.filePreviewDownloadButton.addEventListener("click", () => {
      if (activePreviewAttachmentId) {
        downloadAttachment(activePreviewAttachmentId);
      }
    });
    elements.globalSearchInput.addEventListener("input", renderGlobalSearchResults);
    elements.globalSearchClearButton.addEventListener("click", clearGlobalSearch);
    elements.summaryFilters.forEach((button) => {
      button.addEventListener("click", () => handleSummaryFilterClick(button.dataset.summaryFilter));
    });
    window.addEventListener("keydown", handleGlobalKeydown);
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleDocumentClick);

    [
      elements.searchInput,
      elements.statusFilter,
      elements.itemCategoryFilter,
      elements.priorityFilter
    ].forEach((element) => {
      element.addEventListener("input", render);
      element.addEventListener("change", render);
    });
    elements.sortSelect.addEventListener("change", () => {
      updateSortDirectionButton();
      render();
    });
    elements.sortDirectionButton.addEventListener("click", toggleSortDirection);

    elements.exportJsonButton.addEventListener("click", () => {
      closeBackupMenu();
      exportJsonBackup();
    });
    elements.exportFullBackupButton.addEventListener("click", () => {
      closeBackupMenu();
      exportFullBackupZip();
    });
    elements.importJsonButton.addEventListener("click", () => {
      closeBackupMenu();
      pendingJsonImportMode = "replace";
      elements.importFileInput.value = "";
      elements.importFileInput.click();
    });
    elements.mergeJsonButton.addEventListener("click", () => {
      closeBackupMenu();
      pendingJsonImportMode = "merge";
      elements.importFileInput.value = "";
      elements.importFileInput.click();
    });
    elements.importFileInput.addEventListener("change", handleImportFile);
    elements.importFullBackupButton.addEventListener("click", () => {
      closeBackupMenu();
      pendingZipImportMode = "replace";
      elements.importFullBackupInput.value = "";
      elements.importFullBackupInput.click();
    });
    elements.mergeFullBackupButton.addEventListener("click", () => {
      closeBackupMenu();
      pendingZipImportMode = "merge";
      elements.importFullBackupInput.value = "";
      elements.importFullBackupInput.click();
    });
    elements.importFullBackupInput.addEventListener("change", handleImportFullBackupFile);
    elements.exportCsvButton.addEventListener("click", () => {
      closeBackupMenu();
      exportCsv();
    });
    elements.backupHealthButton.addEventListener("click", handleBackupHealthCheck);
    elements.resetWorkspaceButton.addEventListener("click", handleWorkspaceReset);
    elements.calendarMonthViewButton.addEventListener("click", () => switchCalendarView("month"));
    elements.calendarWeekViewButton.addEventListener("click", () => switchCalendarView("week"));
    elements.calendarPrevButton.addEventListener("click", () => moveCalendar(-1));
    elements.calendarTodayButton.addEventListener("click", () => {
      calendarDate = new Date();
      renderCalendar();
    });
    elements.calendarNextButton.addEventListener("click", () => moveCalendar(1));
    elements.companyForm.addEventListener("submit", handleCompanySubmit);
    elements.newCompanyButton.addEventListener("click", openNewCompany);
    elements.importCompaniesButton.addEventListener("click", handleImportCompaniesFromWork);
    elements.closeCompanyEditorButton.addEventListener("click", () => closeCompanyEditorPanel());
    elements.resetCompanyButton.addEventListener("click", resetCompanyForm);
    elements.deleteCompanyButton.addEventListener("click", handleCompanyDelete);
    elements.addCompanyContactButton.addEventListener("click", () => appendCompanyContactRow());
    elements.openCurrentCompanyFilesButton.addEventListener("click", () => openCurrentFormFiles("company"));
    [elements.companySearchInput, elements.companyStatusFilter, elements.companySortSelect].forEach((element) => {
      element.addEventListener("input", renderCompanies);
      element.addEventListener("change", renderCompanies);
    });
    elements.accountForm.addEventListener("submit", handleAccountSubmit);
    elements.newAccountButton.addEventListener("click", openNewAccount);
    elements.closeAccountEditorButton.addEventListener("click", () => closeAccountEditorPanel());
    elements.resetAccountButton.addEventListener("click", resetAccountForm);
    elements.deleteAccountButton.addEventListener("click", handleAccountDelete);
    elements.accountSearchInput.addEventListener("input", renderAccounts);
    elements.settlementForm.addEventListener("submit", handleSettlementSubmit);
    elements.settlementCompanySearch.addEventListener("input", () => renderWorkCompanyPicker("settlement"));
    elements.settlementCompanyUnknown.addEventListener("change", () => handleWorkCompanyUnknownChange("settlement"));
    elements.settlementContactPicker.addEventListener("change", () => handleWorkContactPickerChange("settlement"));
    elements.settlementSalesLink.addEventListener("change", handleSettlementSalesLinkChange);
    elements.settlementSalesLinkUnknown.addEventListener("change", handleSettlementSalesLinkUnknownChange);
    elements.settlementPaymentType.addEventListener("change", () => {
      updateSettlementPaymentTypeUI();
      syncSettlementDerivedFieldsFromSchedule();
    });
    elements.newSettlementTaskButton.addEventListener("click", openNewSettlementTask);
    elements.closeSettlementEditorButton.addEventListener("click", () => closeSettlementEditorPanel());
    elements.openCurrentSettlementFilesButton.addEventListener("click", () => openCurrentFormFiles("settlement"));
    elements.resetSettlementButton.addEventListener("click", resetSettlementForm);
    elements.deleteSettlementButton.addEventListener("click", handleSettlementDelete);
    [
      elements.settlementTotalAmount,
      elements.settlementReceivedAmount,
      elements.settlementDeductedAmount
    ].forEach((element) => element.addEventListener("input", () => {
      updateSettlementRemainingPreview();
      updateSettlementScheduleSummary();
    }));
    elements.generateSettlementScheduleButton.addEventListener("click", handleGenerateSettlementSchedule);
    elements.addSettlementScheduleRowButton.addEventListener("click", () => appendSettlementScheduleRow());
    elements.syncSettlementScheduleButton.addEventListener("click", syncSettlementDerivedFieldsFromSchedule);
    elements.parseSettlementScheduleButton.addEventListener("click", handleParseSettlementSchedule);
    elements.outputForm.addEventListener("submit", handleOutputSubmit);
    elements.outputCompanySearch.addEventListener("input", () => renderWorkCompanyPicker("output"));
    elements.outputCompanyUnknown.addEventListener("change", () => handleWorkCompanyUnknownChange("output"));
    elements.outputContactPicker.addEventListener("change", () => handleWorkContactPickerChange("output"));
    elements.outputSalesLinkSearch.addEventListener("input", renderOutputSalesLinkPicker);
    elements.outputSalesLinkUnknown.addEventListener("change", handleOutputSalesLinkUnknownChange);
    elements.newOutputTaskButton.addEventListener("click", openNewOutputTask);
    elements.closeOutputEditorButton.addEventListener("click", () => closeOutputEditorPanel());
    elements.openCurrentOutputFilesButton.addEventListener("click", () => openCurrentFormFiles("output"));
    elements.resetOutputButton.addEventListener("click", resetOutputForm);
    elements.deleteOutputButton.addEventListener("click", handleOutputDelete);
    elements.otherForm.addEventListener("submit", handleOtherSubmit);
    elements.otherCompanySearch.addEventListener("input", () => renderWorkCompanyPicker("other"));
    elements.otherCompanyUnknown.addEventListener("change", () => handleWorkCompanyUnknownChange("other"));
    elements.otherContactPicker.addEventListener("change", () => handleWorkContactPickerChange("other"));
    elements.newOtherTaskButton.addEventListener("click", openNewOtherTask);
    elements.closeOtherEditorButton.addEventListener("click", () => closeOtherEditorPanel());
    elements.openCurrentOtherFilesButton.addEventListener("click", () => openCurrentFormFiles("other"));
    elements.resetOtherButton.addEventListener("click", resetOtherForm);
    elements.deleteOtherButton.addEventListener("click", handleOtherDelete);
    bindWorkExplorerEvents();
  }

  function toggleSortDirection() {
    if (elements.sortDirectionButton.disabled) {
      return;
    }

    sortDirection = sortDirection === "asc" ? "desc" : "asc";
    updateSortDirectionButton();
    render();
  }

  function updateSortDirectionButton() {
    const sortValue = elements.sortSelect.value;
    const isPrioritySort = sortValue === "priority";

    elements.sortDirectionButton.disabled = isPrioritySort;
    elements.sortDirectionButton.textContent = sortDirection === "asc" ? "↑" : "↓";

    if (isPrioritySort) {
      elements.sortDirectionButton.textContent = "↓";
      elements.sortDirectionButton.title = "중요도순은 최근 수정 우선 고정";
      elements.sortDirectionButton.setAttribute("aria-label", "중요도순은 같은 중요도에서 최근 수정 우선으로 고정됩니다.");
      return;
    }

    const directionLabel = getSortDirectionLabel(sortValue, sortDirection);
    elements.sortDirectionButton.title = directionLabel;
    elements.sortDirectionButton.setAttribute("aria-label", `정렬 방향: ${directionLabel}. 누르면 방향이 바뀝니다.`);
  }

  function getSortDirectionLabel(sortValue, direction) {
    if (sortValue === "company") {
      return direction === "asc" ? "가나다순" : "역순";
    }

    return direction === "asc" ? "빠른순" : "느린순";
  }

  function bindWorkExplorerEvents() {
    elements.workViewButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const category = button.dataset.workViewCategory;
        const mode = button.dataset.workViewMode;
        if (!workListState[category] || !mode) {
          return;
        }
        workListState[category].mode = mode;
        const controls = getWorkExplorerElements(category);
        if (controls.statusFilter) {
          controls.statusFilter.value = "all";
        }
        if (controls.priorityFilter) {
          controls.priorityFilter.value = "all";
        }
        renderWorkTasksForCategory(category);
      });
    });

    WORK_LIST_CATEGORIES.forEach((category) => {
      const controls = getWorkExplorerElements(category);
      [controls.searchInput, controls.statusFilter, controls.priorityFilter].forEach((element) => {
        if (element) {
          element.addEventListener("input", () => renderWorkTasksForCategory(category));
          element.addEventListener("change", () => renderWorkTasksForCategory(category));
        }
      });

      if (controls.sortSelect) {
        controls.sortSelect.addEventListener("change", () => {
          updateWorkSortDirectionButton(category);
          renderWorkTasksForCategory(category);
        });
      }

      if (controls.sortDirectionButton) {
        controls.sortDirectionButton.addEventListener("click", () => {
          workListState[category].sortDirection = workListState[category].sortDirection === "asc" ? "desc" : "asc";
          updateWorkSortDirectionButton(category);
          renderWorkTasksForCategory(category);
        });
      }
    });
  }

  function getWorkExplorerElements(category) {
    if (category === "settlement") {
      return {
        listTitle: elements.settlementListTitle,
        searchInput: elements.settlementSearchInput,
        statusFilter: elements.settlementStatusFilter,
        priorityFilter: null,
        sortSelect: elements.settlementSortSelect,
        sortDirectionButton: elements.settlementSortDirectionButton,
        activeCount: elements.settlementActiveCount,
        holdCount: elements.settlementHoldCount,
        closedCount: elements.settlementClosedCount
      };
    }
    if (category === "output") {
      return {
        listTitle: elements.outputListTitle,
        searchInput: elements.outputSearchInput,
        statusFilter: elements.outputStatusFilter,
        priorityFilter: elements.outputPriorityFilter,
        sortSelect: elements.outputSortSelect,
        sortDirectionButton: elements.outputSortDirectionButton,
        activeCount: elements.outputActiveCount,
        holdCount: elements.outputHoldCount,
        closedCount: elements.outputClosedCount
      };
    }
    return {
      listTitle: elements.otherListTitle,
      searchInput: elements.otherSearchInput,
      statusFilter: elements.otherStatusFilter,
      priorityFilter: elements.otherPriorityFilter,
      sortSelect: elements.otherSortSelect,
      sortDirectionButton: elements.otherSortDirectionButton,
      activeCount: elements.otherActiveCount,
      holdCount: elements.otherHoldCount,
      closedCount: elements.otherClosedCount
    };
  }

  function updateWorkSortDirectionButton(category) {
    const controls = getWorkExplorerElements(category);
    if (!controls.sortDirectionButton || !controls.sortSelect) {
      return;
    }

    const direction = workListState[category].sortDirection;
    const label = getWorkSortDirectionLabel(controls.sortSelect.value, direction);
    controls.sortDirectionButton.textContent = direction === "asc" ? "↑" : "↓";
    controls.sortDirectionButton.title = label;
    controls.sortDirectionButton.setAttribute("aria-label", `정렬 방향: ${label}. 누르면 방향이 바뀝니다.`);
  }

  function getWorkSortDirectionLabel(sortValue, direction) {
    if (["company", "title", "status"].includes(sortValue)) {
      return direction === "asc" ? "가나다순" : "역순";
    }
    if (sortValue === "updated") {
      return direction === "asc" ? "오래된순" : "최근순";
    }
    if (sortValue === "priority") {
      return direction === "asc" ? "높은순" : "낮은순";
    }
    return direction === "asc" ? "빠른순" : "느린순";
  }

  function renderWorkTasksForCategory(category) {
    if (category === "settlement") {
      renderSettlementTasks();
      return;
    }
    if (category === "output") {
      renderOutputTasks();
      return;
    }
    renderOtherTasks();
  }

  function switchPortal(portalName) {
    activePortal = portalName || "sales";
    elements.portalTabs.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.portal === activePortal);
    });
    elements.portalViews.forEach((view) => {
      view.classList.toggle("is-active", view.id === `${activePortal}Portal`);
    });
    if (activePortal === "schedule") {
      renderCalendar();
    }
  }

  function handleDocumentClick(event) {
    if (elements.backupMenu.open && !elements.backupMenu.contains(event.target)) {
      closeBackupMenu();
    }
  }

  function closeBackupMenu() {
    elements.backupMenu.open = false;
  }

  async function handleWorkspaceReset() {
    closeBackupMenu();
    const ok = confirm("전체 메모장을 초기화할까요?\n\n영업, 정산, 출력, 기타 업무와 관련 파일 원본이 이 브라우저에서 모두 삭제됩니다.\n필요한 자료가 있으면 먼저 전체 백업을 만들어 주세요.\n\n계속하려면 확인을 누르세요.");
    if (!ok) {
      return;
    }

    elements.resetWorkspaceButton.disabled = true;
    elements.resetWorkspaceButton.textContent = "초기화 중";

    try {
      state = createEmptyState();
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(TEMP_IMPORT_BACKUP_KEY);
      localStorage.removeItem(LAST_BACKUP_KEY);
      await clearAttachmentStore();

      if (!saveState()) {
        return;
      }

      activeSummaryFilter = "all";
      elements.searchInput.value = "";
      elements.itemCategoryFilter.value = "all";
      elements.priorityFilter.value = "all";
      elements.companySearchInput.value = "";
      elements.companyStatusFilter.value = "all";
      elements.companySortSelect.value = "name";
      elements.accountSearchInput.value = "";
      elements.sortSelect.value = "priority";
      sortDirection = "asc";
      updateSortDirectionButton();
      renderStatusOptions();
      elements.statusFilter.value = "all";
      resetForm({ silent: true });
      resetCompanyForm();
      resetAccountForm();
      resetSettlementForm();
      resetOutputForm();
      resetOtherForm();
      hideEditorPanel();
      closeCompanyEditorPanel({ force: true });
      closeAccountEditorPanel({ force: true });
      closeSettlementEditorPanel({ force: true });
      closeOutputEditorPanel({ force: true });
      closeOtherEditorPanel({ force: true });
      closeCompanyEditorPanel({ force: true });
      closeFileDrawer();
      closeCustomerDrawer();
      closeAttachmentPreview();
      renderBackupReminder();
      renderAttachmentSection(null);
      render();
      setSaveStatus("전체 메모장이 초기화됐습니다.", false);
      alert("전체 메모장을 초기화했습니다.");
    } catch (error) {
      console.error(error);
      alert(`전체 메모장을 초기화하지 못했습니다.\n${error.message || error}`);
    } finally {
      elements.resetWorkspaceButton.disabled = false;
      elements.resetWorkspaceButton.textContent = "전체 메모장 초기화";
    }
  }

  function openEditorPanel() {
    elements.editorPanel.classList.remove("hidden");
    syncOverlayState();
  }

  function hideEditorPanel() {
    elements.editorPanel.classList.add("hidden");
    syncOverlayState();
  }

  function syncOverlayState() {
    const hasOpenOverlay = !elements.editorPanel.classList.contains("hidden")
      || !elements.settlementEditorPanel.classList.contains("hidden")
      || !elements.outputEditorPanel.classList.contains("hidden")
      || !elements.otherEditorPanel.classList.contains("hidden")
      || !elements.companyEditorPanel.classList.contains("hidden")
      || !elements.accountEditorPanel.classList.contains("hidden")
      || !elements.fileDrawer.classList.contains("hidden")
      || !elements.customerDrawer.classList.contains("hidden")
      || !elements.filePreviewPanel.classList.contains("hidden");
    elements.panelBackdrop.classList.toggle("hidden", !hasOpenOverlay);
    document.body.classList.toggle("editor-open", hasOpenOverlay);
  }

  function handlePanelBackdropClick() {
    if (isAttachmentPreviewOpen()) {
      closeAttachmentPreview();
      return;
    }
    if (isFileDrawerOpen()) {
      closeFileDrawer();
      return;
    }
    if (isCustomerDrawerOpen()) {
      closeCustomerDrawer();
      return;
    }
    if (isCompanyEditorOpen()) {
      closeCompanyEditorPanel();
      return;
    }
    if (isAccountEditorOpen()) {
      closeAccountEditorPanel();
      return;
    }
    if (isSettlementEditorOpen()) {
      closeSettlementEditorPanel();
      return;
    }
    if (isOutputEditorOpen()) {
      closeOutputEditorPanel();
      return;
    }
    if (isOtherEditorOpen()) {
      closeOtherEditorPanel();
      return;
    }
    closeEditorPanel();
  }

  function isFileDrawerOpen() {
    return !elements.fileDrawer.classList.contains("hidden");
  }

  function isCustomerDrawerOpen() {
    return !elements.customerDrawer.classList.contains("hidden");
  }

  function isAttachmentPreviewOpen() {
    return !elements.filePreviewPanel.classList.contains("hidden");
  }

  function isSalesEditorOpen() {
    return !elements.editorPanel.classList.contains("hidden");
  }

  function isCompanyEditorOpen() {
    return !elements.companyEditorPanel.classList.contains("hidden");
  }

  function isAccountEditorOpen() {
    return !elements.accountEditorPanel.classList.contains("hidden");
  }

  function isSettlementEditorOpen() {
    return !elements.settlementEditorPanel.classList.contains("hidden");
  }

  function isOutputEditorOpen() {
    return !elements.outputEditorPanel.classList.contains("hidden");
  }

  function isOtherEditorOpen() {
    return !elements.otherEditorPanel.classList.contains("hidden");
  }

  function closeEditorPanel(options) {
    const config = options || {};
    if (!config.force && hasUnsavedFormChanges() && !confirm("저장되지 않은 작성 내용이 있습니다. 닫을까요?")) {
      return;
    }

    resetForm({ silent: true });
    hideEditorPanel();
  }

  function openNewNote() {
    if (hasUnsavedFormChanges() && !confirm("저장되지 않은 작성 내용을 지우고 새 메모를 작성할까요?")) {
      return;
    }

    resetForm({ silent: true });
    openEditorPanel();
    elements.salesCompanySearch.focus();
  }

  function openSettlementEditorPanel() {
    elements.settlementEditorPanel.classList.remove("hidden");
    syncOverlayState();
  }

  function hideSettlementEditorPanel() {
    elements.settlementEditorPanel.classList.add("hidden");
    syncOverlayState();
  }

  function closeSettlementEditorPanel(options) {
    const config = options || {};
    if (!config.force && !elements.settlementTaskId.value && hasSettlementFormContent() && !confirm("저장되지 않은 정산 업무 작성 내용이 있습니다. 닫을까요?")) {
      return;
    }

    resetSettlementForm();
    hideSettlementEditorPanel();
  }

  function openNewSettlementTask() {
    resetSettlementForm();
    switchPortal("settlement");
    openSettlementEditorPanel();
    elements.settlementCompanySearch.focus();
  }

  function hasSettlementFormContent() {
    return [
      elements.settlementCompany.value,
      elements.settlementCompanyId.value,
      elements.settlementCompanyUnknown.checked ? "미정" : "",
      elements.settlementContactName.value,
      elements.settlementContactPhone.value,
      elements.settlementContactEmail.value,
      elements.settlementSalesLink.value,
      elements.settlementSalesLinkUnknown.checked ? "영업건 미정" : "",
      elements.settlementTotalAmount.value,
      elements.settlementTotalAmountVatIncluded.checked ? "vat" : "",
      elements.settlementAdvanceAmount.value,
      elements.settlementAdvanceAmountVatIncluded.checked ? "vat" : "",
      elements.settlementReceivedAmount.value,
      elements.settlementReceivedAmountVatIncluded.checked ? "vat" : "",
      elements.settlementDeductedAmount.value,
      elements.settlementDeductedAmountVatIncluded.checked ? "vat" : "",
      elements.settlementInstallmentProgress.value,
      elements.settlementNextActionDate.value,
      elements.settlementNextAction.value,
      elements.settlementPlan.value,
      elements.settlementMemo.value,
      elements.settlementScheduleAmountVatIncluded.checked ? "vat" : ""
    ].some((value) => clean(value)) || getSettlementScheduleRowsFromDom().length > 0;
  }

  function openOutputEditorPanel() {
    elements.outputEditorPanel.classList.remove("hidden");
    syncOverlayState();
  }

  function hideOutputEditorPanel() {
    elements.outputEditorPanel.classList.add("hidden");
    syncOverlayState();
  }

  function closeOutputEditorPanel(options) {
    const config = options || {};
    if (!config.force && !elements.outputTaskId.value && hasOutputFormContent() && !confirm("저장되지 않은 출력 업무 작성 내용이 있습니다. 닫을까요?")) {
      return;
    }

    resetOutputForm();
    hideOutputEditorPanel();
  }

  function openNewOutputTask() {
    resetOutputForm();
    switchPortal("output");
    openOutputEditorPanel();
    elements.outputCompanySearch.focus();
  }

  function hasOutputFormContent() {
    const hasCustomDeadline = !isDefaultDeadlineRange(
      elements.outputStartDate.value,
      elements.outputEndDate.value,
      elements.outputIncludeWeekends.checked
    );
    return [
      elements.outputCompany.value,
      elements.outputCompanyId.value,
      elements.outputCompanyUnknown.checked ? "미정" : "",
      elements.outputContactName.value,
      elements.outputContactPhone.value,
      elements.outputContactEmail.value,
      elements.outputSalesNoteId.value,
      elements.outputSalesLinkUnknown.checked ? "영업건 미정" : "",
      hasCustomDeadline ? elements.outputStartDate.value : "",
      hasCustomDeadline ? elements.outputEndDate.value : "",
      elements.outputType.value,
      elements.outputMemo.value
    ].some((value) => clean(value));
  }

  function openOtherEditorPanel() {
    elements.otherEditorPanel.classList.remove("hidden");
    syncOverlayState();
  }

  function hideOtherEditorPanel() {
    elements.otherEditorPanel.classList.add("hidden");
    syncOverlayState();
  }

  function closeOtherEditorPanel(options) {
    const config = options || {};
    if (!config.force && !elements.otherTaskId.value && hasOtherFormContent() && !confirm("저장되지 않은 기타 업무 작성 내용이 있습니다. 닫을까요?")) {
      return;
    }

    resetOtherForm();
    hideOtherEditorPanel();
  }

  function openNewOtherTask() {
    resetOtherForm();
    switchPortal("other");
    openOtherEditorPanel();
    elements.otherTitle.focus();
  }

  function hasOtherFormContent() {
    const hasCustomDeadline = !isDefaultDeadlineRange(
      elements.otherStartDate.value,
      elements.otherEndDate.value,
      elements.otherIncludeWeekends.checked
    );
    return [
      elements.otherTitle.value,
      elements.otherCompany.value,
      elements.otherCompanyId.value,
      elements.otherCompanyUnknown.checked ? "미정" : "",
      elements.otherContactName.value,
      elements.otherContactPhone.value,
      elements.otherContactEmail.value,
      elements.otherCategory.value,
      elements.otherOwner.value,
      hasCustomDeadline ? elements.otherStartDate.value : "",
      hasCustomDeadline ? elements.otherEndDate.value : "",
      elements.otherPriority.value === "보통" ? "" : elements.otherPriority.value,
      elements.otherMemo.value
    ].some((value) => clean(value));
  }

  function isDefaultDeadlineRange(startDate, endDate, includeWeekends) {
    const today = getTodayDateString();
    return clean(startDate) === today && clean(endDate) === today && !includeWeekends;
  }

  function handleGlobalKeydown(event) {
    if (event.key !== "Escape") {
      return;
    }
    if (isAttachmentPreviewOpen()) {
      closeAttachmentPreview();
      return;
    }
    if (isFileDrawerOpen()) {
      closeFileDrawer();
      return;
    }
    if (isCustomerDrawerOpen()) {
      closeCustomerDrawer();
      return;
    }
    if (isCompanyEditorOpen()) {
      closeCompanyEditorPanel();
      return;
    }
    if (isAccountEditorOpen()) {
      closeAccountEditorPanel();
      return;
    }
    if (isSettlementEditorOpen()) {
      closeSettlementEditorPanel();
      return;
    }
    if (isOutputEditorOpen()) {
      closeOutputEditorPanel();
      return;
    }
    if (isOtherEditorOpen()) {
      closeOtherEditorPanel();
      return;
    }
    if (!elements.editorPanel.classList.contains("hidden")) {
      closeEditorPanel();
    }
  }

  function handleSummaryFilterClick(filterName) {
    activeSummaryFilter = filterName || "all";
    render();
  }

  function loadState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return createEmptyState();
      }

      const parsed = JSON.parse(stored);
      return normalizeState(parsed);
    } catch (error) {
      console.error(error);
      setSaveStatus("저장 데이터를 읽지 못했습니다.", true);
      return createEmptyState();
    }
  }

  function normalizeState(data) {
    const nextState = createEmptyState();
    nextState.version = typeof data.version === "string" ? data.version : APP_VERSION;
    nextState.updatedAt = data.updatedAt || getLocalTimestamp();
    nextState.statusOptions = normalizeSalesStatusOptions(data.statusOptions);
    nextState.companies = Array.isArray(data.companies) ? data.companies.map(normalizeCompany).filter(Boolean) : [];
    nextState.notes = Array.isArray(data.notes) ? data.notes.map(normalizeNote) : [];
    nextState.settlementTasks = Array.isArray(data.settlementTasks) ? data.settlementTasks.map(normalizeSettlementTask) : [];
    nextState.outputTasks = Array.isArray(data.outputTasks) ? data.outputTasks.map(normalizeOutputTask) : [];
    nextState.otherTasks = Array.isArray(data.otherTasks) ? data.otherTasks.map(normalizeOtherTask) : [];
    nextState.accounts = Array.isArray(data.accounts) ? data.accounts.map(normalizeAccount).filter(Boolean) : [];
    linkCompanyIdsByName(nextState);
    return nextState;
  }

  function normalizeNote(note) {
    const now = getLocalTimestamp();
    const legacyContact = splitLegacyContactInfo(note.contactInfo);
    const nextContactUnknown = Boolean(note.nextContactUnknown) || clean(note.nextContactDate) === "";
    const expectedRevenueAmount = normalizeAmountValue(note.expectedRevenueAmount);
    const revenueAmount = normalizeAmountValue(note.revenueAmount);
    const expenseAmount = normalizeAmountValue(note.expenseAmount);
    return {
      id: note.id || createId(),
      companyId: clean(note.companyId),
      contactId: clean(note.contactId),
      companyUnknown: Boolean(note.companyUnknown),
      company: clean(note.company),
      contactName: clean(note.contactName),
      contactPhone: clean(note.contactPhone) || legacyContact.phone,
      contactEmail: clean(note.contactEmail) || legacyContact.email,
      interest: clean(note.interest),
      itemCategory: normalizeSalesItemCategory(note.itemCategory),
      status: normalizeSalesStatus(note.status),
      priority: clean(note.priority) || "보통",
      meetingDate: normalizeSalesStatus(note.status) === "미팅 예정" ? clean(note.meetingDate) : "",
      nextAction: clean(note.nextAction),
      nextContactDate: clean(note.nextContactDate),
      nextContactUnknown,
      lastContactDate: clean(note.lastContactDate),
      memo: clean(note.memo),
      quoteStatus: clean(note.quoteStatus),
      purchasePossibility: clean(note.purchasePossibility),
      expectedRevenueAmount,
      expectedRevenueVatIncluded: Boolean(note.expectedRevenueVatIncluded),
      revenueAmount,
      revenueAmountVatIncluded: Boolean(note.revenueAmountVatIncluded),
      revenueType: clean(note.revenueType),
      expenseAmount,
      marginRate: calculateMarginRateValue(revenueAmount, expenseAmount),
      attachments: Array.isArray(note.attachments) ? note.attachments.map(normalizeAttachmentMeta).filter(Boolean) : [],
      history: normalizeHistoryEntries(note.history),
      createdAt: note.createdAt || now,
      updatedAt: note.updatedAt || now
    };
  }

  function normalizeSalesItemCategory(value) {
    const category = clean(value);
    return SALES_ITEM_CATEGORY_OPTIONS.includes(category) ? category : "";
  }

  function normalizeCompany(company) {
    if (!company) {
      return null;
    }
    const now = getLocalTimestamp();
    const id = clean(company.id) || createId().replace("note_", "company_");
    const contacts = Array.isArray(company.contacts)
      ? company.contacts.map(normalizeCompanyContact).filter(Boolean)
      : [];
    ensurePrimaryCompanyContact(contacts);
    return {
      id,
      name: clean(company.name || company.company),
      businessNumber: clean(company.businessNumber),
      representative: clean(company.representative),
      businessType: clean(company.businessType),
      status: clean(company.status) || "검토중",
      address: clean(company.address),
      mainPhone: clean(company.mainPhone || company.phone),
      mainEmail: clean(company.mainEmail || company.email),
      memo: clean(company.memo),
      contacts,
      attachments: Array.isArray(company.attachments) ? company.attachments.map(normalizeAttachmentMeta).filter(Boolean) : [],
      history: normalizeHistoryEntries(company.history),
      createdAt: company.createdAt || now,
      updatedAt: company.updatedAt || now
    };
  }

  function normalizeCompanyContact(contact) {
    if (!contact) {
      return null;
    }
    const hasValue = [
      contact.name,
      contact.department,
      contact.title,
      contact.phone,
      contact.email,
      contact.memo
    ].some((value) => clean(value));
    if (!hasValue) {
      return null;
    }
    return {
      id: clean(contact.id) || createId().replace("note_", "contact_"),
      name: clean(contact.name),
      department: clean(contact.department),
      title: clean(contact.title),
      phone: clean(contact.phone),
      email: clean(contact.email),
      memo: clean(contact.memo),
      isPrimary: Boolean(contact.isPrimary)
    };
  }

  function ensurePrimaryCompanyContact(contacts) {
    const items = Array.isArray(contacts) ? contacts : [];
    if (!items.length) {
      return;
    }
    let foundPrimary = false;
    items.forEach((contact) => {
      if (contact.isPrimary && !foundPrimary) {
        foundPrimary = true;
      } else {
        contact.isPrimary = false;
      }
    });
    if (!foundPrimary) {
      items[0].isPrimary = true;
    }
  }

  function linkCompanyIdsByName(data) {
    const companies = Array.isArray(data.companies) ? data.companies : [];
    const byKey = new Map(companies.map((company) => [normalizeCustomerKey(company.name), company]).filter(([key]) => Boolean(key)));
    [
      ...(Array.isArray(data.notes) ? data.notes : []),
      ...(Array.isArray(data.settlementTasks) ? data.settlementTasks : []),
      ...(Array.isArray(data.outputTasks) ? data.outputTasks : []),
      ...(Array.isArray(data.otherTasks) ? data.otherTasks : [])
    ].forEach((item) => {
      if (!item || item.companyId || item.companyUnknown) {
        return;
      }
      const company = byKey.get(normalizeCustomerKey(item.company));
      if (!company) {
        return;
      }
      item.companyId = company.id;
      const contact = findCompanyContactForWorkItem(company, item);
      if (contact) {
        item.contactId = contact.id;
      }
    });
  }

  function normalizeSalesStatus(value) {
    const status = clean(value);
    return SALES_STATUS_RENAMES[status] || status || DEFAULT_STATUS_OPTIONS[0];
  }

  function normalizeSalesStatusOptions(options) {
    const incoming = Array.isArray(options) && options.length ? options : DEFAULT_STATUS_OPTIONS;
    const seen = new Set();
    const extra = [];
    incoming.forEach((option) => {
      const value = normalizeSalesStatus(option);
      if (value && !DEFAULT_STATUS_OPTIONS.includes(value) && !seen.has(value)) {
        seen.add(value);
        extra.push(value);
      }
    });
    return DEFAULT_STATUS_OPTIONS.concat(extra);
  }

  function normalizeAttachmentMeta(attachment) {
    if (!attachment || !attachment.id) {
      return null;
    }

    return {
      id: attachment.id,
      noteId: attachment.noteId || "",
      fileName: clean(attachment.fileName),
      fileType: clean(attachment.fileType),
      fileSize: Number(attachment.fileSize) || 0,
      category: clean(attachment.category) || "기타",
      sentDate: clean(attachment.sentDate),
      memo: clean(attachment.memo),
      uploadedAt: attachment.uploadedAt || getLocalTimestamp()
    };
  }

  function normalizeSettlementTask(task) {
    const now = getLocalTimestamp();
    const paymentType = normalizeSettlementPaymentType(task.paymentType);
    const totalAmount = normalizeAmountValue(task.totalAmount) || (
      paymentType === SETTLEMENT_PAYMENT_TYPE_ADVANCE ? normalizeAmountValue(task.advanceAmount) : ""
    );
    return {
      id: task.id || createId().replace("note_", "settlement_"),
      companyId: clean(task.companyId),
      contactId: clean(task.contactId),
      companyUnknown: Boolean(task.companyUnknown),
      company: clean(task.company),
      contactName: clean(task.contactName),
      contactPhone: clean(task.contactPhone),
      contactEmail: clean(task.contactEmail),
      salesNoteId: clean(task.salesLinkUnknown) ? "" : clean(task.salesNoteId),
      salesLinkUnknown: Boolean(task.salesLinkUnknown),
      paymentType,
      status: normalizeSettlementStatus(task.status),
      totalAmount,
      totalAmountVatIncluded: Boolean(task.totalAmountVatIncluded),
      advanceAmount: normalizeAmountValue(task.advanceAmount),
      advanceAmountVatIncluded: Boolean(task.advanceAmountVatIncluded),
      receivedAmount: normalizeAmountValue(task.receivedAmount),
      receivedAmountVatIncluded: Boolean(task.receivedAmountVatIncluded),
      deductedAmount: normalizeAmountValue(task.deductedAmount),
      deductedAmountVatIncluded: Boolean(task.deductedAmountVatIncluded),
      installmentProgress: clean(task.installmentProgress),
      nextActionDate: clean(task.nextActionDate),
      nextAction: clean(task.nextAction),
      paymentSchedule: Array.isArray(task.paymentSchedule) ? task.paymentSchedule.map(normalizeSettlementScheduleItem).filter(Boolean) : [],
      plan: cleanMultilineText(task.plan),
      memo: cleanMultilineText(task.memo),
      attachments: Array.isArray(task.attachments) ? task.attachments.map(normalizeAttachmentMeta).filter(Boolean) : [],
      history: normalizeHistoryEntries(task.history),
      createdAt: task.createdAt || now,
      updatedAt: task.updatedAt || now
    };
  }

  function normalizeSettlementPaymentType(value) {
    const paymentType = clean(value);
    if (paymentType === SETTLEMENT_PAYMENT_TYPE_ADVANCE || paymentType === "선금 후차감") {
      return SETTLEMENT_PAYMENT_TYPE_ADVANCE;
    }
    return SETTLEMENT_PAYMENT_TYPE_INSTALLMENT;
  }

  function normalizeSettlementStatus(value) {
    const status = clean(value);
    if (SETTLEMENT_STATUS_OPTIONS.includes(status)) {
      return status;
    }
    if (status === "차감 진행") {
      return "차감 진행 중";
    }
    if (["청구 필요", "청구 완료", "입금 확인", "연체"].includes(status)) {
      return "확인 필요";
    }
    return "예정";
  }

  function normalizeSettlementScheduleItem(item, index) {
    if (!item) {
      return null;
    }

    const round = clean(item.round) || String((Number(index) || 0) + 1);
    return {
      id: item.id || createId().replace("note_", "payment_"),
      round,
      dueDate: clean(item.dueDate),
      amount: normalizeAmountValue(item.amount),
      amountVatIncluded: Boolean(item.amountVatIncluded),
      item: clean(item.item),
      status: SETTLEMENT_SCHEDULE_STATUS_OPTIONS.includes(clean(item.status)) ? clean(item.status) : "예정",
      paidDate: clean(item.paidDate),
      memo: clean(item.memo)
    };
  }

  function normalizeOutputTask(task) {
    const now = getLocalTimestamp();
    const legacyDueDate = clean(task.dueDate);
    return {
      id: task.id || createId().replace("note_", "output_"),
      companyId: clean(task.companyId),
      contactId: clean(task.contactId),
      companyUnknown: Boolean(task.companyUnknown),
      company: clean(task.company),
      contactName: clean(task.contactName),
      contactPhone: clean(task.contactPhone),
      contactEmail: clean(task.contactEmail),
      salesNoteId: clean(task.salesLinkUnknown) ? "" : clean(task.salesNoteId),
      salesLinkUnknown: Boolean(task.salesLinkUnknown),
      startDate: clean(task.startDate) || legacyDueDate,
      endDate: clean(task.endDate) || legacyDueDate,
      includeWeekends: Boolean(task.includeWeekends),
      status: clean(task.status) || "대기",
      outputType: clean(task.outputType),
      priority: clean(task.priority) || "보통",
      memo: clean(task.memo),
      attachments: Array.isArray(task.attachments) ? task.attachments.map(normalizeAttachmentMeta).filter(Boolean) : [],
      history: normalizeHistoryEntries(task.history),
      createdAt: task.createdAt || now,
      updatedAt: task.updatedAt || now
    };
  }

  function normalizeOtherTask(task) {
    const now = getLocalTimestamp();
    const legacyDueDate = clean(task.dueDate);
    return {
      id: task.id || createId().replace("note_", "other_"),
      companyId: clean(task.companyId),
      contactId: clean(task.contactId),
      companyUnknown: Boolean(task.companyUnknown),
      company: clean(task.company),
      contactName: clean(task.contactName),
      contactPhone: clean(task.contactPhone),
      contactEmail: clean(task.contactEmail),
      title: clean(task.title),
      category: clean(task.category),
      owner: clean(task.owner),
      startDate: clean(task.startDate) || legacyDueDate,
      endDate: clean(task.endDate) || legacyDueDate,
      includeWeekends: Boolean(task.includeWeekends),
      status: clean(task.status) || "대기",
      priority: clean(task.priority) || "보통",
      memo: clean(task.memo),
      attachments: Array.isArray(task.attachments) ? task.attachments.map(normalizeAttachmentMeta).filter(Boolean) : [],
      history: normalizeHistoryEntries(task.history),
      createdAt: task.createdAt || now,
      updatedAt: task.updatedAt || now
    };
  }

  function normalizeAccount(account) {
    if (!account) {
      return null;
    }
    const now = getLocalTimestamp();
    const hasValue = [
      account.siteName,
      account.homepageName,
      account.siteUrl,
      account.homepageUrl,
      account.username,
      account.password,
      account.purpose,
      account.owner,
      account.memo
    ].some((value) => clean(value));
    if (!hasValue) {
      return null;
    }

    return {
      id: clean(account.id) || createId().replace("note_", "account_"),
      siteName: clean(account.siteName || account.homepageName),
      siteUrl: clean(account.siteUrl || account.homepageUrl),
      username: clean(account.username || account.accountId),
      password: clean(account.password),
      purpose: clean(account.purpose),
      owner: clean(account.owner),
      accountCreatedDate: clean(account.accountCreatedDate || account.createdDate),
      passwordChangedDate: clean(account.passwordChangedDate),
      memo: clean(account.memo),
      createdAt: account.createdAt || now,
      updatedAt: account.updatedAt || now
    };
  }

  function normalizeHistoryEntries(entries) {
    return (Array.isArray(entries) ? entries : [])
      .map((entry) => ({
        id: clean(entry.id) || createId().replace("note_", "history_"),
        at: clean(entry.at) || getLocalTimestamp(),
        action: clean(entry.action),
        detail: clean(entry.detail)
      }))
      .filter((entry) => entry.action || entry.detail)
      .slice(-120);
  }

  function cloneHistory(entries) {
    return normalizeHistoryEntries(entries).map((entry) => ({ ...entry }));
  }

  function appendHistoryEntry(owner, action, detail) {
    if (!owner) {
      return;
    }
    owner.history = cloneHistory(owner.history);
    owner.history.push({
      id: createId().replace("note_", "history_"),
      at: getLocalTimestamp(),
      action: clean(action),
      detail: clean(detail)
    });
    owner.history = owner.history.slice(-120);
  }

  function recordChangedFields(owner, previous, next, fields) {
    if (!previous || !next) {
      return;
    }
    const changes = [];
    fields.forEach((field) => {
      const beforeCompare = createHistoryCompareValue(previous[field]);
      const afterCompare = createHistoryCompareValue(next[field]);
      if (beforeCompare === afterCompare) {
        return;
      }
      const before = formatHistoryValue(previous[field]);
      const after = formatHistoryValue(next[field]);
      changes.push(`${HISTORY_FIELD_LABELS[field] || field}: ${before || "-"} -> ${after || "-"}`);
    });
    if (changes.length) {
      appendHistoryEntry(owner, "수정", changes.slice(0, 6).join(" / "));
    }
  }

  function createHistoryCompareValue(value) {
    if (Array.isArray(value) || value && typeof value === "object") {
      return JSON.stringify(value);
    }
    return formatHistoryValue(value);
  }

  function formatHistoryValue(value) {
    if (Array.isArray(value)) {
      return `${value.length}개`;
    }
    if (typeof value === "boolean") {
      return value ? "예" : "아니오";
    }
    if (value && typeof value === "object") {
      return "정보";
    }
    return clean(value);
  }

  function mergeHistoryEntries(currentEntries, incomingEntries) {
    const merged = [];
    const seen = new Set();
    [...cloneHistory(currentEntries), ...cloneHistory(incomingEntries)].forEach((entry) => {
      const key = [entry.at, entry.action, entry.detail].join("|");
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      merged.push(entry);
    });
    return merged.sort((a, b) => String(a.at).localeCompare(String(b.at))).slice(-120);
  }

  function saveState() {
    try {
      // Keep real sales data in browser storage unless the user exports a backup.
      state.updatedAt = getLocalTimestamp();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setSaveStatus(`자동 저장됨 ${formatDateTimeForDisplay(state.updatedAt)}`, false);
      return true;
    } catch (error) {
      console.error(error);
      setSaveStatus("자동 저장에 실패했습니다.", true);
      alert("브라우저 저장공간에 데이터를 저장하지 못했습니다. JSON 백업을 먼저 내보내 주세요.");
      return false;
    }
  }

  function openAttachmentDb() {
    if (!window.indexedDB) {
      return Promise.reject(new Error("이 브라우저에서는 첨부파일 저장소를 사용할 수 없습니다."));
    }

    if (attachmentDbPromise) {
      return attachmentDbPromise;
    }

    attachmentDbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(ATTACHMENT_DB_NAME, ATTACHMENT_DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(ATTACHMENT_STORE_NAME)) {
          const store = db.createObjectStore(ATTACHMENT_STORE_NAME, { keyPath: "id" });
          store.createIndex("noteId", "noteId", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("첨부파일 저장소를 열지 못했습니다."));
      request.onblocked = () => reject(new Error("첨부파일 저장소가 다른 창에서 사용 중입니다."));
    });

    return attachmentDbPromise;
  }

  async function putAttachmentRecord(record) {
    const db = await openAttachmentDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(ATTACHMENT_STORE_NAME, "readwrite");
      const store = transaction.objectStore(ATTACHMENT_STORE_NAME);
      store.put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("첨부파일 저장에 실패했습니다."));
    });
  }

  async function getAttachmentRecord(id) {
    const db = await openAttachmentDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(ATTACHMENT_STORE_NAME, "readonly");
      const request = transaction.objectStore(ATTACHMENT_STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("첨부파일을 읽지 못했습니다."));
    });
  }

  async function deleteAttachmentRecord(id) {
    const db = await openAttachmentDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(ATTACHMENT_STORE_NAME, "readwrite");
      transaction.objectStore(ATTACHMENT_STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("첨부파일 삭제에 실패했습니다."));
    });
  }

  async function deleteAttachmentRecords(attachments) {
    const items = Array.isArray(attachments) ? attachments : [];
    await Promise.all(items.map((attachment) => deleteAttachmentRecord(attachment.id)));
  }

  async function deleteAttachmentRecordsById(ids) {
    const items = Array.from(ids || []);
    await Promise.all(items.map((id) => deleteAttachmentRecord(id)));
  }

  async function clearAttachmentStore() {
    if (!window.indexedDB) {
      return;
    }

    const db = await openAttachmentDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(ATTACHMENT_STORE_NAME, "readwrite");
      transaction.objectStore(ATTACHMENT_STORE_NAME).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("첨부파일 저장소 초기화에 실패했습니다."));
    });
  }

  function setSaveStatus(message, isError) {
    elements.saveStatus.textContent = message;
    elements.saveStatus.style.color = isError ? "var(--danger)" : "var(--muted)";
  }

  function setDraftStatus(message, isWarning) {
    elements.draftStatus.textContent = message;
    elements.draftStatus.classList.toggle("warning", Boolean(isWarning));
  }

  function renderBackupReminder() {
    const lastBackupAt = localStorage.getItem(LAST_BACKUP_KEY);
    elements.backupReminder.classList.remove("warning");

    if (!lastBackupAt) {
      elements.backupReminder.textContent = "백업 기록 없음";
      elements.backupReminder.classList.add("warning");
      return;
    }

    const days = getDaysSince(lastBackupAt);
    if (days >= 7) {
      elements.backupReminder.textContent = `마지막 백업 ${days}일 전`;
      elements.backupReminder.classList.add("warning");
      return;
    }

    elements.backupReminder.textContent = `마지막 백업 ${formatDateTimeForDisplay(lastBackupAt)}`;
  }

  function recordJsonBackup() {
    try {
      localStorage.setItem(LAST_BACKUP_KEY, getLocalTimestamp());
      renderBackupReminder();
    } catch (error) {
      console.warn("Backup date could not be recorded", error);
    }
  }

  async function handleBackupHealthCheck() {
    elements.backupHealthButton.disabled = true;
    elements.backupHealthButton.textContent = "점검 중";
    try {
      const attachmentIds = collectAttachmentIdsFromData(state);
      let checkedFiles = 0;
      let missingFiles = 0;
      if (window.indexedDB) {
        for (const id of attachmentIds) {
          checkedFiles += 1;
          const record = await getAttachmentRecord(id);
          if (!record || !record.blob) {
            missingFiles += 1;
          }
        }
      }
      const lastBackupAt = localStorage.getItem(LAST_BACKUP_KEY);
      const lines = [
        "백업 상태 점검 결과",
        "",
      `업체: ${state.companies.length}개`,
      `영업: ${state.notes.length}건`,
      `계정: ${state.accounts.length}건`,
      `정산: ${state.settlementTasks.length}건`,
        `출력: ${state.outputTasks.length}건`,
        `기타: ${state.otherTasks.length}건`,
        `첨부 기록: ${attachmentIds.size}개`,
        window.indexedDB ? `첨부 원본 확인: ${checkedFiles - missingFiles}/${checkedFiles}개 정상` : "첨부 원본 확인: 이 브라우저에서 IndexedDB를 사용할 수 없음",
        missingFiles ? `원본 누락 의심: ${missingFiles}개` : "원본 누락 의심: 없음",
        `마지막 백업: ${lastBackupAt ? formatDateTimeForDisplay(lastBackupAt) : "기록 없음"}`
      ];
      alert(lines.join("\n"));
    } catch (error) {
      console.error(error);
      alert(`백업 상태를 점검하지 못했습니다.\n${error.message || error}`);
    } finally {
      elements.backupHealthButton.disabled = false;
      elements.backupHealthButton.textContent = "백업 상태 점검";
      renderBackupReminder();
    }
  }

  function queueDraftSave() {
    if (isApplyingFormValues) {
      return;
    }

    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(saveDraft, 250);
  }

  function saveDraft() {
    if (!hasAnyFormContent()) {
      clearDraft(false);
      return;
    }

    if (!hasUnsavedFormChanges()) {
      return;
    }

    const savedAt = getLocalTimestamp();
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        savedAt,
        form: getFormValues()
      }));
      setDraftStatus(`초안 자동 저장됨 ${formatDateTimeForDisplay(savedAt)}`, true);
    } catch (error) {
      console.warn("Draft save failed", error);
      setDraftStatus("초안을 자동 저장하지 못했습니다.", true);
    }
  }

  function offerDraftRestore() {
    const storedDraft = localStorage.getItem(DRAFT_KEY);
    if (!storedDraft) {
      setDraftStatus("작성 중 초안 없음", false);
      return;
    }

    try {
      const draft = JSON.parse(storedDraft);
      if (!draft || !draft.form) {
        clearDraft(false);
        return;
      }

      const restore = confirm(`저장되지 않은 작성 초안이 있습니다.\n저장 시각: ${formatDateTimeForDisplay(draft.savedAt)}\n초안을 복원할까요?`);
      if (!restore) {
        clearDraft(false);
        return;
      }

      applyFormValues(draft.form);
      setEditMode(Boolean(draft.form.id));
      openEditorPanel();
      renderAttachmentSection(getOpenNote());
      setDraftStatus(`복원된 초안 ${formatDateTimeForDisplay(draft.savedAt)}`, true);
    } catch (error) {
      console.warn("Draft restore failed", error);
      clearDraft(false);
    }
  }

  function clearDraft(showStatus) {
    window.clearTimeout(draftTimer);
    localStorage.removeItem(DRAFT_KEY);
    if (showStatus !== false) {
      setDraftStatus("작성 중 초안 없음", false);
    }
  }

  function handleBeforeUnload(event) {
    if (!hasUnsavedFormChanges()) {
      return;
    }

    event.preventDefault();
    event.returnValue = "";
  }

  function hasUnsavedFormChanges() {
    return getFormSnapshot() !== formSnapshot;
  }

  function updateFormSnapshot() {
    formSnapshot = getFormSnapshot();
  }

  function getFormSnapshot() {
    return JSON.stringify(getFormValues());
  }

  function hasAnyFormContent() {
    return [
      elements.company.value,
      elements.salesCompanyUnknown.checked ? "미정" : "",
      elements.contactName.value,
      elements.contactPhone.value,
      elements.contactEmail.value,
      elements.interest.value,
      elements.itemCategory.value,
      elements.meetingDate.value,
      elements.nextAction.value,
      elements.nextContactDate.value,
      elements.lastContactDate.value,
      elements.memo.value,
      elements.quoteStatus.value,
      elements.purchasePossibility.value,
      elements.expectedRevenueAmount.value,
      elements.expectedRevenueVatIncluded.checked ? "vat" : "",
      elements.revenueAmount.value,
      elements.revenueAmountVatIncluded.checked ? "vat" : "",
      elements.revenueType.value
    ].some((value) => clean(value));
  }

  function renderStatusOptions() {
    elements.status.innerHTML = "";
    state.statusOptions.forEach((status) => {
      elements.status.appendChild(new Option(status, status));
    });

    elements.statusFilter.innerHTML = "";
    elements.statusFilter.appendChild(new Option("전체", "all"));
    state.statusOptions.forEach((status) => {
      elements.statusFilter.appendChild(new Option(status, status));
    });

    updateMeetingDateVisibility();
    updateNextContactDateState();
  }

  function handleStatusChange() {
    updateMeetingDateVisibility();
    queueDraftSave();
  }

  function updateMeetingDateVisibility() {
    const isMeeting = elements.status.value === "미팅 예정";
    elements.meetingDateField.classList.toggle("hidden", !isMeeting);
  }

  function handleNextContactUnknownChange() {
    updateNextContactDateState();
    queueDraftSave();
  }

  function updateNextContactDateState() {
    const isUnknown = elements.nextContactUnknown.checked;
    elements.nextContactDate.disabled = isUnknown;
    if (isUnknown) {
      elements.nextContactDate.value = "";
    }
  }

  function render() {
    const filteredNotes = getFilteredNotes();
    renderSummary();
    renderSummaryFilterState();
    renderFollowups();
    renderTable(filteredNotes);
    renderMobileCards(filteredNotes);
    renderSalesPipelineBoard(filteredNotes);
    renderSalesViewMode(filteredNotes.length);
    renderCompanies();
    renderAccounts();
    renderSettlementTasks();
    renderOutputTasks();
    renderOtherTasks();
    renderCalendar();
    renderGlobalSearchResults();
    if (isSettlementEditorOpen()) {
      renderWorkCompanyPicker("settlement");
    }
    if (isOutputEditorOpen()) {
      renderWorkCompanyPicker("output");
      renderOutputSalesLinkPicker();
    }
    if (isOtherEditorOpen()) {
      renderWorkCompanyPicker("other");
    }
    if (isSalesEditorOpen()) {
      renderSalesCompanyPicker();
    }
    if (isCustomerDrawerOpen()) {
      renderCustomerDrawer();
    }
  }

  function clearGlobalSearch() {
    elements.globalSearchInput.value = "";
    renderGlobalSearchResults();
    elements.globalSearchInput.focus();
  }

  function renderGlobalSearchResults() {
    if (!elements.globalSearchResults) {
      return;
    }

    const query = clean(elements.globalSearchInput.value).toLowerCase();
    elements.globalSearchResults.innerHTML = "";
    elements.globalSearchClearButton.classList.toggle("hidden", !query);

    if (!query) {
      elements.globalSearchResults.classList.add("hidden");
      return;
    }

    const results = getGlobalSearchResults(query).slice(0, 40);
    elements.globalSearchResults.classList.remove("hidden");
    if (!results.length) {
      const empty = document.createElement("div");
      empty.className = "global-search-empty";
      empty.textContent = "검색 결과가 없습니다.";
      elements.globalSearchResults.appendChild(empty);
      return;
    }

    results.forEach((result) => {
      elements.globalSearchResults.appendChild(createGlobalSearchResult(result));
    });
  }

  function getGlobalSearchResults(query) {
    const results = [];
    state.companies.forEach((company) => {
      if (!getCompanySearchText(company).includes(query)) {
        return;
      }
      const primary = getPrimaryCompanyContact(company);
      results.push({
        type: "company",
        id: company.id,
        label: "업체",
        title: company.name || "업체",
        meta: [company.status, company.businessNumber, primary ? formatCompanyContactLine(primary) : ""].filter(Boolean).join(" · "),
        detail: company.memo || company.address || company.businessType || ""
      });
    });

    state.notes.forEach((note) => {
      if (!getSalesSearchText(note).includes(query)) {
        return;
      }
      results.push({
        type: "sales",
        id: note.id,
        label: "영업",
        title: note.company || note.contactName || "영업 메모",
        meta: [note.status, note.priority, formatNextContactForDisplay(note)].filter(Boolean).join(" · "),
        detail: note.nextAction || note.memo || note.interest || ""
      });
    });

    state.accounts.forEach((account) => {
      if (!getAccountSearchText(account).includes(query)) {
        return;
      }
      results.push({
        type: "account",
        id: account.id,
        label: "계정",
        title: account.siteName || account.siteUrl || "계정",
        meta: [account.purpose, account.username, account.owner].filter(Boolean).join(" · "),
        detail: account.siteUrl || account.memo || ""
      });
    });

    state.settlementTasks.forEach((task) => {
      if (!getWorkSearchText("settlement", task).includes(query)) {
        return;
      }
      results.push({
        type: "settlement",
        id: task.id,
        label: "정산",
        title: getWorkCompanyTitle(task, "정산 업무"),
        meta: [task.status, task.paymentType, formatSettlementNextAction(task)].filter(Boolean).join(" · "),
        detail: task.memo || task.plan || ""
      });
    });

    state.outputTasks.forEach((task) => {
      if (!getWorkSearchText("output", task).includes(query)) {
        return;
      }
      results.push({
        type: "output",
        id: task.id,
        label: "출력",
        title: getWorkCompanyTitle(task, task.outputType || "출력 업무"),
        meta: [task.status, task.priority, task.salesLinkUnknown ? "영업건 미정" : task.salesNoteId ? getLinkedSalesLabel(task.salesNoteId) : "", formatWorkDateRangeForDisplay(task)].filter(Boolean).join(" · "),
        detail: task.memo || task.outputType || ""
      });
    });

    state.otherTasks.forEach((task) => {
      if (!getWorkSearchText("other", task).includes(query)) {
        return;
      }
      results.push({
        type: "other",
        id: task.id,
        label: "기타",
        title: task.title || "기타 업무",
        meta: [task.status, task.priority, getWorkCompanyTitle(task, ""), formatWorkDateRangeForDisplay(task)].filter(Boolean).join(" · "),
        detail: task.memo || task.category || ""
      });
    });

    results.push(...collectGlobalFileSearchResults(query));
    return results.sort(compareGlobalSearchResults);
  }

  function collectGlobalFileSearchResults(query) {
    const groups = [
      { type: "company", label: "업체", items: state.companies },
      { type: "sales", label: "영업", items: state.notes },
      { type: "settlement", label: "정산", items: state.settlementTasks },
      { type: "output", label: "출력", items: state.outputTasks },
      { type: "other", label: "기타", items: state.otherTasks }
    ];
    const results = [];
    groups.forEach((group) => {
      group.items.forEach((owner) => {
        (owner.attachments || []).forEach((attachment) => {
          const searchText = [
            getFileTypeLabel(group.type),
            getFileOwnerTitle(group.type, owner),
            attachment.fileName,
            attachment.category,
            attachment.memo,
            attachment.sentDate,
            formatFileSize(attachment.fileSize)
          ].join(" ").toLowerCase();
          if (!searchText.includes(query)) {
            return;
          }
          results.push({
            type: "file",
            id: attachment.id,
            ownerType: group.type,
            ownerId: owner.id,
            label: "파일",
            title: attachment.fileName || "이름 없는 파일",
            meta: [group.label, attachment.category, attachment.sentDate ? formatDateForDisplay(attachment.sentDate) : "", formatFileSize(attachment.fileSize)].filter(Boolean).join(" · "),
            detail: [getFileOwnerTitle(group.type, owner), attachment.memo].filter(Boolean).join(" · ")
          });
        });
      });
    });
    return results.slice(0, 30);
  }

  function createGlobalSearchResult(result) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `global-search-result global-search-result-${result.type}`;
    button.addEventListener("click", () => openGlobalSearchResult(result));

    const badge = document.createElement("span");
    badge.className = "global-search-badge";
    badge.textContent = result.label;

    const body = document.createElement("span");
    body.className = "global-search-result-body";
    const title = document.createElement("strong");
    title.textContent = result.title;
    const meta = document.createElement("small");
    meta.textContent = result.meta || "-";
    const detail = document.createElement("span");
    detail.textContent = result.detail || "";
    body.append(title, meta, detail);

    button.append(badge, body);
    return button;
  }

  function openGlobalSearchResult(result) {
    if (result.type === "company") {
      editCompany(result.id);
      return;
    }
    if (result.type === "sales") {
      switchPortal("sales");
      editNote(result.id);
      return;
    }
    if (result.type === "settlement") {
      editSettlementTask(result.id);
      return;
    }
    if (result.type === "account") {
      editAccount(result.id);
      return;
    }
    if (result.type === "output") {
      editOutputTask(result.id);
      return;
    }
    if (result.type === "file") {
      openFileDrawer(result.ownerType, result.ownerId);
      return;
    }
    editOtherTask(result.id);
  }

  function compareGlobalSearchResults(a, b) {
    return a.label.localeCompare(b.label, "ko") || a.title.localeCompare(b.title, "ko");
  }

  function renderSummary() {
    elements.totalCount.textContent = state.notes.length;
    elements.activeSalesCount.textContent = state.notes.filter(isActiveSalesNote).length;
    elements.completedSalesCount.textContent = state.notes.filter(isCompletedSalesNote).length;
    elements.failedSalesCount.textContent = state.notes.filter(isFailedSalesNote).length;
  }

  function renderSummaryFilterState() {
    elements.summaryFilters.forEach((button) => {
      const isActive = button.dataset.summaryFilter === activeSummaryFilter;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function renderFollowups() {
    const today = getTodayDateString();
    const weekEnd = addDays(today, 6);
    const groups = [
      {
        key: "overdue",
        title: "기한 지난 팔로업",
        empty: "지연된 항목 없음",
        notes: state.notes.filter((note) => isOverdue(note.nextContactDate, today))
      },
      {
        key: "today",
        title: "오늘 연락 예정",
        empty: "오늘 연락 없음",
        notes: state.notes.filter((note) => note.nextContactDate === today)
      },
      {
        key: "week",
        title: "이번 주 연락 예정",
        empty: "이번 주 예정 없음",
        notes: state.notes.filter((note) => (
          note.nextContactDate && note.nextContactDate > today && note.nextContactDate <= weekEnd
        ))
      },
      {
        key: "meeting",
        title: "미팅 예정",
        empty: "미팅 예정 없음",
        notes: state.notes.filter((note) => note.status === "미팅 예정")
      }
    ];

    elements.followupBoard.innerHTML = "";

    groups.forEach((group) => {
      const column = document.createElement("section");
      column.className = "followup-column";

      const title = document.createElement("h3");
      title.textContent = `${group.title} ${group.notes.length}`;

      const items = document.createElement("div");
      items.className = "followup-items";

      const notes = group.notes.sort((a, b) => compareByFollowupSchedule(a, b, group.key)).slice(0, 4);
      if (!notes.length) {
        const empty = document.createElement("p");
        empty.className = "followup-empty";
        empty.textContent = group.empty;
        items.appendChild(empty);
      } else {
        notes.forEach((note) => {
          items.appendChild(createFollowupItem(note));
        });
      }

      column.append(title, items);
      elements.followupBoard.appendChild(column);
    });
  }

  function createFollowupItem(note) {
    const item = elements.followupItemTemplate.content.firstElementChild.cloneNode(true);
    item.querySelector(".followup-company").textContent = note.company || "고객사 미입력";
    item.querySelector(".followup-meta").textContent = `${getScheduleLabel(note)} · ${note.nextAction || note.status}`;
    item.addEventListener("click", () => editNote(note.id));
    return item;
  }

  function renderTable(notes) {
    elements.notesTableBody.innerHTML = "";

    notes.forEach((note) => {
      const row = document.createElement("tr");
      row.tabIndex = 0;
      row.addEventListener("click", (event) => {
        if (!event.target.closest("button, select, input, textarea")) {
          editNote(note.id);
        }
      });
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.target.closest("button, select, input, textarea")) {
          editNote(note.id);
        }
      });

      row.appendChild(createCompanyCell(note));
      row.appendChild(createSalesStatusCell(note));
      row.appendChild(createSalesItemCategoryCell(note));
      row.appendChild(createSalesPriorityCell(note));
      row.appendChild(createInsightCell(note));
      row.appendChild(createActionCell(note));
      row.appendChild(createScheduleCell(note));
      row.appendChild(createRowActionsCell(note));

      elements.notesTableBody.appendChild(row);
    });
  }

  function renderMobileCards(notes) {
    elements.mobileNotesList.innerHTML = "";

    notes.forEach((note) => {
      const card = document.createElement("article");
      card.className = "note-card";
      card.tabIndex = 0;
      card.addEventListener("click", (event) => {
        if (!event.target.closest("button, select, input, textarea")) {
          editNote(note.id);
        }
      });
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.target.closest("button, select, input, textarea")) {
          editNote(note.id);
        }
      });

      const header = document.createElement("div");
      header.className = "note-card-header";

      const title = document.createElement("div");
      title.className = "note-card-title";
      const company = document.createElement("span");
      company.textContent = note.company || "고객사 미입력";
      const subtitle = document.createElement("small");
      subtitle.className = "muted-line";
      subtitle.textContent = [note.contactName, note.contactPhone, note.contactEmail, note.interest].filter(Boolean).join(" · ") || "상세 정보 없음";
      title.append(company, subtitle);

      const badges = document.createElement("div");
      badges.className = "note-card-badges";
      badges.append(
        createSalesStatusControl(note),
        createSalesItemCategoryControl(note),
        createSalesPriorityControl(note)
      );

      const detail = document.createElement("div");
      detail.className = "note-card-detail";
      const detailLines = [
        createDetailLine("구분", note.itemCategory || "미지정"),
        createDetailLine("관심", note.interest || "-"),
        createDetailLine("견적/구매", `${note.quoteStatus || "미입력"} / ${note.purchasePossibility || "미입력"}`)
      ];
      if (hasAmountValue(note.expectedRevenueAmount)) {
        detailLines.push(createDetailLine("예상매출", formatMoneyWithVatForDisplay(note.expectedRevenueAmount, note.expectedRevenueVatIncluded)));
      }
      if (hasAmountValue(note.revenueAmount) || note.revenueType) {
        detailLines.push(createDetailLine("매출", formatRevenueForDisplay(note)));
      }
      detailLines.push(
        createDetailLine("다음 액션", note.nextAction || "-"),
        createDetailLine("다음 연락", formatNextContactForDisplay(note)),
        createDetailLine("미팅 일자", note.status === "미팅 예정" ? formatDateForDisplay(note.meetingDate) : "-"),
        createDetailLine("첨부자료", `${note.attachments.length}개`),
        createDetailLine("최종 수정", formatDateTimeForDisplay(note.updatedAt))
      );
      detail.append(...detailLines);

      const actions = document.createElement("div");
      actions.className = "note-card-actions row-actions";

      const customerButton = createCustomerProfileButton(note);
      const fileButton = createFolderButton("sales", note.id, note.attachments.length);

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.textContent = "수정";
      editButton.addEventListener("click", () => editNote(note.id));

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "delete-row-button";
      deleteButton.textContent = "삭제";
      deleteButton.addEventListener("click", () => deleteNote(note.id));

      actions.append(customerButton, fileButton, editButton, deleteButton);
      header.append(title, badges);
      card.append(header, detail, actions);
      elements.mobileNotesList.appendChild(card);
    });
  }

  function switchSalesView(mode) {
    salesViewMode = mode === "board" ? "board" : "list";
    renderSalesViewMode(getFilteredNotes().length);
  }

  function renderSalesViewMode(visibleCount) {
    const isBoard = salesViewMode === "board";
    elements.salesListViewButton.classList.toggle("is-active", !isBoard);
    elements.salesBoardViewButton.classList.toggle("is-active", isBoard);
    elements.salesListViewButton.setAttribute("aria-pressed", String(!isBoard));
    elements.salesBoardViewButton.setAttribute("aria-pressed", String(isBoard));
    elements.notesTableWrap.classList.toggle("hidden", isBoard);
    elements.mobileNotesList.classList.toggle("hidden", isBoard);
    elements.salesPipelineBoard.classList.toggle("hidden", !isBoard);
    elements.emptyState.classList.toggle("hidden", visibleCount > 0);
  }

  function renderSalesPipelineBoard(notes) {
    elements.salesPipelineBoard.innerHTML = "";
    const statusColumns = getSalesPipelineStatuses();
    const notesByStatus = groupNotesByStatus(notes);

    statusColumns.forEach((status) => {
      const columnNotes = notesByStatus.get(status) || [];
      elements.salesPipelineBoard.appendChild(createSalesPipelineColumn(status, columnNotes));
    });
  }

  function getSalesPipelineStatuses() {
    const statusFilter = elements.statusFilter.value;
    if (statusFilter && statusFilter !== "all") {
      return [statusFilter];
    }

    const statuses = [];
    const addStatus = (status) => {
      const value = clean(status);
      if (value && !statuses.includes(value)) {
        statuses.push(value);
      }
    };
    (state.statusOptions || DEFAULT_STATUS_OPTIONS).forEach(addStatus);
    state.notes.forEach((note) => addStatus(note.status));
    return statuses.length ? statuses : DEFAULT_STATUS_OPTIONS.slice();
  }

  function groupNotesByStatus(notes) {
    const map = new Map();
    notes.forEach((note) => {
      const status = clean(note.status) || "미지정";
      if (!map.has(status)) {
        map.set(status, []);
      }
      map.get(status).push(note);
    });
    return map;
  }

  function createSalesPipelineColumn(status, notes) {
    const column = document.createElement("section");
    column.className = `sales-pipeline-column sales-pipeline-${getStatusClassSuffix(status)}`;
    column.dataset.status = status;
    column.addEventListener("dragover", handleSalesPipelineDragOver);
    column.addEventListener("dragleave", handleSalesPipelineDragLeave);
    column.addEventListener("drop", handleSalesPipelineDrop);

    const header = document.createElement("div");
    header.className = "sales-pipeline-column-header";
    const title = document.createElement("strong");
    title.textContent = status;
    const count = document.createElement("span");
    count.textContent = `${notes.length}건`;
    header.append(title, count);

    const list = document.createElement("div");
    list.className = "sales-pipeline-card-list";
    if (!notes.length) {
      const empty = document.createElement("div");
      empty.className = "sales-pipeline-empty";
      empty.textContent = "해당 상태의 메모 없음";
      list.appendChild(empty);
    } else {
      notes.forEach((note) => list.appendChild(createSalesPipelineCard(note)));
    }

    column.append(header, list);
    return column;
  }

  function createSalesPipelineCard(note) {
    const card = document.createElement("article");
    card.className = `sales-pipeline-card priority-${note.priority || "보통"}`;
    card.draggable = true;
    card.tabIndex = 0;
    card.dataset.noteId = note.id;
    card.addEventListener("dragstart", handleSalesPipelineDragStart);
    card.addEventListener("dragend", handleSalesPipelineDragEnd);
    card.addEventListener("click", (event) => {
      if (!event.target.closest("button, select, input, textarea")) {
        editNote(note.id);
      }
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.target.closest("button, select, input, textarea")) {
        editNote(note.id);
      }
    });

    const header = document.createElement("div");
    header.className = "sales-pipeline-card-header";
    const title = document.createElement("strong");
    title.textContent = note.company || "고객사 미입력";
    const contact = document.createElement("small");
    contact.textContent = [note.contactName, note.contactPhone, note.contactEmail].filter(Boolean).join(" · ") || "연락처 없음";
    header.append(title, contact);

    const badges = document.createElement("div");
    badges.className = "sales-pipeline-card-badges";
    badges.append(
      createSalesStatusControl(note),
      createSalesItemCategoryControl(note),
      createSalesPriorityControl(note)
    );

    const body = document.createElement("div");
    body.className = "sales-pipeline-card-body";
    body.append(
      createSalesBoardLine("관심", note.interest || "-"),
      createSalesBoardLine("다음", note.nextAction || note.memo || "-"),
      createSalesBoardLine("일정", formatSalesBoardSchedule(note))
    );
    if (hasAmountValue(note.expectedRevenueAmount)) {
      body.appendChild(createSalesBoardLine("예상", formatMoneyWithVatForDisplay(note.expectedRevenueAmount, note.expectedRevenueVatIncluded)));
    }
    if (hasAmountValue(note.revenueAmount) || note.revenueType) {
      body.appendChild(createSalesBoardLine("매출", formatRevenueForDisplay(note)));
    }
    body.appendChild(createSalesBoardLine("자료", note.attachments.length ? `${note.attachments.length}개` : "없음"));

    const actions = document.createElement("div");
    actions.className = "sales-pipeline-card-actions";
    actions.append(
      createCustomerProfileButton(note),
      createFolderButton("sales", note.id, note.attachments.length)
    );
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "수정";
    editButton.addEventListener("click", () => editNote(note.id));
    actions.appendChild(editButton);

    card.append(header, badges, body, actions);
    return card;
  }

  function createSalesBoardLine(label, value) {
    const line = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    line.append(strong, value || "-");
    return line;
  }

  function formatSalesBoardSchedule(note) {
    const schedule = [
      note.nextContactUnknown ? "다음 미정" : note.nextContactDate ? `다음 ${formatDateForDisplay(note.nextContactDate)}` : "",
      note.status === "미팅 예정" && note.meetingDate ? `미팅 ${formatDateForDisplay(note.meetingDate)}` : "",
      note.lastContactDate ? `최근 ${formatDateForDisplay(note.lastContactDate)}` : ""
    ].filter(Boolean);
    return schedule.join(" · ") || "-";
  }

  function handleSalesPipelineDragStart(event) {
    const noteId = event.currentTarget.dataset.noteId;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", noteId);
    event.currentTarget.classList.add("is-dragging");
  }

  function handleSalesPipelineDragEnd(event) {
    event.currentTarget.classList.remove("is-dragging");
    clearSalesPipelineDropState();
  }

  function handleSalesPipelineDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    event.currentTarget.classList.add("is-drop-target");
  }

  function handleSalesPipelineDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      event.currentTarget.classList.remove("is-drop-target");
    }
  }

  function handleSalesPipelineDrop(event) {
    event.preventDefault();
    const noteId = event.dataTransfer.getData("text/plain");
    const nextStatus = event.currentTarget.dataset.status;
    clearSalesPipelineDropState();
    if (!noteId || !nextStatus) {
      return;
    }
    updateSalesQuickField(noteId, "status", nextStatus);
  }

  function clearSalesPipelineDropState() {
    elements.salesPipelineBoard
      .querySelectorAll(".sales-pipeline-column.is-drop-target")
      .forEach((column) => column.classList.remove("is-drop-target"));
  }

  function getStatusClassSuffix(status) {
    return normalizeTextForCompare(status).replace(/[^a-z0-9가-힣]+/gi, "-") || "unknown";
  }

  function renderAttachmentSection(note) {
    cleanupAttachmentPreviewUrls();

    const selectedNote = note || getOpenNote();
    const hasNote = Boolean(selectedNote);
    const attachments = hasNote ? selectedNote.attachments : [];
    const canUseFiles = Boolean(window.indexedDB);

    elements.attachmentCount.textContent = `${attachments.length}개`;
    elements.attachmentFileInput.disabled = !hasNote || !canUseFiles;
    elements.attachmentCategory.disabled = !hasNote || !canUseFiles;
    elements.attachmentSentDate.disabled = !hasNote || !canUseFiles;
    elements.attachmentMemo.disabled = !hasNote || !canUseFiles;
    elements.uploadAttachmentButton.disabled = !hasNote || !canUseFiles;

    if (!canUseFiles) {
      elements.attachmentHint.textContent = "이 브라우저에서는 IndexedDB 첨부파일 저장소를 사용할 수 없습니다.";
    } else if (!hasNote) {
      elements.attachmentHint.textContent = "메모를 저장하면 견적서, 발송자료, 메일 캡처 이미지를 첨부할 수 있습니다.";
    } else {
      elements.attachmentHint.textContent = "첨부자료 원본은 이 브라우저의 IndexedDB에 저장됩니다. JSON 백업에는 파일 원본이 포함되지 않습니다.";
    }

    elements.attachmentList.innerHTML = "";
    if (!hasNote) {
      elements.attachmentList.appendChild(createAttachmentEmpty("저장된 메모를 열면 첨부자료 목록이 표시됩니다."));
      return;
    }

    if (!attachments.length) {
      elements.attachmentList.appendChild(createAttachmentEmpty("아직 첨부된 자료가 없습니다."));
      return;
    }

    attachments
      .slice()
      .sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)))
      .forEach((attachment) => {
        elements.attachmentList.appendChild(createAttachmentItem(selectedNote.id, attachment));
      });
  }

  function createAttachmentEmpty(message) {
    const empty = document.createElement("div");
    empty.className = "attachment-empty";
    empty.textContent = message;
    return empty;
  }

  function createAttachmentItem(noteId, attachment) {
    const item = document.createElement("article");
    item.className = "attachment-item";

    const thumb = document.createElement("div");
    thumb.className = "attachment-thumb";
    thumb.textContent = getFileExtensionLabel(attachment.fileName);
    if (isImageFile(attachment)) {
      loadAttachmentThumbnail(attachment.id, thumb);
    }

    const body = document.createElement("div");
    body.className = "attachment-body";

    const name = document.createElement("div");
    name.className = "attachment-name";
    name.textContent = attachment.fileName || "이름 없는 파일";

    const meta = document.createElement("div");
    meta.className = "attachment-meta";
    meta.textContent = [
      attachment.category,
      attachment.sentDate ? `발송 ${formatDateForDisplay(attachment.sentDate)}` : "발송일 미입력",
      formatFileSize(attachment.fileSize),
      formatDateTimeForDisplay(attachment.uploadedAt)
    ].filter(Boolean).join(" · ");

    const note = document.createElement("div");
    note.className = "attachment-note";
    note.textContent = attachment.memo || "";
    note.classList.toggle("hidden", !attachment.memo);

    const buttons = document.createElement("div");
    buttons.className = "attachment-buttons";

    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.textContent = "다운로드";
    downloadButton.addEventListener("click", () => downloadAttachment(attachment.id));

    const previewButton = createAttachmentPreviewButton(attachment);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-attachment-button";
    deleteButton.textContent = "삭제";
    deleteButton.addEventListener("click", () => deleteAttachment(noteId, attachment.id));

    if (previewButton) {
      buttons.append(previewButton);
    }
    buttons.append(downloadButton, deleteButton);
    body.append(name, meta, note, buttons);
    item.append(thumb, body);
    return item;
  }

  async function loadAttachmentThumbnail(id, thumb) {
    try {
      const record = await getAttachmentRecord(id);
      if (!record || !record.blob) {
        return;
      }

      const url = URL.createObjectURL(record.blob);
      attachmentPreviewUrls.push(url);
      const image = document.createElement("img");
      image.src = url;
      image.alt = "";
      thumb.textContent = "";
      thumb.appendChild(image);
    } catch (error) {
      console.warn("Attachment preview failed", error);
    }
  }

  function createAttachmentPreviewButton(attachment) {
    if (!isPreviewableAttachment(attachment)) {
      return null;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "미리보기";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openAttachmentPreview(attachment.id);
    });
    return button;
  }

  async function openAttachmentPreview(attachmentId) {
    try {
      const record = await getAttachmentRecord(attachmentId);
      if (!record || !record.blob) {
        alert("이 파일의 원본을 현재 브라우저 저장소에서 찾지 못했습니다.\nJSON 기록만 가져온 파일이면 전체 ZIP 백업을 불러와야 미리보기와 다운로드가 가능합니다.");
        return;
      }

      closeAttachmentPreview({ silent: true });
      activePreviewAttachmentId = attachmentId;
      activeAttachmentPreviewUrl = URL.createObjectURL(record.blob);
      elements.filePreviewTitle.textContent = record.fileName || "파일 미리보기";
      elements.filePreviewMeta.textContent = [
        record.category,
        formatFileSize(record.fileSize),
        record.sentDate ? `관련일 ${formatDateForDisplay(record.sentDate)}` : "",
        record.memo
      ].filter(Boolean).join(" · ") || "파일 정보를 확인합니다.";
      elements.filePreviewBody.innerHTML = "";
      elements.filePreviewZoomControls.classList.toggle("hidden", !isImageFile(record));
      setFilePreviewZoom(1);

      if (isImageFile(record)) {
        const stage = document.createElement("div");
        stage.className = "file-preview-image-stage";
        const image = document.createElement("img");
        image.className = "file-preview-image";
        image.src = activeAttachmentPreviewUrl;
        image.alt = record.fileName || "첨부 이미지";
        stage.appendChild(image);
        elements.filePreviewBody.appendChild(stage);
      } else if (isPdfFile(record)) {
        const frame = document.createElement("iframe");
        frame.src = activeAttachmentPreviewUrl;
        frame.title = record.fileName || "PDF 미리보기";
        elements.filePreviewBody.appendChild(frame);
      } else {
        const empty = createAttachmentEmpty("이 형식은 브라우저 안에서 미리보기를 지원하지 않습니다. 다운로드해서 확인해 주세요.");
        elements.filePreviewBody.appendChild(empty);
      }

      elements.filePreviewPanel.classList.remove("hidden");
      syncOverlayState();
    } catch (error) {
      console.error(error);
      alert(`파일을 미리볼 수 없습니다.\n${error.message || error}`);
    }
  }

  function closeAttachmentPreview(options) {
    if (activeAttachmentPreviewUrl) {
      URL.revokeObjectURL(activeAttachmentPreviewUrl);
    }
    activeAttachmentPreviewUrl = "";
    activePreviewAttachmentId = "";
    filePreviewZoom = 1;
    elements.filePreviewZoomControls.classList.add("hidden");
    elements.filePreviewZoomResetButton.textContent = "100%";
    if (!options || !options.silent) {
      elements.filePreviewBody.innerHTML = "";
      elements.filePreviewPanel.classList.add("hidden");
      syncOverlayState();
    }
  }

  function setFilePreviewZoom(value) {
    filePreviewZoom = Math.min(3, Math.max(0.5, Number(value) || 1));
    const stage = elements.filePreviewBody.querySelector(".file-preview-image-stage");
    if (stage) {
      stage.style.setProperty("--preview-zoom", String(filePreviewZoom));
    }
    elements.filePreviewZoomResetButton.textContent = `${Math.round(filePreviewZoom * 100)}%`;
    elements.filePreviewZoomOutButton.disabled = filePreviewZoom <= 0.5;
    elements.filePreviewZoomInButton.disabled = filePreviewZoom >= 3;
  }

  function cleanupAttachmentPreviewUrls() {
    attachmentPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    attachmentPreviewUrls = [];
  }

  function createCompanyCell(note) {
    const cell = document.createElement("td");
    cell.className = "company-cell";

    const company = document.createElement("span");
    company.className = "company-cell-title";
    company.textContent = note.company || "고객사 미입력";
    cell.appendChild(company);

    const details = [note.contactName, note.contactPhone, note.contactEmail].filter(Boolean);
    if (!details.length) {
      const empty = document.createElement("span");
      empty.className = "muted-line";
      empty.textContent = "상세 정보 없음";
      cell.appendChild(empty);
      return cell;
    }

    details.forEach((value) => {
      const line = document.createElement("span");
      line.className = "muted-line";
      line.textContent = value;
      cell.appendChild(line);
    });
    return cell;
  }

  function createInsightCell(note) {
    const cell = document.createElement("td");
    cell.className = "insight-cell";
    const wrap = document.createElement("div");
    wrap.className = "stacked-lines";

    wrap.appendChild(createStackLine("관심제품", note.interest || "-"));
    wrap.appendChild(createStackLine("견적여부", note.quoteStatus || "미입력"));
    wrap.appendChild(createStackLine("구매가능성", note.purchasePossibility || "미입력"));
    if (hasAmountValue(note.expectedRevenueAmount)) {
      wrap.appendChild(createStackLine("예상매출", formatMoneyWithVatForDisplay(note.expectedRevenueAmount, note.expectedRevenueVatIncluded)));
    }
    if (hasAmountValue(note.revenueAmount) || note.revenueType) {
      wrap.appendChild(createStackLine("매출", formatRevenueForDisplay(note)));
    }
    wrap.appendChild(createStackLine("관련자료", note.attachments.length ? `${note.attachments.length}개` : "없음"));

    cell.appendChild(wrap);
    return cell;
  }

  function createActionCell(note) {
    const cell = document.createElement("td");
    cell.className = "action-cell";
    const wrap = document.createElement("div");
    wrap.className = "stacked-lines";

    const action = document.createElement("strong");
    action.textContent = note.nextAction || "다음 액션 미입력";
    wrap.appendChild(action);

    cell.appendChild(wrap);
    return cell;
  }

  function createScheduleCell(note) {
    const cell = document.createElement("td");
    cell.className = "schedule-cell";
    const wrap = document.createElement("div");
    wrap.className = "stacked-lines";

    wrap.appendChild(createStackLine("다음연락", formatNextContactForDisplay(note)));
    if (note.status === "미팅 예정") {
      wrap.appendChild(createStackLine("미팅일정", formatDateForDisplay(note.meetingDate)));
    }
    wrap.appendChild(createStackLine("최근연락", formatDateForDisplay(note.lastContactDate)));

    cell.appendChild(wrap);
    return cell;
  }

  function createStackLine(label, value) {
    const line = document.createElement("span");
    const labelElement = document.createElement("strong");
    labelElement.textContent = `${label}: `;
    line.appendChild(labelElement);
    line.append(value || "-");
    return line;
  }

  function createBadgeCell(text, className) {
    const cell = document.createElement("td");
    if (className.indexOf("badge-priority") >= 0) {
      cell.className = "priority-cell";
    }
    cell.appendChild(createBadgeElement(text, className));
    return cell;
  }

  function createSalesStatusCell(note) {
    const cell = document.createElement("td");
    cell.appendChild(createSalesStatusControl(note));
    return cell;
  }

  function createSalesItemCategoryCell(note) {
    const cell = document.createElement("td");
    cell.className = "category-cell";
    cell.appendChild(createSalesItemCategoryControl(note));
    return cell;
  }

  function createSalesPriorityCell(note) {
    const cell = document.createElement("td");
    cell.className = "priority-cell";
    cell.appendChild(createSalesPriorityControl(note));
    return cell;
  }

  function createSalesStatusControl(note) {
    return createInlineSelect(
      getSalesStatusOptions(note.status),
      note.status,
      "inline-status-select",
      (value) => updateSalesQuickField(note.id, "status", value),
      `${note.company || "영업 메모"} 진행 상태`
    );
  }

  function createSalesItemCategoryControl(note) {
    const select = document.createElement("select");
    select.className = "inline-edit-select inline-category-select";
    select.setAttribute("aria-label", `${note.company || "영업 메모"} 구분`);
    select.appendChild(new Option("미지정", ""));
    SALES_ITEM_CATEGORY_OPTIONS.forEach((option) => {
      select.appendChild(new Option(option, option));
    });
    select.value = normalizeSalesItemCategory(note.itemCategory);
    select.addEventListener("click", (event) => event.stopPropagation());
    select.addEventListener("keydown", (event) => event.stopPropagation());
    select.addEventListener("change", (event) => {
      event.stopPropagation();
      updateSalesQuickField(note.id, "itemCategory", normalizeSalesItemCategory(select.value));
    });
    return select;
  }

  function createSalesPriorityControl(note) {
    return createInlineSelect(
      getPriorityOptions(note.priority),
      note.priority,
      "inline-priority-select",
      (value) => updateSalesQuickField(note.id, "priority", value),
      `${note.company || "영업 메모"} 중요도`
    );
  }

  function getSalesStatusOptions(currentValue) {
    return mergeOptionValues(state.statusOptions, currentValue);
  }

  function getPriorityOptions(currentValue) {
    return mergeOptionValues(PRIORITY_OPTIONS, currentValue);
  }

  function mergeOptionValues(values, currentValue) {
    const options = (Array.isArray(values) ? values : []).filter(Boolean);
    const current = clean(currentValue);
    return current && !options.includes(current) ? [...options, current] : options;
  }

  function createInlineSelect(options, value, className, onChange, ariaLabel) {
    const select = document.createElement("select");
    select.className = `inline-edit-select ${className || ""}`.trim();
    select.setAttribute("aria-label", ariaLabel || "빠른 수정");
    mergeOptionValues(options, value).forEach((option) => {
      select.appendChild(new Option(option, option));
    });
    select.value = value || (options && options[0]) || "";
    select.addEventListener("click", (event) => event.stopPropagation());
    select.addEventListener("keydown", (event) => event.stopPropagation());
    select.addEventListener("change", (event) => {
      event.stopPropagation();
      onChange(select.value);
    });
    return select;
  }

  function updateSalesQuickField(noteId, field, value) {
    const note = state.notes.find((item) => item.id === noteId);
    if (!note || note[field] === value) {
      return;
    }

    const previousValue = note[field];
    note[field] = value;
    if (field === "status" && value !== "미팅 예정") {
      note.meetingDate = "";
    }
    appendHistoryEntry(
      note,
      "빠른 수정",
      `${HISTORY_FIELD_LABELS[field] || field}: ${formatHistoryValue(previousValue) || "-"} -> ${formatHistoryValue(value) || "-"}`
    );
    note.updatedAt = getLocalTimestamp();
    if (elements.noteId.value === noteId) {
      applyFormValues(note);
      updateFormSnapshot();
    }
    if (saveState()) {
      render();
      setSaveStatus("빠른 수정이 저장됐습니다.", false);
    }
  }

  function createBadgeElement(text, className) {
    const badge = document.createElement("span");
    badge.className = `badge ${className}`;
    badge.textContent = text || "-";
    return badge;
  }

  function createDetailLine(label, value) {
    const line = document.createElement("span");
    line.innerHTML = `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(value || "-")}`;
    return line;
  }

  function createTextCell(text, className) {
    const cell = document.createElement("td");
    cell.className = className || "";
    cell.textContent = text || "-";
    return cell;
  }

  function createRowActionsCell(note) {
    const cell = document.createElement("td");
    cell.className = "row-actions-cell";
    const wrap = document.createElement("div");
    wrap.className = "row-actions sales-row-actions";

    const customerButton = createCustomerProfileButton(note);
    const fileButton = createFolderButton("sales", note.id, note.attachments.length);

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "수정";
    editButton.addEventListener("click", () => editNote(note.id));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-row-button";
    deleteButton.textContent = "삭제";
    deleteButton.addEventListener("click", () => deleteNote(note.id));

    const topRow = document.createElement("div");
    topRow.className = "row-action-group";
    topRow.append(customerButton, fileButton);

    const bottomRow = document.createElement("div");
    bottomRow.className = "row-action-group";
    bottomRow.append(editButton, deleteButton);

    const updated = document.createElement("small");
    updated.className = "row-updated-meta";
    updated.textContent = formatDateTimeForDisplay(note.updatedAt);

    wrap.append(topRow, bottomRow, updated);
    cell.appendChild(wrap);
    return cell;
  }

  async function handleAttachmentUpload() {
    const noteId = elements.noteId.value;
    const note = state.notes.find((item) => item.id === noteId);
    if (!note) {
      alert("먼저 메모를 저장한 뒤 첨부자료를 추가해 주세요.");
      return;
    }

    const files = Array.from(elements.attachmentFileInput.files || []);
    if (!files.length) {
      alert("첨부할 파일을 선택해 주세요.");
      return;
    }

    elements.uploadAttachmentButton.disabled = true;
    elements.uploadAttachmentButton.textContent = "저장 중";

    try {
      const now = getLocalTimestamp();
      const metas = [];
      for (const file of files) {
        const id = createId().replace("note_", "file_");
        const meta = {
          id,
          noteId,
          fileName: file.name,
          fileType: file.type || "application/octet-stream",
          fileSize: file.size,
          category: elements.attachmentCategory.value || "기타",
          sentDate: elements.attachmentSentDate.value,
          memo: clean(elements.attachmentMemo.value),
          uploadedAt: now
        };

        await putAttachmentRecord({
          ...meta,
          blob: file
        });
        metas.push(meta);
      }

      note.attachments.push(...metas);
      appendHistoryEntry(note, "파일 추가", metas.map((meta) => meta.fileName || "이름 없는 파일").join(" / "));
      note.updatedAt = getLocalTimestamp();
      if (saveState()) {
        elements.attachmentFileInput.value = "";
        elements.attachmentMemo.value = "";
        renderAttachmentSection(note);
        render();
        setSaveStatus(`첨부자료 ${metas.length}개 저장됨`, false);
      }
    } catch (error) {
      console.error(error);
      alert(`첨부자료를 저장하지 못했습니다.\n${error.message || error}`);
    } finally {
      elements.uploadAttachmentButton.textContent = "첨부자료 저장";
      renderAttachmentSection(getOpenNote());
    }
  }

  async function downloadAttachment(attachmentId) {
    try {
      const record = await getAttachmentRecord(attachmentId);
      if (!record || !record.blob) {
        alert("파일 원본을 찾지 못했습니다. JSON 백업만 옮긴 경우 파일 원본은 포함되지 않습니다.");
        return;
      }

      downloadBlob(record.blob, record.fileName || "attachment", record.fileType || "application/octet-stream");
    } catch (error) {
      console.error(error);
      alert(`첨부자료를 다운로드하지 못했습니다.\n${error.message || error}`);
    }
  }

  async function deleteAttachment(noteId, attachmentId) {
    const note = state.notes.find((item) => item.id === noteId);
    if (!note) {
      return;
    }

    const attachment = note.attachments.find((item) => item.id === attachmentId);
    const label = attachment ? attachment.fileName : "선택한 첨부자료";
    if (!confirm(`${label} 파일을 삭제할까요?`)) {
      return;
    }

    try {
      await deleteAttachmentRecord(attachmentId);
      note.attachments = note.attachments.filter((item) => item.id !== attachmentId);
      appendHistoryEntry(note, "파일 삭제", label);
      note.updatedAt = getLocalTimestamp();
      if (saveState()) {
        renderAttachmentSection(note);
        render();
      }
    } catch (error) {
      console.error(error);
      alert(`첨부자료를 삭제하지 못했습니다.\n${error.message || error}`);
    }
  }

  function openCurrentFormFiles(type) {
    const id = type === "sales"
      ? elements.noteId.value
      : type === "company"
        ? elements.companyRecordId.value
        : type === "settlement"
          ? elements.settlementTaskId.value
          : type === "output"
            ? elements.outputTaskId.value
            : elements.otherTaskId.value;

    if (!id) {
      alert("먼저 업무를 저장한 뒤 파일함을 열어 주세요.");
      return;
    }
    openFileDrawer(type, id);
  }

  function openFileDrawer(type, id) {
    const owner = getFileOwner(type, id);
    if (!owner) {
      alert("파일함을 열 업무를 찾지 못했습니다.");
      return;
    }

    activeFileContext = { type, id };
    clearFileDrawerSelection();
    elements.fileDrawerCategory.value = getDefaultFileCategory(type);
    elements.fileDrawerSentDate.value = getDefaultFileDate(type, owner);
    elements.fileDrawer.classList.remove("hidden");
    renderFileDrawer();
    syncOverlayState();
  }

  function closeFileDrawer() {
    activeFileContext = null;
    clearFileDrawerSelection();
    elements.fileDrawer.classList.add("hidden");
    elements.fileDrawerList.innerHTML = "";
    cleanupAttachmentPreviewUrls();
    syncOverlayState();
  }

  function closeFileDrawerIfContext(type, id) {
    if (activeFileContext && activeFileContext.type === type && activeFileContext.id === id) {
      closeFileDrawer();
    }
  }

  function clearFileDrawerSelection() {
    elements.fileDrawerFileInput.value = "";
    renderSelectedFileMemoInputs(elements.fileDrawerFileInput, elements.fileDrawerSelectedFiles);
  }

  function renderFileDrawer() {
    cleanupAttachmentPreviewUrls();
    const context = activeFileContext;
    const owner = context ? getFileOwner(context.type, context.id) : null;
    const canUseFiles = Boolean(window.indexedDB);

    if (!context || !owner) {
      elements.fileDrawerTitle.textContent = "관련 파일";
      elements.fileDrawerSubtitle.textContent = "업무를 선택해 주세요.";
      elements.fileDrawerCount.textContent = "0개";
      elements.fileDrawerList.innerHTML = "";
      elements.fileDrawerList.appendChild(createAttachmentEmpty("업무를 선택하면 관련 파일이 표시됩니다."));
      return;
    }

    const attachments = Array.isArray(owner.attachments) ? owner.attachments : [];
    elements.fileDrawerTitle.textContent = `${getFileTypeLabel(context.type)} 파일함`;
    elements.fileDrawerSubtitle.textContent = getFileOwnerTitle(context.type, owner);
    elements.fileDrawerCount.textContent = `${attachments.length}개`;
    elements.fileDrawerFileInput.disabled = !canUseFiles;
    elements.fileDrawerCategory.disabled = !canUseFiles;
    elements.fileDrawerSentDate.disabled = !canUseFiles;
    elements.fileDrawerUploadButton.disabled = !canUseFiles;
    elements.fileDrawerClearSelectionButton.disabled = !canUseFiles;

    elements.fileDrawerHint.textContent = canUseFiles
      ? "여러 파일을 한 번에 선택할 수 있고, 파일별 메모는 아래 선택 파일 목록에서 입력합니다."
      : "이 브라우저에서는 IndexedDB 파일 저장소를 사용할 수 없습니다.";

    elements.fileDrawerList.innerHTML = "";
    if (!attachments.length) {
      elements.fileDrawerList.appendChild(createAttachmentEmpty("아직 저장된 관련 파일이 없습니다."));
      return;
    }

    attachments
      .slice()
      .sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)))
      .forEach((attachment) => {
        elements.fileDrawerList.appendChild(createFileDrawerAttachmentItem(context.type, context.id, attachment));
      });
  }

  function createFileDrawerAttachmentItem(type, ownerId, attachment) {
    const item = document.createElement("article");
    item.className = "attachment-item file-drawer-item";

    const thumb = document.createElement("div");
    thumb.className = "attachment-thumb";
    thumb.textContent = getFileExtensionLabel(attachment.fileName);
    if (isImageFile(attachment)) {
      loadAttachmentThumbnail(attachment.id, thumb);
    }

    const body = document.createElement("div");
    body.className = "attachment-body";

    const name = document.createElement("div");
    name.className = "attachment-name";
    name.textContent = attachment.fileName || "이름 없는 파일";

    const meta = document.createElement("div");
    meta.className = "attachment-meta";
    meta.textContent = [
      formatFileSize(attachment.fileSize),
      formatDateTimeForDisplay(attachment.uploadedAt)
    ].filter(Boolean).join(" · ");

    const editGrid = document.createElement("div");
    editGrid.className = "file-edit-grid";

    const categoryLabel = document.createElement("label");
    const categoryText = document.createElement("span");
    categoryText.textContent = "자료 종류";
    const categorySelect = createFileCategorySelect(attachment.category || getDefaultFileCategory(type));
    categoryLabel.append(categoryText, categorySelect);

    const dateLabel = document.createElement("label");
    const dateText = document.createElement("span");
    dateText.textContent = "관련일";
    const sentDateInput = document.createElement("input");
    sentDateInput.type = "date";
    sentDateInput.value = attachment.sentDate || "";
    dateLabel.append(dateText, sentDateInput);

    const memoLabel = document.createElement("label");
    memoLabel.className = "file-edit-memo";
    const memoText = document.createElement("span");
    memoText.textContent = "파일 메모";
    const memoInput = document.createElement("textarea");
    memoInput.rows = 2;
    memoInput.value = attachment.memo || "";
    memoLabel.append(memoText, memoInput);

    editGrid.append(categoryLabel, dateLabel, memoLabel);

    const buttons = document.createElement("div");
    buttons.className = "attachment-buttons";

    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.textContent = "다운로드";
    downloadButton.addEventListener("click", () => downloadAttachment(attachment.id));

    const previewButton = createAttachmentPreviewButton(attachment);

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "수정 저장";
    saveButton.addEventListener("click", () => updateFileAttachment(type, ownerId, attachment.id, {
      category: categorySelect.value,
      sentDate: sentDateInput.value,
      memo: memoInput.value
    }));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-attachment-button";
    deleteButton.textContent = "삭제";
    deleteButton.addEventListener("click", () => deleteFileAttachment(type, ownerId, attachment.id));

    if (previewButton) {
      buttons.append(previewButton);
    }
    buttons.append(downloadButton, saveButton, deleteButton);
    body.append(name, meta, editGrid, buttons);
    item.append(thumb, body);
    return item;
  }

  function createFileCategorySelect(value) {
    const select = document.createElement("select");
    const current = clean(value) || "기타";
    const options = FILE_CATEGORY_OPTIONS.includes(current)
      ? FILE_CATEGORY_OPTIONS
      : [current, ...FILE_CATEGORY_OPTIONS];

    options.forEach((option) => {
      select.appendChild(new Option(option, option));
    });
    select.value = current;
    return select;
  }

  async function handleFileDrawerUpload() {
    const context = activeFileContext;
    const owner = context ? getFileOwner(context.type, context.id) : null;
    if (!context || !owner) {
      alert("파일을 추가할 업무를 먼저 선택해 주세요.");
      return;
    }

    const files = Array.from(elements.fileDrawerFileInput.files || []);
    if (!files.length) {
      alert("추가할 파일을 선택해 주세요.");
      return;
    }

    const fileMemos = getSelectedFileMemos(elements.fileDrawerSelectedFiles);
    elements.fileDrawerUploadButton.disabled = true;
    elements.fileDrawerUploadButton.textContent = "저장 중";

    try {
      const now = getLocalTimestamp();
      const metas = [];
      for (const [index, file] of files.entries()) {
        const id = createId().replace("note_", "file_");
        const meta = {
          id,
          noteId: owner.id,
          fileName: file.name,
          fileType: file.type || "application/octet-stream",
          fileSize: file.size,
          category: elements.fileDrawerCategory.value || getDefaultFileCategory(context.type),
          sentDate: elements.fileDrawerSentDate.value,
          memo: fileMemos[index] || "",
          uploadedAt: now
        };
        await putAttachmentRecord({ ...meta, blob: file });
        metas.push(meta);
      }

      owner.attachments.push(...metas);
      appendHistoryEntry(owner, "파일 추가", metas.map((meta) => meta.fileName || "이름 없는 파일").join(" / "));
      owner.updatedAt = now;
      if (saveState()) {
        clearFileDrawerSelection();
        render();
        renderAttachmentSection(getOpenNote());
        renderFileDrawer();
        setSaveStatus(`관련 파일 ${metas.length}개 저장됨`, false);
      }
    } catch (error) {
      console.error(error);
      alert(`관련 파일을 저장하지 못했습니다.\n${error.message || error}`);
    } finally {
      elements.fileDrawerUploadButton.textContent = "선택 파일 저장";
      if (activeFileContext) {
        renderFileDrawer();
      }
    }
  }

  async function updateFileAttachment(type, ownerId, attachmentId, values) {
    const owner = getFileOwner(type, ownerId);
    if (!owner) {
      return;
    }

    const attachment = owner.attachments.find((item) => item.id === attachmentId);
    if (!attachment) {
      return;
    }

    attachment.category = clean(values.category) || getDefaultFileCategory(type);
    attachment.sentDate = clean(values.sentDate);
    attachment.memo = clean(values.memo);
    appendHistoryEntry(owner, "파일 수정", attachment.fileName || "이름 없는 파일");
    owner.updatedAt = getLocalTimestamp();

    try {
      const record = await getAttachmentRecord(attachmentId);
      if (record) {
        await putAttachmentRecord({ ...record, ...attachment, blob: record.blob });
      }
    } catch (error) {
      console.warn("Attachment metadata update failed", error);
    }

    if (saveState()) {
      render();
      renderAttachmentSection(getOpenNote());
      renderFileDrawer();
      setSaveStatus("파일 정보가 수정됐습니다.", false);
    }
  }

  async function deleteFileAttachment(type, ownerId, attachmentId) {
    const owner = getFileOwner(type, ownerId);
    if (!owner) {
      return;
    }

    const attachment = owner.attachments.find((item) => item.id === attachmentId);
    const label = attachment ? attachment.fileName : "선택한 파일";
    if (!confirm(`${label} 파일을 삭제할까요?`)) {
      return;
    }

    try {
      await deleteAttachmentRecord(attachmentId);
      owner.attachments = owner.attachments.filter((item) => item.id !== attachmentId);
      appendHistoryEntry(owner, "파일 삭제", label);
      owner.updatedAt = getLocalTimestamp();
      if (saveState()) {
        render();
        renderAttachmentSection(getOpenNote());
        renderFileDrawer();
        setSaveStatus("파일이 삭제됐습니다.", false);
      }
    } catch (error) {
      console.error(error);
      alert(`파일을 삭제하지 못했습니다.\n${error.message || error}`);
    }
  }

  function getFileOwner(type, id) {
    if (type === "sales") {
      return state.notes.find((item) => item.id === id) || null;
    }
    if (type === "company") {
      return state.companies.find((item) => item.id === id) || null;
    }
    if (type === "output") {
      return state.outputTasks.find((item) => item.id === id) || null;
    }
    if (type === "settlement") {
      return state.settlementTasks.find((item) => item.id === id) || null;
    }
    if (type === "other") {
      return state.otherTasks.find((item) => item.id === id) || null;
    }
    return null;
  }

  function getFileTypeLabel(type) {
    if (type === "sales") {
      return "영업";
    }
    if (type === "company") {
      return "업체";
    }
    if (type === "output") {
      return "출력";
    }
    if (type === "settlement") {
      return "정산";
    }
    return "기타";
  }

  function getFileOwnerTitle(type, owner) {
    if (type === "sales") {
      return owner.company || owner.contactName || "고객사 미입력";
    }
    if (type === "company") {
      return owner.name || "업체명 미입력";
    }
    if (type === "output") {
      return owner.company || owner.outputType || "출력 업무";
    }
    if (type === "settlement") {
      return owner.company || owner.paymentType || "정산 업무";
    }
    return owner.title || "기타 업무";
  }

  function getDefaultFileCategory(type) {
    if (type === "settlement") {
      return "정산자료";
    }
    if (type === "company") {
      return "사업자등록증";
    }
    if (type === "output") {
      return "출력 파일";
    }
    if (type === "other") {
      return "기타 파일";
    }
    return "발송자료";
  }

  function getDefaultFileDate(type, owner) {
    if (type === "settlement") {
      return owner.nextActionDate || "";
    }
    if (type === "company") {
      return "";
    }
    if (type === "output" || type === "other") {
      return owner.endDate || owner.startDate || "";
    }
    return "";
  }

  function renderCompanies() {
    if (!elements.companyList) {
      return;
    }
    const companies = getFilteredCompanies();
    elements.companyListTitle.textContent = `업체 목록 ${companies.length}개`;
    elements.companyList.innerHTML = "";
    if (!companies.length) {
      elements.companyList.appendChild(createWorkEmpty("표시할 업체가 없습니다."));
      return;
    }
    companies.forEach((company) => elements.companyList.appendChild(createCompanyCard(company)));
  }

  function getFilteredCompanies() {
    const search = clean(elements.companySearchInput.value).toLowerCase();
    const status = elements.companyStatusFilter.value;
    const sort = elements.companySortSelect.value;
    return state.companies
      .filter((company) => {
        const matchesSearch = !search || getCompanySearchText(company).includes(search);
        const matchesStatus = status === "all" || company.status === status;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => compareCompanies(a, b, sort));
  }

  function createCompanyCard(company) {
    const card = document.createElement("article");
    card.className = "company-card";
    card.tabIndex = 0;
    card.addEventListener("click", (event) => {
      if (!event.target.closest("button, select, input, textarea")) {
        editCompany(company.id);
      }
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.target.closest("button, select, input, textarea")) {
        editCompany(company.id);
      }
    });

    const header = document.createElement("div");
    header.className = "company-card-header";
    const title = document.createElement("div");
    title.className = "company-card-title";
    const name = document.createElement("strong");
    name.textContent = company.name || "업체명 미입력";
    const meta = document.createElement("small");
    meta.textContent = [company.businessNumber, company.businessType, company.address].filter(Boolean).join(" · ") || "기본 정보 없음";
    title.append(name, meta);
    const status = createBadgeElement(company.status || "검토중", "badge-status");
    header.append(title, status);

    const contacts = document.createElement("div");
    contacts.className = "company-card-contacts";
    const contactItems = company.contacts.length ? company.contacts : [];
    if (!contactItems.length) {
      contacts.appendChild(createWorkLine("담당자", "없음"));
    } else {
      contactItems.slice(0, 3).forEach((contact) => {
        contacts.appendChild(createWorkLine(
          contact.isPrimary ? "기본 담당자" : "담당자",
          formatCompanyContactLine(contact)
        ));
      });
      if (contactItems.length > 3) {
        contacts.appendChild(createWorkLine("추가 담당자", `${contactItems.length - 3}명`));
      }
    }
    contacts.appendChild(createWorkLine("대표 연락처", company.mainPhone || "-"));
    contacts.appendChild(createWorkLine("대표 이메일", company.mainEmail || "-"));
    contacts.appendChild(createWorkLine("파일", company.attachments.length ? `${company.attachments.length}개` : "없음"));

    const memo = document.createElement("p");
    memo.className = "company-card-memo";
    memo.textContent = company.memo || "메모 없음";

    const actions = document.createElement("div");
    actions.className = "company-card-actions";
    actions.appendChild(createFolderButton("company", company.id, company.attachments.length));

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.textContent = "업체 보기";
    openButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openCustomerProfile(company.name, "");
    });

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "수정";
    editButton.addEventListener("click", (event) => {
      event.stopPropagation();
      editCompany(company.id);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-row-button";
    deleteButton.textContent = "삭제";
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteCompany(company.id);
    });

    actions.append(openButton, editButton, deleteButton);
    card.append(header, contacts, memo, actions);
    return card;
  }

  function renderAccounts() {
    elements.accountList.innerHTML = "";
    const query = clean(elements.accountSearchInput.value).toLowerCase();
    const accounts = state.accounts
      .filter((account) => !query || getAccountSearchText(account).includes(query))
      .sort((a, b) => compareByUpdatedAt(a, b, "desc") || compareTextValue(a.siteName, b.siteName, "asc"));

    if (!accounts.length) {
      elements.accountList.appendChild(createAttachmentEmpty(query ? "검색된 계정이 없습니다." : "아직 등록된 계정이 없습니다."));
      return;
    }

    accounts.forEach((account) => {
      elements.accountList.appendChild(createAccountCard(account));
    });
  }

  function createAccountCard(account) {
    const card = document.createElement("article");
    card.className = "account-card";
    card.tabIndex = 0;
    card.addEventListener("click", (event) => {
      if (!event.target.closest("button, a")) {
        editAccount(account.id);
      }
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.target.closest("button, a")) {
        editAccount(account.id);
      }
    });

    const header = document.createElement("div");
    header.className = "account-card-header";
    const title = document.createElement("div");
    title.className = "account-card-title";
    const name = document.createElement("strong");
    name.textContent = account.siteName || "홈페이지 이름 미입력";
    const link = document.createElement("small");
    link.textContent = account.siteUrl || "링크 없음";
    title.append(name, link);
    const purpose = createBadgeElement(account.purpose || "용도 미입력", "badge-status");
    header.append(title, purpose);

    const body = document.createElement("div");
    body.className = "account-card-body";
    body.append(
      createWorkLine("홈페이지", account.siteUrl || account.siteName || "-"),
      createWorkLine("아이디", account.username || "-"),
      createWorkLine("비밀번호", account.password ? "••••••••" : "-")
    );

    const meta = document.createElement("p");
    meta.className = "account-card-meta";
    meta.textContent = [
      account.owner ? `담당 ${account.owner}` : "",
      account.accountCreatedDate ? `생성 ${formatDateForDisplay(account.accountCreatedDate)}` : "",
      account.passwordChangedDate ? `변경 ${formatDateForDisplay(account.passwordChangedDate)}` : ""
    ].filter(Boolean).join(" · ") || "관리 정보 없음";

    const actions = document.createElement("div");
    actions.className = "account-card-actions";

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.textContent = "링크 열기";
    openButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openAccountLink(account);
    });

    const copyIdButton = document.createElement("button");
    copyIdButton.type = "button";
    copyIdButton.textContent = "아이디 복사";
    copyIdButton.addEventListener("click", (event) => {
      event.stopPropagation();
      copyAccountValue(account.username, "아이디");
    });

    const copyPasswordButton = document.createElement("button");
    copyPasswordButton.type = "button";
    copyPasswordButton.textContent = "비밀번호 복사";
    copyPasswordButton.addEventListener("click", (event) => {
      event.stopPropagation();
      copyAccountValue(account.password, "비밀번호");
    });

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "수정";
    editButton.addEventListener("click", (event) => {
      event.stopPropagation();
      editAccount(account.id);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-row-button";
    deleteButton.textContent = "삭제";
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteAccount(account.id);
    });

    actions.append(openButton, copyIdButton, copyPasswordButton, editButton, deleteButton);
    card.append(header, body, meta, actions);
    return card;
  }

  function openAccountEditorPanel() {
    elements.accountEditorPanel.classList.remove("hidden");
    syncOverlayState();
  }

  function hideAccountEditorPanel() {
    elements.accountEditorPanel.classList.add("hidden");
    syncOverlayState();
  }

  function closeAccountEditorPanel(options) {
    const config = options || {};
    if (!config.force && hasAccountFormContent() && !confirm("저장되지 않은 계정 작성 내용이 있습니다. 닫을까요?")) {
      return;
    }
    resetAccountForm();
    hideAccountEditorPanel();
  }

  function openNewAccount() {
    resetAccountForm();
    switchPortal("account");
    openAccountEditorPanel();
    elements.accountSiteName.focus();
  }

  function resetAccountForm() {
    elements.accountForm.reset();
    elements.accountId.value = "";
    elements.accountCreatedDate.value = getTodayDateString();
    elements.accountPasswordChangedDate.value = "";
    elements.accountFormTitle.textContent = "계정 등록";
    elements.saveAccountButton.textContent = "계정 저장";
    elements.deleteAccountButton.classList.add("hidden");
  }

  function hasAccountFormContent() {
    const hasCustomCreatedDate = clean(elements.accountCreatedDate.value) && clean(elements.accountCreatedDate.value) !== getTodayDateString();
    return [
      elements.accountId.value,
      elements.accountSiteName.value,
      elements.accountSiteUrl.value,
      elements.accountUsername.value,
      elements.accountPassword.value,
      elements.accountPurpose.value,
      elements.accountOwner.value,
      hasCustomCreatedDate ? elements.accountCreatedDate.value : "",
      elements.accountPasswordChangedDate.value,
      elements.accountMemo.value
    ].some((value) => clean(value));
  }

  function editAccount(id) {
    const account = getAccountById(id);
    if (!account) {
      return;
    }
    switchPortal("account");
    elements.accountId.value = account.id;
    elements.accountSiteName.value = account.siteName;
    elements.accountSiteUrl.value = account.siteUrl;
    elements.accountUsername.value = account.username;
    elements.accountPassword.value = account.password;
    elements.accountPurpose.value = account.purpose;
    elements.accountOwner.value = account.owner;
    elements.accountCreatedDate.value = account.accountCreatedDate;
    elements.accountPasswordChangedDate.value = account.passwordChangedDate;
    elements.accountMemo.value = account.memo;
    elements.accountFormTitle.textContent = "계정 수정";
    elements.saveAccountButton.textContent = "수정 저장";
    elements.deleteAccountButton.classList.remove("hidden");
    openAccountEditorPanel();
    elements.accountSiteName.focus();
  }

  function handleAccountSubmit(event) {
    event.preventDefault();
    const now = getLocalTimestamp();
    const existingId = elements.accountId.value;
    const id = existingId || createId().replace("note_", "account_");
    const index = state.accounts.findIndex((account) => account.id === id);
    const previous = index >= 0 ? state.accounts[index] : null;
    const account = normalizeAccount({
      id,
      siteName: elements.accountSiteName.value,
      siteUrl: elements.accountSiteUrl.value,
      username: elements.accountUsername.value,
      password: elements.accountPassword.value,
      purpose: elements.accountPurpose.value,
      owner: elements.accountOwner.value,
      accountCreatedDate: elements.accountCreatedDate.value,
      passwordChangedDate: elements.accountPasswordChangedDate.value,
      memo: elements.accountMemo.value,
      createdAt: previous ? previous.createdAt : now,
      updatedAt: now
    });

    if (!account || (!account.siteName && !account.siteUrl && !account.username)) {
      alert("홈페이지 이름, 링크, 아이디 중 하나는 입력해 주세요.");
      return;
    }

    if (index >= 0) {
      state.accounts[index] = account;
    } else {
      state.accounts.unshift(account);
    }

    if (saveState()) {
      closeAccountEditorPanel({ force: true });
      render();
      setSaveStatus("계정 정보가 저장됐습니다.", false);
    }
  }

  function handleAccountDelete() {
    const id = elements.accountId.value;
    if (id) {
      deleteAccount(id);
    }
  }

  function deleteAccount(id) {
    const account = getAccountById(id);
    if (!account) {
      return;
    }
    if (!confirm(`${account.siteName || "선택한 계정"}을 삭제할까요?`)) {
      return;
    }
    state.accounts = state.accounts.filter((item) => item.id !== id);
    if (saveState()) {
      closeAccountEditorPanel({ force: true });
      render();
      setSaveStatus("계정이 삭제됐습니다.", false);
    }
  }

  function getAccountById(id) {
    return state.accounts.find((account) => account.id === id) || null;
  }

  function getAccountSearchText(account) {
    return [
      account.siteName,
      account.siteUrl,
      account.username,
      account.purpose,
      account.owner,
      account.accountCreatedDate,
      account.passwordChangedDate,
      account.memo
    ].join(" ").toLowerCase();
  }

  function openAccountLink(account) {
    const url = normalizeExternalUrl(account.siteUrl);
    if (!url) {
      alert("열 홈페이지 링크가 없습니다.");
      return;
    }
    window.open(url, "_blank", "noopener");
  }

  function normalizeExternalUrl(value) {
    const url = clean(value);
    if (!url) {
      return "";
    }
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  }

  async function copyAccountValue(value, label) {
    const text = clean(value);
    if (!text) {
      alert(`복사할 ${label}가 없습니다.`);
      return;
    }
    try {
      await copyTextToClipboard(text);
      setSaveStatus(`${label}가 복사됐습니다.`, false);
    } catch (error) {
      console.error(error);
      alert(`${label}를 복사하지 못했습니다.`);
    }
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    if (!ok) {
      throw new Error("copy failed");
    }
  }

  function compareCompanies(a, b, sort) {
    if (sort === "updated") {
      return compareByUpdatedAt(a, b, "desc");
    }
    if (sort === "status") {
      return compareTextValue(a.status, b.status, "asc") || compareTextValue(a.name, b.name, "asc");
    }
    return compareTextValue(a.name, b.name, "asc") || compareByUpdatedAt(a, b, "desc");
  }

  function openCompanyEditorPanel() {
    elements.companyEditorPanel.classList.remove("hidden");
    syncOverlayState();
  }

  function hideCompanyEditorPanel() {
    elements.companyEditorPanel.classList.add("hidden");
    syncOverlayState();
  }

  function closeCompanyEditorPanel(options) {
    const config = options || {};
    if (!config.force && hasCompanyFormContent() && !confirm("저장되지 않은 업체 작성 내용이 있습니다. 닫을까요?")) {
      return;
    }
    resetCompanyForm();
    hideCompanyEditorPanel();
  }

  function openNewCompany() {
    resetCompanyForm();
    switchPortal("company");
    openCompanyEditorPanel();
    elements.companyName.focus();
  }

  function resetCompanyForm() {
    elements.companyForm.reset();
    elements.companyRecordId.value = "";
    elements.companyStatus.value = "검토중";
    renderCompanyContactRows([]);
    elements.openCurrentCompanyFilesButton.classList.add("hidden");
    elements.companyFormTitle.textContent = "업체 등록";
    elements.saveCompanyButton.textContent = "업체 저장";
    elements.deleteCompanyButton.classList.add("hidden");
  }

  function hasCompanyFormContent() {
    return [
      elements.companyRecordId.value,
      elements.companyName.value,
      elements.companyBusinessNumber.value,
      elements.companyRepresentative.value,
      elements.companyBusinessType.value,
      elements.companyAddress.value,
      elements.companyMainPhone.value,
      elements.companyMainEmail.value,
      elements.companyMemo.value,
      ...getCompanyContactRowsFromDom().flatMap((contact) => [
        contact.name,
        contact.department,
        contact.title,
        contact.phone,
        contact.email,
        contact.memo
      ])
    ].some((value) => clean(value));
  }

  function editCompany(id) {
    const company = getCompanyById(id);
    if (!company) {
      return;
    }
    switchPortal("company");
    elements.companyRecordId.value = company.id;
    elements.companyName.value = company.name;
    elements.companyBusinessNumber.value = company.businessNumber;
    elements.companyRepresentative.value = company.representative;
    elements.companyBusinessType.value = company.businessType;
    elements.companyStatus.value = company.status || "검토중";
    elements.companyAddress.value = company.address;
    elements.companyMainPhone.value = company.mainPhone;
    elements.companyMainEmail.value = company.mainEmail;
    elements.companyMemo.value = company.memo;
    renderCompanyContactRows(company.contacts);
    elements.openCurrentCompanyFilesButton.classList.remove("hidden");
    elements.companyFormTitle.textContent = "업체 수정";
    elements.saveCompanyButton.textContent = "수정 저장";
    elements.deleteCompanyButton.classList.remove("hidden");
    openCompanyEditorPanel();
    elements.companyName.focus();
  }

  async function handleCompanySubmit(event) {
    event.preventDefault();
    const now = getLocalTimestamp();
    const existingId = elements.companyRecordId.value;
    const id = existingId || createId().replace("note_", "company_");
    const index = state.companies.findIndex((company) => company.id === id);
    const previous = index >= 0 ? state.companies[index] : null;
    const contacts = getCompanyContactRowsFromDom().map(normalizeCompanyContact).filter(Boolean);
    ensurePrimaryCompanyContact(contacts);

    const company = normalizeCompany({
      id,
      name: elements.companyName.value,
      businessNumber: elements.companyBusinessNumber.value,
      representative: elements.companyRepresentative.value,
      businessType: elements.companyBusinessType.value,
      status: elements.companyStatus.value,
      address: elements.companyAddress.value,
      mainPhone: elements.companyMainPhone.value,
      mainEmail: elements.companyMainEmail.value,
      memo: elements.companyMemo.value,
      contacts,
      attachments: previous ? previous.attachments.slice() : [],
      createdAt: previous ? previous.createdAt : now,
      updatedAt: now
    });

    if (!company || !company.name) {
      alert("업체명을 입력해 주세요.");
      return;
    }

    if (isDuplicateCompanyName(company.name, company.id)) {
      alert("같은 이름의 업체가 이미 있습니다.");
      return;
    }

    const similarCompanies = findSimilarCompanies(company.name, company.id);
    if (similarCompanies.length) {
      const message = [
        "비슷한 이름의 업체가 있습니다.",
        "",
        ...similarCompanies.slice(0, 5).map((item) => `- ${item.name}`),
        "",
        "자동 병합은 하지 않습니다. 그래도 현재 업체를 저장할까요?"
      ].join("\n");
      if (!confirm(message)) {
        return;
      }
    }

    company.history = previous ? cloneHistory(previous.history) : [];
    if (previous) {
      recordChangedFields(company, previous, company, ["name", "businessNumber", "representative", "businessType", "status", "address", "mainPhone", "mainEmail", "contacts", "memo"]);
    } else {
      appendHistoryEntry(company, "생성", "업체 등록");
    }

    if (index >= 0) {
      state.companies[index] = company;
    } else {
      state.companies.unshift(company);
    }

    linkSalesNotesToCompany(company);
    linkWorkTasksToCompany(company);
    syncLinkedSalesNotesFromCompany(company);
    syncLinkedWorkTasksFromCompany(company);
    if (saveState()) {
      closeCompanyEditorPanel({ force: true });
      render();
      setSaveStatus("업체 정보가 저장됐습니다.", false);
    }
  }

  function handleCompanyDelete() {
    const id = elements.companyRecordId.value;
    if (id) {
      deleteCompany(id);
    }
  }

  async function deleteCompany(id) {
    const company = getCompanyById(id);
    if (!company) {
      return;
    }
    const linkedCount = state.notes.filter((note) => note.companyId === id).length;
    const linkedWorkCount = [...state.settlementTasks, ...state.outputTasks, ...state.otherTasks].filter((task) => task.companyId === id).length;
    const attachmentMessage = company.attachments.length ? `\n연결된 업체 파일 ${company.attachments.length}개도 함께 삭제됩니다.` : "";
    const linkedMessage = linkedCount || linkedWorkCount
      ? `\n이 업체와 연결된 영업 메모 ${linkedCount}건, 업무 ${linkedWorkCount}건은 업체 연결만 해제되고 내용은 남습니다.`
      : "";
    if (!confirm(`${company.name || "선택한 업체"}를 삭제할까요?${linkedMessage}${attachmentMessage}`)) {
      return;
    }
    try {
      await deleteAttachmentRecords(company.attachments);
    } catch (error) {
      console.error(error);
      if (!confirm(`업체 파일 원본을 삭제하지 못했습니다.\n${error.message || error}\n\n업체 목록에서만 삭제할까요?`)) {
        return;
      }
    }
    state.notes.forEach((note) => {
      if (note.companyId === id) {
        note.companyId = "";
        note.contactId = "";
      }
    });
    [...state.settlementTasks, ...state.outputTasks, ...state.otherTasks].forEach((task) => {
      if (task.companyId === id) {
        task.companyId = "";
        task.contactId = "";
      }
    });
    state.companies = state.companies.filter((item) => item.id !== id);
    if (saveState()) {
      closeFileDrawerIfContext("company", id);
      closeCompanyEditorPanel({ force: true });
      render();
      setSaveStatus("업체가 삭제됐습니다.", false);
    }
  }

  function renderCompanyContactRows(contacts) {
    elements.companyContactList.innerHTML = "";
    const items = Array.isArray(contacts) ? contacts : [];
    if (!items.length) {
      appendCompanyContactRow({
        id: createId().replace("note_", "contact_"),
        isPrimary: true
      });
      return;
    }
    items.forEach((contact) => appendCompanyContactRow(contact));
    updateCompanyContactCount();
  }

  function appendCompanyContactRow(values) {
    const contact = values || {};
    const row = document.createElement("div");
    row.className = "company-contact-row";
    row.dataset.contactId = clean(contact.id) || createId().replace("note_", "contact_");

    row.append(
      createCompanyContactInput("담당자명", "contact-name", contact.name, "예: 홍길동"),
      createCompanyContactInput("부서", "contact-department", contact.department, "예: 구매팀"),
      createCompanyContactInput("직함", "contact-title", contact.title, "예: 책임"),
      createCompanyContactInput("연락처", "contact-phone", contact.phone, "010-0000-0000"),
      createCompanyContactInput("이메일", "contact-email", contact.email, "name@example.com"),
      createCompanyContactInput("메모", "contact-memo", contact.memo, "역할, 주의사항")
    );

    const primaryLabel = document.createElement("label");
    primaryLabel.className = "checkbox-label company-contact-primary";
    const primaryInput = document.createElement("input");
    primaryInput.type = "radio";
    primaryInput.name = "companyPrimaryContact";
    primaryInput.checked = Boolean(contact.isPrimary) || !elements.companyContactList.children.length;
    primaryLabel.append(primaryInput, document.createElement("span"));
    primaryLabel.querySelector("span").textContent = "기본";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger-button company-contact-delete";
    deleteButton.textContent = "삭제";
    deleteButton.addEventListener("click", () => {
      row.remove();
      if (!elements.companyContactList.querySelector('input[name="companyPrimaryContact"]:checked')) {
        const first = elements.companyContactList.querySelector('input[name="companyPrimaryContact"]');
        if (first) {
          first.checked = true;
        }
      }
      updateCompanyContactCount();
    });

    row.append(primaryLabel, deleteButton);
    elements.companyContactList.appendChild(row);
    updateCompanyContactCount();
  }

  function createCompanyContactInput(label, className, value, placeholder) {
    const wrap = document.createElement("label");
    const span = document.createElement("span");
    span.textContent = label;
    const input = document.createElement("input");
    input.type = className === "contact-email" ? "email" : className === "contact-phone" ? "tel" : "text";
    input.className = className;
    input.value = value || "";
    input.placeholder = placeholder || "";
    wrap.append(span, input);
    return wrap;
  }

  function getCompanyContactRowsFromDom() {
    return Array.from(elements.companyContactList.querySelectorAll(".company-contact-row")).map((row) => ({
      id: row.dataset.contactId || "",
      name: row.querySelector(".contact-name").value,
      department: row.querySelector(".contact-department").value,
      title: row.querySelector(".contact-title").value,
      phone: row.querySelector(".contact-phone").value,
      email: row.querySelector(".contact-email").value,
      memo: row.querySelector(".contact-memo").value,
      isPrimary: Boolean(row.querySelector('input[name="companyPrimaryContact"]').checked)
    }));
  }

  function updateCompanyContactCount() {
    elements.companyContactCount.textContent = `${elements.companyContactList.children.length}명`;
  }

  function handleImportCompaniesFromWork() {
    const result = importCompaniesFromWorkData();
    if (!result.created && !result.updated && !result.linked) {
      alert("가져올 새 업체 정보가 없습니다.");
      return;
    }
    if (saveState()) {
      render();
      alert(`기존 메모에서 업체 정보를 가져왔습니다.\n새 업체 ${result.created}개, 담당자 보강 ${result.updated}건, 업무 연결 ${result.linked}건`);
    }
  }

  function importCompaniesFromWorkData() {
    const byKey = new Map(state.companies.map((company) => [normalizeCustomerKey(company.name), company]));
    const rows = [];
    state.notes.forEach((note) => rows.push(createCompanyImportRow(note.company, note.contactName, note.contactPhone, note.contactEmail, note.memo)));
    state.settlementTasks.forEach((task) => rows.push(createCompanyImportRow(task.company, task.contactName, task.contactPhone, task.contactEmail, task.memo)));
    state.outputTasks.forEach((task) => rows.push(createCompanyImportRow(task.company, task.contactName, task.contactPhone, task.contactEmail, task.memo)));
    state.otherTasks.forEach((task) => rows.push(createCompanyImportRow(task.company, task.contactName, task.contactPhone, task.contactEmail, task.memo)));

    let created = 0;
    let updated = 0;
    let linked = 0;
    rows.forEach((row) => {
      if (!row.name) {
        return;
      }
      const key = normalizeCustomerKey(row.name);
      let company = byKey.get(key);
      if (!company) {
        company = normalizeCompany({
          id: createId().replace("note_", "company_"),
          name: row.name,
          status: "검토중",
          contacts: row.contact ? [row.contact] : [],
          memo: ""
        });
        state.companies.push(company);
        byKey.set(key, company);
        created += 1;
      } else if (row.contact && addContactToCompanyIfMissing(company, row.contact)) {
        updated += 1;
      }
    });
    state.companies.forEach((company) => {
      ensurePrimaryCompanyContact(company.contacts);
      linked += linkSalesNotesToCompany(company);
      linked += linkWorkTasksToCompany(company);
      syncLinkedSalesNotesFromCompany(company);
      syncLinkedWorkTasksFromCompany(company);
    });
    state.updatedAt = getLocalTimestamp();
    return { created, updated, linked };
  }

  function createCompanyImportRow(name, contactName, phone, email, memo) {
    const contact = normalizeCompanyContact({
      name: contactName,
      phone,
      email,
      memo: ""
    });
    return {
      name: clean(name),
      contact,
      memo: clean(memo)
    };
  }

  function addContactToCompanyIfMissing(company, contact) {
    const normalized = normalizeCompanyContact(contact);
    if (!normalized) {
      return false;
    }
    const signature = createCompanyContactSignature(normalized);
    const exists = company.contacts.some((item) => createCompanyContactSignature(item) === signature);
    if (exists) {
      return false;
    }
    company.contacts.push(normalized);
    company.updatedAt = getLocalTimestamp();
    return true;
  }

  function createCompanyContactSignature(contact) {
    return [
      normalizeTextForCompare(contact.name),
      normalizeTextForCompare(contact.phone),
      normalizeTextForCompare(contact.email)
    ].join("|");
  }

  function renderSalesCompanyPicker() {
    if (!elements.salesCompanyResults) {
      return;
    }
    const isUnknown = Boolean(elements.salesCompanyUnknown.checked);
    const selectedCompany = getCompanyById(elements.salesCompanyId.value);
    const selectedContact = selectedCompany ? getCompanyContactById(selectedCompany, elements.salesContactId.value) : null;
    const query = clean(elements.salesCompanySearch.value).toLowerCase();
    elements.salesCompanySearch.disabled = isUnknown;
    elements.salesCompanyLinkCount.textContent = isUnknown ? "미정" : selectedCompany ? "연결됨" : "연결 안 함";
    renderSalesSelectedCompany(selectedCompany, selectedContact);
    renderSalesContactPicker(selectedCompany, selectedContact);

    elements.salesCompanyResults.innerHTML = "";
    if (isUnknown) {
      elements.salesCompanyResults.appendChild(createSalesLinkEmpty("관련 업체를 아직 정하지 않은 상태로 저장됩니다."));
      return;
    }
    if (!state.companies.length) {
      elements.salesCompanyResults.appendChild(createSalesLinkEmpty("등록된 업체가 없습니다. 업체 탭에서 먼저 등록해 주세요."));
      return;
    }
    const candidates = state.companies
      .filter((company) => !query || getCompanySearchText(company).includes(query))
      .sort((a, b) => compareTextValue(a.name, b.name, "asc"))
      .slice(0, 8);
    if (!candidates.length) {
      elements.salesCompanyResults.appendChild(createSalesLinkEmpty("검색 결과가 없습니다."));
      return;
    }
    candidates.forEach((company) => elements.salesCompanyResults.appendChild(createSalesCompanyResult(company)));
  }

  function renderSalesSelectedCompany(company, contact) {
    elements.salesCompanySelected.innerHTML = "";
    if (elements.salesCompanyUnknown.checked) {
      elements.salesCompanySelected.appendChild(createSalesLinkEmpty("관련 업체 미정으로 저장됩니다."));
      return;
    }
    if (!company) {
      const legacyCompany = clean(elements.company.value);
      elements.salesCompanySelected.appendChild(createSalesLinkEmpty(legacyCompany
        ? `기존 고객사명 "${legacyCompany}"은 업체 목록과 연결되지 않았습니다.`
        : "업체를 선택하지 않았습니다."));
      return;
    }
    const card = document.createElement("div");
    card.className = "sales-link-selected-card";
    const body = document.createElement("div");
    body.className = "sales-link-body";
    const title = document.createElement("strong");
    title.textContent = company.name || "업체명 미입력";
    const meta = document.createElement("small");
    meta.textContent = [
      company.status,
      contact ? formatCompanyContactLine(contact) : "담당자 미선택",
      company.mainPhone,
      company.mainEmail
    ].filter(Boolean).join(" · ");
    const detail = document.createElement("span");
    detail.textContent = company.address || company.businessType || "";
    body.append(title, meta, detail);

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "sales-link-clear-button";
    clearButton.textContent = "해제";
    clearButton.addEventListener("click", clearSalesCompanySelection);
    card.append(body, clearButton);
    elements.salesCompanySelected.appendChild(card);
  }

  function renderSalesContactPicker(company, selectedContact) {
    const contacts = company ? company.contacts : [];
    elements.salesContactPickerField.classList.toggle("hidden", elements.salesCompanyUnknown.checked || !company || !contacts.length);
    elements.salesContactPicker.innerHTML = "";
    if (elements.salesCompanyUnknown.checked || !company || !contacts.length) {
      return;
    }
    elements.salesContactPicker.appendChild(new Option("담당자 선택 안 함", ""));
    contacts.forEach((contact) => {
      elements.salesContactPicker.appendChild(new Option(formatCompanyContactLine(contact), contact.id));
    });
    elements.salesContactPicker.value = selectedContact ? selectedContact.id : "";
  }

  function createSalesCompanyResult(company) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sales-link-result";
    button.addEventListener("click", () => selectSalesCompany(company.id));

    const body = document.createElement("div");
    body.className = "sales-link-body";
    const title = document.createElement("strong");
    title.textContent = company.name || "업체명 미입력";
    const meta = document.createElement("small");
    const primary = getPrimaryCompanyContact(company);
    meta.textContent = [
      company.status,
      company.businessNumber,
      primary ? formatCompanyContactLine(primary) : "",
      company.mainPhone
    ].filter(Boolean).join(" · ");
    const detail = document.createElement("span");
    detail.textContent = company.address || company.memo || "";
    body.append(title, meta, detail);
    button.appendChild(body);
    return button;
  }

  function selectSalesCompany(companyId) {
    const company = getCompanyById(companyId);
    if (!company) {
      return;
    }
    const contact = getPrimaryCompanyContact(company);
    elements.salesCompanyUnknown.checked = false;
    elements.salesCompanyId.value = company.id;
    elements.salesContactId.value = contact ? contact.id : "";
    applyCompanyToSalesForm(company, contact);
    renderSalesCompanyPicker();
    queueDraftSave();
  }

  function handleSalesContactPickerChange() {
    const company = getCompanyById(elements.salesCompanyId.value);
    const contact = company ? getCompanyContactById(company, elements.salesContactPicker.value) : null;
    elements.salesContactId.value = contact ? contact.id : "";
    if (company) {
      applyCompanyToSalesForm(company, contact);
    }
    renderSalesCompanyPicker();
    queueDraftSave();
  }

  function clearSalesCompanySelection() {
    elements.salesCompanyId.value = "";
    elements.salesContactId.value = "";
    elements.salesCompanySearch.value = "";
    elements.company.value = "";
    elements.contactName.value = "";
    elements.contactPhone.value = "";
    elements.contactEmail.value = "";
    renderSalesCompanyPicker();
    queueDraftSave();
  }

  function handleSalesCompanyUnknownChange() {
    if (elements.salesCompanyUnknown.checked) {
      clearSalesCompanySelection();
      elements.salesCompanyUnknown.checked = true;
    }
    renderSalesCompanyPicker();
    queueDraftSave();
  }

  function applyCompanyToSalesForm(company, contact) {
    elements.company.value = company.name || "";
    if (contact) {
      elements.contactName.value = contact.name || "";
      elements.contactPhone.value = contact.phone || "";
      elements.contactEmail.value = contact.email || "";
    } else {
      elements.contactName.value = "";
      elements.contactPhone.value = company.mainPhone || "";
      elements.contactEmail.value = company.mainEmail || "";
    }
  }

  function syncLinkedSalesNotesFromCompany(company) {
    state.notes.forEach((note) => {
      if (note.companyId !== company.id) {
        return;
      }
      const contact = getCompanyContactById(company, note.contactId);
      note.company = company.name;
      if (contact) {
        note.contactId = contact.id;
        note.contactName = contact.name;
        note.contactPhone = contact.phone;
        note.contactEmail = contact.email;
      }
    });
  }

  function syncLinkedWorkTasksFromCompany(company) {
    [...state.settlementTasks, ...state.outputTasks, ...state.otherTasks].forEach((task) => {
      if (task.companyId !== company.id) {
        return;
      }
      const contact = getCompanyContactById(company, task.contactId);
      task.company = company.name;
      if (contact) {
        task.contactId = contact.id;
        task.contactName = contact.name;
        task.contactPhone = contact.phone;
        task.contactEmail = contact.email;
      }
    });
  }

  function linkSalesNotesToCompany(company) {
    const key = normalizeCustomerKey(company.name);
    if (!key) {
      return 0;
    }
    let linked = 0;
    state.notes.forEach((note) => {
      if (note.companyId || !isSameCustomerKey(note.company, key)) {
        return;
      }
      note.companyId = company.id;
      const contact = findCompanyContactForSalesNote(company, note);
      if (contact) {
        note.contactId = contact.id;
      }
      linked += 1;
    });
    return linked;
  }

  function linkWorkTasksToCompany(company) {
    const key = normalizeCustomerKey(company.name);
    if (!key) {
      return 0;
    }
    let linked = 0;
    [...state.settlementTasks, ...state.outputTasks, ...state.otherTasks].forEach((task) => {
      if (task.companyId || task.companyUnknown || !isSameCustomerKey(task.company, key)) {
        return;
      }
      task.companyId = company.id;
      const contact = findCompanyContactForWorkItem(company, task);
      if (contact) {
        task.contactId = contact.id;
      }
      linked += 1;
    });
    return linked;
  }

  function findCompanyContactForSalesNote(company, note) {
    return findCompanyContactForWorkItem(company, note);
  }

  function findCompanyContactForWorkItem(company, item) {
    const contacts = company && Array.isArray(company.contacts) ? company.contacts : [];
    if (!contacts.length) {
      return null;
    }
    const email = normalizeTextForCompare(item && item.contactEmail);
    const phone = normalizeTextForCompare(item && item.contactPhone);
    const name = normalizeTextForCompare(item && item.contactName);
    return contacts.find((contact) => email && normalizeTextForCompare(contact.email) === email)
      || contacts.find((contact) => phone && normalizeTextForCompare(contact.phone) === phone)
      || contacts.find((contact) => name && normalizeTextForCompare(contact.name) === name)
      || null;
  }

  function getWorkCompanyPickerElements(type) {
    if (type === "settlement") {
      return {
        type,
        companyId: elements.settlementCompanyId,
        contactId: elements.settlementContactId,
        unknown: elements.settlementCompanyUnknown,
        search: elements.settlementCompanySearch,
        selected: elements.settlementCompanySelected,
        results: elements.settlementCompanyResults,
        count: elements.settlementCompanyLinkCount,
        contactField: elements.settlementContactPickerField,
        contactPicker: elements.settlementContactPicker,
        companyInput: elements.settlementCompany,
        contactName: elements.settlementContactName,
        contactPhone: elements.settlementContactPhone,
        contactEmail: elements.settlementContactEmail
      };
    }
    if (type === "output") {
      return {
        type,
        companyId: elements.outputCompanyId,
        contactId: elements.outputContactId,
        unknown: elements.outputCompanyUnknown,
        search: elements.outputCompanySearch,
        selected: elements.outputCompanySelected,
        results: elements.outputCompanyResults,
        count: elements.outputCompanyLinkCount,
        contactField: elements.outputContactPickerField,
        contactPicker: elements.outputContactPicker,
        companyInput: elements.outputCompany,
        contactName: elements.outputContactName,
        contactPhone: elements.outputContactPhone,
        contactEmail: elements.outputContactEmail
      };
    }
    return {
      type,
      companyId: elements.otherCompanyId,
      contactId: elements.otherContactId,
      unknown: elements.otherCompanyUnknown,
      search: elements.otherCompanySearch,
      selected: elements.otherCompanySelected,
      results: elements.otherCompanyResults,
      count: elements.otherCompanyLinkCount,
      contactField: elements.otherContactPickerField,
      contactPicker: elements.otherContactPicker,
      companyInput: elements.otherCompany,
      contactName: elements.otherContactName,
      contactPhone: elements.otherContactPhone,
      contactEmail: elements.otherContactEmail
    };
  }

  function renderWorkCompanyPicker(type) {
    const picker = getWorkCompanyPickerElements(type);
    if (!picker || !picker.results) {
      return;
    }
    const isUnknown = Boolean(picker.unknown.checked);
    const selectedCompany = getCompanyById(picker.companyId.value);
    const selectedContact = selectedCompany ? getCompanyContactById(selectedCompany, picker.contactId.value) : null;
    const query = clean(picker.search.value).toLowerCase();

    picker.search.disabled = isUnknown;
    picker.count.textContent = isUnknown ? "미정" : selectedCompany ? "연결됨" : "연결 안 함";
    renderWorkSelectedCompany(picker, selectedCompany, selectedContact);
    renderWorkContactPicker(picker, selectedCompany, selectedContact);

    picker.results.innerHTML = "";
    if (isUnknown) {
      picker.results.appendChild(createSalesLinkEmpty("관련 업체를 아직 정하지 않은 상태입니다."));
      return;
    }
    if (!state.companies.length) {
      picker.results.appendChild(createSalesLinkEmpty("등록된 업체가 없습니다. 업체 탭에서 먼저 등록해 주세요."));
      return;
    }

    const candidates = state.companies
      .filter((company) => !query || getCompanySearchText(company).includes(query))
      .sort((a, b) => compareTextValue(a.name, b.name, "asc"))
      .slice(0, 8);
    if (!candidates.length) {
      picker.results.appendChild(createSalesLinkEmpty("검색 결과가 없습니다."));
      return;
    }
    candidates.forEach((company) => picker.results.appendChild(createWorkCompanyResult(picker.type, company)));
  }

  function renderWorkSelectedCompany(picker, company, contact) {
    picker.selected.innerHTML = "";
    const isUnknown = Boolean(picker.unknown.checked);
    if (isUnknown) {
      picker.selected.appendChild(createSalesLinkEmpty("관련 업체 미정으로 저장됩니다."));
      return;
    }
    if (!company) {
      const legacyCompany = clean(picker.companyInput.value);
      picker.selected.appendChild(createSalesLinkEmpty(legacyCompany
        ? `기존 업체명 "${legacyCompany}"은 업체 목록과 연결되지 않았습니다.`
        : "업체를 선택하지 않았습니다."));
      return;
    }

    const card = document.createElement("div");
    card.className = "sales-link-selected-card";
    const body = document.createElement("div");
    body.className = "sales-link-body";
    const title = document.createElement("strong");
    title.textContent = company.name || "업체명 미입력";
    const meta = document.createElement("small");
    meta.textContent = [
      company.status,
      contact ? formatCompanyContactLine(contact) : "담당자 미선택",
      company.mainPhone,
      company.mainEmail
    ].filter(Boolean).join(" · ");
    const detail = document.createElement("span");
    detail.textContent = company.address || company.businessType || "";
    body.append(title, meta, detail);

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "sales-link-clear-button";
    clearButton.textContent = "해제";
    clearButton.addEventListener("click", () => clearWorkCompanySelection(picker.type));
    card.append(body, clearButton);
    picker.selected.appendChild(card);
  }

  function renderWorkContactPicker(picker, company, selectedContact) {
    const contacts = company ? company.contacts : [];
    picker.contactField.classList.toggle("hidden", Boolean(picker.unknown.checked) || !company || !contacts.length);
    picker.contactPicker.innerHTML = "";
    if (Boolean(picker.unknown.checked) || !company || !contacts.length) {
      return;
    }
    picker.contactPicker.appendChild(new Option("담당자 선택 안 함", ""));
    contacts.forEach((contact) => {
      picker.contactPicker.appendChild(new Option(formatCompanyContactLine(contact), contact.id));
    });
    picker.contactPicker.value = selectedContact ? selectedContact.id : "";
  }

  function createWorkCompanyResult(type, company) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sales-link-result";
    button.addEventListener("click", () => selectWorkCompany(type, company.id));

    const body = document.createElement("div");
    body.className = "sales-link-body";
    const title = document.createElement("strong");
    title.textContent = company.name || "업체명 미입력";
    const primary = getPrimaryCompanyContact(company);
    const meta = document.createElement("small");
    meta.textContent = [
      company.status,
      company.businessNumber,
      primary ? formatCompanyContactLine(primary) : "",
      company.mainPhone
    ].filter(Boolean).join(" · ");
    const detail = document.createElement("span");
    detail.textContent = company.address || company.memo || "";
    body.append(title, meta, detail);
    button.appendChild(body);
    return button;
  }

  function selectWorkCompany(type, companyId) {
    const picker = getWorkCompanyPickerElements(type);
    const company = getCompanyById(companyId);
    if (!company) {
      return;
    }
    const contact = getPrimaryCompanyContact(company);
    picker.unknown.checked = false;
    picker.companyId.value = company.id;
    picker.contactId.value = contact ? contact.id : "";
    picker.search.value = "";
    applyCompanyToWorkForm(picker, company, contact);
    renderWorkCompanyPicker(type);
  }

  function handleWorkContactPickerChange(type) {
    const picker = getWorkCompanyPickerElements(type);
    const company = getCompanyById(picker.companyId.value);
    const contact = company ? getCompanyContactById(company, picker.contactPicker.value) : null;
    picker.contactId.value = contact ? contact.id : "";
    if (company) {
      applyCompanyToWorkForm(picker, company, contact);
    }
    renderWorkCompanyPicker(type);
  }

  function clearWorkCompanySelection(type) {
    const picker = getWorkCompanyPickerElements(type);
    picker.companyId.value = "";
    picker.contactId.value = "";
    picker.search.value = "";
    picker.companyInput.value = "";
    picker.contactName.value = "";
    picker.contactPhone.value = "";
    picker.contactEmail.value = "";
    renderWorkCompanyPicker(type);
  }

  function handleWorkCompanyUnknownChange(type) {
    const picker = getWorkCompanyPickerElements(type);
    if (picker.unknown.checked) {
      clearWorkCompanySelection(type);
      picker.unknown.checked = true;
    }
    renderWorkCompanyPicker(type);
  }

  function applyCompanyToWorkForm(picker, company, contact) {
    picker.companyInput.value = company.name || "";
    if (contact) {
      picker.contactName.value = contact.name || "";
      picker.contactPhone.value = contact.phone || "";
      picker.contactEmail.value = contact.email || "";
      return;
    }
    picker.contactName.value = "";
    picker.contactPhone.value = company.mainPhone || "";
    picker.contactEmail.value = company.mainEmail || "";
  }

  function getCompanyById(id) {
    const value = clean(id);
    return value ? state.companies.find((company) => company.id === value) || null : null;
  }

  function getCompanyContactById(company, contactId) {
    const id = clean(contactId);
    return company && id ? company.contacts.find((contact) => contact.id === id) || null : null;
  }

  function getPrimaryCompanyContact(company) {
    if (!company || !company.contacts.length) {
      return null;
    }
    return company.contacts.find((contact) => contact.isPrimary) || company.contacts[0];
  }

  function getCompanySearchText(company) {
    return [
      company.name,
      company.businessNumber,
      company.representative,
      company.businessType,
      company.status,
      company.address,
      company.mainPhone,
      company.mainEmail,
      company.memo,
      (company.contacts || []).map((contact) => [
        contact.name,
        contact.department,
        contact.title,
        contact.phone,
        contact.email,
        contact.memo
      ].join(" ")).join(" "),
      (company.attachments || []).map((attachment) => [
        attachment.fileName,
        attachment.category,
        attachment.memo,
        attachment.sentDate
      ].join(" ")).join(" ")
    ].join(" ").toLowerCase();
  }

  function getLinkedCompanySearchText(companyId) {
    const company = getCompanyById(companyId);
    return company ? getCompanySearchText(company) : "";
  }

  function formatCompanyContactLine(contact) {
    return [
      contact.name,
      contact.department,
      contact.title,
      contact.phone,
      contact.email
    ].filter(Boolean).join(" · ") || "담당자 정보 없음";
  }

  function isDuplicateCompanyName(name, id) {
    const key = normalizeCustomerKey(name);
    return state.companies.some((company) => company.id !== id && normalizeCustomerKey(company.name) === key);
  }

  function findSimilarCompanies(name, id) {
    const key = normalizeCompanySimilarityKey(name);
    if (key.length < 2) {
      return [];
    }
    return state.companies
      .filter((company) => company.id !== id && isSimilarCompanyNameKey(key, normalizeCompanySimilarityKey(company.name)))
      .slice(0, 5);
  }

  function normalizeCompanySimilarityKey(value) {
    return normalizeCustomerKey(value)
      .replace(/주식회사|유한회사|합자회사|합명회사|재단법인|사단법인|\(주\)|㈜|주\)/g, "");
  }

  function isSimilarCompanyNameKey(a, b) {
    if (!a || !b || a === b) {
      return false;
    }
    const shorter = a.length <= b.length ? a : b;
    const longer = a.length > b.length ? a : b;
    if (shorter.length >= 3 && longer.includes(shorter) && shorter.length / longer.length >= 0.55) {
      return true;
    }
    const maxLength = Math.max(a.length, b.length);
    if (maxLength < 4) {
      return false;
    }
    const distance = calculateEditDistance(a, b);
    return distance <= Math.max(1, Math.floor(maxLength * 0.25));
  }

  function calculateEditDistance(a, b) {
    const left = Array.from(a);
    const right = Array.from(b);
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    const current = new Array(right.length + 1);
    for (let i = 1; i <= left.length; i += 1) {
      current[0] = i;
      for (let j = 1; j <= right.length; j += 1) {
        const cost = left[i - 1] === right[j - 1] ? 0 : 1;
        current[j] = Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + cost
        );
      }
      for (let j = 0; j <= right.length; j += 1) {
        previous[j] = current[j];
      }
    }
    return previous[right.length];
  }

  function createCustomerProfileButton(note) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "업체";
    button.title = "업체 상세 보기";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openCustomerProfileFromNote(note);
    });
    return button;
  }

  function openCustomerProfileFromNote(note) {
    const label = clean(note.company) || clean(note.contactName) || "고객사 미입력";
    openCustomerProfile(label, note.id);
  }

  function createCustomerProfileButtonFromWork(task) {
    const linkedNote = getSalesNoteById(task.salesNoteId);
    const basisLabel = clean(task.company) || clean(linkedNote && linkedNote.company) || clean(task.contactName);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "업체";
    button.title = "업체 상세 보기";
    button.disabled = !basisLabel;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!basisLabel) {
        return;
      }
      const label = clean(task.company) || clean(linkedNote && linkedNote.company) || clean(task.contactName);
      openCustomerProfile(label, linkedNote ? linkedNote.id : "");
    });
    return button;
  }

  function openCustomerProfile(label, sourceNoteId) {
    const key = normalizeCustomerKey(label);
    if (!key) {
      alert("업체 상세를 만들 기준 정보가 없습니다.");
      return;
    }

    activeCustomerContext = {
      key,
      label,
      sourceNoteId: sourceNoteId || ""
    };
    renderCustomerDrawer();
    elements.customerDrawer.classList.remove("hidden");
    syncOverlayState();
  }

  function closeCustomerDrawer() {
    activeCustomerContext = null;
    elements.customerDrawer.classList.add("hidden");
    elements.customerProfileSummary.innerHTML = "";
    elements.customerProfileActions.innerHTML = "";
    elements.customerTimelineList.innerHTML = "";
    elements.customerRelatedList.innerHTML = "";
    elements.customerAttachmentList.innerHTML = "";
    syncOverlayState();
  }

  function renderCustomerDrawer() {
    if (!activeCustomerContext) {
      return;
    }

    const data = getCustomerProfileData(activeCustomerContext);
    elements.customerDrawerTitle.textContent = data.label;
    elements.customerDrawerSubtitle.textContent = data.subtitle || "관련 업무를 모아서 보여줍니다.";
    renderCustomerProfileSummary(data);
    renderCustomerProfileActions(data);
    renderCustomerTimeline(data);
    renderCustomerRelatedWorks(data);
    renderCustomerAttachments(data);
  }

  function getCustomerProfileData(context) {
    const key = context.key;
    const sourceNote = state.notes.find((note) => note.id === context.sourceNoteId) || null;
    const sourceLabel = clean(sourceNote && sourceNote.company) || context.label;
    const companyRecord = state.companies.find((company) => isSameCustomerKey(company.name, key)) || null;

    const notes = state.notes.filter((note) => isSameCustomerKey(note.company, key)
      || (sourceNote && note.id === sourceNote.id));
    const settlements = state.settlementTasks.filter((task) => isCustomerWorkMatch(task, key));
    const outputs = state.outputTasks.filter((task) => isCustomerWorkMatch(task, key));
    const others = state.otherTasks.filter((task) => isCustomerWorkMatch(task, key));
    const contacts = collectCustomerContacts(notes, settlements, outputs, others, companyRecord);
    const attachments = collectCustomerAttachments(notes, settlements, outputs, others, companyRecord);
    const timeline = collectCustomerTimeline(notes, settlements, outputs, others, companyRecord);
    const activeWorks = settlements.filter(isActiveWorkTask).length
      + outputs.filter(isActiveWorkTask).length
      + others.filter(isActiveWorkTask).length
      + notes.filter((note) => !isCompletedSalesNote(note) && !isFailedSalesNote(note)).length;
    const heldWorks = settlements.filter(isHeldWorkTask).length
      + outputs.filter(isHeldWorkTask).length
      + others.filter(isHeldWorkTask).length
      + notes.filter((note) => note.status === "보류").length;
    const closedWorks = settlements.filter(isClosedWorkTask).length
      + outputs.filter(isClosedWorkTask).length
      + others.filter(isClosedWorkTask).length
      + notes.filter((note) => isCompletedSalesNote(note) || isFailedSalesNote(note)).length;

    return {
      key,
      label: sourceLabel || context.label || "업체 상세",
      subtitle: contacts.primary ? contacts.primary : "",
      notes,
      settlements,
      outputs,
      others,
      contacts,
      attachments,
      timeline,
      activeWorks,
      heldWorks,
      closedWorks,
      companyRecord
    };
  }

  function isCustomerWorkMatch(task, key) {
    if (isSameCustomerKey(task.company, key)) {
      return true;
    }
    const linkedNote = getSalesNoteById(task.salesNoteId);
    return linkedNote ? isSameCustomerKey(linkedNote.company, key) : false;
  }

  function normalizeCustomerKey(value) {
    return clean(value).toLowerCase().replace(/\s+/g, "");
  }

  function datePart(value) {
    return clean(value).slice(0, 10);
  }

  function isSameCustomerKey(value, key) {
    return Boolean(key && normalizeCustomerKey(value) === key);
  }

  function collectCustomerContacts(notes, settlements, outputs, others, companyRecord) {
    const rows = [];
    if (companyRecord) {
      (companyRecord.contacts || []).forEach((contact) => {
        const line = formatCompanyContactLine(contact);
        if (line && !rows.includes(line)) {
          rows.push(line);
        }
      });
      const mainContact = [companyRecord.mainPhone, companyRecord.mainEmail].filter(Boolean).join(" · ");
      if (mainContact && !rows.includes(mainContact)) {
        rows.push(mainContact);
      }
    }
    [...notes, ...settlements, ...outputs, ...others].forEach((item) => {
      const contact = [item.contactName, item.contactPhone, item.contactEmail].filter(Boolean).join(" · ");
      if (contact && !rows.includes(contact)) {
        rows.push(contact);
      }
    });
    return {
      primary: rows[0] || "",
      rows
    };
  }

  function collectCustomerAttachments(notes, settlements, outputs, others, companyRecord) {
    const groups = [
      { type: "company", label: "업체", items: companyRecord ? [companyRecord] : [] },
      { type: "sales", label: "영업", items: notes },
      { type: "settlement", label: "정산", items: settlements },
      { type: "output", label: "출력", items: outputs },
      { type: "other", label: "기타", items: others }
    ];
    const attachments = [];
    groups.forEach((group) => {
      group.items.forEach((owner) => {
        (owner.attachments || []).forEach((attachment) => {
          attachments.push({
            attachment,
            owner,
            type: group.type,
            label: group.label,
            title: getFileOwnerTitle(group.type, owner)
          });
        });
      });
    });
    return attachments.sort((a, b) => String(b.attachment.uploadedAt).localeCompare(String(a.attachment.uploadedAt)));
  }

  function collectCustomerTimeline(notes, settlements, outputs, others, companyRecord) {
    const entries = [];
    if (companyRecord) {
      addTimelineEntry(entries, "업체", companyRecord.status || "업체", companyRecord.name || "업체 정보", datePart(companyRecord.updatedAt), companyRecord.memo || companyRecord.address, () => editCompany(companyRecord.id));
      addAttachmentTimelineEntries(entries, "업체", companyRecord, "company");
      addHistoryTimelineEntries(entries, "업체", companyRecord.name || "업체 정보", companyRecord, () => editCompany(companyRecord.id));
    }

    notes.forEach((note) => {
      addTimelineEntry(entries, "영업", "최근 연락", note.company || "영업 메모", note.lastContactDate, note.nextAction || note.memo, () => editNote(note.id));
      addTimelineEntry(entries, "영업", "다음 연락", note.company || "영업 메모", note.nextContactDate, note.nextAction || note.status, () => editNote(note.id));
      if (note.status === "미팅 예정") {
        addTimelineEntry(entries, "영업", "미팅", note.company || "영업 메모", note.meetingDate, note.nextAction || note.memo, () => editNote(note.id));
      }
      addTimelineEntry(entries, "영업", "최종 수정", note.company || "영업 메모", datePart(note.updatedAt), summarize(note.memo || note.nextAction), () => editNote(note.id));
      (note.attachments || []).forEach((attachment) => {
        addTimelineEntry(entries, "영업", attachment.category || "자료", attachment.fileName || "첨부자료", attachment.sentDate || datePart(attachment.uploadedAt), attachment.memo, () => openFileDrawer("sales", note.id));
      });
      addHistoryTimelineEntries(entries, "영업", note.company || "영업 메모", note, () => editNote(note.id));
    });

    settlements.forEach((task) => {
      addTimelineEntry(entries, "정산", task.status || "정산", task.company || "정산 업무", task.nextActionDate, formatSettlementNextAction(task), () => editSettlementTask(task.id));
      (task.paymentSchedule || []).forEach((row) => {
        addTimelineEntry(entries, "정산", formatSettlementScheduleRound(row, task.paymentType), task.company || "정산 업무", row.dueDate, [
          row.status,
          hasAmountValue(row.amount) ? formatMoneyWithVatForDisplay(row.amount, row.amountVatIncluded) : "",
          row.item,
          row.memo
        ].filter(Boolean).join(" · "), () => editSettlementTask(task.id));
      });
      addAttachmentTimelineEntries(entries, "정산", task, "settlement");
      addHistoryTimelineEntries(entries, "정산", task.company || "정산 업무", task, () => editSettlementTask(task.id));
    });

    outputs.forEach((task) => {
      addTimelineEntry(entries, "출력", task.status || "출력", task.company || task.outputType || "출력 업무", task.startDate || task.endDate, [formatWorkDateRangeForDisplay(task), task.outputType, task.memo].filter(Boolean).join(" · "), () => editOutputTask(task.id));
      addAttachmentTimelineEntries(entries, "출력", task, "output");
      addHistoryTimelineEntries(entries, "출력", task.company || task.outputType || "출력 업무", task, () => editOutputTask(task.id));
    });

    others.forEach((task) => {
      addTimelineEntry(entries, "기타", task.status || "기타", task.title || "기타 업무", task.startDate || task.endDate, [formatWorkDateRangeForDisplay(task), task.category, task.memo].filter(Boolean).join(" · "), () => editOtherTask(task.id));
      addAttachmentTimelineEntries(entries, "기타", task, "other");
      addHistoryTimelineEntries(entries, "기타", task.title || "기타 업무", task, () => editOtherTask(task.id));
    });

    return entries.sort(compareCustomerTimelineEntries);
  }

  function addAttachmentTimelineEntries(entries, label, owner, type) {
    (owner.attachments || []).forEach((attachment) => {
      addTimelineEntry(entries, label, attachment.category || "자료", attachment.fileName || "첨부자료", attachment.sentDate || datePart(attachment.uploadedAt), attachment.memo, () => openFileDrawer(type, owner.id));
    });
  }

  function addHistoryTimelineEntries(entries, label, title, owner, onOpen) {
    (owner.history || []).forEach((entry) => {
      addTimelineEntry(entries, label, entry.action || "이력", title, entry.at, entry.detail, onOpen);
    });
  }

  function addTimelineEntry(entries, label, kind, title, date, detail, onOpen) {
    const normalizedDate = clean(date);
    if (!normalizedDate) {
      return;
    }
    entries.push({
      label,
      kind,
      title,
      date: normalizedDate,
      detail: detail || "",
      onOpen
    });
  }

  function compareCustomerTimelineEntries(a, b) {
    const today = getTodayDateString();
    const aFuture = a.date >= today;
    const bFuture = b.date >= today;
    if (aFuture !== bFuture) {
      return aFuture ? -1 : 1;
    }
    if (aFuture) {
      return a.date.localeCompare(b.date);
    }
    return b.date.localeCompare(a.date);
  }

  function renderCustomerProfileSummary(data) {
    elements.customerProfileSummary.innerHTML = "";
    const cards = [
      ["영업 메모", data.notes.length],
      ["진행 업무", data.activeWorks],
      ["보류", data.heldWorks],
      ["완료/종료", data.closedWorks],
      ["정산", data.settlements.length],
      ["출력", data.outputs.length],
      ["기타", data.others.length],
      ["담당자", data.contacts.rows.length],
      ["파일", data.attachments.length]
    ];
    cards.forEach(([label, value]) => {
      const card = document.createElement("div");
      card.className = "customer-summary-card";
      const span = document.createElement("span");
      span.textContent = label;
      const strong = document.createElement("strong");
      strong.textContent = String(value);
      card.append(span, strong);
      elements.customerProfileSummary.appendChild(card);
    });
  }

  function renderCustomerProfileActions(data) {
    elements.customerProfileActions.innerHTML = "";
    if (data.companyRecord) {
      const info = document.createElement("div");
      info.className = "customer-master-info";
      [
        ["거래 상태", data.companyRecord.status],
        ["사업자번호", data.companyRecord.businessNumber],
        ["대표자", data.companyRecord.representative],
        ["업종/분류", data.companyRecord.businessType],
        ["대표 연락처", data.companyRecord.mainPhone],
        ["대표 이메일", data.companyRecord.mainEmail],
        ["주소", data.companyRecord.address],
        ["업체 메모", data.companyRecord.memo]
      ].forEach(([label, value]) => {
        if (!value) {
          return;
        }
        info.appendChild(createWorkLine(label, value));
      });
      if (info.children.length) {
        elements.customerProfileActions.appendChild(info);
      }
    }

    data.contacts.rows.slice(0, 3).forEach((contact) => {
      const item = document.createElement("span");
      item.className = "customer-contact-chip";
      item.textContent = contact;
      elements.customerProfileActions.appendChild(item);
    });

    if (data.companyRecord) {
      const editCompanyButton = document.createElement("button");
      editCompanyButton.type = "button";
      editCompanyButton.className = "secondary-button";
      editCompanyButton.textContent = "업체 정보 수정";
      editCompanyButton.addEventListener("click", () => editCompany(data.companyRecord.id));
      elements.customerProfileActions.appendChild(editCompanyButton);

      const filesButton = document.createElement("button");
      filesButton.type = "button";
      filesButton.className = "secondary-button folder-action-button";
      filesButton.textContent = `업체 파일 ${data.companyRecord.attachments.length}개`;
      filesButton.addEventListener("click", () => openFileDrawer("company", data.companyRecord.id));
      elements.customerProfileActions.appendChild(filesButton);
    }

    const firstNote = data.notes[0] || null;
    if (firstNote) {
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "secondary-button";
      editButton.textContent = "대표 영업 메모 열기";
      editButton.addEventListener("click", () => editNote(firstNote.id));
      elements.customerProfileActions.appendChild(editButton);
    }
  }

  function renderCustomerTimeline(data) {
    elements.customerTimelineList.innerHTML = "";
    elements.customerTimelineCount.textContent = `${data.timeline.length}개`;
    if (!data.timeline.length) {
      elements.customerTimelineList.appendChild(createAttachmentEmpty("아직 표시할 이력이 없습니다."));
      return;
    }
    data.timeline.slice(0, 30).forEach((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `customer-timeline-item customer-timeline-${entry.label}`;
      button.addEventListener("click", entry.onOpen);

      const date = document.createElement("strong");
      date.textContent = formatDateForDisplay(entry.date);
      const body = document.createElement("span");
      body.className = "customer-timeline-body";
      const title = document.createElement("span");
      title.textContent = `[${entry.label}] ${entry.title}`;
      const meta = document.createElement("small");
      meta.textContent = [entry.kind, entry.detail].filter(Boolean).join(" · ") || "-";
      body.append(title, meta);
      button.append(date, body);
      elements.customerTimelineList.appendChild(button);
    });
  }

  function renderCustomerRelatedWorks(data) {
    elements.customerRelatedList.innerHTML = "";
    const items = [
      ...data.notes.map((item) => ({ type: "sales", label: "영업", title: item.company || "영업 메모", status: item.status, detail: item.nextAction || item.memo || item.interest, id: item.id })),
      ...data.settlements.map((item) => ({ type: "settlement", label: "정산", title: item.company || "정산 업무", status: item.status, detail: formatSettlementNextAction(item), id: item.id })),
      ...data.outputs.map((item) => ({ type: "output", label: "출력", title: item.company || item.outputType || "출력 업무", status: item.status, detail: [formatWorkDateRangeForDisplay(item), item.outputType].filter(Boolean).join(" · "), id: item.id })),
      ...data.others.map((item) => ({ type: "other", label: "기타", title: item.title || "기타 업무", status: item.status, detail: [formatWorkDateRangeForDisplay(item), item.category].filter(Boolean).join(" · "), id: item.id }))
    ];
    elements.customerRelatedCount.textContent = `${items.length}개`;
    if (!items.length) {
      elements.customerRelatedList.appendChild(createAttachmentEmpty("연결된 업무가 없습니다."));
      return;
    }
    items.forEach((item) => elements.customerRelatedList.appendChild(createCustomerRelatedItem(item)));
  }

  function createCustomerRelatedItem(item) {
    const card = document.createElement("article");
    card.className = `customer-related-item customer-related-${item.type}`;
    const badge = document.createElement("span");
    badge.className = "global-search-badge";
    badge.textContent = item.label;
    const body = document.createElement("div");
    body.className = "customer-related-body";
    const title = document.createElement("strong");
    title.textContent = item.title;
    const meta = document.createElement("small");
    meta.textContent = [item.status, item.detail].filter(Boolean).join(" · ") || "-";
    body.append(title, meta);
    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.textContent = "열기";
    openButton.addEventListener("click", () => openCustomerRelatedItem(item));
    card.append(badge, body, openButton);
    return card;
  }

  function openCustomerRelatedItem(item) {
    if (item.type === "sales") {
      editNote(item.id);
      return;
    }
    if (item.type === "settlement") {
      editSettlementTask(item.id);
      return;
    }
    if (item.type === "output") {
      editOutputTask(item.id);
      return;
    }
    editOtherTask(item.id);
  }

  function renderCustomerAttachments(data) {
    elements.customerAttachmentList.innerHTML = "";
    elements.customerFileCount.textContent = `${data.attachments.length}개`;
    if (!data.attachments.length) {
      elements.customerAttachmentList.appendChild(createAttachmentEmpty("관련 파일이 없습니다."));
      return;
    }
    data.attachments.forEach((item) => elements.customerAttachmentList.appendChild(createCustomerAttachmentItem(item)));
  }

  function createCustomerAttachmentItem(item) {
    const attachment = item.attachment;
    const card = document.createElement("article");
    card.className = "attachment-item customer-attachment-item";

    const thumb = document.createElement("div");
    thumb.className = "attachment-thumb";
    thumb.textContent = getFileExtensionLabel(attachment.fileName);
    if (isImageFile(attachment)) {
      loadAttachmentThumbnail(attachment.id, thumb);
    }

    const body = document.createElement("div");
    body.className = "attachment-body";
    const title = document.createElement("div");
    title.className = "attachment-name";
    title.textContent = attachment.fileName || "이름 없는 파일";
    const meta = document.createElement("div");
    meta.className = "attachment-meta";
    meta.textContent = [
      item.label,
      item.title,
      attachment.category,
      attachment.sentDate ? formatDateForDisplay(attachment.sentDate) : "",
      formatFileSize(attachment.fileSize)
    ].filter(Boolean).join(" · ");
    const memo = document.createElement("div");
    memo.className = "attachment-note";
    memo.textContent = attachment.memo || "";
    memo.classList.toggle("hidden", !attachment.memo);

    const buttons = document.createElement("div");
    buttons.className = "attachment-buttons";
    const previewButton = createAttachmentPreviewButton(attachment);
    if (previewButton) {
      buttons.appendChild(previewButton);
    }
    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.textContent = "다운로드";
    downloadButton.addEventListener("click", () => downloadAttachment(attachment.id));
    const folderButton = document.createElement("button");
    folderButton.type = "button";
    folderButton.textContent = "파일함";
    folderButton.addEventListener("click", () => openFileDrawer(item.type, item.owner.id));
    buttons.append(downloadButton, folderButton);

    body.append(title, meta, memo, buttons);
    card.append(thumb, body);
    return card;
  }

  function getCurrentSettlementPaymentType() {
    return normalizeSettlementPaymentType(elements.settlementPaymentType.value);
  }

  function isAdvanceSettlementType(paymentType) {
    return normalizeSettlementPaymentType(paymentType) === SETTLEMENT_PAYMENT_TYPE_ADVANCE;
  }

  function updateSettlementPaymentTypeUI() {
    const paymentType = getCurrentSettlementPaymentType();
    const isAdvance = isAdvanceSettlementType(paymentType);
    elements.settlementPaymentType.value = paymentType;

    elements.settlementTotalAmountText.textContent = isAdvance ? "선금 금액" : "총 관리 금액";
    elements.settlementTotalAmount.placeholder = isAdvance ? "예: 10000000" : "예: 60000000";
    elements.settlementAdvanceAmountLabel.classList.add("hidden");
    elements.settlementReceivedAmountLabel.classList.toggle("hidden", isAdvance);
    elements.settlementReceivedAmountText.textContent = "회차 입금 완료액";
    elements.settlementDeductedAmountText.textContent = isAdvance ? "차감 완료액" : "기타 차감 금액";
    elements.settlementDeductedAmount.placeholder = isAdvance ? "예: 1500000" : "예: 10500000";
    elements.settlementRemainingAmountText.textContent = isAdvance ? "선금 잔액" : "잔여 금액";
    elements.settlementInstallmentProgressText.textContent = isAdvance ? "차감 진행 / 총 차감" : "현재 회차 / 총 회차";
    elements.settlementInstallmentProgress.placeholder = isAdvance ? "예: 3/10" : "예: 8/25";
    elements.settlementScheduleTitle.textContent = isAdvance ? "선금 차감 목록" : "회차별 결제 일정";
    elements.settlementScheduleStartDateText.textContent = isAdvance ? "차감 시작일" : "시작일";
    elements.settlementScheduleIntervalDaysText.textContent = isAdvance ? "차감 간격(일)" : "간격(일)";
    elements.settlementScheduleCountText.textContent = isAdvance ? "예정 차감 수" : "예정 회차";
    elements.settlementScheduleAmountText.textContent = isAdvance ? "기본 차감액" : "회차별 금액";
    elements.generateSettlementScheduleButton.textContent = isAdvance ? "차감 일정 자동 생성" : "일정 자동 생성";
    elements.addSettlementScheduleRowButton.textContent = isAdvance ? "차감 추가" : "회차 추가";
    elements.syncSettlementScheduleButton.textContent = isAdvance ? "차감 목록 기준 반영" : "일정표 기준 반영";
    elements.settlementSchedulePasteText.textContent = isAdvance ? "엑셀 차감 목록 붙여넣기" : "엑셀 일정 붙여넣기";
    elements.settlementSchedulePaste.placeholder = isAdvance
      ? "예: 1차감\t2026-07-08\t500000\t소재 PLA\t차감 완료"
      : "예: 1회차\t2026-07-08\t1980000\t장비 대금\t결제 완료";
    elements.parseSettlementScheduleButton.textContent = isAdvance ? "붙여넣은 차감 목록 불러오기" : "붙여넣은 일정 불러오기";
    updateSettlementScheduleSummary();
    updateSettlementRemainingPreview();
  }

  function handleGenerateSettlementSchedule() {
    const intervalDays = Math.max(1, Number(elements.settlementScheduleIntervalDays.value) || 14);
    const progress = parseInstallmentProgress(elements.settlementInstallmentProgress.value);
    const count = Math.max(0, Math.floor(Number(elements.settlementScheduleCount.value) || progress.total || 0));
    const amount = normalizeAmountValue(elements.settlementScheduleAmount.value);
    const amountVatIncluded = elements.settlementScheduleAmountVatIncluded.checked;
    const startDate = resolveSettlementScheduleStartDate(intervalDays, progress.completed);
    const isAdvance = isAdvanceSettlementType(getCurrentSettlementPaymentType());

    if (!startDate || !count) {
      alert("시작일 또는 다음 처리일, 그리고 예정 회차를 입력해 주세요.");
      return;
    }
    if (!clean(elements.settlementScheduleStartDate.value)) {
      elements.settlementScheduleStartDate.value = startDate;
    }

    const existingRows = getSettlementScheduleRowsFromDom();
    const scheduleLabel = isAdvance ? "선금 차감 목록" : "회차별 결제 일정";
    if (existingRows.length && !confirm(`기존 ${scheduleLabel}을 새로 생성한 내용으로 교체할까요?`)) {
      return;
    }

    const today = getTodayDateString();
    const rows = Array.from({ length: count }, (_, index) => {
      const dueDate = addDays(startDate, intervalDays * index);
      const isCompleted = progress.completed ? index < progress.completed : dueDate < today;
      return normalizeSettlementScheduleItem({
        round: String(index + 1),
        dueDate,
        amount,
        amountVatIncluded,
        item: "",
        status: isCompleted ? (isAdvance ? "차감 완료" : "결제 완료") : "예정",
        paidDate: isCompleted ? dueDate : "",
        memo: ""
      }, index);
    });

    renderSettlementScheduleRows(rows);
    syncSettlementDerivedFieldsFromSchedule();
  }

  function handleParseSettlementSchedule() {
    const isAdvance = isAdvanceSettlementType(getCurrentSettlementPaymentType());
    const rows = fillMissingSettlementScheduleDates(parseSettlementScheduleText(elements.settlementSchedulePaste.value));
    if (!rows.length) {
      alert(isAdvance
        ? "불러올 수 있는 차감 행을 찾지 못했습니다.\n예: 1차감 2026-07-08 500000 소재 PLA 차감 완료"
        : "불러올 수 있는 일정 행을 찾지 못했습니다.\n예: 1회차 2026-07-08 1980000 장비 대금 결제 완료");
      return;
    }

    const existingRows = getSettlementScheduleRowsFromDom();
    if (existingRows.length && !confirm(`기존 ${isAdvance ? "선금 차감 목록" : "회차별 결제 일정"}을 붙여넣은 내용으로 교체할까요?`)) {
      return;
    }

    renderSettlementScheduleRows(rows);
    elements.settlementSchedulePaste.value = "";
    syncSettlementDerivedFieldsFromSchedule();
  }

  function appendSettlementScheduleRow(values) {
    const rows = getSettlementScheduleRowsFromDom();
    const previous = rows[rows.length - 1] || null;
    const intervalDays = Math.max(1, Number(elements.settlementScheduleIntervalDays.value) || 14);
    const nextRound = previous ? String((Number(previous.round) || rows.length) + 1) : String(rows.length + 1);
    const nextDate = previous && previous.dueDate
      ? addDays(previous.dueDate, intervalDays)
      : clean(elements.settlementScheduleStartDate.value) || clean(elements.settlementNextActionDate.value);
    const nextAmount = clean(elements.settlementScheduleAmount.value) || (previous ? previous.amount : "");
    const nextAmountVatIncluded = previous ? Boolean(previous.amountVatIncluded) : elements.settlementScheduleAmountVatIncluded.checked;

    rows.push(normalizeSettlementScheduleItem(values || {
      round: nextRound,
      dueDate: nextDate,
      amount: nextAmount,
      amountVatIncluded: nextAmountVatIncluded,
      item: "",
      status: "예정",
      paidDate: "",
      memo: ""
    }, rows.length));
    renderSettlementScheduleRows(rows);
    syncSettlementDerivedFieldsFromSchedule();
  }

  function renderSettlementScheduleRows(rows) {
    elements.settlementScheduleList.innerHTML = "";
    const items = (Array.isArray(rows) ? rows : []).map(normalizeSettlementScheduleItem).filter(Boolean);
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "attachment-empty";
      empty.textContent = "아직 등록된 회차별 결제 일정이 없습니다.";
      elements.settlementScheduleList.appendChild(empty);
      updateSettlementScheduleSummary([]);
      return;
    }

    items.forEach((row, index) => {
      elements.settlementScheduleList.appendChild(createSettlementScheduleRow(row, index));
    });
    updateSettlementScheduleSummary(items);
  }

  function createSettlementScheduleRow(row, index) {
    const item = document.createElement("div");
    item.className = "settlement-schedule-row";
    item.dataset.scheduleId = row.id || createId().replace("note_", "payment_");

    const roundLabel = createScheduleInput(
      isAdvanceSettlementType(getCurrentSettlementPaymentType()) ? "차감" : "회차",
      "text",
      "schedule-round",
      row.round || String(index + 1)
    );
    const dueDateLabel = createScheduleInput("예정일", "date", "schedule-due-date", row.dueDate);
    const amountLabel = createScheduleInput("금액", "number", "schedule-amount", row.amount);
    amountLabel.querySelector("input").min = "0";
    amountLabel.querySelector("input").step = "any";
    amountLabel.appendChild(createVatCheckbox("schedule-amount-vat", row.amountVatIncluded));
    const itemLabel = createScheduleInput(
      isAdvanceSettlementType(getCurrentSettlementPaymentType()) ? "차감 품목" : "품목",
      "text",
      "schedule-item",
      row.item
    );

    const statusLabel = document.createElement("label");
    const statusText = document.createElement("span");
    statusText.textContent = "상태";
    const statusSelect = document.createElement("select");
    statusSelect.className = "schedule-status";
    SETTLEMENT_SCHEDULE_STATUS_OPTIONS.forEach((status) => {
      statusSelect.appendChild(new Option(status, status));
    });
    statusSelect.value = SETTLEMENT_SCHEDULE_STATUS_OPTIONS.includes(row.status) ? row.status : "예정";
    statusLabel.append(statusText, statusSelect);

    const paidDateLabel = createScheduleInput("처리일", "date", "schedule-paid-date", row.paidDate);
    const memoLabel = createScheduleInput("메모", "text", "schedule-memo", row.memo);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "ghost-button settlement-schedule-delete";
    deleteButton.textContent = "삭제";
    deleteButton.addEventListener("click", () => {
      item.remove();
      syncSettlementDerivedFieldsFromSchedule();
    });

    item.append(roundLabel, dueDateLabel, amountLabel, itemLabel, statusLabel, paidDateLabel, memoLabel, deleteButton);
    item.querySelectorAll("input, select").forEach((input) => {
      input.addEventListener("input", syncSettlementDerivedFieldsFromSchedule);
      input.addEventListener("change", syncSettlementDerivedFieldsFromSchedule);
    });
    return item;
  }

  function createScheduleInput(labelText, type, className, value) {
    const label = document.createElement("label");
    const text = document.createElement("span");
    text.textContent = labelText;
    const input = document.createElement("input");
    input.type = type;
    input.className = className;
    input.value = value || "";
    label.append(text, input);
    return label;
  }

  function createVatCheckbox(className, checked) {
    const wrapper = document.createElement("span");
    wrapper.className = "checkbox-label vat-checkbox";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = className;
    checkbox.checked = Boolean(checked);
    const text = document.createElement("span");
    text.textContent = "부가세 포함";
    wrapper.append(checkbox, text);
    return wrapper;
  }

  function getSettlementScheduleRowsFromDom() {
    return Array.from(elements.settlementScheduleList.querySelectorAll(".settlement-schedule-row"))
      .map((row, index) => normalizeSettlementScheduleItem({
        id: row.dataset.scheduleId,
        round: row.querySelector(".schedule-round").value,
        dueDate: row.querySelector(".schedule-due-date").value,
        amount: row.querySelector(".schedule-amount").value,
        amountVatIncluded: row.querySelector(".schedule-amount-vat").checked,
        item: row.querySelector(".schedule-item").value,
        status: row.querySelector(".schedule-status").value,
        paidDate: row.querySelector(".schedule-paid-date").value,
        memo: row.querySelector(".schedule-memo").value
      }, index))
      .filter(Boolean);
  }

  function syncSettlementDerivedFieldsFromSchedule() {
    const rows = getSettlementScheduleRowsFromDom();
    updateSettlementScheduleSummary(rows);
    if (!rows.length) {
      updateSettlementRemainingPreview();
      return;
    }

    const totals = getSettlementScheduleTotals(rows);
    if (isAdvanceSettlementType(getCurrentSettlementPaymentType())) {
      elements.settlementReceivedAmount.value = "";
      elements.settlementDeductedAmount.value = normalizeAmountValue(totals.completed);
    } else {
      elements.settlementReceivedAmount.value = normalizeAmountValue(totals.received);
    }
    elements.settlementInstallmentProgress.value = `${totals.completedCount}/${rows.length}`;

    const nextRow = getNextSettlementScheduleRow({ paymentSchedule: rows });
    if (nextRow) {
      elements.settlementNextActionDate.value = nextRow.dueDate || "";
      elements.settlementNextAction.value = formatSettlementScheduleAction(nextRow, getCurrentSettlementPaymentType());
    } else {
      elements.settlementNextActionDate.value = "";
      elements.settlementNextAction.value = "정산 완료";
    }

    updateSettlementRemainingPreview();
  }

  function updateSettlementScheduleSummary(rows) {
    const items = Array.isArray(rows) ? rows : getSettlementScheduleRowsFromDom();
    const totals = getSettlementScheduleTotals(items);
    if (!items.length) {
      elements.settlementScheduleSummary.textContent = "0회차";
      return;
    }

    const totalAmount = parseAmountValue(elements.settlementTotalAmount.value);
    if (isAdvanceSettlementType(getCurrentSettlementPaymentType())) {
      const remainingText = totalAmount === null
        ? ""
        : ` · 잔액 ${formatMoneyForDisplay(Math.max(totalAmount - totals.completed, 0))}`;
      elements.settlementScheduleSummary.textContent = `${items.length}건 · 차감예정 ${formatMoneyForDisplay(totals.scheduled)} · 차감완료 ${formatMoneyForDisplay(totals.completed)}${remainingText}`;
      return;
    }

    const residualText = totalAmount === null
      ? ""
      : ` · 일정후 ${formatMoneyForDisplay(Math.max(totalAmount - totals.scheduled, 0))}`;
    elements.settlementScheduleSummary.textContent = `${items.length}회차 · 예정 ${formatMoneyForDisplay(totals.scheduled)} · 완료 ${formatMoneyForDisplay(totals.completed)}${residualText}`;
  }

  function getSettlementScheduleTotals(rows) {
    return (Array.isArray(rows) ? rows : []).reduce((totals, row) => {
      const amount = parseAmountValue(row.amount) || 0;
      totals.scheduled += amount;
      if (isSettlementScheduleRowComplete(row)) {
        totals.completed += amount;
        totals.completedCount += 1;
        if (row.status === "차감 완료") {
          totals.deducted += amount;
        } else {
          totals.received += amount;
        }
      }
      return totals;
    }, {
      scheduled: 0,
      completed: 0,
      received: 0,
      deducted: 0,
      completedCount: 0
    });
  }

  function isSettlementScheduleRowComplete(row) {
    return ["결제 완료", "차감 완료", "입금 확인", "완료"].includes(clean(row.status));
  }

  function getNextSettlementScheduleRow(task) {
    const rows = Array.isArray(task.paymentSchedule) ? task.paymentSchedule : [];
    return rows
      .filter((row) => !isSettlementScheduleRowComplete(row))
      .slice()
      .sort(compareSettlementScheduleRows)[0] || null;
  }

  function compareSettlementScheduleRows(a, b) {
    const aDate = a.dueDate || "9999-12-31";
    const bDate = b.dueDate || "9999-12-31";
    const dateResult = aDate.localeCompare(bDate);
    if (dateResult) {
      return dateResult;
    }
    return (Number(a.round) || 0) - (Number(b.round) || 0);
  }

  function formatSettlementScheduleAction(row, paymentType) {
    return [
      formatSettlementScheduleRound(row, paymentType),
      hasAmountValue(row.amount) ? formatMoneyWithVatForDisplay(row.amount, row.amountVatIncluded) : "",
      row.item,
      row.status && row.status !== "예정" ? row.status : ""
    ].filter(Boolean).join(" · ") || "정산 확인";
  }

  function formatSettlementScheduleRound(row, paymentType) {
    const round = clean(row.round);
    const suffix = isAdvanceSettlementType(paymentType || getCurrentSettlementPaymentType()) ? "차감" : "회차";
    return round ? `${round.replace(/회차$|차감$/, "")}${suffix}` : `${suffix} 미정`;
  }

  function parseCompletedInstallmentCount(value) {
    return parseInstallmentProgress(value).completed;
  }

  function parseInstallmentProgress(value) {
    const match = clean(value).match(/^(\d+)\s*\/\s*(\d+)/);
    return {
      completed: match ? Number(match[1]) || 0 : 0,
      total: match ? Number(match[2]) || 0 : 0
    };
  }

  function resolveSettlementScheduleStartDate(intervalDays, completedCount) {
    const explicitStartDate = clean(elements.settlementScheduleStartDate.value);
    if (explicitStartDate) {
      return explicitStartDate;
    }

    const nextActionDate = clean(elements.settlementNextActionDate.value);
    if (nextActionDate && completedCount > 0) {
      return addDays(nextActionDate, -intervalDays * completedCount);
    }

    return nextActionDate;
  }

  function parseSettlementScheduleText(value) {
    const rows = [];
    cleanMultilineText(value)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const row = parseSettlementScheduleLine(line, rows.length);
        if (row) {
          rows.push(row);
        }
      });
    return rows;
  }

  function fillMissingSettlementScheduleDates(rows) {
    const items = (Array.isArray(rows) ? rows : []).map(normalizeSettlementScheduleItem).filter(Boolean);
    if (!items.length) {
      return [];
    }

    const intervalDays = Math.max(1, Number(elements.settlementScheduleIntervalDays.value) || 14);
    const knownIndex = items.findIndex((row) => row.dueDate);
    if (knownIndex >= 0) {
      const knownDate = items[knownIndex].dueDate;
      return items.map((row, index) => ({
        ...row,
        dueDate: row.dueDate || addDays(knownDate, intervalDays * (index - knownIndex))
      }));
    }

    const progress = parseInstallmentProgress(elements.settlementInstallmentProgress.value);
    const startDate = resolveSettlementScheduleStartDate(intervalDays, progress.completed);
    if (!startDate) {
      return items;
    }

    return items.map((row, index) => ({
      ...row,
      dueDate: addDays(startDate, intervalDays * index)
    }));
  }

  function parseSettlementScheduleLine(line, index) {
    const parts = line.split(/\t|,/).map((part) => part.trim()).filter(Boolean);
    const text = parts.length > 1 ? parts.join(" ") : line;
    const parsedRound = parseScheduleRound(text);
    const dueDate = parseFlexibleScheduleDate(text);
    const amount = parseScheduleAmount(text);
    const status = detectScheduleStatus(text);
    const paidDate = isSettlementScheduleRowComplete({ status }) ? dueDate : "";
    const amountVatIncluded = /부가세\s*포함|vat\s*포함/i.test(line);
    const item = parseScheduleItem(parts);
    const memo = parseScheduleMemo(parts, line, item);

    if (!dueDate && !amount && !parsedRound) {
      return null;
    }

    return normalizeSettlementScheduleItem({
      round: parsedRound || String(index + 1),
      dueDate,
      amount,
      amountVatIncluded,
      item,
      status,
      paidDate,
      memo
    }, index);
  }

  function parseScheduleItem(parts) {
    if (!Array.isArray(parts) || parts.length < 4) {
      return "";
    }
    const candidate = clean(parts[3]);
    return isScheduleStatusText(candidate) || isVatStatusText(candidate) ? "" : candidate;
  }

  function parseScheduleMemo(parts, line, item) {
    if (!Array.isArray(parts) || parts.length < 5) {
      return clean(line);
    }
    const memoStartIndex = item ? 4 : 3;
    const memoParts = parts.slice(memoStartIndex).filter((part) => !isScheduleStatusText(part) && !isVatStatusText(part));
    return clean(memoParts.join(" / "));
  }

  function isScheduleStatusText(value) {
    const text = clean(value);
    return SETTLEMENT_SCHEDULE_STATUS_OPTIONS.includes(text)
      || /예정|청구|결제|입금|차감|완료|연체|보류/.test(text);
  }

  function isVatStatusText(value) {
    return /부가세|VAT/i.test(clean(value));
  }

  function parseScheduleRound(text) {
    const roundMatch = clean(text).match(/(\d+)\s*회차/);
    if (roundMatch) {
      return roundMatch[1];
    }
    const firstValue = clean(text).split(/\s+/)[0];
    return /^\d{1,3}$/.test(firstValue) ? firstValue : "";
  }

  function parseFlexibleScheduleDate(text) {
    const value = clean(text);
    const fullDateMatch = value.match(/(\d{2,4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);
    if (fullDateMatch) {
      let year = Number(fullDateMatch[1]);
      if (year < 100) {
        year += 2000;
      }
      return `${String(year).padStart(4, "0")}-${String(Number(fullDateMatch[2])).padStart(2, "0")}-${String(Number(fullDateMatch[3])).padStart(2, "0")}`;
    }

    const shortDateMatch = value.match(/(^|\s)(\d{1,2})[.\-/월\s]+(\d{1,2})(일)?($|\s)/);
    if (shortDateMatch) {
      const baseYear = Number(clean(elements.settlementScheduleStartDate.value).slice(0, 4)) || new Date().getFullYear();
      return `${baseYear}-${String(Number(shortDateMatch[2])).padStart(2, "0")}-${String(Number(shortDateMatch[3])).padStart(2, "0")}`;
    }
    return "";
  }

  function parseScheduleAmount(text) {
    const withoutDates = clean(text)
      .replace(/(\d{2,4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/g, " ")
      .replace(/\d+\s*회차/g, " ");
    const matches = withoutDates.match(/\d[\d,]*(?:\.\d+)?/g) || [];
    const amount = matches
      .map((match) => Number(match.replace(/,/g, "")))
      .find((number) => Number.isFinite(number) && number >= 1000);
    return normalizeAmountValue(amount || "");
  }

  function detectScheduleStatus(text) {
    const value = clean(text);
    if (/예정/.test(value)) {
      return "예정";
    }
    if (/차감\s*완료/.test(value)) {
      return "차감 완료";
    }
    if (/연체/.test(value)) {
      return "연체";
    }
    if (/보류/.test(value)) {
      return "보류";
    }
    if (/청구/.test(value)) {
      return "청구 완료";
    }
    if (/입금|결제/.test(value)) {
      return "결제 완료";
    }
    if (/완료|처리/.test(value)) {
      return isAdvanceSettlementType(getCurrentSettlementPaymentType()) ? "차감 완료" : "결제 완료";
    }
    return "예정";
  }

  async function handleSettlementSubmit(event) {
    event.preventDefault();
    const now = getLocalTimestamp();
    const existingId = elements.settlementTaskId.value;
    const id = existingId || createId().replace("note_", "settlement_");
    const index = state.settlementTasks.findIndex((task) => task.id === id);
    const previous = index >= 0 ? state.settlementTasks[index] : null;
    const paymentType = getCurrentSettlementPaymentType();
    const isAdvance = isAdvanceSettlementType(paymentType);
    if (getSettlementScheduleRowsFromDom().length) {
      syncSettlementDerivedFieldsFromSchedule();
    }

    const task = normalizeSettlementTask({
      id,
      companyId: elements.settlementCompanyUnknown.checked ? "" : elements.settlementCompanyId.value,
      contactId: elements.settlementCompanyUnknown.checked ? "" : elements.settlementContactId.value,
      companyUnknown: elements.settlementCompanyUnknown.checked,
      company: elements.settlementCompany.value,
      contactName: elements.settlementContactName.value,
      contactPhone: elements.settlementContactPhone.value,
      contactEmail: elements.settlementContactEmail.value,
      salesNoteId: elements.settlementSalesLinkUnknown.checked ? "" : elements.settlementSalesLink.value,
      salesLinkUnknown: elements.settlementSalesLinkUnknown.checked,
      paymentType,
      status: elements.settlementStatus.value,
      totalAmount: elements.settlementTotalAmount.value,
      totalAmountVatIncluded: elements.settlementTotalAmountVatIncluded.checked,
      advanceAmount: "",
      advanceAmountVatIncluded: elements.settlementAdvanceAmountVatIncluded.checked,
      receivedAmount: isAdvance ? "" : elements.settlementReceivedAmount.value,
      receivedAmountVatIncluded: elements.settlementReceivedAmountVatIncluded.checked,
      deductedAmount: elements.settlementDeductedAmount.value,
      deductedAmountVatIncluded: elements.settlementDeductedAmountVatIncluded.checked,
      installmentProgress: elements.settlementInstallmentProgress.value,
      nextActionDate: elements.settlementNextActionDate.value,
      nextAction: elements.settlementNextAction.value,
      paymentSchedule: getSettlementScheduleRowsFromDom(),
      plan: elements.settlementPlan.value,
      memo: elements.settlementMemo.value,
      attachments: previous ? previous.attachments.slice() : [],
      createdAt: previous ? previous.createdAt : now,
      updatedAt: now
    });

    if (!task.company && !task.companyUnknown && !task.nextAction && !task.memo && !task.plan) {
      alert("관련 업체, 다음 처리, 계획, 메모 중 하나는 입력해 주세요.");
      return;
    }

    task.history = previous ? cloneHistory(previous.history) : [];
    if (previous) {
      recordChangedFields(task, previous, task, [
        "company",
        "companyUnknown",
        "contactName",
        "contactPhone",
        "contactEmail",
        "salesNoteId",
        "salesLinkUnknown",
        "paymentType",
        "status",
        "totalAmount",
        "totalAmountVatIncluded",
        "receivedAmount",
        "receivedAmountVatIncluded",
        "deductedAmount",
        "deductedAmountVatIncluded",
        "installmentProgress",
        "nextActionDate",
        "nextAction",
        "paymentSchedule",
        "plan",
        "memo"
      ]);
    } else {
      appendHistoryEntry(task, "생성", "정산 업무 생성");
    }

    if (index >= 0) {
      state.settlementTasks[index] = task;
    } else {
      state.settlementTasks.unshift(task);
    }

    if (saveState()) {
      closeSettlementEditorPanel({ force: true });
      render();
      setSaveStatus("정산 업무가 저장됐습니다.", false);
    }
  }

  function resetSettlementForm() {
    elements.settlementForm.reset();
    elements.settlementTaskId.value = "";
    elements.settlementCompanyId.value = "";
    elements.settlementContactId.value = "";
    elements.settlementCompanySearch.value = "";
    elements.settlementCompanyUnknown.checked = false;
    renderSalesLinkOptions("");
    elements.settlementSalesLinkUnknown.checked = false;
    updateSettlementSalesLinkUnknownState();
    elements.settlementPaymentType.value = SETTLEMENT_PAYMENT_TYPE_INSTALLMENT;
    elements.settlementStatus.value = "예정";
    elements.settlementAdvanceAmount.value = "";
    elements.settlementTotalAmountVatIncluded.checked = false;
    elements.settlementAdvanceAmountVatIncluded.checked = false;
    elements.settlementReceivedAmountVatIncluded.checked = false;
    elements.settlementDeductedAmountVatIncluded.checked = false;
    elements.settlementRemainingAmount.value = "";
    elements.settlementScheduleStartDate.value = "";
    elements.settlementScheduleIntervalDays.value = "14";
    elements.settlementScheduleCount.value = "";
    elements.settlementScheduleAmount.value = "";
    elements.settlementScheduleAmountVatIncluded.checked = false;
    elements.settlementSchedulePaste.value = "";
    renderSettlementScheduleRows([]);
    elements.openCurrentSettlementFilesButton.classList.add("hidden");
    elements.settlementFormTitle.textContent = "정산 업무 등록";
    elements.saveSettlementButton.textContent = "정산 업무 저장";
    elements.deleteSettlementButton.classList.add("hidden");
    updateSettlementPaymentTypeUI();
    renderWorkCompanyPicker("settlement");
  }

  function editSettlementTask(id) {
    const task = state.settlementTasks.find((item) => item.id === id);
    if (!task) {
      return;
    }
    switchPortal("settlement");
    renderSalesLinkOptions(task.salesNoteId);
    elements.settlementTaskId.value = task.id;
    elements.settlementCompanyId.value = task.companyId || "";
    elements.settlementContactId.value = task.contactId || "";
    elements.settlementCompanySearch.value = "";
    elements.settlementCompanyUnknown.checked = Boolean(task.companyUnknown);
    elements.settlementCompany.value = task.company;
    elements.settlementContactName.value = task.contactName;
    elements.settlementContactPhone.value = task.contactPhone || "";
    elements.settlementContactEmail.value = task.contactEmail || "";
    elements.settlementSalesLink.value = task.salesNoteId;
    elements.settlementSalesLinkUnknown.checked = Boolean(task.salesLinkUnknown);
    updateSettlementSalesLinkUnknownState();
    elements.settlementPaymentType.value = task.paymentType;
    elements.settlementStatus.value = task.status;
    elements.settlementTotalAmount.value = task.totalAmount;
    elements.settlementTotalAmountVatIncluded.checked = Boolean(task.totalAmountVatIncluded);
    elements.settlementAdvanceAmount.value = task.advanceAmount;
    elements.settlementAdvanceAmountVatIncluded.checked = Boolean(task.advanceAmountVatIncluded);
    elements.settlementReceivedAmount.value = task.receivedAmount;
    elements.settlementReceivedAmountVatIncluded.checked = Boolean(task.receivedAmountVatIncluded);
    elements.settlementDeductedAmount.value = task.deductedAmount;
    elements.settlementDeductedAmountVatIncluded.checked = Boolean(task.deductedAmountVatIncluded);
    elements.settlementInstallmentProgress.value = task.installmentProgress;
    elements.settlementNextActionDate.value = task.nextActionDate;
    elements.settlementNextAction.value = task.nextAction;
    renderSettlementScheduleRows(task.paymentSchedule);
    updateSettlementPaymentTypeUI();
    elements.settlementPlan.value = task.plan;
    elements.settlementMemo.value = task.memo;
    updateSettlementRemainingPreview();
    elements.openCurrentSettlementFilesButton.classList.remove("hidden");
    elements.settlementFormTitle.textContent = "정산 업무 수정";
    elements.saveSettlementButton.textContent = "수정 저장";
    elements.deleteSettlementButton.classList.remove("hidden");
    openSettlementEditorPanel();
    renderWorkCompanyPicker("settlement");
    elements.settlementCompanySearch.focus();
  }

  async function handleSettlementDelete() {
    const id = elements.settlementTaskId.value;
    if (id) {
      await deleteSettlementTask(id);
    }
  }

  async function deleteSettlementTask(id) {
    const task = state.settlementTasks.find((item) => item.id === id);
    if (!task) {
      return;
    }
    if (!confirm(`${task.company || "선택한 정산 업무"}를 삭제할까요?`)) {
      return;
    }
    try {
      await deleteAttachmentRecords(task.attachments);
    } catch (error) {
      console.error(error);
      if (!confirm(`정산 파일 원본을 삭제하지 못했습니다.\n${error.message || error}\n\n업무 목록에서만 삭제할까요?`)) {
        return;
      }
    }
    state.settlementTasks = state.settlementTasks.filter((item) => item.id !== id);
    if (saveState()) {
      closeFileDrawerIfContext("settlement", id);
      closeSettlementEditorPanel({ force: true });
      render();
    }
  }

  function renderSettlementTasks() {
    renderWorkTaskList("settlement", state.settlementTasks, elements.settlementTaskList, createSettlementTaskCard);
  }

  function createSettlementTaskCard(task) {
    const card = createWorkCardShell(getWorkCompanyTitle(task, "정산 업무"), task.status, task.paymentType || "정산", {
      category: "settlement",
      id: task.id,
      statusControl: true
    });
    const paymentBadge = card.querySelector(".work-card-badges .badge");
    if (paymentBadge) {
      paymentBadge.className = "badge badge-settlement";
      paymentBadge.textContent = task.paymentType || "정산";
    }

    const metaLines = [
      createWorkLine("담당자", task.contactName || "-"),
      createWorkLine("연락처", task.contactPhone || "-"),
      createWorkLine("이메일", task.contactEmail || "-"),
      createWorkLine("관련 영업", task.salesLinkUnknown ? "미정" : getLinkedSalesLabel(task.salesNoteId))
    ];
    if (isAdvanceSettlementType(task.paymentType)) {
      metaLines.push(
        createWorkLine("선금", formatMoneyWithVatForDisplay(task.totalAmount, task.totalAmountVatIncluded)),
        createWorkLine("차감완료", formatSettlementCompletedAmount(task)),
        createWorkLine("선금잔액", formatMoneyForDisplay(calculateSettlementRemaining(task))),
        createWorkLine("차감 진행", task.installmentProgress || "-")
      );
    } else {
      metaLines.push(
        createWorkLine("총액", formatMoneyWithVatForDisplay(task.totalAmount, task.totalAmountVatIncluded)),
        createWorkLine("회차입금", formatSettlementReceivedAmount(task)),
        createWorkLine("기타차감", formatMoneyWithVatForDisplay(task.deductedAmount, task.deductedAmountVatIncluded)),
        createWorkLine("잔액", formatMoneyForDisplay(calculateSettlementRemaining(task))),
        createWorkLine("회차", task.installmentProgress || "-")
      );
    }
    metaLines.push(
      createWorkLine("다음 처리", formatSettlementNextAction(task)),
      createWorkLine("파일", task.attachments.length ? `${task.attachments.length}개` : "없음")
    );
    card.querySelector(".work-card-meta").append(...metaLines);
    card.querySelector(".work-card-memo").textContent = task.memo || task.plan || "메모 없음";

    const actions = card.querySelector(".work-card-actions");
    actions.appendChild(createCustomerProfileButtonFromWork(task));
    actions.appendChild(createFolderButton("settlement", task.id, task.attachments.length));
    appendWorkButtons(actions, () => editSettlementTask(task.id), () => deleteSettlementTask(task.id));
    return card;
  }

  function renderSalesLinkOptions(selectedId) {
    const current = clean(selectedId);
    elements.settlementSalesLink.innerHTML = "";
    elements.settlementSalesLink.appendChild(new Option("연결 안 함", ""));
    let hasCurrent = !current;
    state.notes
      .slice()
      .sort((a, b) => String(a.company || "").localeCompare(String(b.company || ""), "ko"))
      .forEach((note) => {
        const label = [
          note.company || "고객사 미입력",
          note.interest,
          note.nextAction
        ].filter(Boolean).join(" · ");
        elements.settlementSalesLink.appendChild(new Option(label, note.id));
        if (note.id === current) {
          hasCurrent = true;
        }
      });
    if (!hasCurrent) {
      elements.settlementSalesLink.appendChild(new Option("삭제되었거나 찾을 수 없는 영업 메모", current));
    }
    elements.settlementSalesLink.value = current;
    updateSettlementSalesLinkUnknownState();
  }

  function handleSettlementSalesLinkUnknownChange() {
    updateSettlementSalesLinkUnknownState();
  }

  function handleSettlementSalesLinkChange() {
    const note = getSalesNoteById(elements.settlementSalesLink.value);
    if (!note) {
      return;
    }
    elements.settlementSalesLinkUnknown.checked = false;
    updateSettlementSalesLinkUnknownState();
    if (note.companyUnknown) {
      const picker = getWorkCompanyPickerElements("settlement");
      picker.unknown.checked = true;
      clearWorkCompanySelection("settlement");
      picker.unknown.checked = true;
      renderWorkCompanyPicker("settlement");
      return;
    }
    if (note.companyId) {
      const picker = getWorkCompanyPickerElements("settlement");
      const company = getCompanyById(note.companyId);
      const contact = company ? getCompanyContactById(company, note.contactId) || findCompanyContactForWorkItem(company, note) : null;
      if (company) {
        picker.unknown.checked = false;
        picker.companyId.value = company.id;
        picker.contactId.value = contact ? contact.id : "";
        applyCompanyToWorkForm(picker, company, contact);
        renderWorkCompanyPicker("settlement");
        return;
      }
    }
    if (!clean(elements.settlementCompany.value)) {
      elements.settlementCompany.value = note.company || "";
    }
    if (!clean(elements.settlementContactName.value)) {
      elements.settlementContactName.value = note.contactName || "";
    }
    if (!clean(elements.settlementContactPhone.value)) {
      elements.settlementContactPhone.value = note.contactPhone || "";
    }
    if (!clean(elements.settlementContactEmail.value)) {
      elements.settlementContactEmail.value = note.contactEmail || "";
    }
    renderWorkCompanyPicker("settlement");
  }

  function updateSettlementSalesLinkUnknownState() {
    const isUnknown = elements.settlementSalesLinkUnknown.checked;
    elements.settlementSalesLink.disabled = isUnknown;
    if (isUnknown) {
      elements.settlementSalesLink.value = "";
    }
  }

  function updateSettlementRemainingPreview() {
    const remaining = calculateSettlementRemaining({
      paymentType: getCurrentSettlementPaymentType(),
      totalAmount: elements.settlementTotalAmount.value,
      receivedAmount: elements.settlementReceivedAmount.value,
      deductedAmount: elements.settlementDeductedAmount.value
    });
    elements.settlementRemainingAmount.value = remaining === "" ? "" : formatMoneyForDisplay(remaining);
  }

  function calculateSettlementRemaining(task) {
    const total = parseAmountValue(task.totalAmount);
    if (total === null) {
      return "";
    }
    const isAdvance = isAdvanceSettlementType(task.paymentType);
    const scheduleTotals = getSettlementScheduleTotals(task.paymentSchedule);
    const deducted = parseAmountValue(task.deductedAmount);
    if (isAdvance) {
      const deductedAmount = deducted === null && scheduleTotals.completed ? scheduleTotals.completed : deducted || 0;
      return normalizeAmountValue(Math.max(total - deductedAmount, 0));
    }

    const received = parseAmountValue(task.receivedAmount);
    const receivedAmount = received === null && scheduleTotals.received ? scheduleTotals.received : received || 0;
    return normalizeAmountValue(Math.max(total - receivedAmount - (deducted || 0), 0));
  }

  function formatSettlementCompletedAmount(task) {
    if (isAdvanceSettlementType(task.paymentType)) {
      const scheduleTotals = getSettlementScheduleTotals(task.paymentSchedule);
      const deducted = parseAmountValue(task.deductedAmount);
      const deductedAmount = deducted === null && scheduleTotals.completed ? scheduleTotals.completed : deducted || 0;
      return deductedAmount ? formatMoneyForDisplay(deductedAmount) : "-";
    }

    const scheduleTotals = getSettlementScheduleTotals(task.paymentSchedule);
    const received = parseAmountValue(task.receivedAmount);
    const deducted = parseAmountValue(task.deductedAmount);
    const receivedAmount = received === null && scheduleTotals.received ? scheduleTotals.received : received || 0;
    const deductedAmount = deducted || 0;
    if (!receivedAmount && !deductedAmount) {
      return "-";
    }
    return formatMoneyForDisplay(receivedAmount + deductedAmount);
  }

  function formatSettlementReceivedAmount(task) {
    const scheduleTotals = getSettlementScheduleTotals(task.paymentSchedule);
    const received = parseAmountValue(task.receivedAmount);
    const receivedAmount = received === null && scheduleTotals.received ? scheduleTotals.received : received || 0;
    return receivedAmount ? formatMoneyWithVatForDisplay(receivedAmount, task.receivedAmountVatIncluded) : "-";
  }

  function formatSettlementNextAction(task) {
    const nextRow = getNextSettlementScheduleRow(task);
    if (nextRow) {
      return [
        formatSettlementScheduleAction(nextRow, task.paymentType),
        nextRow.dueDate ? formatDateForDisplay(nextRow.dueDate) : ""
      ].filter(Boolean).join(" · ");
    }

    return [
      task.nextAction || "정산 확인",
      task.nextActionDate ? formatDateForDisplay(task.nextActionDate) : ""
    ].filter(Boolean).join(" · ") || "-";
  }

  function getLinkedSalesLabel(salesNoteId) {
    const note = state.notes.find((item) => item.id === salesNoteId);
    if (!note) {
      return "-";
    }
    return [note.company, note.interest].filter(Boolean).join(" · ") || "영업 메모";
  }

  function getLinkedSalesSearchText(salesNoteId) {
    const note = getSalesNoteById(salesNoteId);
    return note ? getSalesSearchText(note) : getLinkedSalesLabel(salesNoteId);
  }

  function renderOutputSalesLinkPicker() {
    if (!elements.outputSalesLinkResults) {
      return;
    }

    const selectedId = clean(elements.outputSalesNoteId.value);
    const selectedNote = getSalesNoteById(selectedId);
    const query = clean(elements.outputSalesLinkSearch.value).toLowerCase();
    const isUnknown = elements.outputSalesLinkUnknown.checked;

    elements.outputSalesLinkSearch.disabled = isUnknown;
    elements.outputSalesLinkCount.textContent = isUnknown ? "미정" : selectedNote ? "연결됨" : selectedId ? "확인 필요" : "연결 안 함";
    renderOutputSelectedSalesLink(selectedId, selectedNote);

    elements.outputSalesLinkResults.innerHTML = "";
    if (isUnknown) {
      elements.outputSalesLinkResults.appendChild(createSalesLinkEmpty("관련 영업건을 아직 정하지 않은 상태입니다."));
      return;
    }
    if (!state.notes.length) {
      elements.outputSalesLinkResults.appendChild(createSalesLinkEmpty("등록된 영업 메모가 없습니다."));
      return;
    }

    const candidates = getSalesLinkCandidates(query, selectedId);
    if (!candidates.length) {
      elements.outputSalesLinkResults.appendChild(createSalesLinkEmpty(query ? "검색 결과가 없습니다." : "표시할 영업건이 없습니다."));
      return;
    }

    candidates.forEach((note) => {
      elements.outputSalesLinkResults.appendChild(createSalesLinkCandidateButton(note));
    });
  }

  function renderOutputSelectedSalesLink(selectedId, selectedNote) {
    elements.outputSalesLinkSelected.innerHTML = "";
    if (elements.outputSalesLinkUnknown.checked) {
      elements.outputSalesLinkSelected.appendChild(createSalesLinkEmpty("관련 영업건 미정으로 저장됩니다."));
      return;
    }
    if (selectedNote) {
      elements.outputSalesLinkSelected.appendChild(createSelectedSalesLinkCard(selectedNote));
      return;
    }

    const empty = document.createElement("div");
    empty.className = "sales-link-empty";
    empty.textContent = selectedId ? "연결된 영업건을 현재 목록에서 찾을 수 없습니다." : "아직 연결된 영업건이 없습니다.";
    elements.outputSalesLinkSelected.appendChild(empty);

    if (selectedId) {
      const clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.className = "ghost-button sales-link-clear-button";
      clearButton.textContent = "연결 해제";
      clearButton.addEventListener("click", clearOutputSalesLink);
      elements.outputSalesLinkSelected.appendChild(clearButton);
    }
  }

  function createSelectedSalesLinkCard(note) {
    const card = document.createElement("div");
    card.className = "sales-link-selected-card";

    const body = createSalesLinkBody(note);
    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "ghost-button sales-link-clear-button";
    clearButton.textContent = "연결 해제";
    clearButton.addEventListener("click", clearOutputSalesLink);

    card.append(body, clearButton);
    return card;
  }

  function createSalesLinkCandidateButton(note) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sales-link-result";
    button.addEventListener("click", () => selectOutputSalesLink(note.id));
    button.appendChild(createSalesLinkBody(note));
    return button;
  }

  function createSalesLinkBody(note) {
    const body = document.createElement("span");
    body.className = "sales-link-body";

    const title = document.createElement("strong");
    title.textContent = note.company || note.contactName || "영업 메모";

    const meta = document.createElement("small");
    meta.textContent = [
      note.contactName,
      note.interest,
      note.status,
      formatNextContactForDisplay(note)
    ].filter(Boolean).join(" · ") || "상세 정보 없음";

    const detail = document.createElement("span");
    detail.textContent = note.nextAction || note.memo || "";

    body.append(title, meta, detail);
    return body;
  }

  function createSalesLinkEmpty(message) {
    const empty = document.createElement("div");
    empty.className = "sales-link-empty";
    empty.textContent = message;
    return empty;
  }

  function getSalesLinkCandidates(query, selectedId) {
    return state.notes
      .filter((note) => note.id !== selectedId)
      .filter((note) => !query || getSalesSearchText(note).includes(query))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, 6);
  }

  function selectOutputSalesLink(noteId) {
    const note = getSalesNoteById(noteId);
    if (!note) {
      return;
    }

    elements.outputSalesLinkUnknown.checked = false;
    elements.outputSalesNoteId.value = note.id;
    if (note.companyUnknown) {
      const picker = getWorkCompanyPickerElements("output");
      picker.unknown.checked = true;
      clearWorkCompanySelection("output");
      picker.unknown.checked = true;
      renderWorkCompanyPicker("output");
    } else if (note.companyId) {
      const picker = getWorkCompanyPickerElements("output");
      const company = getCompanyById(note.companyId);
      const contact = company ? getCompanyContactById(company, note.contactId) || findCompanyContactForWorkItem(company, note) : null;
      if (company) {
        picker.unknown.checked = false;
        picker.companyId.value = company.id;
        picker.contactId.value = contact ? contact.id : "";
        applyCompanyToWorkForm(picker, company, contact);
        renderWorkCompanyPicker("output");
      }
    } else if (!clean(elements.outputCompany.value)) {
      elements.outputCompany.value = note.company || "";
    }
    if (!clean(elements.outputContactName.value)) {
      elements.outputContactName.value = note.contactName || "";
    }
    if (!clean(elements.outputContactPhone.value)) {
      elements.outputContactPhone.value = note.contactPhone || "";
    }
    if (!clean(elements.outputContactEmail.value)) {
      elements.outputContactEmail.value = note.contactEmail || "";
    }
    elements.outputSalesLinkSearch.value = "";
    renderOutputSalesLinkPicker();
  }

  function clearOutputSalesLink() {
    elements.outputSalesNoteId.value = "";
    renderOutputSalesLinkPicker();
    elements.outputSalesLinkSearch.focus();
  }

  function handleOutputSalesLinkUnknownChange() {
    if (elements.outputSalesLinkUnknown.checked) {
      elements.outputSalesNoteId.value = "";
      elements.outputSalesLinkSearch.value = "";
    }
    renderOutputSalesLinkPicker();
  }

  function getSalesNoteById(noteId) {
    const id = clean(noteId);
    return id ? state.notes.find((note) => note.id === id) || null : null;
  }

  function compareSettlementTasks(a, b) {
    const aNextRow = getNextSettlementScheduleRow(a);
    const bNextRow = getNextSettlementScheduleRow(b);
    const aDate = (aNextRow && aNextRow.dueDate) || a.nextActionDate || "9999-12-31";
    const bDate = (bNextRow && bNextRow.dueDate) || b.nextActionDate || "9999-12-31";
    return aDate.localeCompare(bDate) || String(b.updatedAt).localeCompare(String(a.updatedAt));
  }

  async function handleOutputSubmit(event) {
    event.preventDefault();
    const now = getLocalTimestamp();
    const existingId = elements.outputTaskId.value;
    const id = existingId || createId().replace("note_", "output_");
    const index = state.outputTasks.findIndex((task) => task.id === id);
    const previous = index >= 0 ? state.outputTasks[index] : null;

    const task = {
      id,
      companyId: elements.outputCompanyUnknown.checked ? "" : clean(elements.outputCompanyId.value),
      contactId: elements.outputCompanyUnknown.checked ? "" : clean(elements.outputContactId.value),
      companyUnknown: elements.outputCompanyUnknown.checked,
      company: clean(elements.outputCompany.value),
      contactName: clean(elements.outputContactName.value),
      contactPhone: clean(elements.outputContactPhone.value),
      contactEmail: clean(elements.outputContactEmail.value),
      salesNoteId: elements.outputSalesLinkUnknown.checked ? "" : clean(elements.outputSalesNoteId.value),
      salesLinkUnknown: elements.outputSalesLinkUnknown.checked,
      startDate: clean(elements.outputStartDate.value),
      endDate: clean(elements.outputEndDate.value),
      includeWeekends: Boolean(elements.outputIncludeWeekends.checked),
      status: elements.outputStatus.value || "대기",
      outputType: clean(elements.outputType.value),
      priority: elements.outputPriority.value || "보통",
      memo: clean(elements.outputMemo.value),
      attachments: previous ? previous.attachments.slice() : [],
      createdAt: previous ? previous.createdAt : now,
      updatedAt: now
    };

    if (!task.company && !task.companyUnknown && !task.outputType && !task.memo) {
      alert("관련 업체, 출력 종류, 메모 중 하나는 입력해 주세요.");
      return;
    }

    if (!isValidDateRange(task.startDate, task.endDate)) {
      alert("기한 종료일은 시작일보다 빠를 수 없습니다.");
      return;
    }

    task.history = previous ? cloneHistory(previous.history) : [];
    if (previous) {
      recordChangedFields(task, previous, task, [
        "company",
        "companyUnknown",
        "contactName",
        "contactPhone",
        "contactEmail",
        "salesNoteId",
        "salesLinkUnknown",
        "startDate",
        "endDate",
        "includeWeekends",
        "status",
        "outputType",
        "priority",
        "memo"
      ]);
    } else {
      appendHistoryEntry(task, "생성", "출력 업무 생성");
    }

    if (index >= 0) {
      state.outputTasks[index] = task;
    } else {
      state.outputTasks.unshift(task);
    }

    if (saveState()) {
      closeOutputEditorPanel({ force: true });
      render();
      setSaveStatus("출력 업무가 저장됐습니다.", false);
    }
  }

  function resetOutputForm() {
    elements.outputForm.reset();
    elements.outputTaskId.value = "";
    elements.outputSalesNoteId.value = "";
    elements.outputCompanyId.value = "";
    elements.outputContactId.value = "";
    elements.outputCompanySearch.value = "";
    elements.outputCompanyUnknown.checked = false;
    elements.outputSalesLinkSearch.value = "";
    elements.outputSalesLinkUnknown.checked = false;
    elements.outputStartDate.value = getTodayDateString();
    elements.outputEndDate.value = getTodayDateString();
    elements.outputIncludeWeekends.checked = false;
    elements.outputPriority.value = "보통";
    elements.outputStatus.value = "대기";
    elements.openCurrentOutputFilesButton.classList.add("hidden");
    elements.outputFormTitle.textContent = "출력 업무 등록";
    elements.saveOutputButton.textContent = "출력 업무 저장";
    elements.deleteOutputButton.classList.add("hidden");
    renderWorkCompanyPicker("output");
    renderOutputSalesLinkPicker();
  }

  function editOutputTask(id) {
    const task = state.outputTasks.find((item) => item.id === id);
    if (!task) {
      return;
    }
    switchPortal("output");
    elements.outputTaskId.value = task.id;
    elements.outputCompanyId.value = task.companyId || "";
    elements.outputContactId.value = task.contactId || "";
    elements.outputCompanySearch.value = "";
    elements.outputCompanyUnknown.checked = Boolean(task.companyUnknown);
    elements.outputCompany.value = task.company;
    elements.outputContactName.value = task.contactName;
    elements.outputContactPhone.value = task.contactPhone || "";
    elements.outputContactEmail.value = task.contactEmail || "";
    elements.outputSalesNoteId.value = task.salesNoteId || "";
    elements.outputSalesLinkSearch.value = "";
    elements.outputSalesLinkUnknown.checked = Boolean(task.salesLinkUnknown);
    elements.outputStartDate.value = task.startDate;
    elements.outputEndDate.value = task.endDate;
    elements.outputIncludeWeekends.checked = Boolean(task.includeWeekends);
    elements.outputStatus.value = task.status;
    elements.outputType.value = task.outputType;
    elements.outputPriority.value = task.priority;
    elements.outputMemo.value = task.memo;
    elements.openCurrentOutputFilesButton.classList.remove("hidden");
    elements.outputFormTitle.textContent = "출력 업무 수정";
    elements.saveOutputButton.textContent = "수정 저장";
    elements.deleteOutputButton.classList.remove("hidden");
    renderWorkCompanyPicker("output");
    renderOutputSalesLinkPicker();
    openOutputEditorPanel();
    elements.outputCompanySearch.focus();
  }

  async function handleOutputDelete() {
    const id = elements.outputTaskId.value;
    if (!id) {
      return;
    }
    await deleteOutputTask(id);
  }

  async function deleteOutputTask(id) {
    const task = state.outputTasks.find((item) => item.id === id);
    if (!task) {
      return;
    }
    if (!confirm(`${task.company || task.outputType || "선택한 출력 업무"}를 삭제할까요?`)) {
      return;
    }
    try {
      await deleteAttachmentRecords(task.attachments);
    } catch (error) {
      console.error(error);
      if (!confirm(`출력 파일 원본을 삭제하지 못했습니다.\n${error.message || error}\n\n업무 목록에서만 삭제할까요?`)) {
        return;
      }
    }
    state.outputTasks = state.outputTasks.filter((item) => item.id !== id);
    if (saveState()) {
      closeFileDrawerIfContext("output", id);
      closeOutputEditorPanel({ force: true });
      render();
    }
  }

  function renderOutputTasks() {
    renderWorkTaskList("output", state.outputTasks, elements.outputTaskList, createOutputTaskCard);
  }

  function createOutputTaskCard(task) {
    const card = createWorkCardShell(getWorkCompanyTitle(task, task.outputType || "출력 업무"), task.status, task.priority, {
      category: "output",
      id: task.id,
      statusControl: true,
      priorityControl: true
    });
    card.querySelector(".work-card-meta").append(
      createWorkLine("담당자(요청자)", task.contactName || "-"),
      createWorkLine("연락처", task.contactPhone || "-"),
      createWorkLine("이메일", task.contactEmail || "-"),
      createWorkLine("관련 영업", task.salesLinkUnknown ? "미정" : getLinkedSalesLabel(task.salesNoteId)),
      createWorkLine("기한", formatWorkDateRangeForDisplay(task)),
      createWorkLine("출력종류", task.outputType || "-"),
      createWorkLine("파일", task.attachments.length ? `${task.attachments.length}개` : "없음")
    );
    card.querySelector(".work-card-memo").textContent = task.memo || "메모 없음";

    const actions = card.querySelector(".work-card-actions");
    actions.appendChild(createCustomerProfileButtonFromWork(task));
    actions.appendChild(createFolderButton("output", task.id, task.attachments.length));
    appendWorkButtons(actions, () => editOutputTask(task.id), () => deleteOutputTask(task.id));
    return card;
  }

  async function handleOtherSubmit(event) {
    event.preventDefault();
    const now = getLocalTimestamp();
    const existingId = elements.otherTaskId.value;
    const id = existingId || createId().replace("note_", "other_");
    const index = state.otherTasks.findIndex((task) => task.id === id);
    const previous = index >= 0 ? state.otherTasks[index] : null;

    const task = {
      id,
      companyId: elements.otherCompanyUnknown.checked ? "" : clean(elements.otherCompanyId.value),
      contactId: elements.otherCompanyUnknown.checked ? "" : clean(elements.otherContactId.value),
      companyUnknown: elements.otherCompanyUnknown.checked,
      company: clean(elements.otherCompany.value),
      contactName: clean(elements.otherContactName.value),
      contactPhone: clean(elements.otherContactPhone.value),
      contactEmail: clean(elements.otherContactEmail.value),
      title: clean(elements.otherTitle.value),
      category: clean(elements.otherCategory.value),
      owner: clean(elements.otherOwner.value),
      startDate: clean(elements.otherStartDate.value),
      endDate: clean(elements.otherEndDate.value),
      includeWeekends: Boolean(elements.otherIncludeWeekends.checked),
      status: elements.otherStatus.value || "대기",
      priority: elements.otherPriority.value || "보통",
      memo: clean(elements.otherMemo.value),
      attachments: previous ? previous.attachments.slice() : [],
      createdAt: previous ? previous.createdAt : now,
      updatedAt: now
    };

    if (!task.title && !task.memo) {
      alert("업무명 또는 메모를 입력해 주세요.");
      return;
    }

    if (!isValidDateRange(task.startDate, task.endDate)) {
      alert("기한 종료일은 시작일보다 빠를 수 없습니다.");
      return;
    }

    task.history = previous ? cloneHistory(previous.history) : [];
    if (previous) {
      recordChangedFields(task, previous, task, [
        "company",
        "companyUnknown",
        "contactName",
        "contactPhone",
        "contactEmail",
        "title",
        "category",
        "owner",
        "startDate",
        "endDate",
        "includeWeekends",
        "status",
        "priority",
        "memo"
      ]);
    } else {
      appendHistoryEntry(task, "생성", "기타 업무 생성");
    }

    if (index >= 0) {
      state.otherTasks[index] = task;
    } else {
      state.otherTasks.unshift(task);
    }

    if (saveState()) {
      closeOtherEditorPanel({ force: true });
      render();
      setSaveStatus("기타 업무가 저장됐습니다.", false);
    }
  }

  function resetOtherForm() {
    elements.otherForm.reset();
    elements.otherTaskId.value = "";
    elements.otherCompanyId.value = "";
    elements.otherContactId.value = "";
    elements.otherCompanySearch.value = "";
    elements.otherCompanyUnknown.checked = false;
    elements.otherCompany.value = "";
    elements.otherContactName.value = "";
    elements.otherContactPhone.value = "";
    elements.otherContactEmail.value = "";
    elements.otherStartDate.value = getTodayDateString();
    elements.otherEndDate.value = getTodayDateString();
    elements.otherIncludeWeekends.checked = false;
    elements.otherStatus.value = "대기";
    elements.otherPriority.value = "보통";
    elements.openCurrentOtherFilesButton.classList.add("hidden");
    elements.otherFormTitle.textContent = "기타 업무 등록";
    elements.saveOtherButton.textContent = "기타 업무 저장";
    elements.deleteOtherButton.classList.add("hidden");
    renderWorkCompanyPicker("other");
  }

  function editOtherTask(id) {
    const task = state.otherTasks.find((item) => item.id === id);
    if (!task) {
      return;
    }
    switchPortal("other");
    elements.otherTaskId.value = task.id;
    elements.otherCompanyId.value = task.companyId || "";
    elements.otherContactId.value = task.contactId || "";
    elements.otherCompanySearch.value = "";
    elements.otherCompanyUnknown.checked = Boolean(task.companyUnknown);
    elements.otherCompany.value = task.company || "";
    elements.otherContactName.value = task.contactName || "";
    elements.otherContactPhone.value = task.contactPhone || "";
    elements.otherContactEmail.value = task.contactEmail || "";
    elements.otherTitle.value = task.title;
    elements.otherCategory.value = task.category;
    elements.otherOwner.value = task.owner;
    elements.otherStartDate.value = task.startDate;
    elements.otherEndDate.value = task.endDate;
    elements.otherIncludeWeekends.checked = Boolean(task.includeWeekends);
    elements.otherStatus.value = task.status;
    elements.otherPriority.value = task.priority || "보통";
    elements.otherMemo.value = task.memo;
    elements.openCurrentOtherFilesButton.classList.remove("hidden");
    elements.otherFormTitle.textContent = "기타 업무 수정";
    elements.saveOtherButton.textContent = "수정 저장";
    elements.deleteOtherButton.classList.remove("hidden");
    openOtherEditorPanel();
    renderWorkCompanyPicker("other");
    elements.otherTitle.focus();
  }

  async function handleOtherDelete() {
    const id = elements.otherTaskId.value;
    if (id) {
      await deleteOtherTask(id);
    }
  }

  async function deleteOtherTask(id) {
    const task = state.otherTasks.find((item) => item.id === id);
    if (!task) {
      return;
    }
    if (!confirm(`${task.title || "선택한 기타 업무"}를 삭제할까요?`)) {
      return;
    }
    try {
      await deleteAttachmentRecords(task.attachments);
    } catch (error) {
      console.error(error);
      if (!confirm(`관련 파일 원본을 삭제하지 못했습니다.\n${error.message || error}\n\n업무 목록에서만 삭제할까요?`)) {
        return;
      }
    }
    state.otherTasks = state.otherTasks.filter((item) => item.id !== id);
    if (saveState()) {
      closeFileDrawerIfContext("other", id);
      closeOtherEditorPanel({ force: true });
      render();
    }
  }

  function renderOtherTasks() {
    renderWorkTaskList("other", state.otherTasks, elements.otherTaskList, createOtherTaskCard);
  }

  function createOtherTaskCard(task) {
    const card = createWorkCardShell(task.title || "업무명 미입력", task.status, task.priority || "보통", {
      category: "other",
      id: task.id,
      statusControl: true,
      priorityControl: true
    });
    card.querySelector(".work-card-meta").append(
      createWorkLine("관련 업체", getWorkCompanyTitle(task, "-")),
      createWorkLine("담당자", task.contactName || "-"),
      createWorkLine("구분", task.category || "-"),
      createWorkLine("담당/요청자", task.owner || "-"),
      createWorkLine("기한", formatWorkDateRangeForDisplay(task)),
      createWorkLine("파일", task.attachments.length ? `${task.attachments.length}개` : "없음")
    );
    card.querySelector(".work-card-memo").textContent = task.memo || "메모 없음";
    const actions = card.querySelector(".work-card-actions");
    if (task.company) {
      actions.appendChild(createCustomerProfileButtonFromWork(task));
    }
    actions.appendChild(createFolderButton("other", task.id, task.attachments.length));
    appendWorkButtons(actions, () => editOtherTask(task.id), () => deleteOtherTask(task.id));
    return card;
  }

  function renderWorkTaskList(category, tasks, listElement, createCard) {
    const sourceTasks = Array.isArray(tasks) ? tasks : [];
    const controls = getWorkExplorerElements(category);
    const mode = workListState[category].mode;
    const label = getWorkCategoryLabel(category);
    const activeCount = sourceTasks.filter((task) => isActiveWorkTask(task)).length;
    const holdCount = sourceTasks.filter((task) => isHeldWorkTask(task)).length;
    const closedCount = sourceTasks.filter((task) => isClosedWorkTask(task)).length;

    if (controls.activeCount) {
      controls.activeCount.textContent = String(activeCount);
    }
    if (controls.holdCount) {
      controls.holdCount.textContent = String(holdCount);
    }
    if (controls.closedCount) {
      controls.closedCount.textContent = String(closedCount);
    }
    if (controls.listTitle) {
      controls.listTitle.textContent = `${getWorkModeLabel(mode)} ${label} 목록`;
    }

    elements.workViewButtons
      .filter((button) => button.dataset.workViewCategory === category)
      .forEach((button) => {
        const isActive = button.dataset.workViewMode === mode;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });

    listElement.innerHTML = "";
    const filteredTasks = getFilteredWorkTasks(category, sourceTasks);
    if (!filteredTasks.length) {
      const modeLabel = getWorkModeLabel(mode);
      listElement.appendChild(createWorkEmpty(`${modeLabel} ${label}가 없습니다.`));
      return;
    }

    filteredTasks.forEach((task) => listElement.appendChild(createCard(task)));
  }

  function getFilteredWorkTasks(category, tasks) {
    const controls = getWorkExplorerElements(category);
    const mode = workListState[category].mode;
    const search = clean(controls.searchInput ? controls.searchInput.value : "").toLowerCase();
    const statusFilter = controls.statusFilter ? controls.statusFilter.value : "all";
    const priorityFilter = controls.priorityFilter ? controls.priorityFilter.value : "all";

    return tasks
      .filter((task) => {
        const matchesMode = matchesWorkListMode(task, mode);
        const matchesSearch = !search || getWorkSearchText(category, task).includes(search);
        const matchesStatus = statusFilter === "all" || task.status === statusFilter;
        const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
        return matchesMode && matchesSearch && matchesStatus && matchesPriority;
      })
      .sort((a, b) => compareWorkExplorerTasks(category, a, b));
  }

  function getWorkSearchText(category, task) {
    const attachmentText = (task.attachments || [])
      .map((attachment) => [
        attachment.fileName,
        attachment.category,
        attachment.memo,
        attachment.sentDate
      ].join(" "))
      .join(" ");

    if (category === "settlement") {
      const companyText = getLinkedCompanySearchText(task.companyId);
      const scheduleText = (task.paymentSchedule || [])
        .map((row) => [
          row.round,
          row.dueDate,
          row.amount,
          hasAmountValue(row.amount) ? formatVatStatus(row.amountVatIncluded) : "",
          row.item,
          row.status,
          row.paidDate,
          row.memo
        ].join(" "))
        .join(" ");
      return [
        task.company,
        task.companyUnknown ? "업체 미정" : "",
        companyText,
        task.contactName,
        task.contactPhone,
        task.contactEmail,
        task.salesLinkUnknown ? "영업건 미정" : "",
        getLinkedSalesSearchText(task.salesNoteId),
        task.paymentType,
        task.status,
        task.totalAmount,
        hasAmountValue(task.totalAmount) ? formatVatStatus(task.totalAmountVatIncluded) : "",
        task.receivedAmount,
        hasAmountValue(task.receivedAmount) ? formatVatStatus(task.receivedAmountVatIncluded) : "",
        task.deductedAmount,
        hasAmountValue(task.deductedAmount) ? formatVatStatus(task.deductedAmountVatIncluded) : "",
        task.installmentProgress,
        task.nextActionDate,
        task.nextAction,
        task.plan,
        task.memo,
        scheduleText,
        attachmentText
      ].join(" ").toLowerCase();
    }

    if (category === "output") {
      const companyText = getLinkedCompanySearchText(task.companyId);
      return [
        task.company,
        task.companyUnknown ? "업체 미정" : "",
        companyText,
        task.contactName,
        task.contactPhone,
        task.contactEmail,
        task.salesLinkUnknown ? "영업건 미정" : "",
        getLinkedSalesSearchText(task.salesNoteId),
        task.startDate,
        task.endDate,
        formatWeekendPolicy(task.includeWeekends),
        task.status,
        task.outputType,
        task.priority,
        task.memo,
        attachmentText
      ].join(" ").toLowerCase();
    }

    return [
      task.company,
      task.companyUnknown ? "업체 미정" : "",
      getLinkedCompanySearchText(task.companyId),
      task.contactName,
      task.contactPhone,
      task.contactEmail,
      task.title,
      task.category,
      task.owner,
      task.startDate,
      task.endDate,
      formatWeekendPolicy(task.includeWeekends),
      task.status,
      task.priority,
      task.memo,
      attachmentText
    ].join(" ").toLowerCase();
  }

  function compareWorkExplorerTasks(category, a, b) {
    const controls = getWorkExplorerElements(category);
    const sortValue = controls.sortSelect ? controls.sortSelect.value : "deadline";
    const direction = workListState[category].sortDirection;

    if (sortValue === "updated") {
      return compareByUpdatedAt(a, b, direction);
    }
    if (sortValue === "company") {
      return compareTextValue(getWorkCompanyTitle(a, ""), getWorkCompanyTitle(b, ""), direction) || compareByUpdatedAt(a, b, "desc");
    }
    if (sortValue === "title") {
      return compareTextValue(a.title, b.title, direction) || compareByUpdatedAt(a, b, "desc");
    }
    if (sortValue === "status") {
      return compareTextValue(a.status, b.status, direction) || compareByUpdatedAt(a, b, "desc");
    }
    if (sortValue === "priority") {
      const result = (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0);
      return (direction === "desc" ? -result : result) || compareByUpdatedAt(a, b, "desc");
    }

    return compareWorkDateValue(getWorkExplorerSortDate(category, a), getWorkExplorerSortDate(category, b), direction)
      || compareByUpdatedAt(a, b, "desc");
  }

  function getWorkExplorerSortDate(category, task) {
    if (category === "settlement") {
      const nextRow = getNextSettlementScheduleRow(task);
      return (nextRow && nextRow.dueDate) || clean(task.nextActionDate);
    }
    return clean(task.startDate) || clean(task.endDate);
  }

  function compareWorkDateValue(aDate, bDate, direction) {
    const aMissing = !aDate;
    const bMissing = !bDate;
    if (aMissing !== bMissing) {
      return aMissing ? 1 : -1;
    }
    const result = String(aDate || "").localeCompare(String(bDate || ""));
    return direction === "desc" ? -result : result;
  }

  function compareTextValue(aValue, bValue, direction) {
    const result = String(aValue || "").localeCompare(String(bValue || ""), "ko");
    return direction === "desc" ? -result : result;
  }

  function getWorkCategoryLabel(category) {
    if (category === "settlement") {
      return "정산 업무";
    }
    if (category === "output") {
      return "출력 업무";
    }
    return "기타 업무";
  }

  function getWorkCompanyTitle(task, fallback) {
    if (task && task.companyUnknown) {
      return "업체 미정";
    }
    const fallbackValue = fallback === undefined ? "업무" : fallback;
    return clean(task && task.company) || fallbackValue;
  }

  function getSalesCompanyTitle(note) {
    if (note && note.companyUnknown) {
      return "업체 미정";
    }
    return clean(note && note.company) || "고객사 미입력";
  }

  function getWorkModeLabel(mode) {
    if (mode === "closed") {
      return "완료된";
    }
    if (mode === "hold") {
      return "보류";
    }
    return "진행 중인";
  }

  function matchesWorkListMode(task, mode) {
    if (mode === "closed") {
      return isClosedWorkTask(task);
    }
    if (mode === "hold") {
      return isHeldWorkTask(task);
    }
    return isActiveWorkTask(task);
  }

  function isActiveWorkTask(task) {
    return !isClosedWorkTask(task) && !isHeldWorkTask(task);
  }

  function isHeldWorkTask(task) {
    return HELD_WORK_STATUSES.includes(clean(task.status));
  }

  function isInactiveWorkTask(task) {
    return isClosedWorkTask(task) || isHeldWorkTask(task);
  }

  function isClosedWorkTask(task) {
    return CLOSED_WORK_STATUSES.includes(clean(task.status));
  }

  function createWorkCardShell(title, status, priority, options) {
    const config = options || {};
    const card = document.createElement("article");
    card.className = "work-card";
    const header = document.createElement("div");
    header.className = "work-card-header";
    const heading = document.createElement("strong");
    heading.textContent = title;
    const badges = document.createElement("div");
    badges.className = "work-card-badges";
    const statusElement = config.statusControl
      ? createWorkStatusControl(config.category, config.id, status)
      : createBadgeElement(status, "badge-status");
    const priorityElement = config.priorityControl
      ? createWorkPriorityControl(config.category, config.id, priority)
      : createBadgeElement(priority, getPriorityClass(priority));
    badges.append(statusElement, priorityElement);
    header.append(heading, badges);

    const meta = document.createElement("div");
    meta.className = "work-card-meta";
    const memo = document.createElement("p");
    memo.className = "work-card-memo";
    const actions = document.createElement("div");
    actions.className = "work-card-actions";
    card.append(header, meta, memo, actions);
    return card;
  }

  function createWorkStatusControl(category, id, status) {
    return createInlineSelect(
      getWorkStatusOptions(category, status),
      status,
      "inline-status-select",
      (value) => updateWorkQuickField(category, id, "status", value),
      `${getWorkCategoryLabel(category)} 진행 상태`
    );
  }

  function createWorkPriorityControl(category, id, priority) {
    return createInlineSelect(
      getPriorityOptions(priority),
      priority || "보통",
      "inline-priority-select",
      (value) => updateWorkQuickField(category, id, "priority", value),
      `${getWorkCategoryLabel(category)} 중요도`
    );
  }

  function getWorkStatusOptions(category, currentValue) {
    if (category === "settlement") {
      return mergeOptionValues(SETTLEMENT_STATUS_OPTIONS, currentValue);
    }
    if (category === "output") {
      return mergeOptionValues(["대기", "진행 중", "검토 필요", "완료", "보류"], currentValue);
    }
    return mergeOptionValues(["대기", "진행 중", "완료", "보류"], currentValue);
  }

  function updateWorkQuickField(category, id, field, value) {
    const task = getWorkTaskByCategory(category, id);
    if (!task || task[field] === value) {
      return;
    }

    const previousValue = task[field];
    task[field] = value;
    appendHistoryEntry(
      task,
      "빠른 수정",
      `${HISTORY_FIELD_LABELS[field] || field}: ${formatHistoryValue(previousValue) || "-"} -> ${formatHistoryValue(value) || "-"}`
    );
    task.updatedAt = getLocalTimestamp();
    syncOpenWorkEditorField(category, id, field, value);
    if (saveState()) {
      render();
      setSaveStatus("빠른 수정이 저장됐습니다.", false);
    }
  }

  function getWorkTaskByCategory(category, id) {
    if (category === "settlement") {
      return state.settlementTasks.find((task) => task.id === id) || null;
    }
    if (category === "output") {
      return state.outputTasks.find((task) => task.id === id) || null;
    }
    return state.otherTasks.find((task) => task.id === id) || null;
  }

  function syncOpenWorkEditorField(category, id, field, value) {
    if (category === "settlement" && elements.settlementTaskId.value === id && field === "status") {
      elements.settlementStatus.value = value;
      return;
    }
    if (category === "output" && elements.outputTaskId.value === id) {
      if (field === "status") {
        elements.outputStatus.value = value;
      }
      if (field === "priority") {
        elements.outputPriority.value = value;
      }
      return;
    }
    if (category === "other" && elements.otherTaskId.value === id) {
      if (field === "status") {
        elements.otherStatus.value = value;
      }
      if (field === "priority") {
        elements.otherPriority.value = value;
      }
    }
  }

  function createWorkLine(label, value) {
    const item = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    item.append(strong, value || "-");
    return item;
  }

  function createFolderButton(type, id, count) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "file-folder-button";
    button.title = "관련 파일함 열기";
    button.setAttribute("aria-label", `관련 파일함 열기, ${count || 0}개`);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openFileDrawer(type, id);
    });

    const icon = document.createElement("span");
    icon.className = "folder-icon";
    icon.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.textContent = `파일 ${count || 0}`;

    button.append(icon, label);
    return button;
  }

  function createWorkAttachmentList(attachments) {
    const items = Array.isArray(attachments) ? attachments : [];
    if (!items.length) {
      return document.createDocumentFragment();
    }

    const fileList = document.createElement("div");
    fileList.className = "work-file-list";
    items.forEach((attachment) => {
      const item = document.createElement("div");
      item.className = "work-file-item";

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = attachment.fileName || "파일";
      button.addEventListener("click", () => downloadAttachment(attachment.id));
      item.appendChild(button);

      if (attachment.memo) {
        const memo = document.createElement("span");
        memo.textContent = attachment.memo;
        item.appendChild(memo);
      }

      fileList.appendChild(item);
    });
    return fileList;
  }

  function renderSelectedFileMemoInputs(fileInput, container) {
    if (!fileInput || !container) {
      return;
    }

    const files = Array.from(fileInput.files || []);
    container.innerHTML = "";
    files.forEach((file, index) => {
      const item = document.createElement("label");
      item.className = "file-memo-item";

      const title = document.createElement("span");
      title.className = "file-memo-title";
      title.textContent = `${file.name} (${formatFileSize(file.size)})`;

      const textarea = document.createElement("textarea");
      textarea.rows = 2;
      textarea.placeholder = "이 파일에 대한 메모";
      textarea.dataset.fileMemoIndex = String(index);

      item.append(title, textarea);
      container.appendChild(item);
    });
  }

  function getSelectedFileMemos(container) {
    const memos = [];
    if (!container) {
      return memos;
    }

    container.querySelectorAll("[data-file-memo-index]").forEach((field) => {
      memos[Number(field.dataset.fileMemoIndex)] = clean(field.value);
    });
    return memos;
  }

  function compareWorkTasksByRange(a, b) {
    const aDate = getWorkTaskSortDate(a);
    const bDate = getWorkTaskSortDate(b);
    return aDate.localeCompare(bDate) || String(b.updatedAt).localeCompare(String(a.updatedAt));
  }

  function getWorkTaskSortDate(task) {
    return clean(task.startDate) || clean(task.endDate) || "9999-12-31";
  }

  function appendWorkButtons(actions, onEdit, onDelete) {
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "수정";
    editButton.addEventListener("click", onEdit);
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "삭제";
    deleteButton.className = "delete-row-button";
    deleteButton.addEventListener("click", onDelete);
    actions.append(editButton, deleteButton);
  }

  function createWorkEmpty(message) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = message;
    return empty;
  }

  function switchCalendarView(mode) {
    calendarViewMode = mode === "week" ? "week" : "month";
    renderCalendar();
  }

  function moveCalendar(delta) {
    if (calendarViewMode === "week") {
      calendarDate = addDaysToDate(calendarDate, delta * 7);
    } else {
      calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + delta, 1);
    }
    renderCalendar();
  }

  function renderCalendar() {
    if (!elements.calendarGrid) {
      return;
    }
    updateCalendarViewButtons();
    if (calendarViewMode === "week") {
      renderWeekCalendar();
      renderTodayTasks();
      return;
    }
    renderMonthCalendar();
    renderTodayTasks();
  }

  function updateCalendarViewButtons() {
    const isMonth = calendarViewMode === "month";
    elements.calendarMonthViewButton.classList.toggle("is-active", isMonth);
    elements.calendarWeekViewButton.classList.toggle("is-active", !isMonth);
    elements.calendarMonthViewButton.setAttribute("aria-pressed", String(isMonth));
    elements.calendarWeekViewButton.setAttribute("aria-pressed", String(!isMonth));
  }

  function renderMonthCalendar() {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    elements.calendarTitle.textContent = `${year}년 ${String(month + 1).padStart(2, "0")}월`;
    elements.calendarGrid.className = "calendar-grid calendar-grid-month";
    elements.calendarGrid.innerHTML = "";

    ["일", "월", "화", "수", "목", "금", "토"].forEach((day) => {
      const header = document.createElement("div");
      header.className = "calendar-weekday";
      header.textContent = day;
      elements.calendarGrid.appendChild(header);
    });

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const eventsByDate = groupCalendarEvents();

    const totalCells = Math.max(35, Math.ceil((firstDay.getDay() + lastDay.getDate()) / 7) * 7);
    const firstVisibleDay = 1 - firstDay.getDay();

    for (let index = 0; index < totalCells; index += 1) {
      const date = new Date(year, month, firstVisibleDay + index);
      const dateString = formatDateString(date);
      const isOutsideMonth = date.getMonth() !== month;
      const cell = document.createElement("div");
      cell.className = "calendar-day";
      if (isOutsideMonth) {
        cell.classList.add("is-outside-month");
      }
      if (dateString === getTodayDateString()) {
        cell.classList.add("is-today");
      }
      const dayNumber = document.createElement("strong");
      dayNumber.textContent = isOutsideMonth ? `${date.getMonth() + 1}/${date.getDate()}` : String(date.getDate());
      cell.appendChild(dayNumber);
      const events = eventsByDate.get(dateString) || [];
      events.slice(0, 5).forEach((event) => cell.appendChild(createCalendarEvent(event)));
      if (events.length > 5) {
        const more = document.createElement("span");
        more.className = "calendar-more";
        more.textContent = `+${events.length - 5}개`;
        cell.appendChild(more);
      }
      elements.calendarGrid.appendChild(cell);
    }
  }

  function renderWeekCalendar() {
    const weekStart = getWeekStartDate(calendarDate);
    const weekEnd = addDaysToDate(weekStart, 6);
    const eventsByDate = groupCalendarEvents();
    elements.calendarTitle.textContent = `${formatDateForDisplay(formatDateString(weekStart))} ~ ${formatDateForDisplay(formatDateString(weekEnd))}`;
    elements.calendarGrid.className = "calendar-grid calendar-grid-week";
    elements.calendarGrid.innerHTML = "";

    for (let index = 0; index < 7; index += 1) {
      const date = addDaysToDate(weekStart, index);
      const dateString = formatDateString(date);
      const day = document.createElement("section");
      day.className = "calendar-week-day";
      if (dateString === getTodayDateString()) {
        day.classList.add("is-today");
      }

      const header = document.createElement("div");
      header.className = "calendar-week-day-header";
      const weekday = document.createElement("span");
      weekday.textContent = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
      const dateLabel = document.createElement("strong");
      dateLabel.textContent = `${date.getMonth() + 1}/${date.getDate()}`;
      header.append(weekday, dateLabel);

      const list = document.createElement("div");
      list.className = "calendar-week-event-list";
      const events = eventsByDate.get(dateString) || [];
      if (!events.length) {
        const empty = document.createElement("p");
        empty.className = "calendar-week-empty";
        empty.textContent = "일정 없음";
        list.appendChild(empty);
      } else {
        events.forEach((event) => list.appendChild(createCalendarWeekEvent(event)));
      }

      day.append(header, list);
      elements.calendarGrid.appendChild(day);
    }
  }

  function createCalendarWeekEvent(event) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `calendar-week-event calendar-event-${event.type}`;
    button.title = event.detail || "";
    button.addEventListener("click", () => openCalendarEvent(event));

    const title = document.createElement("strong");
    title.textContent = `[${event.type}] ${event.title}`;
    const meta = document.createElement("span");
    meta.textContent = [event.subtype, event.priority].filter(Boolean).join(" · ");
    const detail = document.createElement("small");
    detail.textContent = event.detail || "상세 내용 없음";

    button.append(title, meta, detail);
    return button;
  }

  function groupCalendarEvents() {
    const map = new Map();
    getCalendarEvents().forEach((event) => {
      if (!event.date) {
        return;
      }
      if (!map.has(event.date)) {
        map.set(event.date, []);
      }
      map.get(event.date).push(event);
    });
    map.forEach((events) => {
      events.sort((a, b) => a.type.localeCompare(b.type, "ko") || String(a.subtype).localeCompare(String(b.subtype), "ko") || a.title.localeCompare(b.title, "ko"));
    });
    return map;
  }

  function getCalendarEvents() {
    const events = [];
    state.notes.forEach((note) => {
      if (note.nextContactDate) {
        events.push({
          date: note.nextContactDate,
          type: "영업",
          subtype: "연락",
          title: getSalesCompanyTitle(note),
          detail: note.nextAction || "다음 연락",
          priority: note.priority,
          id: note.id
        });
      }
      if (note.status === "미팅 예정" && note.meetingDate) {
        events.push({
          date: note.meetingDate,
          type: "영업",
          subtype: "미팅",
          title: getSalesCompanyTitle(note),
          detail: note.nextAction || "미팅 일정",
          priority: note.priority,
          id: note.id
        });
      }
    });
    state.outputTasks.forEach((task) => {
      if (isInactiveWorkTask(task)) {
        return;
      }
      getDateRangeDates(task.startDate, task.endDate, { includeWeekends: task.includeWeekends }).forEach((date) => {
        events.push({
          date,
          type: "출력",
          subtype: "기한",
          title: getWorkCompanyTitle(task, task.outputType || "출력 업무"),
          detail: [formatWorkDateRangeForDisplay(task), task.outputType, task.status].filter((item) => item && item !== "-").join(" · "),
          priority: task.priority,
          id: task.id
        });
      });
    });
    state.settlementTasks.forEach((task) => {
      if (isInactiveWorkTask(task)) {
        return;
      }
      if (Array.isArray(task.paymentSchedule) && task.paymentSchedule.length) {
        const today = getTodayDateString();
        task.paymentSchedule.forEach((row) => {
          if (!row.dueDate || isSettlementScheduleRowComplete(row)) {
            return;
          }
          const isLate = row.dueDate < today && !isSettlementScheduleRowComplete(row);
          events.push({
            date: row.dueDate,
            type: "정산",
            subtype: formatSettlementScheduleRound(row, task.paymentType),
            title: getWorkCompanyTitle(task, "정산 업무"),
            detail: [
              task.paymentType,
              row.status,
              hasAmountValue(row.amount) ? formatMoneyWithVatForDisplay(row.amount, row.amountVatIncluded) : "",
              row.item,
              row.memo
            ].filter((item) => item && item !== "-").join(" · "),
            priority: isLate || task.status === "확인 필요" ? "긴급" : "보통",
            id: task.id
          });
        });
      } else if (task.nextActionDate) {
        events.push({
          date: task.nextActionDate,
          type: "정산",
          subtype: task.nextAction || "정산 확인",
          title: getWorkCompanyTitle(task, "정산 업무"),
          detail: [
            task.paymentType,
            task.status,
            formatSettlementNextAction(task),
            `잔액 ${formatMoneyForDisplay(calculateSettlementRemaining(task))}`
          ].filter((item) => item && item !== "-").join(" · "),
          priority: task.status === "확인 필요" ? "긴급" : "보통",
          id: task.id
        });
      }
    });
    state.otherTasks.forEach((task) => {
      if (isInactiveWorkTask(task)) {
        return;
      }
      getDateRangeDates(task.startDate, task.endDate, { includeWeekends: task.includeWeekends }).forEach((date) => {
        events.push({
          date,
          type: "기타",
          subtype: "기한",
          title: task.title || "기타 업무",
          detail: [formatWorkDateRangeForDisplay(task), task.category, task.status].filter((item) => item && item !== "-").join(" · "),
          priority: "보통",
          id: task.id
        });
      });
    });
    return events;
  }

  function createCalendarEvent(event) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `calendar-event calendar-event-${event.type}`;
    button.textContent = `[${event.type}] ${event.title} ${event.subtype || ""}`.trim();
    button.title = event.detail;
    button.addEventListener("click", () => openCalendarEvent(event));
    return button;
  }

  function renderTodayTasks() {
    if (!elements.todayTaskList) {
      return;
    }
    const today = getTodayDateString();
    const events = getCalendarEvents()
      .filter((event) => event.date === today)
      .sort(compareCalendarEventPriority);

    elements.todayTaskList.innerHTML = "";
    if (!events.length) {
      const empty = document.createElement("div");
      empty.className = "today-empty";
      empty.textContent = "오늘 예정된 업무가 없습니다.";
      elements.todayTaskList.appendChild(empty);
      return;
    }

    events.forEach((event) => {
      elements.todayTaskList.appendChild(createTodayTaskItem(event));
    });
  }

  function compareCalendarEventPriority(a, b) {
    const priorityDiff = (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0);
    if (priorityDiff) {
      return priorityDiff;
    }
    return a.type.localeCompare(b.type, "ko") || a.title.localeCompare(b.title, "ko");
  }

  function createTodayTaskItem(event) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `today-task today-task-${event.type}`;
    item.addEventListener("click", () => openCalendarEvent(event));

    const head = document.createElement("div");
    head.className = "today-task-head";
    const title = document.createElement("strong");
    title.textContent = `[${event.type}] ${event.title} ${event.subtype || ""}`.trim();
    const badge = createBadgeElement(event.priority || event.type, event.priority ? getPriorityClass(event.priority) : "badge-status");
    head.append(title, badge);

    const detail = document.createElement("p");
    detail.textContent = event.detail || "상세 내용 없음";

    item.append(head, detail);
    return item;
  }

  function openCalendarEvent(event) {
    if (event.type === "영업") {
      switchPortal("sales");
      editNote(event.id);
    } else if (event.type === "정산") {
      editSettlementTask(event.id);
    } else if (event.type === "출력") {
      editOutputTask(event.id);
    } else {
      editOtherTask(event.id);
    }
  }

  function getFilteredNotes() {
    const search = elements.searchInput.value.trim().toLowerCase();
    const statusFilter = elements.statusFilter.value;
    const itemCategoryFilter = elements.itemCategoryFilter.value;
    const priorityFilter = elements.priorityFilter.value;
    const sortValue = elements.sortSelect.value;

    return state.notes
      .filter((note) => {
        const matchesSearch = !search || getSalesSearchText(note).includes(search);
        const matchesStatus = statusFilter === "all" || note.status === statusFilter;
        const matchesItemCategory = itemCategoryFilter === "all"
          || (itemCategoryFilter === "uncategorized" ? !note.itemCategory : note.itemCategory === itemCategoryFilter);
        const matchesPriority = priorityFilter === "all" || note.priority === priorityFilter;
        const matchesSummary = matchesSummaryFilter(note);
        return matchesSearch && matchesStatus && matchesItemCategory && matchesPriority && matchesSummary;
      })
      .sort((a, b) => compareNotes(a, b, sortValue));
  }

  function getSalesSearchText(note) {
    return [
      note.company,
      note.companyUnknown ? "업체 미정" : "",
      note.contactName,
      note.contactPhone,
      note.contactEmail,
      getLinkedCompanySearchText(note.companyId),
      note.interest,
      note.itemCategory,
      note.status,
      note.priority,
      note.meetingDate,
      note.nextAction,
      note.memo,
      note.quoteStatus,
      note.purchasePossibility,
      note.expectedRevenueAmount,
      hasAmountValue(note.expectedRevenueAmount) ? formatVatStatus(note.expectedRevenueVatIncluded) : "",
      note.revenueAmount,
      hasAmountValue(note.revenueAmount) ? formatVatStatus(note.revenueAmountVatIncluded) : "",
      note.revenueType,
      (note.attachments || []).map((attachment) => [
        attachment.fileName,
        attachment.category,
        attachment.memo,
        attachment.sentDate
      ].join(" ")).join(" ")
    ].join(" ").toLowerCase();
  }

  function matchesSummaryFilter(note) {
    if (activeSummaryFilter === "active") {
      return isActiveSalesNote(note);
    }
    if (activeSummaryFilter === "all") {
      return true;
    }

    const today = getTodayDateString();
    if (activeSummaryFilter === "today") {
      return note.nextContactDate === today;
    }
    if (activeSummaryFilter === "overdue") {
      return isOverdue(note.nextContactDate, today);
    }
    if (activeSummaryFilter === "week") {
      const weekEnd = addDays(today, 6);
      return hasWeeklySalesSchedule(note, today, weekEnd);
    }
    if (activeSummaryFilter === "meeting") {
      return note.status === "미팅 예정";
    }
    if (activeSummaryFilter === "completed") {
      return isCompletedSalesNote(note);
    }
    if (activeSummaryFilter === "failed") {
      return isFailedSalesNote(note);
    }

    return true;
  }

  function isActiveSalesNote(note) {
    return !isCompletedSalesNote(note) && !isFailedSalesNote(note);
  }

  function isCompletedSalesNote(note) {
    return clean(note.status) === "완료";
  }

  function isFailedSalesNote(note) {
    const status = clean(note.status);
    return status === "실패" || status === "실패/종료";
  }

  function hasWeeklySalesSchedule(note, startDate, endDate) {
    return isDateInRange(note.nextContactDate, startDate, endDate)
      || (note.status === "미팅 예정" && isDateInRange(note.meetingDate, startDate, endDate));
  }

  function isDateInRange(dateString, startDate, endDate) {
    return Boolean(dateString && dateString >= startDate && dateString <= endDate);
  }

  function getOpenNote() {
    const id = elements.noteId.value;
    return state.notes.find((note) => note.id === id) || null;
  }

  function compareNotes(a, b, sortValue) {
    if (sortValue === "priority") {
      return compareByPriority(a, b) || compareByUpdatedAt(a, b, "desc");
    }
    if (sortValue === "updated") {
      return compareByUpdatedAt(a, b, sortDirection);
    }
    if (sortValue === "company") {
      return compareByCompany(a, b, sortDirection);
    }
    if (sortValue === "nextContact") {
      return compareByNextContact(a, b, sortDirection);
    }
    return compareByPriority(a, b) || compareByUpdatedAt(a, b, "desc");
  }

  function compareByPriority(a, b) {
    return (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0);
  }

  function compareByUpdatedAt(a, b, direction) {
    const result = String(a.updatedAt || "").localeCompare(String(b.updatedAt || ""));
    return direction === "desc" ? -result : result;
  }

  function compareByCompany(a, b, direction) {
    const result = String(a.company || "").localeCompare(String(b.company || ""), "ko");
    return direction === "desc" ? -result : result;
  }

  function compareByNextContact(a, b, direction) {
    const aMissing = !a.nextContactDate;
    const bMissing = !b.nextContactDate;
    if (aMissing !== bMissing) {
      return aMissing ? 1 : -1;
    }

    const result = String(a.nextContactDate || "").localeCompare(String(b.nextContactDate || ""));
    const directedResult = direction === "desc" ? -result : result;
    return directedResult || compareByUpdatedAt(a, b, "desc");
  }

  function compareByFollowupSchedule(a, b, groupKey) {
    if (groupKey === "meeting") {
      const aDate = a.meetingDate || a.nextContactDate || "9999-12-31";
      const bDate = b.meetingDate || b.nextContactDate || "9999-12-31";
      return aDate.localeCompare(bDate) || String(b.updatedAt).localeCompare(String(a.updatedAt));
    }

    return compareByNextContact(a, b);
  }

  function handleFormSubmit(event) {
    event.preventDefault();

    const now = getLocalTimestamp();
    const existingId = elements.noteId.value;
    const note = readFormValues(now);

    if (!note.company && !note.companyUnknown && !note.nextAction && !note.memo) {
      alert("고객사명, 다음 액션, 메모 중 하나는 입력해 주세요.");
      return;
    }

    if (existingId) {
      const index = state.notes.findIndex((item) => item.id === existingId);
      if (index >= 0) {
        const previous = state.notes[index];
        note.id = existingId;
        note.createdAt = previous.createdAt;
        note.updatedAt = now;
        note.attachments = previous.attachments || [];
        note.history = cloneHistory(previous.history);
        recordChangedFields(note, previous, note, [
          "company",
          "companyUnknown",
          "contactName",
          "contactPhone",
          "contactEmail",
          "interest",
          "itemCategory",
          "status",
          "priority",
          "meetingDate",
          "nextAction",
          "nextContactDate",
          "lastContactDate",
          "quoteStatus",
          "purchasePossibility",
          "expectedRevenueAmount",
          "expectedRevenueVatIncluded",
          "revenueAmount",
          "revenueAmountVatIncluded",
          "revenueType",
          "memo"
        ]);
        state.notes[index] = note;
      } else {
        note.id = createId();
        note.createdAt = now;
        note.updatedAt = now;
        note.attachments = [];
        note.history = [];
        appendHistoryEntry(note, "생성", "영업 메모 생성");
        state.notes.unshift(note);
      }
    } else {
      note.id = createId();
      note.createdAt = now;
      note.updatedAt = now;
      note.attachments = [];
      note.history = [];
      appendHistoryEntry(note, "생성", "영업 메모 생성");
      state.notes.unshift(note);
    }

    if (saveState()) {
      clearDraft(false);
      render();
      editNote(note.id, {
        skipUnsavedCheck: true,
        focus: false,
        statusMessage: "저장됨. 파일함에서 관련 파일을 추가할 수 있습니다."
      });
    }
  }

  function readFormValues(now) {
    const values = getFormValues();
    return {
      ...values,
      id: values.id || createId(),
      createdAt: now,
      updatedAt: now
    };
  }

  function getFormValues() {
    return {
      id: clean(elements.noteId.value),
      companyId: clean(elements.salesCompanyId.value),
      contactId: clean(elements.salesContactId.value),
      companyUnknown: elements.salesCompanyUnknown.checked,
      company: clean(elements.company.value),
      contactName: clean(elements.contactName.value),
      contactPhone: clean(elements.contactPhone.value),
      contactEmail: clean(elements.contactEmail.value),
      interest: clean(elements.interest.value),
      itemCategory: normalizeSalesItemCategory(elements.itemCategory.value),
      status: elements.status.value || DEFAULT_STATUS_OPTIONS[0],
      priority: elements.priority.value || "보통",
      meetingDate: elements.status.value === "미팅 예정" ? clean(elements.meetingDate.value) : "",
      nextAction: clean(elements.nextAction.value),
      nextContactDate: elements.nextContactUnknown.checked ? "" : clean(elements.nextContactDate.value),
      nextContactUnknown: elements.nextContactUnknown.checked,
      lastContactDate: clean(elements.lastContactDate.value),
      memo: clean(elements.memo.value),
      quoteStatus: clean(elements.quoteStatus.value),
      purchasePossibility: clean(elements.purchasePossibility.value),
      expectedRevenueAmount: normalizeAmountValue(elements.expectedRevenueAmount.value),
      expectedRevenueVatIncluded: elements.expectedRevenueVatIncluded.checked,
      revenueAmount: normalizeAmountValue(elements.revenueAmount.value),
      revenueAmountVatIncluded: elements.revenueAmountVatIncluded.checked,
      revenueType: clean(elements.revenueType.value),
      expenseAmount: "",
      marginRate: ""
    };
  }

  function applyFormValues(values) {
    const legacyContact = splitLegacyContactInfo(values.contactInfo);
    isApplyingFormValues = true;
    elements.noteId.value = values.id || "";
    elements.salesCompanyId.value = values.companyId || "";
    elements.salesContactId.value = values.contactId || "";
    elements.salesCompanyUnknown.checked = Boolean(values.companyUnknown);
    elements.salesCompanySearch.value = "";
    elements.company.value = values.company || "";
    elements.contactName.value = values.contactName || "";
    elements.contactPhone.value = values.contactPhone || legacyContact.phone;
    elements.contactEmail.value = values.contactEmail || legacyContact.email;
    elements.interest.value = values.interest || "";
    elements.itemCategory.value = normalizeSalesItemCategory(values.itemCategory);
    elements.status.value = values.status || state.statusOptions[0] || DEFAULT_STATUS_OPTIONS[0];
    elements.priority.value = values.priority || "보통";
    elements.meetingDate.value = values.meetingDate || "";
    elements.nextAction.value = values.nextAction || "";
    elements.nextContactDate.value = values.nextContactDate || "";
    elements.nextContactUnknown.checked = Boolean(values.nextContactUnknown);
    elements.lastContactDate.value = values.lastContactDate || "";
    elements.memo.value = values.memo || "";
    elements.quoteStatus.value = values.quoteStatus || "";
    elements.purchasePossibility.value = values.purchasePossibility || "";
    elements.expectedRevenueAmount.value = normalizeAmountValue(values.expectedRevenueAmount);
    elements.expectedRevenueVatIncluded.checked = Boolean(values.expectedRevenueVatIncluded);
    elements.revenueAmount.value = normalizeAmountValue(values.revenueAmount);
    elements.revenueAmountVatIncluded.checked = Boolean(values.revenueAmountVatIncluded);
    elements.revenueType.value = values.revenueType || "";
    elements.attachmentFileInput.value = "";
    elements.attachmentMemo.value = "";
    updateMeetingDateVisibility();
    updateNextContactDateState();
    renderSalesCompanyPicker();
    isApplyingFormValues = false;
  }

  function setEditMode(isEditing) {
    elements.formTitle.textContent = isEditing ? "메모 수정" : "새 메모";
    elements.saveButton.textContent = isEditing ? "수정 저장" : "저장";
    elements.openCurrentNoteFilesButton.classList.toggle("hidden", !isEditing);
    elements.deleteButton.classList.toggle("hidden", !isEditing);
  }

  function editNote(id, options) {
    const config = options || {};
    if (!config.skipUnsavedCheck && hasUnsavedFormChanges() && !confirm("저장되지 않은 작성 내용이 있습니다. 선택한 메모를 열까요?")) {
      return;
    }

    const note = state.notes.find((item) => item.id === id);
    if (!note) {
      return;
    }

    clearDraft(false);
    applyFormValues(note);
    setEditMode(true);
    openEditorPanel();
    updateFormSnapshot();
    renderAttachmentSection(note);
    setDraftStatus(config.statusMessage || "수정 중인 메모가 열렸습니다.", false);
    if (config.focus !== false) {
      elements.salesCompanySearch.focus();
    }
  }

  function resetForm(options) {
    const config = options || {};
    if (!config.silent && hasUnsavedFormChanges() && !confirm("저장되지 않은 작성 내용을 지우고 새 메모로 돌아갈까요?")) {
      return;
    }

    isApplyingFormValues = true;
    elements.noteForm.reset();
    elements.noteId.value = "";
    elements.salesCompanyId.value = "";
    elements.salesContactId.value = "";
    elements.salesCompanyUnknown.checked = false;
    elements.salesCompanySearch.value = "";
    elements.status.value = state.statusOptions[0] || DEFAULT_STATUS_OPTIONS[0];
    elements.priority.value = "보통";
    elements.nextContactUnknown.checked = false;
    elements.nextContactDate.disabled = false;
    elements.attachmentFileInput.value = "";
    elements.attachmentMemo.value = "";
    isApplyingFormValues = false;
    setEditMode(false);
    updateMeetingDateVisibility();
    updateNextContactDateState();
    renderSalesCompanyPicker();
    clearDraft(false);
    updateFormSnapshot();
    renderAttachmentSection(null);
    setDraftStatus("작성 중 초안 없음", false);
  }

  function handleCurrentDelete() {
    const id = elements.noteId.value;
    if (id) {
      deleteNote(id);
    }
  }

  async function deleteNote(id) {
    const note = state.notes.find((item) => item.id === id);
    if (!note) {
      return;
    }

    const label = note.company || "선택한 메모";
    const attachmentMessage = note.attachments.length ? `\n연결된 첨부자료 ${note.attachments.length}개도 함께 삭제됩니다.` : "";
    if (!confirm(`${label} 메모를 삭제할까요?${attachmentMessage}`)) {
      return;
    }

    try {
      await deleteAttachmentRecords(note.attachments);
    } catch (error) {
      console.error(error);
      if (!confirm(`첨부자료 원본을 삭제하지 못했습니다.\n${error.message || error}\n\n메모 목록에서만 삭제할까요?`)) {
        return;
      }
    }

    const isDeletingOpenNote = elements.noteId.value === id;
    state.notes = state.notes.filter((item) => item.id !== id);
    if (saveState()) {
      closeFileDrawerIfContext("sales", id);
      if (isDeletingOpenNote) {
        resetForm({ silent: true });
        hideEditorPanel();
      }
      render();
    }
  }

  function exportJsonBackup() {
    const backup = createBackupPayload("manual");

    downloadFile(
      JSON.stringify(backup, null, 2),
      `sales-note-backup-${getFilenameTimestamp()}.json`,
      "application/json"
    );
    recordJsonBackup();
  }

  function createBackupPayload(reason, options) {
    const config = options || {};
    return {
      app: "sales-note-app",
      version: APP_VERSION,
      backupCreatedAt: getLocalTimestamp(),
      reason: reason || "manual",
      updatedAt: state.updatedAt,
      backupType: config.backupType || "records-json",
      attachmentStorage: config.attachmentStorage || "indexedDB",
      fileOriginalsIncluded: Boolean(config.fileOriginalsIncluded),
      missingFileOriginals: Number(config.missingFileOriginals) || 0,
      statusOptions: config.statusOptions || state.statusOptions,
      companies: config.companies || state.companies,
      notes: config.notes || state.notes,
      settlementTasks: config.settlementTasks || state.settlementTasks,
      outputTasks: config.outputTasks || state.outputTasks,
      otherTasks: config.otherTasks || state.otherTasks,
      accounts: config.accounts || state.accounts
    };
  }

  async function exportFullBackupZip() {
    if (!window.indexedDB) {
      alert("이 브라우저에서는 첨부파일 저장소를 사용할 수 없어 전체 백업을 만들 수 없습니다.");
      return;
    }

    elements.exportFullBackupButton.disabled = true;
    elements.exportFullBackupButton.textContent = "ZIP 생성 중";

    try {
      const result = await createFullBackupZipBlob();
      downloadBlob(
        result.blob,
        `work-note-full-backup-${getFilenameTimestamp()}.zip`,
        "application/zip"
      );
      recordJsonBackup();

      if (result.missingCount) {
        alert(`전체 백업 ZIP을 만들었지만 원본 파일 ${result.missingCount}개를 찾지 못했습니다.\n브라우저 저장소에서 이미 사라진 파일일 수 있습니다.`);
      } else {
        setSaveStatus("전체 백업 ZIP이 생성됐습니다.", false);
      }
    } catch (error) {
      console.error(error);
      alert(`전체 백업 ZIP을 만들지 못했습니다.\n${error.message || error}`);
    } finally {
      elements.exportFullBackupButton.disabled = false;
      elements.exportFullBackupButton.textContent = "전체 백업";
    }
  }

  async function createFullBackupZipBlob() {
    const backupState = cloneBackupState();
    const fileEntries = [];
    let totalCount = 0;
    let missingCount = 0;

    const owners = [
      { type: "company", items: backupState.companies },
      { type: "sales", items: backupState.notes },
      { type: "settlement", items: backupState.settlementTasks },
      { type: "output", items: backupState.outputTasks },
      { type: "other", items: backupState.otherTasks }
    ];

    for (const ownerGroup of owners) {
      for (const owner of ownerGroup.items) {
        const attachments = Array.isArray(owner.attachments) ? owner.attachments : [];
        for (const attachment of attachments) {
          totalCount += 1;
          const backupPath = createAttachmentBackupPath(ownerGroup.type, owner, attachment);
          attachment.backupPath = backupPath;
          try {
            const record = await getAttachmentRecord(attachment.id);
            if (!record || !record.blob) {
              attachment.missingOriginal = true;
              missingCount += 1;
              continue;
            }

            const buffer = await record.blob.arrayBuffer();
            fileEntries.push({
              path: backupPath,
              data: new Uint8Array(buffer)
            });
          } catch (error) {
            console.warn("Full backup attachment read failed", attachment.id, error);
            attachment.missingOriginal = true;
            missingCount += 1;
          }
        }
      }
    }

    const payload = createBackupPayload("full-zip", {
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

    const entries = [
      {
        path: "backup.json",
        data: textToBytes(JSON.stringify(payload, null, 2))
      },
      ...fileEntries
    ];

    return {
      blob: createZipBlob(entries),
      totalCount,
      missingCount
    };
  }

  function cloneBackupState() {
    return {
      companies: JSON.parse(JSON.stringify(state.companies)),
      notes: JSON.parse(JSON.stringify(state.notes)),
      settlementTasks: JSON.parse(JSON.stringify(state.settlementTasks)),
      outputTasks: JSON.parse(JSON.stringify(state.outputTasks)),
      otherTasks: JSON.parse(JSON.stringify(state.otherTasks)),
      accounts: JSON.parse(JSON.stringify(state.accounts))
    };
  }

  function collectAttachmentIdsFromData(data) {
    const ids = new Set();
    [
      ...(data.notes || []),
      ...(data.companies || []),
      ...(data.settlementTasks || []),
      ...(data.outputTasks || []),
      ...(data.otherTasks || [])
    ].forEach((item) => {
      (Array.isArray(item.attachments) ? item.attachments : []).forEach((attachment) => {
        if (attachment && attachment.id) {
          ids.add(attachment.id);
        }
      });
    });
    return ids;
  }

  function createAttachmentBackupPath(type, owner, attachment) {
    const ownerId = sanitizePathSegment(owner.id || "unknown");
    const fileId = sanitizePathSegment(attachment.id || createId().replace("note_", "file_"));
    const fileName = sanitizeFileName(attachment.fileName || "attachment");
    return `attachments/${type}/${ownerId}/${fileId}-${fileName}`;
  }

  function createZipBlob(entries) {
    const chunks = [];
    const centralDirectory = [];
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

      chunks.push(localHeader, data);

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
      chunks.push(header);
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
    chunks.push(endRecord);

    return new Blob(chunks, { type: "application/zip" });
  }

  function calculateCrc32(data) {
    const table = getZipCrcTable();
    let crc = 0xffffffff;
    for (let index = 0; index < data.length; index += 1) {
      crc = (crc >>> 8) ^ table[(crc ^ data[index]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function getZipCrcTable() {
    if (zipCrcTable) {
      return zipCrcTable;
    }

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

  function textToBytes(value) {
    return new TextEncoder().encode(value);
  }

  function getDosTime(date) {
    return (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  }

  function getDosDate(date) {
    return ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  }

  function sanitizePathSegment(value) {
    return String(value || "item")
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, "_")
      .slice(0, 120) || "item";
  }

  function sanitizeFileName(value) {
    const fileName = String(value || "attachment").split(/[\\/]/).pop();
    return sanitizePathSegment(fileName);
  }

  function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    const mode = pendingJsonImportMode;
    const reader = new FileReader();
    reader.onload = () => {
      importJsonBackup(reader.result, mode);
      pendingJsonImportMode = "replace";
      elements.importFileInput.value = "";
    };
    reader.onerror = () => {
      pendingJsonImportMode = "replace";
      elements.importFileInput.value = "";
      alert("파일을 읽지 못했습니다.");
    };
    reader.readAsText(file, "utf-8");
  }

  async function handleImportFullBackupFile(event) {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    const mode = pendingZipImportMode;
    try {
      await importFullBackupZip(file, mode);
    } finally {
      pendingZipImportMode = "replace";
      elements.importFullBackupInput.value = "";
    }
  }

  async function importFullBackupZip(file, mode) {
    if (!window.indexedDB) {
      alert("이 브라우저에서는 첨부파일 저장소를 사용할 수 없어 전체 백업을 불러올 수 없습니다.");
      return;
    }

    const importMode = mode === "merge" ? "merge" : "replace";
    const controlButton = importMode === "merge" ? elements.mergeFullBackupButton : elements.importFullBackupButton;
    const defaultButtonText = controlButton.textContent;
    controlButton.disabled = true;
    controlButton.textContent = importMode === "merge" ? "ZIP 병합 중" : "ZIP 읽는 중";

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const zipEntries = parseZipArchive(bytes);
      const backupEntry = findZipBackupJson(zipEntries);
      if (!backupEntry) {
        alert("ZIP 안에서 backup.json을 찾지 못했습니다.");
        return;
      }

      const parsed = JSON.parse(new TextDecoder().decode(backupEntry.data));
      const backupData = extractBackupData(parsed);
      if (!backupData || !Array.isArray(backupData.notes)) {
        alert("Work Note 전체 백업 ZIP 형식이 아닙니다.");
        return;
      }

      const restoreFiles = collectZipAttachmentRecords(backupData, zipEntries);
      const missingMessage = restoreFiles.missingCount
        ? `\n\n주의: ZIP 안에서 원본 파일 ${restoreFiles.missingCount}개를 찾지 못했습니다. 해당 파일은 기록만 복원됩니다.`
        : "";

      if (importMode === "merge") {
        const ok = confirm(`전체 백업 ZIP을 현재 데이터에 스마트 병합합니다.\n\n같은 업무는 기존 건 안에서 갱신/합산하고, 새 업무와 새 첨부파일은 추가합니다.\n백업 생성일: ${formatDateTimeForDisplay(backupData.backupCreatedAt)}\n가져올 원본 파일: ${restoreFiles.records.length}개${missingMessage}\n\n계속할까요?`);
        if (!ok) {
          return;
        }

        await mergeFullBackupZipData(backupData, restoreFiles);
        return;
      }

      const ok = confirm(`전체 백업 ZIP을 불러오면 현재 업무 데이터와 첨부파일 원본 저장소를 덮어씁니다.\n\n백업 생성일: ${formatDateTimeForDisplay(backupData.backupCreatedAt)}\n복원할 원본 파일: ${restoreFiles.records.length}개${missingMessage}\n\n계속할까요?`);
      if (!ok) {
        return;
      }

      const preImportBackup = createBackupPayload("before-full-zip-import");
      downloadFile(
        JSON.stringify(preImportBackup, null, 2),
        `sales-note-pre-full-import-backup-${getFilenameTimestamp()}.json`,
        "application/json"
      );
      recordJsonBackup();

      try {
        localStorage.setItem(TEMP_IMPORT_BACKUP_KEY, JSON.stringify(preImportBackup));
      } catch (error) {
        console.warn("Temporary backup failed", error);
      }

      const previousAttachmentIds = collectAttachmentIdsFromData(state);
      const importedAttachmentIds = new Set(restoreFiles.records.map((record) => record.id));
      for (const record of restoreFiles.records) {
        const { backupOwnerType, backupOwnerId, ...recordData } = record;
        await putAttachmentRecord(recordData);
      }

      state = normalizeState({
        version: backupData.version,
        updatedAt: getLocalTimestamp(),
        statusOptions: backupData.statusOptions,
        companies: backupData.companies,
        notes: backupData.notes,
        settlementTasks: backupData.settlementTasks,
        outputTasks: backupData.outputTasks,
        otherTasks: backupData.otherTasks,
        accounts: backupData.accounts
      });

      if (!saveState()) {
        return;
      }
      const oldOnlyIds = new Set(Array.from(previousAttachmentIds).filter((id) => !importedAttachmentIds.has(id)));
      try {
        await deleteAttachmentRecordsById(oldOnlyIds);
      } catch (error) {
        console.warn("Old attachment cleanup failed", error);
      }
      renderStatusOptions();
      resetForm({ silent: true });
      hideEditorPanel();
      closeSettlementEditorPanel({ force: true });
      closeOutputEditorPanel({ force: true });
      closeOtherEditorPanel({ force: true });
      closeFileDrawer();
      closeCustomerDrawer();
      closeAttachmentPreview();
      render();
      alert(`전체 백업 ZIP을 불러왔습니다.\n원본 파일 ${restoreFiles.records.length}개가 복원됐습니다.`);
    } catch (error) {
      console.error(error);
      alert(`전체 백업 ZIP을 불러오지 못했습니다.\n${error.message || error}`);
    } finally {
      controlButton.disabled = false;
      controlButton.textContent = defaultButtonText;
    }
  }

  function extractBackupData(parsed) {
    return parsed && parsed.data && Array.isArray(parsed.data.notes) ? parsed.data : parsed;
  }

  function collectZipAttachmentRecords(backupData, zipEntries) {
    const records = [];
    let missingCount = 0;
    const ownerGroups = [
      { type: "company", items: backupData.companies || [] },
      { type: "sales", items: backupData.notes || [] },
      { type: "settlement", items: backupData.settlementTasks || [] },
      { type: "output", items: backupData.outputTasks || [] },
      { type: "other", items: backupData.otherTasks || [] }
    ];

    ownerGroups.forEach((ownerGroup) => {
      ownerGroup.items.forEach((owner) => {
        const attachments = Array.isArray(owner.attachments) ? owner.attachments : [];
        attachments.forEach((attachment) => {
          const meta = normalizeAttachmentMeta(attachment);
          if (!meta) {
            return;
          }

          const backupPath = clean(attachment.backupPath).replace(/\\/g, "/");
          const entry = backupPath ? zipEntries.get(backupPath) : null;
          if (!entry) {
            missingCount += 1;
            return;
          }

          records.push({
            ...meta,
            backupOwnerType: ownerGroup.type,
            backupOwnerId: owner.id,
            blob: new Blob([entry.data], { type: meta.fileType || "application/octet-stream" })
          });
        });
      });
    });

    return { records, missingCount };
  }

  async function mergeFullBackupZipData(backupData, restoreFiles) {
    savePreImportSnapshot("before-full-zip-merge", "sales-note-pre-full-merge-backup");

    const previousState = state;
    const mergeResult = mergeBackupDataIntoCurrent(backupData);
    let restoredFileCount = 0;

    for (const record of restoreFiles.records) {
      const ownerKey = createOwnerMapKey(record.backupOwnerType, record.backupOwnerId);
      if (!mergeResult.ownerIdMap.has(ownerKey)) {
        continue;
      }

      const { backupOwnerType, backupOwnerId, ...recordData } = record;
      const nextRecord = {
        ...recordData,
        id: mergeResult.attachmentIdMap.get(record.id) || record.id,
        noteId: mergeResult.ownerIdMap.get(ownerKey) || record.noteId
      };
      await putAttachmentRecord(nextRecord);
      restoredFileCount += 1;
    }

    state = mergeResult.state;
    if (!saveState()) {
      state = previousState;
      return;
    }

    refreshAfterImport();
    alert(`전체 백업 ZIP을 병합했습니다.\n추가된 업무: ${formatMergeCount(mergeResult.counts)}\n기존 업무 갱신: ${mergeResult.counts.updated}건\n복원된 원본 파일: ${restoredFileCount}개\n중복으로 판단해 건너뛴 업무: ${mergeResult.counts.skipped}개`);
  }

  function mergeJsonBackupData(backupData) {
    savePreImportSnapshot("before-json-merge", "sales-note-pre-json-merge-backup");

    const previousState = state;
    const mergeResult = mergeBackupDataIntoCurrent(backupData);
    state = mergeResult.state;
    if (!saveState()) {
      state = previousState;
      return;
    }

    refreshAfterImport();
    alert(`JSON 백업을 병합했습니다.\n추가된 업무: ${formatMergeCount(mergeResult.counts)}\n기존 업무 갱신: ${mergeResult.counts.updated}건\n중복으로 판단해 건너뛴 업무: ${mergeResult.counts.skipped}개\n\nJSON 백업에는 원본 파일이 없어서 새로 추가된 첨부자료는 파일명 기록만 병합됩니다.`);
  }

  function mergeBackupDataIntoCurrent(backupData) {
    const incoming = normalizeState({
      version: backupData.version,
      updatedAt: backupData.updatedAt,
      statusOptions: backupData.statusOptions,
      companies: backupData.companies,
      notes: backupData.notes,
      settlementTasks: backupData.settlementTasks,
      outputTasks: backupData.outputTasks,
      otherTasks: backupData.otherTasks,
      accounts: backupData.accounts
    });
    const nextState = normalizeState(state);
    const usedAttachmentIds = collectAttachmentIdsFromData(nextState);
    const ownerIdMap = new Map();
    const attachmentIdMap = new Map();
    const counts = {
      company: 0,
      sales: 0,
      settlement: 0,
      output: 0,
      other: 0,
      account: 0,
      updated: 0,
      attachments: 0,
      attachmentsUpdated: 0,
      skipped: 0,
      duplicated: 0
    };

    mergeBackupOwnerGroup({
      type: "company",
      source: incoming.companies,
      target: nextState.companies,
      usedAttachmentIds,
      ownerIdMap,
      attachmentIdMap,
      counts
    });
    remapLinkedCompanyIds(incoming.notes, ownerIdMap);
    remapLinkedCompanyIds(incoming.settlementTasks, ownerIdMap);
    remapLinkedCompanyIds(incoming.outputTasks, ownerIdMap);
    remapLinkedCompanyIds(incoming.otherTasks, ownerIdMap);
    mergeBackupOwnerGroup({
      type: "sales",
      source: incoming.notes,
      target: nextState.notes,
      usedAttachmentIds,
      ownerIdMap,
      attachmentIdMap,
      counts
    });
    mergeBackupOwnerGroup({
      type: "settlement",
      source: incoming.settlementTasks,
      target: nextState.settlementTasks,
      usedAttachmentIds,
      ownerIdMap,
      attachmentIdMap,
      counts
    });
    mergeBackupOwnerGroup({
      type: "output",
      source: incoming.outputTasks,
      target: nextState.outputTasks,
      usedAttachmentIds,
      ownerIdMap,
      attachmentIdMap,
      counts
    });
    mergeBackupOwnerGroup({
      type: "other",
      source: incoming.otherTasks,
      target: nextState.otherTasks,
      usedAttachmentIds,
      ownerIdMap,
      attachmentIdMap,
      counts
    });
    mergeBackupOwnerGroup({
      type: "account",
      source: incoming.accounts,
      target: nextState.accounts,
      usedAttachmentIds,
      ownerIdMap,
      attachmentIdMap,
      counts
    });

    remapLinkedSalesIds(nextState.settlementTasks, ownerIdMap);
    remapLinkedSalesIds(nextState.outputTasks, ownerIdMap);

    nextState.statusOptions = mergeStatusOptionLists(nextState.statusOptions, incoming.statusOptions);
    nextState.version = APP_VERSION;
    nextState.updatedAt = getLocalTimestamp();

    return {
      state: normalizeState(nextState),
      ownerIdMap,
      attachmentIdMap,
      counts
    };
  }

  function remapLinkedSalesIds(tasks, ownerIdMap) {
    (Array.isArray(tasks) ? tasks : []).forEach((task) => {
      const salesNoteId = clean(task.salesNoteId);
      const mappedId = salesNoteId ? ownerIdMap.get(createOwnerMapKey("sales", salesNoteId)) : "";
      if (mappedId) {
        task.salesNoteId = mappedId;
      }
    });
  }

  function remapLinkedCompanyIds(notes, ownerIdMap) {
    (Array.isArray(notes) ? notes : []).forEach((note) => {
      const companyId = clean(note.companyId);
      const mappedId = companyId ? ownerIdMap.get(createOwnerMapKey("company", companyId)) : "";
      if (mappedId) {
        note.companyId = mappedId;
      }
    });
  }

  function mergeBackupOwnerGroup(config) {
    const source = Array.isArray(config.source) ? config.source : [];
    const target = Array.isArray(config.target) ? config.target : [];
    const usedOwnerIds = new Set(target.map((item) => item.id).filter(Boolean));
    const existingById = new Map(target.map((item) => [item.id, item]).filter(([id]) => Boolean(id)));
    const existingCompanyByName = config.type === "company"
      ? new Map(target.map((item) => [normalizeCustomerKey(item.name), item]).filter(([key]) => Boolean(key)))
      : null;

    source.forEach((sourceItem) => {
      const item = JSON.parse(JSON.stringify(sourceItem));
      const originalOwnerId = item.id || "";
      const existingItem = (originalOwnerId ? existingById.get(originalOwnerId) : null)
        || (existingCompanyByName ? existingCompanyByName.get(normalizeCustomerKey(item.name)) : null)
        || null;

      if (existingItem) {
        config.ownerIdMap.set(createOwnerMapKey(config.type, originalOwnerId), existingItem.id);
        if (areMergeItemsEquivalent(existingItem, item)) {
          mapExistingAttachmentIdsForRestore(existingItem, item, config.attachmentIdMap);
          config.counts.skipped += 1;
          return;
        }

        mergeExistingOwner(config.type, existingItem, item, config.usedAttachmentIds, config.attachmentIdMap, config.counts);
        config.counts.updated += 1;
        return;
      }

      if (!item.id || usedOwnerIds.has(item.id)) {
        item.id = createUniqueOwnerId(config.type, usedOwnerIds);
        if (originalOwnerId) {
          config.counts.duplicated += 1;
        }
      }

      usedOwnerIds.add(item.id);
      existingById.set(item.id, item);
      if (existingCompanyByName) {
        existingCompanyByName.set(normalizeCustomerKey(item.name), item);
      }
      config.ownerIdMap.set(createOwnerMapKey(config.type, originalOwnerId), item.id);
      item.attachments = mergeBackupAttachments(item.attachments, item.id, config.usedAttachmentIds, config.attachmentIdMap, config.counts);

      target.push(item);
      if (config.type === "company") {
        config.counts.company += 1;
      } else if (config.type === "sales") {
        config.counts.sales += 1;
      } else if (config.type === "settlement") {
        config.counts.settlement += 1;
      } else if (config.type === "output") {
        config.counts.output += 1;
      } else if (config.type === "account") {
        config.counts.account += 1;
      } else {
        config.counts.other += 1;
      }
    });
  }

  function mergeExistingOwner(type, currentItem, incomingItem, usedAttachmentIds, attachmentIdMap, counts) {
    const ownerId = currentItem.id;

    if (type === "company") {
      [
        "name",
        "businessNumber",
        "representative",
        "businessType",
        "status",
        "address",
        "mainPhone",
        "mainEmail"
      ].forEach((field) => {
        currentItem[field] = incomingItem[field];
      });
      currentItem.memo = mergeLongText(currentItem.memo, incomingItem.memo);
      currentItem.contacts = mergeCompanyContacts(currentItem.contacts, incomingItem.contacts);
    } else if (type === "sales") {
      [
        "companyId",
        "contactId",
        "companyUnknown",
        "company",
        "contactName",
        "contactPhone",
        "contactEmail",
        "interest",
        "itemCategory",
        "status",
        "priority",
        "meetingDate",
        "nextAction",
        "nextContactDate",
        "nextContactUnknown",
        "lastContactDate",
        "quoteStatus",
        "purchasePossibility",
        "expectedRevenueAmount",
        "expectedRevenueVatIncluded",
        "revenueAmount",
        "revenueAmountVatIncluded",
        "revenueType",
        "expenseAmount",
        "marginRate"
      ].forEach((field) => {
        currentItem[field] = incomingItem[field];
      });
      currentItem.memo = mergeLongText(currentItem.memo, incomingItem.memo);
    } else if (type === "settlement") {
      [
        "companyId",
        "contactId",
        "companyUnknown",
        "company",
        "contactName",
        "contactPhone",
        "contactEmail",
        "salesNoteId",
        "salesLinkUnknown",
        "paymentType",
        "status",
        "totalAmount",
        "totalAmountVatIncluded",
        "advanceAmount",
        "advanceAmountVatIncluded",
        "receivedAmount",
        "receivedAmountVatIncluded",
        "deductedAmount",
        "deductedAmountVatIncluded",
        "installmentProgress",
        "nextActionDate",
        "nextAction",
        "paymentSchedule"
      ].forEach((field) => {
        currentItem[field] = incomingItem[field];
      });
      currentItem.plan = mergeLongText(currentItem.plan, incomingItem.plan);
      currentItem.memo = mergeLongText(currentItem.memo, incomingItem.memo);
    } else if (type === "output") {
      [
        "companyId",
        "contactId",
        "companyUnknown",
        "company",
        "contactName",
        "contactPhone",
        "contactEmail",
        "salesNoteId",
        "salesLinkUnknown",
        "startDate",
        "endDate",
        "includeWeekends",
        "status",
        "outputType",
        "priority"
      ].forEach((field) => {
        currentItem[field] = incomingItem[field];
      });
      currentItem.memo = mergeLongText(currentItem.memo, incomingItem.memo);
    } else if (type === "account") {
      [
        "siteName",
        "siteUrl",
        "username",
        "password",
        "purpose",
        "owner",
        "accountCreatedDate",
        "passwordChangedDate"
      ].forEach((field) => {
        currentItem[field] = incomingItem[field];
      });
      currentItem.memo = mergeLongText(currentItem.memo, incomingItem.memo);
    } else {
      [
        "companyId",
        "contactId",
        "companyUnknown",
        "company",
        "contactName",
        "contactPhone",
        "contactEmail",
        "title",
        "category",
        "owner",
        "startDate",
        "endDate",
        "includeWeekends",
        "status",
        "priority"
      ].forEach((field) => {
        currentItem[field] = incomingItem[field];
      });
      currentItem.memo = mergeLongText(currentItem.memo, incomingItem.memo);
    }

    currentItem.history = mergeHistoryEntries(currentItem.history, incomingItem.history);
    currentItem.createdAt = currentItem.createdAt || incomingItem.createdAt || getLocalTimestamp();
    currentItem.updatedAt = incomingItem.updatedAt || getLocalTimestamp();
    currentItem.attachments = mergeOwnerAttachments(
      currentItem.attachments,
      incomingItem.attachments,
      ownerId,
      usedAttachmentIds,
      attachmentIdMap,
      counts
    );
  }

  function mergeCompanyContacts(currentContacts, incomingContacts) {
    const current = Array.isArray(currentContacts) ? currentContacts : [];
    const byId = new Map(current.map((contact) => [contact.id, contact]).filter(([id]) => Boolean(id)));
    const bySignature = new Map();
    current.forEach((contact) => {
      const signature = createCompanyContactSignature(contact);
      if (signature && !bySignature.has(signature)) {
        bySignature.set(signature, contact);
      }
    });
    (Array.isArray(incomingContacts) ? incomingContacts : []).forEach((incomingContact) => {
      const item = normalizeCompanyContact(incomingContact);
      if (!item) {
        return;
      }
      const matching = (item.id && byId.get(item.id)) || bySignature.get(createCompanyContactSignature(item));
      if (matching) {
        Object.assign(matching, item, { id: matching.id });
        return;
      }
      current.push(item);
    });
    ensurePrimaryCompanyContact(current);
    return current;
  }

  function mergeBackupAttachments(attachments, ownerId, usedAttachmentIds, attachmentIdMap, counts) {
    return (Array.isArray(attachments) ? attachments : []).map((attachment) => {
      const item = { ...attachment };
      const originalAttachmentId = item.id || "";

      if (!item.id || usedAttachmentIds.has(item.id)) {
        item.id = createUniqueAttachmentId(usedAttachmentIds);
      }

      usedAttachmentIds.add(item.id);
      if (originalAttachmentId) {
        attachmentIdMap.set(originalAttachmentId, item.id);
      }

      item.noteId = ownerId;
      counts.attachments += 1;
      return item;
    });
  }

  function mergeOwnerAttachments(currentAttachments, incomingAttachments, ownerId, usedAttachmentIds, attachmentIdMap, counts) {
    const current = Array.isArray(currentAttachments) ? currentAttachments : [];
    const currentById = new Map(current.map((attachment) => [attachment.id, attachment]).filter(([id]) => Boolean(id)));
    const currentBySignature = new Map();

    current.forEach((attachment) => {
      const signature = createAttachmentSignature(attachment);
      if (signature && !currentBySignature.has(signature)) {
        currentBySignature.set(signature, attachment);
      }
    });

    (Array.isArray(incomingAttachments) ? incomingAttachments : []).forEach((incomingAttachment) => {
      const item = { ...incomingAttachment };
      const originalAttachmentId = item.id || "";
      const signature = createAttachmentSignature(item);
      const matchingAttachment = (originalAttachmentId && currentById.get(originalAttachmentId))
        || (signature && currentBySignature.get(signature))
        || null;

      if (matchingAttachment) {
        const previousSignature = createAttachmentSignature(matchingAttachment);
        Object.assign(matchingAttachment, item, {
          id: matchingAttachment.id,
          noteId: ownerId
        });
        attachmentIdMap.set(originalAttachmentId, matchingAttachment.id);
        const nextSignature = createAttachmentSignature(matchingAttachment);
        if (previousSignature !== nextSignature && previousSignature) {
          currentBySignature.delete(previousSignature);
        }
        if (nextSignature) {
          currentBySignature.set(nextSignature, matchingAttachment);
        }
        counts.attachmentsUpdated += 1;
        return;
      }

      if (!item.id || usedAttachmentIds.has(item.id)) {
        item.id = createUniqueAttachmentId(usedAttachmentIds);
      }

      item.noteId = ownerId;
      usedAttachmentIds.add(item.id);
      if (originalAttachmentId) {
        attachmentIdMap.set(originalAttachmentId, item.id);
      }

      current.push(item);
      currentById.set(item.id, item);
      if (signature) {
        currentBySignature.set(signature, item);
      }
      counts.attachments += 1;
    });

    return current;
  }

  function mapExistingAttachmentIdsForRestore(currentItem, incomingItem, attachmentIdMap) {
    const currentAttachments = Array.isArray(currentItem.attachments) ? currentItem.attachments : [];
    const currentById = new Map(currentAttachments.map((attachment) => [attachment.id, attachment]).filter(([id]) => Boolean(id)));
    const currentBySignature = new Map();

    currentAttachments.forEach((attachment) => {
      const signature = createAttachmentSignature(attachment);
      if (signature && !currentBySignature.has(signature)) {
        currentBySignature.set(signature, attachment);
      }
    });

    (Array.isArray(incomingItem.attachments) ? incomingItem.attachments : []).forEach((attachment) => {
      const matchingAttachment = (attachment.id && currentById.get(attachment.id))
        || currentBySignature.get(createAttachmentSignature(attachment));
      if (matchingAttachment) {
        attachmentIdMap.set(attachment.id, matchingAttachment.id);
      }
    });
  }

  function areMergeItemsEquivalent(first, second) {
    return JSON.stringify(createMergeComparableItem(first)) === JSON.stringify(createMergeComparableItem(second));
  }

  function createMergeComparableItem(item) {
    const copy = JSON.parse(JSON.stringify(item || {}));
    delete copy.id;
    delete copy.createdAt;
    delete copy.updatedAt;
    delete copy.history;
    copy.attachments = (Array.isArray(copy.attachments) ? copy.attachments : []).map((attachment) => ({
      fileName: clean(attachment.fileName),
      fileType: clean(attachment.fileType),
      fileSize: Number(attachment.fileSize) || 0,
      category: clean(attachment.category),
      sentDate: clean(attachment.sentDate),
      memo: clean(attachment.memo)
    }));
    return copy;
  }

  function mergeLongText(currentValue, incomingValue) {
    const current = cleanMultilineText(currentValue);
    const incoming = cleanMultilineText(incomingValue);

    if (!incoming) {
      return current;
    }
    if (!current || normalizeTextForCompare(current) === normalizeTextForCompare(incoming)) {
      return incoming;
    }

    const currentLineUnits = splitLineUnits(current);
    const incomingLineUnits = splitLineUnits(incoming);
    if (currentLineUnits.length > 1 || incomingLineUnits.length > 1) {
      return joinTextUnits([...incomingLineUnits, ...currentLineUnits], "\n");
    }

    const currentCompare = normalizeTextForCompare(current);
    const incomingCompare = normalizeTextForCompare(incoming);
    if (incomingCompare.includes(currentCompare)) {
      return incoming;
    }
    if (currentCompare.includes(incomingCompare)) {
      return current;
    }

    const currentSegmentUnits = splitSegmentUnits(current);
    const incomingSegmentUnits = splitSegmentUnits(incoming);
    const hasSegmentOverlap = incomingSegmentUnits.some((unit) => currentSegmentUnits.some((currentUnit) => normalizeTextForCompare(currentUnit) === normalizeTextForCompare(unit)));
    if (hasSegmentOverlap && (currentSegmentUnits.length > 1 || incomingSegmentUnits.length > 1)) {
      return joinTextUnits([...incomingSegmentUnits, ...currentSegmentUnits], getPreferredTextDelimiter(incoming, current));
    }

    return incoming;
  }

  function cleanMultilineText(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function splitLineUnits(value) {
    return cleanMultilineText(value).split("\n").map((line) => line.trim()).filter(Boolean);
  }

  function splitSegmentUnits(value) {
    return cleanMultilineText(value)
      .split(/\s*(?:\+|\/|,|;|\||ㆍ|·|，|、|；)\s*/)
      .map((unit) => unit.trim())
      .filter(Boolean);
  }

  function joinTextUnits(units, delimiter) {
    const seen = new Set();
    const merged = [];

    units.forEach((unit) => {
      const value = cleanMultilineText(unit);
      const key = normalizeTextForCompare(value);
      if (!value || seen.has(key)) {
        return;
      }
      seen.add(key);
      merged.push(value);
    });

    return merged.join(delimiter);
  }

  function getPreferredTextDelimiter(incoming, current) {
    if (incoming.includes(" + ") || current.includes(" + ")) {
      return " + ";
    }
    if (incoming.includes("+") || current.includes("+")) {
      return " + ";
    }
    if (incoming.includes(" / ") || current.includes(" / ")) {
      return " / ";
    }
    if (incoming.includes("/") || current.includes("/")) {
      return " / ";
    }
    return "\n";
  }

  function normalizeTextForCompare(value) {
    return cleanMultilineText(value).replace(/\s+/g, " ").toLowerCase();
  }

  function createAttachmentSignature(attachment) {
    const fileName = normalizeTextForCompare(attachment && attachment.fileName);
    const fileSize = Number(attachment && attachment.fileSize) || 0;
    const fileType = normalizeTextForCompare(attachment && attachment.fileType);
    if (!fileName && !fileSize) {
      return "";
    }
    return `${fileName}|${fileSize}|${fileType}`;
  }

  function createUniqueOwnerId(type, usedOwnerIds) {
    let id = "";
    do {
      id = createTypedOwnerId(type);
    } while (usedOwnerIds.has(id));
    return id;
  }

  function createTypedOwnerId(type) {
    const id = createId();
    if (type === "company") {
      return id.replace("note_", "company_");
    }
    if (type === "settlement") {
      return id.replace("note_", "settlement_");
    }
    if (type === "output") {
      return id.replace("note_", "output_");
    }
    if (type === "other") {
      return id.replace("note_", "other_");
    }
    if (type === "account") {
      return id.replace("note_", "account_");
    }
    return id;
  }

  function createUniqueAttachmentId(usedAttachmentIds) {
    let id = "";
    do {
      id = createId().replace("note_", "file_");
    } while (usedAttachmentIds.has(id));
    return id;
  }

  function createOwnerMapKey(type, id) {
    return `${type || "unknown"}:${id || ""}`;
  }

  function mergeStatusOptionLists(currentOptions, incomingOptions) {
    const seen = new Set();
    const merged = [
      ...(Array.isArray(currentOptions) ? currentOptions : []),
      ...(Array.isArray(incomingOptions) ? incomingOptions : [])
    ].filter((option) => {
      const value = normalizeSalesStatus(option);
      if (!value || seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
    return normalizeSalesStatusOptions(merged);
  }

  function savePreImportSnapshot(reason, filenamePrefix) {
    const preImportBackup = createBackupPayload(reason);
    downloadFile(
      JSON.stringify(preImportBackup, null, 2),
      `${filenamePrefix}-${getFilenameTimestamp()}.json`,
      "application/json"
    );
    recordJsonBackup();

    try {
      localStorage.setItem(TEMP_IMPORT_BACKUP_KEY, JSON.stringify(preImportBackup));
    } catch (error) {
      console.warn("Temporary backup failed", error);
    }
  }

  function refreshAfterImport() {
    renderStatusOptions();
    resetForm({ silent: true });
    hideEditorPanel();
    closeSettlementEditorPanel({ force: true });
    closeOutputEditorPanel({ force: true });
    closeOtherEditorPanel({ force: true });
    closeCompanyEditorPanel({ force: true });
    closeAccountEditorPanel({ force: true });
    closeFileDrawer();
    closeCustomerDrawer();
    closeAttachmentPreview();
    render();
  }

  function formatMergeCount(counts) {
    return `업체 ${counts.company || 0}개, 영업 ${counts.sales}건, 계정 ${counts.account || 0}건, 정산 ${counts.settlement}건, 출력 ${counts.output}건, 기타 ${counts.other}건`;
  }

  function parseZipArchive(bytes) {
    const entries = new Map();
    const decoder = new TextDecoder();
    let offset = 0;

    while (offset + 30 <= bytes.length) {
      const signature = readZipUint32(bytes, offset);
      if (signature === 0x02014b50 || signature === 0x06054b50) {
        break;
      }
      if (signature !== 0x04034b50) {
        if (offset === 0) {
          throw new Error("ZIP 파일 형식이 아닙니다.");
        }
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
        throw new Error("데이터 설명자가 포함된 ZIP은 현재 불러올 수 없습니다. Work Note에서 내보낸 ZIP을 사용해 주세요.");
      }
      if (method !== 0) {
        throw new Error("압축된 ZIP 항목은 현재 불러올 수 없습니다. Work Note에서 내보낸 전체 백업 ZIP을 사용해 주세요.");
      }
      if (dataEnd > bytes.length) {
        throw new Error("ZIP 파일이 손상되었거나 일부가 누락되었습니다.");
      }

      const path = decoder.decode(bytes.slice(nameStart, nameEnd)).replace(/\\/g, "/");
      entries.set(path, {
        path,
        data: bytes.slice(dataStart, dataEnd)
      });
      offset = dataEnd;
    }

    return entries;
  }

  function findZipBackupJson(zipEntries) {
    if (zipEntries.has("backup.json")) {
      return zipEntries.get("backup.json");
    }

    return Array.from(zipEntries.values()).find((entry) => entry.path.toLowerCase().endsWith("/backup.json") || entry.path.toLowerCase() === "backup.json") || null;
  }

  function readZipUint16(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  function readZipUint32(bytes, offset) {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  }

  function importJsonBackup(content, mode) {
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      alert("JSON 형식이 올바르지 않습니다.");
      return;
    }

    const backupData = extractBackupData(parsed);
    if (!backupData || !Array.isArray(backupData.notes)) {
      alert("영업 메모 백업 파일 형식이 아닙니다.");
      return;
    }

    const version = backupData.version || parsed.version || "알 수 없음";
    const importMode = mode === "merge" ? "merge" : "replace";

    if (importMode === "merge") {
      const incoming = normalizeState({
        version,
        updatedAt: backupData.updatedAt,
        statusOptions: backupData.statusOptions,
        companies: backupData.companies,
        notes: backupData.notes,
        settlementTasks: backupData.settlementTasks,
        outputTasks: backupData.outputTasks,
        otherTasks: backupData.otherTasks,
        accounts: backupData.accounts
      });
      const attachmentCount = collectAttachmentIdsFromData(incoming).size;
      const ok = confirm(`JSON 백업을 현재 데이터에 스마트 병합합니다.\n\n같은 업무는 기존 건 안에서 갱신/합산하고, 새 업무와 계정은 추가합니다.\n가져올 후보: 영업 ${incoming.notes.length}건, 계정 ${incoming.accounts.length}건, 정산 ${incoming.settlementTasks.length}건, 출력 ${incoming.outputTasks.length}건, 기타 ${incoming.otherTasks.length}건\n첨부자료 기록: ${attachmentCount}개\n\nJSON에는 원본 파일이 포함되지 않으므로 새로 추가되는 첨부자료는 파일명 기록만 병합됩니다.\n계속할까요?`);
      if (!ok) {
        return;
      }

      mergeJsonBackupData(backupData);
      return;
    }

    const ok = confirm(`백업 데이터 버전: ${version}\n기존 localStorage 데이터를 덮어쓸까요?`);
    if (!ok) {
      return;
    }

    const preImportBackup = createBackupPayload("before-json-import");
    downloadFile(
      JSON.stringify(preImportBackup, null, 2),
      `sales-note-pre-import-backup-${getFilenameTimestamp()}.json`,
      "application/json"
    );
    recordJsonBackup();

    try {
      // Preserve one in-browser snapshot before replacing the current workspace.
      localStorage.setItem(TEMP_IMPORT_BACKUP_KEY, JSON.stringify(preImportBackup));
    } catch (error) {
      console.warn("Temporary backup failed", error);
    }

    state = normalizeState({
      version: version,
      updatedAt: getLocalTimestamp(),
      statusOptions: backupData.statusOptions,
      companies: backupData.companies,
      notes: backupData.notes,
      settlementTasks: backupData.settlementTasks,
      outputTasks: backupData.outputTasks,
      otherTasks: backupData.otherTasks,
      accounts: backupData.accounts
    });

    saveState();
    refreshAfterImport();
    alert("JSON 백업을 불러왔습니다.");
  }

  function exportCsv() {
    const headers = [
      "고객사명",
      "담당자명",
      "연락처",
      "이메일",
      "관심 장비/소재",
      "구분",
      "진행 상태",
      "중요도",
      "미팅 일자",
      "다음 액션",
      "다음 연락 예정일",
      "최근 연락일",
      "견적 여부",
      "구매 가능성",
      "예상 매출 금액",
      "예상 매출 부가세",
      "매출 금액",
      "매출 부가세",
      "매출 구분",
      "첨부자료 수",
      "첨부자료 목록",
      "최종 수정일",
      "메모 요약"
    ];

    const rows = state.notes.map((note) => [
      note.company,
      note.contactName,
      note.contactPhone,
      note.contactEmail,
      note.interest,
      note.itemCategory,
      note.status,
      note.priority,
      note.meetingDate,
      note.nextAction,
      formatNextContactForDisplay(note),
      note.lastContactDate,
      note.quoteStatus,
      note.purchasePossibility,
      note.expectedRevenueAmount,
      formatVatStatus(note.expectedRevenueVatIncluded),
      note.revenueAmount,
      formatVatStatus(note.revenueAmountVatIncluded),
      note.revenueType,
      note.attachments.length,
      note.attachments.map((attachment) => attachment.fileName).join(" / "),
      note.updatedAt,
      summarize(note.memo)
    ]);

    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    downloadFile(`\uFEFF${csv}`, `sales-note-export-${getFilenameTimestamp()}.csv`, "text/csv;charset=utf-8");
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    downloadBlob(blob, filename, mimeType);
  }

  function downloadBlob(blob, filename, mimeType) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    if (mimeType) {
      link.type = mimeType;
    }
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  function clean(value) {
    return String(value || "").trim();
  }

  function splitLegacyContactInfo(value) {
    const text = clean(value);
    if (!text) {
      return { phone: "", email: "" };
    }

    const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const email = emailMatch ? emailMatch[0] : "";
    const phone = clean(text.replace(email, "").replace(/[\/|,]+/g, " "));
    return { phone, email };
  }

  function formatNextContactForDisplay(note) {
    if (note.nextContactUnknown) {
      return "미정";
    }
    return formatDateForDisplay(note.nextContactDate);
  }

  function getScheduleLabel(note) {
    if (note.status === "미팅 예정" && note.meetingDate) {
      return `미팅 ${formatDateForDisplay(note.meetingDate)}`;
    }
    return formatNextContactForDisplay(note);
  }

  function summarize(value) {
    const text = clean(value).replace(/\s+/g, " ");
    return text.length > 80 ? `${text.slice(0, 80)}...` : text;
  }

  function isImageFile(attachment) {
    return String(attachment.fileType || "").startsWith("image/");
  }

  function isPdfFile(attachment) {
    const fileType = String(attachment && attachment.fileType || "").toLowerCase();
    const fileName = String(attachment && attachment.fileName || "").toLowerCase();
    return fileType === "application/pdf" || fileName.endsWith(".pdf");
  }

  function isPreviewableAttachment(attachment) {
    return isImageFile(attachment) || isPdfFile(attachment);
  }

  function getFileExtensionLabel(fileName) {
    const extension = String(fileName || "")
      .split(".")
      .pop()
      .slice(0, 5)
      .toUpperCase();
    return extension && extension !== fileName ? extension : "FILE";
  }

  function normalizeAmountValue(value) {
    const text = String(value === null || value === undefined ? "" : value).replace(/,/g, "").trim();
    if (!text) {
      return "";
    }

    const amount = Number(text);
    if (!Number.isFinite(amount) || amount < 0) {
      return "";
    }

    return Number.isInteger(amount) ? String(amount) : String(Number(amount.toFixed(2)));
  }

  function parseAmountValue(value) {
    const normalized = normalizeAmountValue(value);
    if (!normalized) {
      return null;
    }
    const amount = Number(normalized);
    return Number.isFinite(amount) ? amount : null;
  }

  function hasAmountValue(value) {
    return parseAmountValue(value) !== null;
  }

  function calculateMarginRateValue(revenueValue, expenseValue) {
    const revenue = parseAmountValue(revenueValue);
    const expense = parseAmountValue(expenseValue);
    if (revenue === null || expense === null || revenue <= 0) {
      return "";
    }
    return (((revenue - expense) / revenue) * 100).toFixed(1);
  }

  function formatMoneyForDisplay(value) {
    const amount = parseAmountValue(value);
    if (amount === null) {
      return "-";
    }
    return `${amount.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`;
  }

  function formatVatStatus(vatIncluded) {
    return vatIncluded ? "VAT 포함" : "VAT 별도";
  }

  function formatMoneyWithVatForDisplay(value, vatIncluded) {
    const money = formatMoneyForDisplay(value);
    return money === "-" ? "-" : `${money} · ${formatVatStatus(vatIncluded)}`;
  }

  function formatMoneyPairForDisplay(revenueValue, expenseValue) {
    const hasRevenue = parseAmountValue(revenueValue) !== null;
    const hasExpense = parseAmountValue(expenseValue) !== null;
    if (!hasRevenue && !hasExpense) {
      return "-";
    }
    return `${formatMoneyForDisplay(revenueValue)} / ${formatMoneyForDisplay(expenseValue)}`;
  }

  function formatRevenueForDisplay(note) {
    return [
      hasAmountValue(note.revenueAmount) ? formatMoneyWithVatForDisplay(note.revenueAmount, note.revenueAmountVatIncluded) : "",
      clean(note.revenueType)
    ].filter(Boolean).join(" · ") || "-";
  }

  function formatMarginRateForDisplay(value) {
    const text = String(value === null || value === undefined ? "" : value).trim();
    if (!text) {
      return "-";
    }
    const rate = Number(text);
    if (!Number.isFinite(rate)) {
      return "-";
    }
    return `${rate.toFixed(1)}%`;
  }

  function formatFileSize(size) {
    const bytes = Number(size) || 0;
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1048576) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  function escapeCsv(value) {
    const text = String(value || "");
    return `"${text.replace(/"/g, "\"\"")}"`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getPriorityClass(priority) {
    if (priority === "긴급") {
      return "badge-priority-urgent";
    }
    if (priority === "높음") {
      return "badge-priority-high";
    }
    if (priority === "낮음") {
      return "badge-priority-low";
    }
    return "badge-priority-normal";
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `note_${window.crypto.randomUUID()}`;
    }
    return `note_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function getTodayDateString() {
    const now = new Date();
    return formatDateString(now);
  }

  function addDays(dateString, days) {
    const date = parseDateOnly(dateString);
    date.setDate(date.getDate() + days);
    return formatDateString(date);
  }

  function addDaysToDate(date, days) {
    const nextDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    nextDate.setDate(nextDate.getDate() + days);
    return nextDate;
  }

  function getWeekStartDate(date) {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    start.setDate(start.getDate() - start.getDay());
    return start;
  }

  function isOverdue(dateString, today) {
    return Boolean(dateString && dateString < today);
  }

  function isValidDateRange(startDate, endDate) {
    return !startDate || !endDate || startDate <= endDate;
  }

  function getDateRangeDates(startDate, endDate, options) {
    const config = options || {};
    const includeWeekends = config.includeWeekends !== undefined ? Boolean(config.includeWeekends) : true;
    const start = isDateOnlyString(startDate) ? clean(startDate) : "";
    const end = isDateOnlyString(endDate) ? clean(endDate) : "";
    if (!start && !end) {
      return [];
    }

    const first = start || end;
    const last = end || start;
    const rangeStart = first <= last ? first : last;
    const rangeEnd = first <= last ? last : first;
    const dates = [];
    const current = parseDateOnly(rangeStart);
    const final = parseDateOnly(rangeEnd);

    for (let guard = 0; current <= final && guard < 366; guard += 1) {
      if (includeWeekends || !isWeekendDate(current)) {
        dates.push(formatDateString(current));
      }
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }

  function isWeekendDate(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  function isDateOnlyString(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(clean(value));
  }

  function parseDateOnly(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function formatDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getDaysSince(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return 999;
    }

    const now = new Date();
    const diff = now.getTime() - date.getTime();
    return Math.max(0, Math.floor(diff / 86400000));
  }

  function getLocalTimestamp() {
    const date = new Date();
    const offsetMinutes = -date.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const absoluteOffset = Math.abs(offsetMinutes);
    const offsetHours = String(Math.floor(absoluteOffset / 60)).padStart(2, "0");
    const offsetMins = String(absoluteOffset % 60).padStart(2, "0");
    return `${formatDateString(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}${sign}${offsetHours}:${offsetMins}`;
  }

  function getFilenameTimestamp() {
    const date = new Date();
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
      "-",
      String(date.getHours()).padStart(2, "0"),
      String(date.getMinutes()).padStart(2, "0")
    ].join("");
  }

  function formatDateForDisplay(dateString) {
    if (!dateString) {
      return "-";
    }
    const normalizedDate = clean(dateString).slice(0, 10);
    const [year, month, day] = normalizedDate.split("-");
    if (!year || !month || !day) {
      return normalizedDate || "-";
    }
    return `${year}.${month}.${day}`;
  }

  function formatDateRange(startDate, endDate) {
    const start = clean(startDate);
    const end = clean(endDate);
    if (start && end && start !== end) {
      return `${formatDateForDisplay(start)} ~ ${formatDateForDisplay(end)}`;
    }
    if (start) {
      return end ? formatDateForDisplay(start) : `${formatDateForDisplay(start)} ~`;
    }
    if (end) {
      return `~ ${formatDateForDisplay(end)}`;
    }
    return "-";
  }

  function formatWeekendPolicy(includeWeekends) {
    return includeWeekends ? "주말 포함" : "주말 제외";
  }

  function formatWorkDateRangeForDisplay(task) {
    const range = formatDateRange(task.startDate, task.endDate);
    return range === "-" ? "-" : `${range} · ${formatWeekendPolicy(task.includeWeekends)}`;
  }

  function formatDateTimeForDisplay(timestamp) {
    if (!timestamp) {
      return "-";
    }

    const match = String(timestamp).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!match) {
      return timestamp;
    }

    return `${match[1]}.${match[2]}.${match[3]} ${match[4]}:${match[5]}`;
  }

  init();
})();
