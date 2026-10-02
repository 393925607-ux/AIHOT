export type DateGroupKey = "today" | "yesterday" | `${number}-${number}-${number}`;
export type DateGroup<T> = { key: DateGroupKey; label: string; items: T[] };
export type DateValue = string | Date;

const SHANGHAI = "Asia/Shanghai";
const DAY_FORMATTER = new Intl.DateTimeFormat("zh-CN", { timeZone: SHANGHAI, year: "numeric", month: "2-digit", day: "2-digit" });

function parsed(value: DateValue): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function shanghaiDayKey(value: DateValue): string | null {
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

export function dateGroup(value: DateValue, now: DateValue = new Date()): DateGroupKey | null {
  const key = shanghaiDayKey(value);
  const today = shanghaiDayKey(now);
  if (!key || !today) return null;
  if (key === today) return "today";
  if (key === shiftDay(today, -1)) return "yesterday";
  return key as DateGroupKey;
}

export function dateGroupLabel(key: DateGroupKey, now: DateValue = new Date()): string {
  if (key === "today") return "今天";
  if (key === "yesterday") return "昨天";
  const [year, month, day] = key.split("-").map(Number);
  const currentYear = Number(shanghaiDayKey(now)?.slice(0, 4));
  if (![year, month, day, currentYear].every(Number.isFinite) || month < 1 || month > 12 || day < 1 || day > 31) return "日期未知";
  return year === currentYear ? `${month}月${day}日` : `${year}年${month}月${day}日`;
}

export function formatShanghaiTime(value: DateValue): string {
  const date = parsed(value);
  if (!date) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: SHANGHAI, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

/** Sort a list from newest to oldest, putting invalid dates last. */
export function compareLatestDesc<T>(getDate: (item: T) => DateValue): (a: T, b: T) => number {
  return (a, b) => {
    const aTime = parsed(getDate(a))?.getTime();
    const bTime = parsed(getDate(b))?.getTime();
    if (aTime == null && bTime == null) return 0;
    if (aTime == null) return 1;
    if (bTime == null) return -1;
    return bTime - aTime;
  };
}

export function buildDateGroups<T>(
  items: T[],
  getDate: (item: T) => DateValue,
  now: DateValue = new Date(),
  compareItems: (a: T, b: T) => number = compareLatestDesc(getDate),
): DateGroup<T>[] {
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
    const newer = normalize(b);
    const older = normalize(a);
    return newer === older ? 0 : newer > older ? 1 : -1;
  });
  return keys.map((key) => ({
    key,
    label: dateGroupLabel(key, now),
    items: (grouped.get(key) ?? []).toSorted(compareItems),
  }));
}
