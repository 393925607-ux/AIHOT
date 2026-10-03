import "./setup.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { sql, closeDb } from "@aihot/backend/db";
import { finishQueueItem, leaseQueueBatch } from "@aihot/backend/insights/discovery-queue";

const prefix = `closeout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

test("queue leases exactly the execution budget and keeps the remainder pending", async () => {
  const rows = Array.from({ length: 120 }, (_, i) => ({ family: i % 2 ? "family-b" : "family-a", id: `${prefix}-budget-${i}` }));
  for (const row of rows) await sql`INSERT INTO radar_discovery_queue(stream,source_family,source_item_id,source_url,payload,priority) VALUES('demand',${row.family},${row.id},${`https://example.invalid/${row.id}`},${sql.json({ id: row.id } as never)},50)`;
  const leased = await leaseQueueBatch<{ id: string }>("demand", 40);
  const ours = leased.filter((row) => row.source_item_id.startsWith(`${prefix}-budget-`));
  assert.equal(ours.length, 40);
  assert.equal(ours.filter((row) => row.source_family === "family-a").length, 20);
  assert.equal(ours.filter((row) => row.source_family === "family-b").length, 20);
  assert.equal(ours.every((row) => row.attempts === 1), true);
  const pending = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM radar_discovery_queue WHERE stream='demand' AND source_item_id LIKE ${`${prefix}-budget-%`} AND status='pending'`;
  assert.equal(pending[0]!.count, 80);
  for (const row of ours) await finishQueueItem("demand", row.source_item_id, "done");
  const released = await sql<{ lease_until: string | null; attempts: number }[]>`SELECT lease_until,attempts FROM radar_discovery_queue WHERE source_item_id=${ours[0]!.source_item_id}`;
  assert.equal(released[0]!.lease_until, null);
  assert.equal(released[0]!.attempts, 1);
  const second = (await leaseQueueBatch<{ id: string }>("demand", 40)).filter((row) => row.source_item_id.startsWith(`${prefix}-budget-`));
  assert.equal(second.length, 40);
  assert.equal(new Set([...ours, ...second].map((row) => row.source_item_id)).size, 80);
  for (const row of second) await finishQueueItem("demand", row.source_item_id, "done");
  await sql`DELETE FROM radar_discovery_queue WHERE source_item_id LIKE ${`${prefix}-budget-%`}`;
});

test("concurrent consumers do not double-claim and expired leases resume", async () => {
  const ids = Array.from({ length: 40 }, (_, i) => `${prefix}-concurrent-${i}`);
  for (const id of ids) await sql`INSERT INTO radar_discovery_queue(stream,source_family,source_item_id,source_url,payload) VALUES('demand','family-c',${id},${`https://example.invalid/${id}`},${sql.json({ id } as never)})`;
  const [left, right] = await Promise.all([leaseQueueBatch<{ id: string }>("demand", 20), leaseQueueBatch<{ id: string }>("demand", 20)]);
  const claimed = [...left, ...right].filter((row) => row.source_item_id.startsWith(`${prefix}-concurrent-`));
  assert.equal(new Set(claimed.map((row) => row.source_item_id)).size, claimed.length);
  assert.equal(claimed.length, 40);
  const expired = `${prefix}-expired`;
  await sql`INSERT INTO radar_discovery_queue(stream,source_family,source_item_id,source_url,payload,status,lease_until) VALUES('demand','family-d',${expired},${`https://example.invalid/${expired}`},${sql.json({ id: expired } as never)},'running',now()-interval '1 minute')`;
  const resumed = await leaseQueueBatch<{ id: string }>("demand", 1);
  assert.equal(resumed.some((row) => row.source_item_id === expired), true);
  for (const row of [...claimed, ...resumed]) await finishQueueItem("demand", row.source_item_id, "done");
  await sql`DELETE FROM radar_discovery_queue WHERE source_item_id LIKE ${`${prefix}-concurrent-%`} OR source_item_id=${expired}`;
});

test.after(async () => { await sql`DELETE FROM radar_discovery_queue WHERE source_item_id LIKE ${`${prefix}-%`}`; await closeDb(); });
