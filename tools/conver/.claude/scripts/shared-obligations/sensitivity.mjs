// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
/**
 * E3: the basis must be load-bearing.
 *
 * The caller supplies an evaluator that answers the obligation with and without the
 * cited basis. If the answer does not change, the basis did not discriminate and the
 * judgment is not evidence of the semantic fact it claims.
 */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function evaluateBasisSensitivity({ verdict = null, evaluate } = {}) {
  if (typeof evaluate !== 'function') {
    return { ok: false, code: 'BASIS_NOT_DISCRIMINATING', problem: 'no evaluator was supplied' };
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const withBasis = evaluate({ present: true });
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const withoutBasis = evaluate({ present: false });
  if (verdict !== null && withBasis !== verdict) {
    return { ok: false, code: 'BASIS_NOT_DISCRIMINATING', problem: 'the basis does not produce the recorded verdict' };
  }
  if (withBasis === withoutBasis) {
    return { ok: false, code: 'BASIS_NOT_DISCRIMINATING', problem: 'the verdict survives the removal of the basis' };
  }
  return { ok: true, code: null, problem: null };
}
