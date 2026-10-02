import test from "node:test";
import assert from "node:assert/strict";
import { buildDateGroups, compareLatestDesc, dateGroup, dateGroupLabel, shanghaiDayKey } from "../apps/web/app/lib/date-groups.ts";

const now = "2026-10-02T08:00:00Z";

test("日期分组使用上海时区，并正确区分今天、昨天和更早的每一天", () => {
  assert.equal(shanghaiDayKey("2026-10-01T16:30:00Z"), "2026-10-02");
  assert.equal(dateGroup("2026-10-01T16:30:00Z", now), "today");
  assert.equal(dateGroup("2026-10-01T15:59:59Z", now), "yesterday");
  assert.equal(dateGroup("2026-09-30T15:59:59Z", now), "2026-09-30");
  assert.equal(dateGroup("2026-09-29T16:00:00Z", now), "2026-09-30");
  assert.equal(dateGroup("2026-09-29T15:59:59Z", now), "2026-09-29");
});

test("日期标签保留昨天、历史日期和跨年信息", () => {
  assert.equal(dateGroupLabel("today", now), "今天");
  assert.equal(dateGroupLabel("yesterday", now), "昨天");
  assert.equal(dateGroupLabel("2026-10-01", now), "10月1日");
  assert.equal(dateGroupLabel("2025-12-31", now), "2025年12月31日");
  assert.equal(dateGroup("not-a-date", now), null);
  assert.equal(dateGroupLabel("2026-99-99", now), "日期未知");
});

test("逐日分组不产生空组，并按日期从新到旧排列", () => {
  const rows = [
    { id: "three-days-ago", at: "2026-09-29T15:59:59Z" },
    { id: "today-old", at: "2026-10-01T16:30:00Z" },
    { id: "two-days-ago", at: "2026-09-30T15:59:59Z" },
    { id: "today-new", at: "2026-10-02T07:59:59Z" },
    { id: "yesterday", at: "2026-10-01T15:59:59Z" },
    { id: "invalid", at: "not-a-date" },
  ];
  const groups = buildDateGroups(rows, (row) => row.at, now);
  assert.deepEqual(groups.map((group) => group.key), ["today", "yesterday", "2026-09-30", "2026-09-29"]);
  assert.deepEqual(groups.map((group) => group.label), ["今天", "昨天", "9月30日", "9月29日"]);
  assert.deepEqual(groups[0]!.items.map((row) => row.id), ["today-new", "today-old"]);
  assert.ok(groups.every((group) => group.items.length > 0));
});

test("UTC 到上海的月初和年初边界使用自然日判断", () => {
  const janFirst = "2026-01-01T08:00:00Z";
  assert.equal(shanghaiDayKey("2025-12-31T15:59:59Z"), "2025-12-31");
  assert.equal(shanghaiDayKey("2025-12-31T16:00:00Z"), "2026-01-01");
  assert.equal(dateGroup("2025-12-31T15:59:59Z", janFirst), "yesterday");
  assert.equal(dateGroup("2025-12-30T15:59:59Z", janFirst), "2025-12-30");
  assert.equal(dateGroupLabel("2025-12-30", janFirst), "2025年12月30日");
});

test("最新时间比较器把无效日期放在最后，并支持需求排序的稳定 tie-break", () => {
  const compareDate = compareLatestDesc<{ id: string; at: string; users: number }>((row) => row.at);
  const rows = [
    { id: "zeta", at: "2026-10-02T06:00:00Z", users: 2 },
    { id: "alpha", at: "2026-10-02T06:00:00Z", users: 4 },
    { id: "invalid", at: "not-a-date", users: 99 },
    { id: "older", at: "2026-10-02T05:00:00Z", users: 10 },
  ];
  const demandComparator = (a: (typeof rows)[number], b: (typeof rows)[number]) => compareDate(a, b) || b.users - a.users || a.id.localeCompare(b.id);
  const grouped = buildDateGroups(rows, (row) => row.at, now, demandComparator);
  assert.deepEqual(grouped[0]!.items.map((row) => row.id), ["alpha", "zeta", "older"]);
  assert.equal(compareDate(rows[2]!, rows[0]!), 1);
  assert.equal(compareDate(rows[0]!, rows[1]!), 0);
});
