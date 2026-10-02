export type DateGroupKey = "today" | "yesterday" | `${number}-${number}-${number}`;
export type DateGroup<T> = { key: DateGroupKey; label: string; items: T[] };

const SHANGHAI = "Asia/Shanghai";
const DAY_FORMATTER = new Intl.DateTimeFormat("zh-CN", { timeZone: SHANGHAI, year: "numeric", month: "2-digit", day: "2-digit" });

function parsed(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function shanghaiDayKey(value: string | Date): string | null {
  const date = parsed(value);
  if (!date) return null;
  const parts = DAY_FORMATTER.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function shiftDay(key: string, offset: number): string {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function dateGroup(value: string | Date, now: string | Date = new Date()): DateGroupKey | null {
  const key = shanghaiDayKey(value);
  const today = shanghaiDayKey(now);
  if (!key || !today) return null;
  if (key === today) return "today";
  if (key === shiftDay(today, -1)) return "yesterday";
  return key as DateGroupKey;
}

export function dateGroupLabel(key: DateGroupKey, now: string | Date = new Date()): string {
  if (key === "today") return "今天";
  if (key === "yesterday") return "昨天";
  const [year, month, day] = key.split("-").map(Number);
  const currentYear = Number(shanghaiDayKey(now)?.slice(0, 4));
  return year === currentYear ? `${month}月${day}日` : `${year}年${month}月${day}日`;
}

export function formatShanghaiTime(value: string | Date): string {
  const date = parsed(value);
  if (!date) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: SHANGHAI, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function buildDateGroups<T>(items: T[], getDate: (item: T) => string | Date, now: string | Date = new Date()): DateGroup<T>[] {
  const grouped = new Map<DateGroupKey, T[]>();
  for (const item of items) {
    const key = dateGroup(getDate(item), now);
    if (!key) continue;
    const bucket = grouped.get(key) ?? [];
    bucket.push(item);
    grouped.set(key, bucket);
  }
  const today = shanghaiDayKey(now);
  const yesterday = today ? shiftDay(today, -1) : null;
  const keys = [...grouped.keys()].sort((a, b) => {
    const rank = (key: DateGroupKey) => key === "today" ? 2 : key === "yesterday" ? 1 : 0;
    const rankDelta = rank(b) - rank(a);
    if (rankDelta) return rankDelta;
    const normalize = (key: DateGroupKey) => key === "today" ? today ?? "" : key === "yesterday" ? yesterday ?? "" : key;
    return normalize(b).localeCompare(normalize(a));
  });
  return keys.map((key) => ({ key, label: dateGroupLabel(key, now), items: grouped.get(key) ?? [] }));
}
