export type CalendarWorkType = "output" | "other";

export function calendarWorkTitle(
  record: Record<string, unknown>,
  type: CalendarWorkType,
): string {
  const title = String(record.title ?? "").trim();
  if (title) return title;
  return type === "output" ? "출력 업무" : "기타 업무";
}
