/** Promote clearly valid testimony that the previous coverage gate left hidden. */
import { closeDb, sql } from "@aihot/backend/db";

async function main() {
  const roots = await sql<{ id: number }[]>`
    UPDATE insight_demands
    SET is_testimony = true
    WHERE source_kind = 'github_issue'
      AND is_testimony = false
      AND coalesce((testimony_judgement->>'valid')::boolean, false) = true
      AND lower(coalesce(testimony_judgement->>'confidence', '')) <> 'low'
    RETURNING id`;
  const comments = await sql<{ id: number }[]>`
    UPDATE insight_demands
    SET is_testimony = true
    WHERE source_kind = 'github_comment'
      AND is_testimony = false
      AND source_user IS NOT NULL
      AND source_user !~* '(bot|\[bot\])$'
      AND coalesce((testimony_judgement->>'same_problem_testimony')::boolean, false) = true
      AND lower(coalesce(testimony_judgement->>'confidence', '')) <> 'low'
    RETURNING id`;
  // Do not promote a comment solely because it contains first-person words and
  // a failure keyword. Ambiguous reproductions and diagnostic material stay
  // rejected until a human or the testimony judge confirms the same problem.
  console.log(JSON.stringify({ ok: true, promotedRoots: roots.length, promotedComments: comments.length, promotedConcreteComments: 0, total: roots.length + comments.length }));
}
try { await main(); } finally { await closeDb(); }
