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
// [::TICKET::] PX-407, PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-407|PX-437) --for-spec --no-implementation-order`.
function isConverged(state) {
  if (!state || typeof state !== 'object') return false;
  if (state.remainder !== 0) return false;
  if ((state.expiredDeferred ?? 0) > 0) return false;
  if ((state.unclassified ?? 0) > 0) return false;
  if (Array.isArray(state.unrecorded) && state.unrecorded.length > 0) return false;
  if (Array.isArray(state.unticketedMustFix) && state.unticketedMustFix.length > 0) return false;
  if (!state.debt || debtDelta(state.debt) > 0) return false;
  if (!Array.isArray(state.runs) || state.runs.length < 2) return false;
  const latest = state.runs[state.runs.length - 1];
  const previous = state.runs[state.runs.length - 2];
  if (!latest || !previous) return false;
  if (latest.inventoryDigest !== previous.inventoryDigest) return false;
  if (latest.coverageDigest !== previous.coverageDigest) return false;
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

/** The counters a v3 coverage report contributes to a run record. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function coverageCounters(coverage) {
  const remainder = coverage?.remainder ?? {};
  return {
    remainder: remainder.remainder ?? 0,
    debt: remainder.debt ?? 0,
    notApplicable: remainder.notApplicable ?? 0,
    structural: remainder.structural ?? 0,
    expiredDeferred: remainder.expiredDeferred ?? 0,
    unclassified: remainder.unclassified ?? 0,
    repairs: remainder.repairs ?? 0,
  };
}

/** Merge explicit dispositions by canonical key, later records winning. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function mergeDispositions(existing, incoming) {
  const byKey = new Map((Array.isArray(existing) ? existing : []).map((entry) => [entry.key, entry]));
  for (const entry of incoming ?? []) {
    if (typeof entry?.key === 'string') byKey.set(entry.key, entry);
  }
  return [...byKey.values()].sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
}

/** Validate one explicit disposition. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function validateDisposition(record) {
  if (record?.status === 'NOT_APPLICABLE_VERIFIED') {
    const resolved = isNonEmptyString(record.ruleId) && isNonEmptyString(record.normativeSource) && Array.isArray(record.evidence) && record.evidence.length > 0;
    return resolved ? { ok: true } : { ok: false, code: 'NOT_APPLICABLE_UNVERIFIED', problem: 'NOT_APPLICABLE_VERIFIED requires ruleId, normativeSource and resolving evidence' };
  }
  if (record?.status === 'DEFERRED') {
    const owner = isNonEmptyString(record.owner) || isNonEmptyString(record.externalOwner);
    const resolved = owner && isNonEmptyString(record.reason) && isNonEmptyString(record.normativeSource) && isNonEmptyString(record.createdAt) && isNonEmptyString(record.expiresAt);
    return resolved ? { ok: true } : { ok: false, code: 'DEFERRED_INVALID', problem: 'DEFERRED requires owner, reason, normativeSource, createdAt and expiresAt' };
  }
  return { ok: true };
}

/** The deferrals whose expiry is not in the future. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function expiredDeferrals(dispositions, now = new Date()) {
  return (dispositions ?? []).filter((entry) => entry?.status === 'DEFERRED'
    && typeof entry.expiresAt === 'string'
    && new Date(entry.expiresAt).getTime() <= now.getTime());
}

/** Append one measured run. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function recordRun({ cwd, report, newTickets = 0, ticketedKeys = [], coverage = null, dispositions = [] }) {
  const state = readState({ cwd });
  const counters = coverageCounters(coverage);
  const previous = state.runs.length > 0 ? state.runs[state.runs.length - 1] : null;
  const debtBefore = previous?.debt?.after ?? counters.debt;
  state.runs.push({
    digest: report.digest,
    remainder: counters.remainder,
    debt: { before: debtBefore, after: counters.debt },
    notApplicable: counters.notApplicable,
    structural: counters.structural,
    expiredDeferred: counters.expiredDeferred,
    unclassified: counters.unclassified,
    repairs: counters.repairs,
    inventoryDigest: coverage?.inventoryDigest ?? null,
    coverageDigest: coverage?.coverageDigest ?? null,
    newTickets,
    at: new Date().toISOString(),
  });
  if (state.runs.length > MAX_RUNS) state.runs = state.runs.slice(-MAX_RUNS);
  // A ticket is work, not proof: nothing is absorbed into baseline here. The
  // baseline is kept only for legacy records and is never extended by a run.
  state.baseline = Array.isArray(state.baseline) ? state.baseline : [];
  state.dispositions = mergeDispositions(state.dispositions, dispositions);
  writeState({ cwd, state });
  return state;
}

/** The convergence report for the gate. */
// [::TICKET::] PX-407, PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-407|PX-437) --for-spec --no-implementation-order`.
function convergenceReport({ cwd, report, judgments, newTickets = 0, ticketedKeys = [], coverage = null, dispositions = [] }) {
  const state = recordRun({ cwd, report, newTickets, ticketedKeys, coverage, dispositions });
  const latest = state.runs[state.runs.length - 1];
  const predicateState = {
    remainder: latest?.remainder ?? 0,
    expiredDeferred: latest?.expiredDeferred ?? 0,
    unclassified: latest?.unclassified ?? 0,
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
    dispositions: state.dispositions ?? [],
    runs: state.runs,
    debt: latest?.debt?.after ?? 0,
    notApplicable: latest?.notApplicable ?? 0,
    structural: latest?.structural ?? 0,
    repairs: latest?.repairs ?? 0,
  };
}

module.exports = {
  CONVERGENCE_FILE_NAME,
  FINDING_CLASS,
  classifyFinding,
  convergenceReport,
  coverageCounters,
  debtDelta,
  diffAgainstBaseline,
  expiredDeferrals,
  isConverged,
  mergeDispositions,
  readState,
  recordRun,
  stableFindingKey,
  unticketedMustFix,
  validateDisposition,
  writeState,
};
