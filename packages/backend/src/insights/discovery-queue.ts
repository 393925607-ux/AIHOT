import { sql, type Tx } from "../db.ts";

export type QueueItem<T> = { sourceFamily: string; payload: T; firstSeenAt?: string; priority?: number };

export type QueueStream = "demand" | "claim_page";
export type QueueLease<T> = { id: number; source_family: string; source_item_id: string; payload: T; attempts: number };

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

/**
 * Lease exactly the work that this invocation will execute. The candidate read is deliberately
 * larger than the final batch so source families get a turn, but rows outside the selected batch
 * are only row-locked until this transaction commits; they never receive a lease.
 */
export async function leaseQueueBatch<T>(stream: QueueStream, limit: number): Promise<QueueLease<T>[]> {
  if (!Number.isInteger(limit) || limit <= 0) return [];
  return sql.begin(async (tx: Tx) => {
    await tx`UPDATE radar_discovery_queue
      SET status='pending', lease_until=NULL, updated_at=now()
      WHERE stream=${stream} AND status='running' AND lease_until IS NOT NULL AND lease_until < now()`;
    const candidateLimit = Math.max(limit * 3, limit);
    const candidates = await tx<{ id: number; source_family: string; source_item_id: string; payload: T; attempts: number }[]>`
      SELECT id, source_family, source_item_id, payload, attempts
      FROM radar_discovery_queue
      WHERE stream=${stream} AND status IN ('pending','retryable') AND available_at <= now()
      ORDER BY (priority + floor(extract(epoch FROM (now() - first_seen_at)) / 3600)) DESC,
               first_seen_at ASC, id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${candidateLimit}`;
    const selected = fairRoundRobin<{ id: number; source_family: string; source_item_id: string; payload: T; attempts: number }>(candidates.map((row) => ({ sourceFamily: row.source_family, payload: row })), limit).map((row) => row.payload);
    if (!selected.length) return [];
    const selectedIds = selected.map((row) => row.id);
    const leased = await tx<QueueLease<T>[]>`
      UPDATE radar_discovery_queue
      SET status='running', attempts=attempts+1,
          lease_until=now()+interval '30 minutes', updated_at=now(), last_error=NULL
      WHERE stream=${stream} AND id IN ${tx(selectedIds)}
      RETURNING id, source_family, source_item_id, payload, attempts`;
    return leased;
  }) as Promise<QueueLease<T>[]>;
}

/** Complete one real execution attempt and always release its lease. */
export async function finishQueueItem(stream: QueueStream, sourceItemId: string, status: "done" | "retryable" | "blocked" | "needs_review", error?: string | null): Promise<void> {
  await sql`
    UPDATE radar_discovery_queue
    SET status=${status}, lease_until=NULL, last_checked_at=now(),
        last_error=${error ?? null},
        available_at=CASE WHEN ${status}='retryable' THEN now() ELSE available_at END,
        updated_at=now()
    WHERE stream=${stream} AND source_item_id=${sourceItemId}`;
}

/** Explicit recovery hook used by the timer and by closeout checks. */
export async function recoverExpiredQueueLeases(stream?: QueueStream): Promise<number> {
  const rows = stream
    ? await sql<{ id: number }[]>`UPDATE radar_discovery_queue SET status='retryable', lease_until=NULL, available_at=now(), updated_at=now() WHERE stream=${stream} AND status='running' AND lease_until IS NOT NULL AND lease_until < now() RETURNING id`
    : await sql<{ id: number }[]>`UPDATE radar_discovery_queue SET status='retryable', lease_until=NULL, available_at=now(), updated_at=now() WHERE status='running' AND lease_until IS NOT NULL AND lease_until < now() RETURNING id`;
  return rows.length;
}
