/**
 * The question gate: whether a point may become a question at all.
 *
 * A question may not be drafted until the settle test has been written out and has
 * failed. For every point about to become a question, the three lines below are
 * written first, in this order. If all three can be written, the point is settled
 * and no question is drafted; only a point whose three lines cannot be written
 * becomes a question, and the failed test is recorded as 決められなかった理由.
 *
 * The gate's output is those three lines, not a feeling: a question drafted
 * without them is a defect even if it reads well. This is why the function below
 * validates lines rather than deciding anything — the AI grounds a point before it
 * may settle it, and that is what lets the human's share fall without any decision
 * losing its origin.
 *
 * The four refusals are the four inferences that each produced a wrong question:
 * a manifest flag naming a point, a doubt filed under another package, a sentence
 * saying only the author can decide, and a point's own weight. Each is returned by
 * name so a caller asserts on a value rather than on prose.
 */

/** The three lines, in the order they are written. */
export const SETTLE_LINES = Object.freeze(['決定', '根拠', '覆す条件']);

/** Why a point is refused a settlement or a question, named rather than described. */
export const REFUSAL = Object.freeze({
  FLAG_IS_NOT_A_GROUND: 'flag-is-not-a-ground',
  FOREIGN_PACKAGE_DOUBT: 'foreign-package-doubt',
  AUTHOR_ONLY_IS_MATERIAL_NOT_EXEMPTION: 'author-only-is-material-not-exemption',
  WEIGHT_ALONE_DOES_NOT_BIND: 'weight-alone-does-not-bind',
});

const REFUSAL_KINDS = new Set(Object.values(REFUSAL));

/** The reason recorded when the AI wrote none: the records were read and did not decide it. */
const NO_GROUND_IN_RECORDS = 'the records read do not decide this point';

/**
 * Refuse a point whose only support is one of the four inferences.
 *
 * @param {Array<{ kind: string, evidence?: string }>} inferences
 * @returns {{ kind: string, evidence?: string } | null}
 */
// [::TICKET::] PX-233, PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-233|PX-234) --for-spec --no-implementation-order`.
function firstRefusal(inferences) {
  for (const inference of inferences) {
    if (!REFUSAL_KINDS.has(inference.kind)) {
      throw new Error(`unknown inference kind: ${inference.kind}`);
    }
  }
  return inferences[0] ?? null;
}

/**
 * Decide a point from the three lines the AI wrote for it.
 *
 * A refusal outranks a complete triple: a point a manifest flag named is not
 * settled even when its lines read well, because a flag is not a ground and is not
 * weight.
 *
 * @param {{
 *   point: { id: string },
 *   candidate?: { decision?: string, ground?: string, override?: string, reason?: string },
 *   records?: string[],
 *   inferences?: Array<{ kind: string, evidence?: string }>,
 * }} input
 * @returns {{ kind: 'settled', decision: string, ground: string, override: string }
 *   | { kind: 'question', reason: string }
 *   | { kind: 'refused', refusal: string, pointId: string, evidence?: string }}
 */
export function settlePoint({ point, candidate = {}, records = [], inferences = [] }) {
  const refusal = firstRefusal(inferences);
  if (refusal !== null) {
    return { kind: 'refused', refusal: refusal.kind, pointId: point.id, evidence: refusal.evidence };
  }

  const { decision = '', ground = '', override = '', reason = '' } = candidate;
  const lines = [decision, ground, override];
  const written = lines.every((line) => typeof line === 'string' && line.trim() !== '');

  // A ground the AI never read is not a ground it has: the records are the only
  // source a settlement may rest on, so a ground outside them leaves the point open.
  if (written && records.includes(ground)) {
    return { kind: 'settled', decision, ground, override };
  }

  return { kind: 'question', reason: reason === '' ? NO_GROUND_IN_RECORDS : reason };
}
