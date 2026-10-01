import { z } from 'zod';
import { closeDb } from '@aihot/backend/db';
import { chatJson, markReceiptsCompleted } from '@aihot/backend/providers/llm';
import { ensureEmbeddings, compatibleEmbedding, EMBEDDING_MODEL } from '@aihot/backend/providers/embeddings';

try {
  const result = await chatJson({ model: 'default', purpose: 'insights_smoke', subject: 'phase2-smoke', promptVersion: 'reality-radar-smoke-v1', system: 'Return strictly valid JSON: {"ok":true}.', user: 'Return {"ok":true}.', schema: z.object({ ok: z.literal(true) }), temperature: 0, maxTokens: 512 });
  await markReceiptsCompleted([result.receiptId]);
  console.log(JSON.stringify({ llm: 'PASS', json: result.data, model: process.env.LLM_MODEL, live: !result.reused, receiptId: result.receiptId }));
  const dims: number[] = [];
  for (let i = 0; i < 2; i++) {
    const vectors = await ensureEmbeddings('article', [{ id: `reality-radar-smoke-${i}`, text: `Public AI coding user feedback smoke ${i}` }]);
    const vector = vectors.values().next().value;
    if (!compatibleEmbedding(vector)) throw new Error('Invalid vector');
    dims.push(vector.length);
  }
  if (dims[0] !== dims[1]) throw new Error('Dimension drift');
  console.log(JSON.stringify({ embedding: 'PASS', model: EMBEDDING_MODEL, dimensions: dims, finite: true }));
} catch (error) {
  console.error(JSON.stringify({ smoke: 'FAIL', error: (error as Error).name }));
  process.exitCode = 1;
} finally { await closeDb(); }
