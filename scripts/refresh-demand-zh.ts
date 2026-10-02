import { z } from "zod";
import { closeDb, sql } from "@aihot/backend/db";
import { judge, safeError } from "./phase4-common.ts";
import { isSafeChinese, needsChineseRefresh } from "./demand-zh-safety.ts";

const Item = z.object({ id: z.number(), problemZh: z.string().trim().min(1).max(300), scenarioZh: z.string().trim().min(1).max(400), workaroundZh: z.string().trim().max(300) });
const Batch = z.object({ items: z.array(Item) });
type Row = { id: number; problem: string; scenario: string; workaround: string; problem_zh: string | null; scenario_zh: string | null; workaround_zh: string | null };

const SYSTEM = `你是 AI 现实雷达的中文内容编辑。把真实用户材料改写成自然、具体、忠实的中文产品文案。只处理需求字段，不改变事实，不补造版本、人数或解决办法。
输出严格 JSON：{"items":[{"id":1,"problemZh":"具体问题","scenarioZh":"使用场景","workaroundZh":"临时解决办法；没有就写暂未发现明确临时解决办法"}]}。
要求：每个输入 id 恰好一次；三个字段都必须是自然中文；禁止英文字母、英文产品名、命令、堆栈、日志和用户名；产品名改为自然中文（例如编程助手、聊天助手、代码托管平台、浏览器）；数字和必要版本号可以保留；不要把泛泛的产品介绍写成用户需求。`;

async function main() {
  const rows = await sql<Row[]>`SELECT id, problem, scenario, workaround, problem_zh, scenario_zh, workaround_zh FROM insight_demands WHERE is_testimony AND (problem_zh IS NULL OR problem_zh ~ '[A-Za-z]' OR scenario_zh IS NULL OR scenario_zh ~ '[A-Za-z]' OR workaround_zh IS NULL OR workaround_zh ~ '[A-Za-z]') ORDER BY id`;
  let updated = 0, skipped = 0, failures = 0;
  for (let offset = 0; offset < rows.length; offset += 4) {
    const batch = rows.slice(offset, offset + 4);
    try {
      const result = await judge("insight_demand_zh_only", `demand-zh-only:${batch[0]!.id}`, SYSTEM, batch.map((row) => ({
        id: row.id,
        originalProblem: row.problem.slice(0, 1800), originalScenario: row.scenario.slice(0, 1800), originalWorkaround: row.workaround.slice(0, 1200),
        existingProblemZh: row.problem_zh?.slice(0, 800) ?? "", existingScenarioZh: row.scenario_zh?.slice(0, 800) ?? "", existingWorkaroundZh: row.workaround_zh?.slice(0, 600) ?? "",
      })), Batch, 2400);
      const inputIds = new Set(batch.map((row) => row.id));
      for (const item of result.data.items) {
        if (!inputIds.has(item.id) || !isSafeChinese(item.problemZh) || !isSafeChinese(item.scenarioZh) || !isSafeChinese(item.workaroundZh)) { skipped++; continue; }
        await sql`UPDATE insight_demands SET
          problem_zh=CASE WHEN problem_zh IS NULL OR problem_zh ~ '[A-Za-z]' THEN ${item.problemZh} ELSE problem_zh END,
          scenario_zh=CASE WHEN scenario_zh IS NULL OR scenario_zh ~ '[A-Za-z]' THEN ${item.scenarioZh} ELSE scenario_zh END,
          workaround_zh=CASE WHEN workaround_zh IS NULL OR workaround_zh ~ '[A-Za-z]' THEN ${item.workaroundZh} ELSE workaround_zh END
          WHERE id=${item.id}`;
        updated++;
      }
      skipped += batch.length - result.data.items.filter((item) => inputIds.has(item.id)).length;
    } catch (error) {
      failures++;
      console.error(JSON.stringify({ batch: batch[0]?.id, error: safeError(error) }));
    }
  }
  const [{ dirty }] = await sql<{ dirty: number }[]>`SELECT count(*)::int AS dirty FROM insight_demands WHERE is_testimony AND ((problem_zh IS NULL OR problem_zh ~ '[A-Za-z]') OR (scenario_zh IS NULL OR scenario_zh ~ '[A-Za-z]') OR (workaround_zh IS NULL OR workaround_zh ~ '[A-Za-z]'))`;
  console.log(JSON.stringify({ ok: failures === 0, candidates: rows.length, updated, skipped, failures, dirty }));
  if (failures || dirty > 0) process.exitCode = 1;
}
try { await main(); } finally { await closeDb(); }
