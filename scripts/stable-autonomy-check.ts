/** Record a natural daily health cycle only after the user has accepted V1. */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { sql, closeDb } from "@aihot/backend/db";

const STATE = ".data/stable-autonomy/goal-status.json";
const TIMER = "aihot-reality-radar-insights.timer";
const SERVICE = "aihot-reality-radar-insights.service";

function show(unit: string, property: string): string {
  try { return execFileSync("systemctl", ["show", unit, "-p", property, "--value"], { encoding: "utf8" }).trim(); } catch { return ""; }
}

function timestamp(value: string): number {
  if (!value) return NaN;
  try { return Number(execFileSync("date", ["-d", value, "+%s%3N"], { encoding: "utf8" }).trim()); } catch { return NaN; }
}

async function main() {
  if (!existsSync(STATE)) { console.log(JSON.stringify({ ok: true, recorded: false, reason: "state_missing" })); return; }
  const state = JSON.parse(readFileSync(STATE, "utf8")) as Record<string, any>;
  if (state.goal_state !== "V1_OPERATIONAL") { console.log(JSON.stringify({ ok: true, recorded: false, reason: "awaiting_user_acceptance", goalState: state.goal_state })); return; }

  const timerTrigger = timestamp(show(TIMER, "LastTriggerUSec"));
  const serviceStart = timestamp(show(SERVICE, "ExecMainStartTimestamp"));
  const natural = Number.isFinite(timerTrigger) && Number.isFinite(serviceStart) && timerTrigger >= serviceStart - 10_000 && timerTrigger <= Date.now() + 10_000;
  if (!natural) { console.log(JSON.stringify({ ok: true, recorded: false, reason: "not_formal_timer_trigger", timerTrigger, serviceStart })); return; }

  const queue = await sql<{ status: string; n: number }[]>`SELECT status, count(*)::int AS n FROM radar_discovery_queue GROUP BY status`;
  const counts = Object.fromEntries(queue.map((row) => [row.status, row.n]));
  const orphan = Number(counts.running ?? 0);
  const now = new Date().toISOString();
  const history = Array.isArray(state.daily_history) ? state.daily_history : [];
  const previousAt = state.last_daily_run?.triggered_at ? Date.parse(state.last_daily_run.triggered_at) : NaN;
  const missedNaturalCycle = Number.isFinite(previousAt) && timerTrigger - previousAt > 36 * 60 * 60 * 1000;
  let cycles = Number(state.consecutive_healthy_cycles ?? 0);
  if (missedNaturalCycle) cycles = 0;
  const result = orphan === 0 ? "HEALTHY_WITH_RETRIES" : "UNHEALTHY";
  cycles = result === "UNHEALTHY" ? 0 : cycles + 1;
  const entry = { triggered_at: new Date(timerTrigger).toISOString(), recorded_at: now, result, queue: counts, orphan_running: orphan };
  const next = { ...state, last_daily_run: entry, consecutive_healthy_cycles: cycles, queue_health: { ...counts, orphan }, daily_history: [...history, entry].slice(-7), current_commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() };
  const temp = `${STATE}.tmp`;
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, STATE);
  console.log(JSON.stringify({ ok: true, recorded: true, natural, result, cycles, orphan }));
}

try { await main(); } finally { await closeDb(); }
