export type DateGroup = "today" | "yesterday" | "earlier";

const DAY_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dayKey(value: string | Date): string {
  const parts = DAY_FORMATTER.formatToParts(typeof value === "string" ? new Date(value) : value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function shiftDay(key: string, offset: number): string {
  const date = new Date(`${key}T00:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function dateGroup(value: string, now = new Date()): DateGroup {
  const today = dayKey(now);
  const key = dayKey(value);
  if (key === today) return "today";
  if (key === shiftDay(today, -1)) return "yesterday";
  return "earlier";
}

export const DATE_GROUPS: Array<{ key: DateGroup; label: string }> = [
  { key: "today", label: "今天" },
  { key: "yesterday", label: "昨天" },
  { key: "earlier", label: "更早" },
];
