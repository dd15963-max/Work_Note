import type { AnyRecord, WorkNoteData } from "./fullstack/types";

export type CompanyType = "customer" | "partner" | "headquarters";

export type RelatedContactOption = {
  id: string;
  companyId: string;
  companyName: string;
  companyType: Exclude<CompanyType, "customer">;
  name: string;
  position: string;
  phone: string;
  email: string;
  department: string;
};

const DEFAULT_HEADQUARTERS_COMPANY_ID = "company_headquarters_default";

function asRecords(value: unknown): AnyRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is AnyRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function text(record: AnyRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function recordId(record: AnyRecord, fallback: string): string {
  return text(record, ["id", "uuid"]) || fallback;
}

function companyName(company: AnyRecord): string {
  return text(company, ["name", "companyName", "company", "clientName"]);
}

export function normalizeCompanyType(company: AnyRecord): CompanyType {
  const value = text(company, ["companyType", "type", "companyCategory"]).toLowerCase();
  if (["partner", "협력사", "vendor", "supplier"].includes(value)) return "partner";
  if (["headquarters", "headoffice", "head_office", "본사", "internal"].includes(value)) return "headquarters";
  return "customer";
}

export function relatedContactIds(record: AnyRecord): string[] {
  const values = Array.isArray(record.relatedContactIds) ? record.relatedContactIds : [];
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

export function collectRelatedContactOptions(data: Pick<WorkNoteData, "companies" | "internalContacts">): RelatedContactOption[] {
  const companies = asRecords(data.companies);
  const byCompanyId = new Map(companies.map((company, index) => [recordId(company, `company-${index}`), company]));
  const options: RelatedContactOption[] = [];

  companies.forEach((company, companyIndex) => {
    if (normalizeCompanyType(company) !== "partner") return;
    const companyId = recordId(company, `company-${companyIndex}`);
    asRecords(company.contacts).forEach((contact, contactIndex) => {
      if (contact.isSelf === true) return;
      const id = recordId(contact, `${companyId}-contact-${contactIndex}`);
      options.push({
        id,
        companyId,
        companyName: companyName(company),
        companyType: "partner",
        name: text(contact, ["name", "contactName"]),
        position: text(contact, ["title", "position"]),
        phone: text(contact, ["phone", "mobile", "contactPhone"]),
        email: text(contact, ["email", "contactEmail"]),
        department: text(contact, ["department"]),
      });
    });
  });

  asRecords(data.internalContacts).forEach((contact, index) => {
    if (contact.isSelf === true) return;
    const companyId = text(contact, ["companyId"]) || DEFAULT_HEADQUARTERS_COMPANY_ID;
    const company = byCompanyId.get(companyId);
    options.push({
      id: recordId(contact, `internal_contact_legacy_${index}`),
      companyId,
      companyName: company ? companyName(company) : "본사",
      companyType: "headquarters",
      name: text(contact, ["name", "contactName"]),
      position: text(contact, ["title", "position"]),
      phone: text(contact, ["mobile", "phone", "contactPhone"]),
      email: text(contact, ["email", "contactEmail"]),
      department: text(contact, ["department"]),
    });
  });

  const unique = new Map<string, RelatedContactOption>();
  options.forEach((option) => {
    if (option.id && option.name && !unique.has(option.id)) unique.set(option.id, option);
  });
  return [...unique.values()].sort((a, b) =>
    a.companyType.localeCompare(b.companyType)
      || a.companyName.localeCompare(b.companyName, "ko")
      || a.name.localeCompare(b.name, "ko"));
}

export function resolveRelatedContacts(
  record: AnyRecord,
  data: Pick<WorkNoteData, "companies" | "internalContacts">,
): RelatedContactOption[] {
  const byId = new Map(collectRelatedContactOptions(data).map((contact) => [contact.id, contact]));
  return relatedContactIds(record).map((id) => byId.get(id)).filter((value): value is RelatedContactOption => Boolean(value));
}

function legacyRelatedNames(record: AnyRecord): string[] {
  return [
    text(record, ["assignee"]),
    text(record, ["owner"]),
    text(record, ["internalContactName"]),
    text(record, ["relatedContactName"]),
  ].map((value) => value.trim()).filter(Boolean);
}

export function migrateCompanyContactStructure<T extends WorkNoteData>(data: T): T {
  let companies: AnyRecord[] = asRecords(data.companies).map((company, index) => ({
    ...company,
    id: recordId(company, `company_legacy_${index}`),
    companyType: normalizeCompanyType(company),
    contacts: asRecords(company.contacts).map((contact, contactIndex) => ({
      ...contact,
      id: recordId(contact, `company_legacy_${index}_contact_${contactIndex}`),
    })),
  }));

  const hasInternalContacts = asRecords(data.internalContacts).length > 0;
  let headquarters = companies.find((company) => normalizeCompanyType(company) === "headquarters");
  if (hasInternalContacts && !headquarters) {
    headquarters = {
      id: DEFAULT_HEADQUARTERS_COMPANY_ID,
      name: "본사",
      companyType: "headquarters",
      status: "운영 중",
      contacts: [],
    };
    companies = [...companies, headquarters];
  }
  const headquartersId = headquarters ? text(headquarters, ["id"]) : DEFAULT_HEADQUARTERS_COMPANY_ID;
  const internalContacts = asRecords(data.internalContacts).map((contact, index) => ({
    ...contact,
    id: recordId(contact, `internal_contact_legacy_${index}`),
    companyId: text(contact, ["companyId"]) || headquartersId,
    companyType: "headquarters",
    type: "headOffice",
  }));

  const contactData = { ...data, companies, internalContacts };
  const options = collectRelatedContactOptions(contactData);
  const idsByName = new Map<string, string>();
  options.forEach((contact) => {
    const key = contact.name.replace(/\s+/g, "").toLocaleLowerCase("ko");
    if (key && !idsByName.has(key)) idsByName.set(key, contact.id);
  });
  const migrateTasks = (records: AnyRecord[]) => records.map((record) => {
    const ids = relatedContactIds(record);
    legacyRelatedNames(record).forEach((name) => {
      const id = idsByName.get(name.replace(/\s+/g, "").toLocaleLowerCase("ko"));
      if (id && !ids.includes(id)) ids.push(id);
    });
    return { ...record, relatedContactIds: ids };
  });

  return {
    ...data,
    companies,
    internalContacts,
    notes: migrateTasks(asRecords(data.notes)),
    materialSalesNotes: migrateTasks(asRecords(data.materialSalesNotes)),
    settlementTasks: migrateTasks(asRecords(data.settlementTasks)),
    outputTasks: migrateTasks(asRecords(data.outputTasks)),
    otherTasks: migrateTasks(asRecords(data.otherTasks)),
  } as T;
}

export function defaultHeadquartersCompanyId(): string {
  return DEFAULT_HEADQUARTERS_COMPANY_ID;
}
