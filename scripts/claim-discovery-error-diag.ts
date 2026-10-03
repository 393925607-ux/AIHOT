import { closeDb } from "@aihot/backend/db";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { StageASchema } from "@aihot/backend/insights/claim-extraction";
import { judge } from "./phase4-common.ts";
try {
  const res = await guardedFetch("https://blogs.nvidia.com/blog/gpus-openai-gpt-6-astra-ultrafast/", { timeoutMs: 15000, maxBytes: 1200000 });
  const text = res.text().replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 1200);
  const out = await judge("claim_stage_a_diag", "diag-one", "Return JSON {\"items\":[] } when no concrete claim is present.", { text }, StageASchema, 400);
  console.log(JSON.stringify({ ok: true, count: Array.isArray(out.data) ? out.data.length : "object" }));
} catch (error) {
  const e = error as { name?: string; constructor?: { name?: string }; message?: string; status?: number };
  console.log(JSON.stringify({ ok: false, name: e.name ?? e.constructor?.name ?? "Error", status: e.status ?? null, message: String(e.message ?? error).replace(/https?:\/\/\S+/g, "[url]").slice(0, 240) }));
} finally { await closeDb(); }
