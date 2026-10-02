import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { z } from "zod";
import { chatJson, markReceiptsCompleted } from "@aihot/backend/providers/llm";
import { sha256 } from "@aihot/backend/lib/ids";

const exec = promisify(execFile);
mkdirSync(".data/phase4", { recursive: true, mode: 0o700 });
const reservations: Array<{ at: number; tokens: number }> = [];
let nextCallAt = 0;
/** Per-run conservative 45k TPM reservation; tenant capacity is shared with other tasks. */
export async function judge<S extends z.ZodType>(purpose: string, subject: string, system: string, input: unknown, schema: S, maxTokens = 1500): Promise<{ data: z.infer<S>; receiptId: number }> {
  const user = JSON.stringify(input);
  const reserve = user.length + system.length + maxTokens * 2;
  if (reserve > 45_000) throw new Error("Phase4 input budget exceeded");
  for (;;) {
    while (reservations.length && reservations[0]!.at <= Date.now() - 60_000) reservations.shift();
    const tokens = reservations.reduce((a, b) => a + b.tokens, 0);
    if (tokens + reserve <= 45_000 && Date.now() >= nextCallAt) break;
    await new Promise((r) => setTimeout(r, Math.max(250, Math.min(2000, nextCallAt - Date.now()))));
  }
  nextCallAt = Date.now() + 1800;
  reservations.push({ at: Date.now(), tokens: reserve });
  const result = await chatJson({ model: "default", purpose, subject, promptVersion: "reality-radar-content-v4", system, user, schema, temperature: 0, maxTokens, timeoutMs: 90_000 });
  await markReceiptsCompleted([result.receiptId]);
  return { data: result.data, receiptId: result.receiptId };
}
export async function github<T>(endpoint: string): Promise<T> {
  if (!/^(repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(issues\/\d+(\/comments)?|readme)(\?.*)?|search\/issues\?.*)$/.test(endpoint)) throw new Error("Unsupported read-only GitHub route");
  const file = `.data/phase4/gh-${sha256(endpoint)}.json`;
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as T;
  const out = await exec("gh", ["api", endpoint], { timeout: 30_000, maxBuffer: 6 * 1024 * 1024 });
  const parsed = JSON.parse(out.stdout) as T;
  writeFileSync(file, JSON.stringify(parsed), { mode: 0o600 });
  return parsed;
}
export function safeError(err: unknown): string { return err instanceof Error ? err.name : "UnknownError"; }
export async function parallel<T>(items: T[], run: (item: T) => Promise<void>, concurrency = 4) {
  let n = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => { while (n < items.length) await run(items[n++]!); }));
}
