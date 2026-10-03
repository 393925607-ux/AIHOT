import { createHash } from "node:crypto";

/** A reader-facing generated copy field. Empty values mean that no copy was produced. */
export type CopyField = string | null | undefined;
export type CopyFields = Record<string, CopyField>;

export type CopyReviewState = "current" | "needs_refresh";

/**
 * Small, auditable metadata kept inside an existing judgement JSON object.
 * `sourceHash` is the source version for the copy currently being shown. A
 * different source is held in `pendingSourceHash` until an explicit refresh.
 */
export type CopyReview = {
  sourceHash: string;
  pendingSourceHash?: string;
  state: CopyReviewState;
};

export type CopyJudgement = Record<string, unknown> & { copyReview?: CopyReview };

export type MergeCopyInput<T extends CopyFields> = {
  sourceText: string;
  generated: T;
  existing?: Partial<T> | null;
  judgement?: CopyJudgement | null;
  /** An explicit editorial refresh is the only operation allowed to replace reviewed copy. */
  refresh?: boolean;
};

export type MergeCopyResult<T extends CopyFields> = {
  copy: T;
  judgement: CopyJudgement;
  sourceHash: string;
  refreshed: boolean;
  needsRefresh: boolean;
};

/** Hash the source text used to generate the copy. CRLF and LF are equivalent. */
export function sourceTextHash(sourceText: string): string {
  return createHash("sha256").update(sourceText.replace(/\r\n?/g, "\n"), "utf8").digest("hex");
}

function hasText(value: CopyField): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validReview(value: unknown): CopyReview | null {
  if (!value || typeof value !== "object") return null;
  const review = value as Partial<CopyReview>;
  if (typeof review.sourceHash !== "string" || review.sourceHash.length === 0) return null;
  if (review.state !== "current" && review.state !== "needs_refresh") return null;
  if (review.pendingSourceHash !== undefined && typeof review.pendingSourceHash !== "string") return null;
  return {
    sourceHash: review.sourceHash,
    ...(review.pendingSourceHash ? { pendingSourceHash: review.pendingSourceHash } : {}),
    state: review.state,
  };
}

function mergeFields<T extends CopyFields>(existing: Partial<T> | null | undefined, generated: T, preserveExisting: boolean): T {
  const out: CopyFields = { ...generated };
  for (const key of Object.keys(generated)) {
    const oldValue = existing?.[key];
    if (preserveExisting && hasText(oldValue)) out[key] = oldValue;
    else if (!hasText(generated[key]) && oldValue !== undefined) out[key] = oldValue;
  }
  return out as T;
}

/**
 * Merge newly generated copy without silently overwriting reviewed text.
 *
 * The first source version fills empty fields. Once a source baseline exists,
 * non-empty existing fields win for the same source and remain visible when
 * the raw source changes. A changed source is recorded as `needs_refresh`;
 * callers must pass `refresh: true` to apply the new generated copy.
 */
export function mergeCopy<T extends CopyFields>(input: MergeCopyInput<T>): MergeCopyResult<T> {
  const hash = sourceTextHash(input.sourceText);
  const existing = input.existing ?? null;
  const priorReview = validReview(input.judgement?.copyReview);
  const hasExistingText = Object.values(existing ?? {}).some(hasText);
  const refresh = input.refresh === true;

  if (refresh) {
    // Refresh is an explicit editorial action: apply the generated object as
    // provided, including intentional empty values that clear stale copy.
    const copy = { ...input.generated } as T;
    const judgement: CopyJudgement = { ...(input.judgement ?? {}), copyReview: { sourceHash: hash, state: "current" } };
    return { copy, judgement, sourceHash: hash, refreshed: true, needsRefresh: false };
  }

  // No baseline is safe to initialize: fill missing fields, but never replace
  // already supplied copy merely because the producer was re-run.
  if (!priorReview) {
    const copy = mergeFields(existing, input.generated, hasExistingText);
    const judgement: CopyJudgement = { ...(input.judgement ?? {}), copyReview: { sourceHash: hash, state: "current" } };
    return { copy, judgement, sourceHash: hash, refreshed: false, needsRefresh: false };
  }

  if (hash === priorReview.sourceHash) {
    // A source reversion returns to the reviewed baseline and clears a stale
    // pending hash without changing the reviewed copy.
    const copy = mergeFields(existing, input.generated, true);
    const judgement: CopyJudgement = { ...(input.judgement ?? {}), copyReview: { sourceHash: hash, state: "current" } };
    return { copy, judgement, sourceHash: hash, refreshed: false, needsRefresh: false };
  }

  const copy = mergeFields(existing, input.generated, true);
  const judgement: CopyJudgement = {
    ...(input.judgement ?? {}),
    copyReview: { sourceHash: priorReview.sourceHash, pendingSourceHash: hash, state: "needs_refresh" },
  };
  return { copy, judgement, sourceHash: hash, refreshed: false, needsRefresh: true };
}

/** Explicitly apply generated copy for the current source version. */
export function refreshCopy<T extends CopyFields>(input: Omit<MergeCopyInput<T>, "refresh">): MergeCopyResult<T> {
  return mergeCopy({ ...input, refresh: true });
}
