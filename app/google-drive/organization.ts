export type JsonRecord = Record<string, unknown>;

export const DRIVE_FILE_CATEGORIES = [
  "견적서",
  "발송서류",
  "계약서",
  "거래명세서",
  "세금계산서",
  "발주서",
  "납품서류",
  "출력·샘플자료",
  "도면·3D파일",
  "기술자료",
  "이미지",
  "기타",
] as const;

export type DriveFileCategory = typeof DRIVE_FILE_CATEGORIES[number];

export type AttachmentOwnerContext = {
  companyId: string;
  companyName: string;
  companyKey: string;
  memoId: string;
  memoTitle: string;
  category: DriveFileCategory;
};

const CATEGORY_SET = new Set<string>(DRIVE_FILE_CATEGORIES);
const OWNER_COLLECTIONS: Record<string, string> = {
  company: "companies",
  sales: "notes",
  materialSales: "materialSalesNotes",
  settlement: "settlementTasks",
  output: "outputTasks",
  other: "otherTasks",
  task: "otherTasks",
};

function text(record: JsonRecord | null | undefined, keys: string[]): string {
  if (!record) return "";
  for (const key of keys) {
    const value = record[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonRecord =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function recordId(record: JsonRecord, index: number): string {
  return text(record, ["id", "uuid"]) || `record-${index}`;
}

export function sanitizeDriveFolderName(
  value: unknown,
  fallback = "제목 미정",
  maxLength = 96,
): string {
  const normalized = String(value || "")
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/[\u0000-\u001f\u007f\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, maxLength)
    .trim();
  return normalized || fallback;
}

export function normalizeCompanyFolderName(value: unknown): string {
  return sanitizeDriveFolderName(value, "업체 미정");
}

export function normalizeCompanyFolderKey(value: unknown): string {
  return normalizeCompanyFolderName(value)
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR");
}

export function normalizeDriveFolderComparisonKey(value: unknown): string {
  return sanitizeDriveFolderName(value, "")
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR");
}

export type CanonicalFolderCandidate = {
  folderId: string;
  name: string;
  createdTime?: string;
  healthyRegistry: boolean;
  managedByWorkNote: boolean;
  attachmentReferences: number;
};

export function rankCanonicalFolderCandidates<T extends CanonicalFolderCandidate>(
  candidates: T[],
): T[] {
  return [...candidates].sort((left, right) => {
    if (left.healthyRegistry !== right.healthyRegistry) {
      return left.healthyRegistry ? -1 : 1;
    }
    if (left.managedByWorkNote !== right.managedByWorkNote) {
      return left.managedByWorkNote ? -1 : 1;
    }
    if (left.attachmentReferences !== right.attachmentReferences) {
      return right.attachmentReferences - left.attachmentReferences;
    }
    const leftCreated = left.createdTime || "9999-12-31T23:59:59.999Z";
    const rightCreated = right.createdTime || "9999-12-31T23:59:59.999Z";
    const createdOrder = leftCreated.localeCompare(rightCreated);
    if (createdOrder) return createdOrder;
    return left.folderId.localeCompare(right.folderId);
  });
}

export function chooseCanonicalFolder<T extends CanonicalFolderCandidate>(
  candidates: T[],
): T | null {
  return rankCanonicalFolderCandidates(candidates)[0] || null;
}

export function resolveManagedMemoIdentity(input: {
  registryMemoIds?: string[];
  appProperties?: Record<string, string>;
  attachmentOwnerIds?: string[];
}): { memoId: string; conflict: boolean } {
  const identities = new Set(
    [
      ...(input.registryMemoIds || []),
      input.appProperties?.memoId || "",
      input.appProperties?.ownerId || "",
      ...(input.attachmentOwnerIds || []),
    ].map((value) => String(value || "").trim()).filter(Boolean),
  );
  return {
    memoId: identities.size === 1 ? [...identities][0] : "",
    conflict: identities.size > 1,
  };
}

export function memoFolderCollisionName(
  desired: string,
  memoId: string,
  occupiedNames: string[],
): string {
  const safeDesired = sanitizeDriveFolderName(desired, "제목 미정");
  const occupied = new Set(occupiedNames.map(normalizeDriveFolderComparisonKey));
  if (!occupied.has(normalizeDriveFolderComparisonKey(safeDesired))) return safeDesired;
  const suffix = sanitizeDriveFolderName(memoId, "memo").slice(0, 8);
  const suffixed = sanitizeDriveFolderName(`${safeDesired}_${suffix}`, safeDesired);
  if (!occupied.has(normalizeDriveFolderComparisonKey(suffixed))) return suffixed;
  let attempt = 2;
  while (occupied.has(normalizeDriveFolderComparisonKey(`${suffixed}_${attempt}`))) {
    attempt += 1;
  }
  return sanitizeDriveFolderName(`${suffixed}_${attempt}`, suffixed);
}

function legacyCategory(
  category: string,
  fileName: string,
): DriveFileCategory | "" {
  if (CATEGORY_SET.has(category)) return category as DriveFileCategory;
  if (category === "발송자료") return "발송서류";
  if (category === "메일 캡처") return "이미지";
  if (["출력 파일", "샘플/BMT"].includes(category)) return "출력·샘플자료";
  if (category === "계약/발주") {
    return /(발주|purchase\s*order|\bpo\b)/i.test(fileName) ? "발주서" : "계약서";
  }
  if (["사업자등록증", "통장 사본", "회사 서류", "정산자료", "입금증", "기타 파일"].includes(category)) {
    return "기타";
  }
  return "";
}

export function classifyDriveFile(
  explicitCategory: unknown,
  fileName: unknown,
  mimeType: unknown = "",
): DriveFileCategory {
  const name = String(fileName || "");
  const explicit = String(explicitCategory || "").trim();
  const mapped = explicit && explicit !== "자동 분류"
    ? legacyCategory(explicit, name)
    : "";
  if (mapped) return mapped;
  if (explicit && explicit !== "자동 분류") return "기타";

  const lower = name.toLowerCase();
  const extension = lower.includes(".") ? lower.split(".").pop() || "" : "";
  if (/(견적|quotation|estimate)/i.test(name)) return "견적서";
  if (/(거래\s*명세|statement)/i.test(name)) return "거래명세서";
  if (/(세금\s*계산서|tax\s*invoice)/i.test(name)) return "세금계산서";
  if (/(발주|purchase\s*order|\bpo\b)/i.test(name)) return "발주서";
  if (/(납품|검수|delivery)/i.test(name)) return "납품서류";
  if (/(계약|contract)/i.test(name)) return "계약서";
  if (/(발송|송장|운송장|invoice|shipping)/i.test(name)) return "발송서류";
  if (/(tds|sds|msds|매뉴얼|manual|사양서|datasheet)/i.test(name)) return "기술자료";
  if (["stl", "step", "stp", "obj", "3mf", "iges", "igs", "dwg", "dxf"].includes(extension)) {
    return "도면·3D파일";
  }
  if (
    ["jpg", "jpeg", "png", "webp", "gif", "heic"].includes(extension) ||
    String(mimeType || "").toLowerCase().startsWith("image/")
  ) {
    return "이미지";
  }
  return "기타";
}

function ownerRecord(
  dataset: JsonRecord,
  ownerKind: string,
  ownerLocalId: string,
): JsonRecord | null {
  const collection = OWNER_COLLECTIONS[ownerKind];
  if (!collection) return null;
  const items = records(dataset[collection]);
  return items.find((record, index) => recordId(record, index) === ownerLocalId) || null;
}

function linkedCompany(
  dataset: JsonRecord,
  owner: JsonRecord | null,
): JsonRecord | null {
  if (!owner) return null;
  const companies = records(dataset.companies);
  const companyId = text(owner, ["companyId", "salesCompanyId", "relatedCompanyId"]);
  if (companyId) {
    const match = companies.find((company, index) => recordId(company, index) === companyId);
    if (match) return match;
  }
  const companyName = text(owner, [
    "company",
    "companyName",
    "clientName",
    "relatedCompany",
    "customerName",
    "customer",
    "organization",
  ]).toLowerCase();
  return companyName
    ? companies.find((company) =>
        text(company, ["company", "companyName", "name", "clientName", "customerName"]).toLowerCase() === companyName) || null
    : null;
}

function temporaryMemoTitle(ownerKind: string, owner: JsonRecord | null, uploadedAt: string): string {
  const explicit = text(owner, [
    "title",
    "taskTitle",
    "subject",
    "workTitle",
    "interest",
    "outputType",
    "paymentType",
    "nextAction",
  ]);
  if (explicit) return explicit;
  const typeLabel: Record<string, string> = {
    company: "업체 파일",
    sales: "장비 영업",
    materialSales: "소재·소모품 영업",
    settlement: "정산 업무",
    output: "출력 업무",
    other: "기타 업무",
    task: "기타 업무",
  };
  if (owner && typeLabel[ownerKind]) return typeLabel[ownerKind];
  const parsed = new Date(uploadedAt);
  const stamp = Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
  return `제목 미정_${stamp.slice(0, 16).replace(/[-T:]/g, "").replace(/^(\d{8})(\d{4})$/, "$1_$2")}`;
}

export function resolveAttachmentOwnerContext(input: {
  dataset?: JsonRecord | null;
  ownerKind: string;
  ownerLocalId: string;
  metadata?: JsonRecord | null;
  fileName: string;
  mimeType?: string;
  category?: unknown;
  uploadedAt?: string;
}): AttachmentOwnerContext {
  const dataset = input.dataset || {};
  const metadata = input.metadata || {};
  const owner = ownerRecord(dataset, input.ownerKind, input.ownerLocalId);
  const company = input.ownerKind === "company" ? owner : linkedCompany(dataset, owner);
  const rawCompanyName = text(metadata, ["companyName", "ownerCompanyName"]) ||
    text(company, ["company", "companyName", "name", "clientName", "customerName"]) ||
    text(owner, [
      "company",
      "companyName",
      "clientName",
      "relatedCompany",
      "customerName",
      "customer",
      "organization",
    ]);
  const companyUnknown = !rawCompanyName ||
    ["미정", "고객 미정", "업체 미정", "관련 업체 없음"].includes(rawCompanyName) ||
    Boolean(owner?.companyUnknown);
  const companyName = companyUnknown ? "업체 미정" : normalizeCompanyFolderName(rawCompanyName);
  const companyKey = normalizeCompanyFolderKey(companyName);
  const companyId = text(metadata, ["companyId", "ownerCompanyId"]) ||
    (company ? text(company, ["id", "uuid"]) : "") ||
    text(owner, ["companyId", "salesCompanyId", "relatedCompanyId"]) ||
    `name:${companyName.toLowerCase()}`;
  const uploadedAt = String(input.uploadedAt || text(metadata, ["uploadedAt", "createdAt"]) || new Date().toISOString());
  const memoTitle = sanitizeDriveFolderName(
    text(metadata, ["memoTitle", "ownerTitle"]) ||
      temporaryMemoTitle(input.ownerKind, owner, uploadedAt),
    temporaryMemoTitle(input.ownerKind, owner, uploadedAt),
  );
  return {
    companyId,
    companyName,
    companyKey,
    memoId: input.ownerLocalId || text(metadata, ["memoId", "ownerId"]) || "unknown",
    memoTitle,
    category: classifyDriveFile(
      input.category ?? metadata.category,
      input.fileName,
      input.mimeType || text(metadata, ["fileType", "mimeType"]),
    ),
  };
}

export function buildDrivePath(context: AttachmentOwnerContext, fileName = ""): string {
  return [
    "Work Note",
    context.companyName,
    context.memoTitle,
    context.category,
    fileName,
  ].filter(Boolean).join("/");
}

export function driveFolderUrl(folderId: string): string {
  return folderId
    ? `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`
    : "";
}

export function driveFileUrl(fileId: string): string {
  return fileId
    ? `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`
    : "";
}

export function managedFolderKeys(context: AttachmentOwnerContext) {
  return {
    company: `company-name:${context.companyKey || normalizeCompanyFolderKey(context.companyName)}`,
    memo: `memo:${context.memoId}`,
    category: `category:${context.memoId}:${context.category}`,
  };
}

export type CleanupCandidateFacts = {
  isRoot: boolean;
  managedByWorkNote: boolean;
  registeredInDatabase: boolean;
  hasChildren: boolean;
  hasFiles: boolean;
  hasActiveOperation: boolean;
  referencedByAnotherMemo: boolean;
  alreadyTrashed?: boolean;
};

export function evaluateCleanupCandidate(facts: CleanupCandidateFacts): {
  eligible: boolean;
  reason: string;
} {
  if (facts.isRoot) return { eligible: false, reason: "Work Note 루트 폴더" };
  if (facts.alreadyTrashed) return { eligible: false, reason: "이미 정리됨" };
  if (!facts.registeredInDatabase || !facts.managedByWorkNote) {
    return { eligible: false, reason: "Work Note 관리 폴더로 확인되지 않음" };
  }
  if (facts.hasActiveOperation) {
    return { eligible: false, reason: "업로드·이동·마이그레이션 진행 중" };
  }
  if (facts.referencedByAnotherMemo) {
    return { eligible: false, reason: "다른 메모에서 참조 중" };
  }
  if (facts.hasFiles || facts.hasChildren) {
    return { eligible: false, reason: "파일 또는 하위 폴더가 있음" };
  }
  return { eligible: true, reason: "" };
}

export function cleanupFolderTypeOrder(type: string): number {
  if (type === "category") return 1;
  if (type === "memo") return 2;
  if (type === "company") return 3;
  return 99;
}
