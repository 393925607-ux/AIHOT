import { readFileSync, writeFileSync } from "node:fs";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
const rows = JSON.parse(readFileSync(".data/claims-recovery/page-audit-input.json","utf8")).filter((r: any) => r.status === "readable");
const clean = (s: string) => s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<header[\s\S]*?<\/header>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const out = [];
for (const row of rows) {
  const res = await guardedFetch(row.url, { timeoutMs: 15000, maxBytes: 1500000 });
  const text = clean(res.text());
  const start = Math.max(0, text.search(/\b(Introducing|delivers|available|model|benchmark|faster|cost|percent|%|tokens|GPU|Gemini|GPT)\b/i));
  out.push({ ...row, body: text.slice(start, start + 900) });
}
writeFileSync(".data/claims-recovery/page-audit-body.json", JSON.stringify(out, null, 2));
for (const row of out) { console.log("\n##", row.title, "\n", row.url, "\n", row.body.slice(0, 450)); }
