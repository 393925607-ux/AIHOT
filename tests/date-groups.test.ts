import test from "node:test";
import assert from "node:assert/strict";
import { buildDateGroups, dateGroup, dateGroupLabel, shanghaiDayKey } from "../apps/web/app/lib/date-groups.ts";

const now = "2026-10-02T08:00:00Z";

test("date groups use the Shanghai calendar boundary", () => {
  assert.equal(shanghaiDayKey("2026-10-01T16:30:00Z"), "2026-10-02");
  assert.equal(dateGroup("2026-10-01T16:30:00Z", now), "today");
  assert.equal(dateGroup("2026-10-01T15:59:59Z", now), "yesterday");
  assert.equal(dateGroup("2026-09-30T15:59:59Z", now), "2026-09-30");
  assert.equal(dateGroup("2026-09-29T16:00:00Z", now), "2026-09-30");
});

test("date labels distinguish yesterday, historical days, and years", () => {
  assert.equal(dateGroupLabel("today", now), "今天");
  assert.equal(dateGroupLabel("yesterday", now), "昨天");
  assert.equal(dateGroupLabel("2026-10-01", now), "10月1日");
  assert.equal(dateGroupLabel("2025-12-31", now), "2025年12月31日");
});

test("buildDateGroups omits empty dates and orders days newest first", () => {
  const rows = [
    { id: "old", at: "2026-09-30T15:59:59Z" },
    { id: "today", at: "2026-10-01T16:30:00Z" },
    { id: "yesterday", at: "2026-10-01T15:59:59Z" },
  ];
  assert.deepEqual(buildDateGroups(rows, (row) => row.at, now).map((group) => group.key), ["today", "yesterday", "2026-09-30"]);
});
