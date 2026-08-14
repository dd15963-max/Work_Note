export type CalendarWorkType = "output" | "other";

function cleanText(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function firstText(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = cleanText(record[key]);
    if (value) return value;
  }
  return "";
}

export function calendarWorkTitle(
  record: Record<string, unknown>,
  type: CalendarWorkType,
): string {
  const title = cleanText(record.title);
  if (title) return title;
  return type === "output" ? "출력 업무" : "기타 업무";
}

export function outputCalendarTitle(record: Record<string, unknown>): string {
  const taskTitle = calendarWorkTitle(record, "output");
  const company = record.companyUnknown
    ? ""
    : firstText(record, ["company", "companyName", "clientName", "relatedCompany", "customerName"]);
  return `[출력] ${company ? `${company} - ${taskTitle}` : taskTitle}`;
}
