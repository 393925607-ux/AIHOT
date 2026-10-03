import { z } from "zod";
import { closeDb } from "@aihot/backend/db";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { judge } from "./phase4-common.ts";
const schema = z.object({ claims: z.array(z.object({ claim: z.string(), claimZh: z.string(), claimType: z.enum(["性能", "成本", "用户量", "Benchmark", "产品能力"]), claimantName: z.string(), explanationZh: z.string() })).max(1) });
try {
  const res = await guardedFetch("https://blogs.nvidia.com/feed/", { timeoutMs: 15000, maxBytes: 1000000 });
  const text = res.text().replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 1800);
  const out = await judge("claim_discovery_diag", "diag", "只返回 JSON。没有明确可核验主张时 claims 为空数组。", { text }, schema, 500);
  console.log(JSON.stringify({ ok: true, count: out.data.claims.length }));
} catch (error) {
  console.log(JSON.stringify({ ok: false, name: error instanceof Error ? error.name : "Error", message: String(error instanceof Error ? error.message : error).slice(0, 220) }));
} finally { await closeDb(); }
