export type QueueItem<T> = { sourceFamily: string; payload: T; firstSeenAt?: string; priority?: number };

/** Select a bounded batch while giving each source family a turn. */
export function fairRoundRobin<T>(items: QueueItem<T>[], limit: number): QueueItem<T>[] {
  const groups = new Map<string, QueueItem<T>[]>();
  for (const item of items) (groups.get(item.sourceFamily) ?? (groups.set(item.sourceFamily, []), groups.get(item.sourceFamily)!)).push(item);
  const families = [...groups.keys()].sort();
  const out: QueueItem<T>[] = [];
  while (out.length < limit && families.length) {
    for (const family of [...families]) {
      const next = groups.get(family)!.shift();
      if (next) out.push(next);
      if (!groups.get(family)!.length) families.splice(families.indexOf(family), 1);
      if (out.length >= limit) break;
    }
  }
  return out;
}
