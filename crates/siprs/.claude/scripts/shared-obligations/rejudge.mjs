// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
/**
 * E4: a deterministic sample is re-judged by a second reader.
 *
 * The sample is derived from the worklist digest so two runs select the same
 * obligations. The comparison does not decide which reader is right; it records a
 * disagreement that keeps the certificate incomplete.
 */
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function hash(text) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  let value = 2166136261;
  for (const character of String(text)) {
    value ^= character.codePointAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function sampleObligations(obligations = [], { seed = '', size = 0 } = {}) {
  return [...obligations]
    .sort((left, right) => hash(`${seed}:${left?.obligationId}`) - hash(`${seed}:${right?.obligationId}`))
    .slice(0, Math.max(0, size));
}

// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function compareRejudgment(first, second) {
  if (first?.verdict !== second?.verdict) {
    return {
      ok: false,
      code: 'REJUDGE_DISAGREEMENT',
      problem: `the second reader returned ${second?.verdict} for ${first?.verdict}`,
    };
  }
  return { ok: true, code: null, problem: null };
}
