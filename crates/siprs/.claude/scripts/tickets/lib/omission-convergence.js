'use strict';

/**
 * PX-407 — finite convergence for the omission loop.
 *
 * A finding is identified by surface, asset and criterion, never by a line
 * number or a message. Only a normative must-fix finding becomes a ticket; an
 * unsourced observation is improvement backlog. The loop converges when every
 * obligation is adjudicated, no must-fix finding is unticketed, debt does not
 * increase, two runs share a digest and the round created no ticket.
 */

const fs = require('node:fs');
const path = require('node:path');
const { writeTemporaryThenRename } = require('./atomic-write.js');

const CONVERGENCE_FILE_NAME = 'OMISSION-CONVERGENCE.json';
const MAX_RUNS = 10;

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
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** The identity of one finding across repeated rounds. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function stableFindingKey(finding) {
  return [finding?.surface ?? '', finding?.assetId ?? '', finding?.criterion ?? ''].join('|');
}

/** Classify one finding. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function classifyFinding(finding) {
  if (CLASS_SET.has(finding?.class)) return finding.class;
  if (!isNonEmptyString(finding?.normativeSource)) return FINDING_CLASS.IMPROVEMENT_BACKLOG;
  if (finding.outOfScope === true && isNonEmptyString(finding.justification)) return FINDING_CLASS.OUT_OF_SCOPE;
  if (isNonEmptyString(finding.justification)) return FINDING_CLASS.ACCEPTABLE;
  if (finding.severity === 'critical' || finding.severity === 'high') return FINDING_CLASS.MUST_FIX;
  return FINDING_CLASS.SHOULD_FIX;
}

/** The signed debt change. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function debtDelta(debt) {
  return (debt?.after ?? 0) - (debt?.before ?? 0);
}

/** The unticketed must-fix findings. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function unticketedMustFix(report, ticketedKeys = []) {
  const ticketed = new Set(ticketedKeys);
  return (report?.findings ?? []).filter((finding) => finding.class === FINDING_CLASS.MUST_FIX && !ticketed.has(finding.stableKey));
}

/**
 * The convergence predicate.
 *
 * The finite obligation set makes this a bounded check: it does not ask whether
 * more improvements exist, only whether every enumerated surface was adjudicated
 * and the measured state stopped changing.
 */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function diffAgainstBaseline(before, after) {
  const known = new Set((Array.isArray(before) ? before : []).map(stableFindingKey));
  return (Array.isArray(after) ? after : []).filter((finding) => !known.has(stableFindingKey(finding)));
}

/** Read the convergence state, or an empty state. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function readState({ cwd }) {
  const filePath = path.join(cwd, CONVERGENCE_FILE_NAME);
  if (!fs.existsSync(filePath)) return { version: 1, runs: [], baseline: [], accepted: {} };
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** Write the convergence state atomically. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function writeState({ cwd, state }) {
  const filePath = path.join(cwd, CONVERGENCE_FILE_NAME);
  writeTemporaryThenRename(filePath, JSON.stringify(state, null, 2) + '\n');
  return filePath;
}

/** Append one measured run. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function recordRun({ cwd, report, newTickets = 0, ticketedKeys = [] }) {
  const state = readState({ cwd });
  const debtAfter = unticketedMustFix(report, ticketedKeys).length;
  const previous = state.runs.length > 0 ? state.runs[state.runs.length - 1] : null;
  const debtBefore = previous?.debt?.after ?? debtAfter;
  state.runs.push({ digest: report.digest, debt: { before: debtBefore, after: debtAfter }, newTickets, at: new Date().toISOString() });
  if (state.runs.length > MAX_RUNS) state.runs = state.runs.slice(-MAX_RUNS);
  const accepted = new Set(state.baseline ?? []);
  for (const finding of report.findings ?? []) {
    if (finding.class !== FINDING_CLASS.MUST_FIX || ticketedKeys.includes(finding.stableKey)) accepted.add(finding.stableKey);
  }
  state.baseline = [...accepted].sort();
  writeState({ cwd, state });
  return state;
}

/** The convergence report for the gate. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function convergenceReport({ cwd, report, judgments, newTickets = 0, ticketedKeys = [] }) {
  const state = recordRun({ cwd, report, newTickets, ticketedKeys });
  const latest = state.runs[state.runs.length - 1];
  const predicateState = {
    unrecorded: judgments?.unrecorded ?? [],
    unticketedMustFix: unticketedMustFix(report, ticketedKeys),
    debt: latest?.debt ?? { before: 0, after: 0 },
    runs: state.runs,
    newTickets,
  };
  return {
    ...predicateState,
    converged: isConverged(predicateState),
    digest: report.digest,
    baseline: state.baseline,
    runs: state.runs,
  };
}

module.exports = {
  CONVERGENCE_FILE_NAME,
  FINDING_CLASS,
  classifyFinding,
  convergenceReport,
  debtDelta,
  diffAgainstBaseline,
  isConverged,
  readState,
  recordRun,
  stableFindingKey,
  unticketedMustFix,
  writeState,
};
