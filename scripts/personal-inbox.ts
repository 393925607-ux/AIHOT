/** Private, explicit-input Inbox. Dry-run is the default and never writes DB/public APIs. */
import { mkdirSync, readFileSync, appendFileSync, realpathSync, statSync, chmodSync } from "node:fs";
import { basename, resolve } from "node:path";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { buildPrivateRecord } from "@aihot/backend/insights/personal";
function arg(name: string) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] ?? null : null; }
async function main() {
  const url = arg("--url"); const textFile = arg("--text-file"); const hint = arg("--hint"); const apply = process.argv.includes("--apply"); const ownTest = process.argv.includes("--own-test");
  if ((url ? 1 : 0) + (textFile ? 1 : 0) !== 1) throw new Error("请提供 --url 或 --text-file 二选一");
  let text = "", safeFile: string | null = null;
  if (textFile) {
    const requested = resolve(textFile); safeFile = realpathSync(requested); const st = statSync(safeFile);
    if (!st.isFile() || st.size > 200_000) throw new Error("文本文件必须是普通文件且不超过200KB");
    text = readFileSync(safeFile, "utf8");
  } else {
    const page = await guardedFetch(url!, { timeoutMs: 15_000, maxBytes: 1_000_000 });
    text = page.text().replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, " ").replace(/\s+/g, " ").trim();
  }
  if (text.length < 20) throw new Error("输入内容太短，拒绝写入");
  const record = buildPrivateRecord({ sourceUrl: url, textFile: safeFile ? basename(safeFile) : null, hint, text, ownTest });
  if (apply) {
    const dir = resolve(".data/private");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
    const inbox = `${dir}/inbox.jsonl`;
    appendFileSync(inbox, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    chmodSync(inbox, 0o600);
  }
  console.log(JSON.stringify({ ok: true, mode: apply ? "applied_private" : "dry_run", privacy: "private", classify: record.classify, reviewStatus: record.reviewStatus, ownTest, contentHash: record.contentHash, textLength: record.textLength }));
}
try { await main(); } catch (error) { console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "inbox_error" })); process.exitCode = 1; }
