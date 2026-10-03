import assert from "node:assert/strict";
import { test } from "node:test";
import { sortDemandThemes, type DemandThemeSortInput } from "@aihot/backend/publication/insights";

const theme = (key: string, latestAt: string, users: number, threads: number, platforms: number): DemandThemeSortInput => ({
  themeKey: key,
  latestAt,
  independentUserCount: users,
  independentThreadCount: threads,
  independentPlatformCount: platforms,
});

test("evidence sorting groups by Shanghai day before ranking evidence", () => {
  const rows = [
    // 10/02 00:05 Shanghai; this newer day must remain first even with less breadth.
    theme("new-day", "2026-10-01T16:05:00.000Z", 1, 1, 1),
    // 10/01 23:59 Shanghai; the larger evidence belongs to the older day.
    theme("older-day-strong", "2026-10-01T15:59:00.000Z", 99, 9, 4),
    theme("older-day-users", "2026-10-01T12:00:00.000Z", 10, 20, 4),
    theme("older-day-threads", "2026-10-01T11:00:00.000Z", 10, 3, 4),
    theme("older-day-platforms", "2026-10-01T10:00:00.000Z", 10, 3, 2),
  ];

  assert.deepEqual(sortDemandThemes(rows, "evidence").map((row) => row.themeKey), [
    "new-day", "older-day-strong", "older-day-users", "older-day-threads", "older-day-platforms",
  ]);
  // Pagination must happen after the complete ordering, so page 2 starts at
  // the second row of the older Shanghai day rather than an arbitrary slice.
  assert.deepEqual(sortDemandThemes(rows, "evidence").slice(2, 4).map((row) => row.themeKey), ["older-day-users", "older-day-threads"]);
});

test("within one Shanghai day evidence order is users, threads, platforms, latest, key", () => {
  const rows = [
    theme("same-key-z", "2026-10-02T10:00:00.000Z", 2, 2, 2),
    theme("same-key-a", "2026-10-02T11:00:00.000Z", 2, 2, 2),
    theme("more-platforms", "2026-10-02T09:00:00.000Z", 2, 2, 3),
    theme("more-threads", "2026-10-02T08:00:00.000Z", 2, 3, 1),
    theme("more-users", "2026-10-02T07:00:00.000Z", 3, 1, 1),
  ];
  assert.deepEqual(sortDemandThemes(rows, "evidence").map((row) => row.themeKey), [
    "more-users", "more-threads", "more-platforms", "same-key-a", "same-key-z",
  ]);
});

test("latest sorting keeps newest item first within each Shanghai day", () => {
  const rows = [
    theme("old-day", "2026-10-01T16:00:00.000Z", 99, 99, 9),
    theme("new-day-late", "2026-10-02T15:00:00.000Z", 1, 1, 1),
    theme("new-day-early", "2026-10-02T01:00:00.000Z", 9, 9, 9),
  ];
  assert.deepEqual(sortDemandThemes(rows, "latest").map((row) => row.themeKey), ["new-day-late", "new-day-early", "old-day"]);
});
