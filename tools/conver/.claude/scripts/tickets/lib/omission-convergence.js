'use strict';

/**
 * PX-406 — finite convergence for the omission loop.
 *
 * A finding is identified by surface, asset and criterion, never by a line
 * number or a message. Only a normative must-fix finding becomes a ticket; an
 * unsourced observation is improvement backlog. The loop converges when every
 * surface is adjudicated, no must-fix finding is unticketed, debt does not
 * increase, two runs share a digest, and the round created no ticket.
 */

const FINDING_CLASS = Object.freeze({
  MUST_FIX: 'must-fix',
  SHOULD_FIX: 'should-fix',
  ACCEPTABLE: 'acceptable',
  OUT_OF_SCOPE: 'out-of-scope',
  NOT_APPLICABLE: 'not-applicable',
  IMPROVEMENT_BACKLOG: 'improvement-backlog',
});

const CLASS_SET = new Set(Object.values(FINDING_CLASS));

/** Whether a value is a non-empty string. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** The identity of one finding across repeated rounds. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function stableFindingKey(finding) {
  return [
    finding?.surface ?? '',
    finding?.assetId ?? '',
    finding?.criterion ?? '',
  ].join('|');
}

/**
 * Classify one finding.
 *
 * A normative source is the boundary between an omission and an improvement
 * suggestion. A justification can downgrade a normative finding to acceptable or
 * out-of-scope; it cannot create a ticket on its own.
 */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function classifyFinding(finding) {
  if (CLASS_SET.has(finding?.class)) return finding.class;
  if (!isNonEmptyString(finding?.normativeSource)) return FINDING_CLASS.IMPROVEMENT_BACKLOG;
  if (finding.outOfScope === true && isNonEmptyString(finding.justification)) return FINDING_CLASS.OUT_OF_SCOPE;
  if (isNonEmptyString(finding.justification)) return FINDING_CLASS.ACCEPTABLE;
  if (finding.severity === 'critical' || finding.severity === 'high') return FINDING_CLASS.MUST_FIX;
  return FINDING_CLASS.SHOULD_FIX;
}

/** The signed debt change. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function debtDelta(debt) {
  return (debt?.after ?? 0) - (debt?.before ?? 0);
}

/**
 * The convergence predicate.
 *
 * The finite obligation set makes this a bounded check: it does not ask whether
 * more improvements exist, only whether every enumerated surface was adjudicated
 * and the measured state stopped changing.
 */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function isConverged(state) {
  if (!state || typeof state !== 'object') return false;
  if (!Array.isArray(state.unrecorded) || state.unrecorded.length > 0) return false;
  if (!Array.isArray(state.unticketedMustFix) || state.unticketedMustFix.length > 0) return false;
  if (!state.debt || debtDelta(state.debt) > 0) return false;
  if (!Array.isArray(state.runs) || state.runs.length < 2) return false;
  const latest = state.runs[state.runs.length - 1];
  const previous = state.runs[state.runs.length - 2];
  if (!latest || !previous || latest.digest !== previous.digest) return false;
  if (state.newTickets !== 0) return false;
  return true;
}

/** The findings this run introduced, not the ones it inherited. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function diffAgainstBaseline(before, after) {
  const known = new Set((Array.isArray(before) ? before : []).map(stableFindingKey));
  return (Array.isArray(after) ? after : []).filter((finding) => !known.has(stableFindingKey(finding)));
}

module.exports = {
  FINDING_CLASS,
  classifyFinding,
  debtDelta,
  diffAgainstBaseline,
  isConverged,
  stableFindingKey,
};
