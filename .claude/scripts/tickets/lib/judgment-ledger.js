'use strict';

/**
 * PX-407 — the AI judgment ledger.
 *
 * A judgment obligation is enumerated by the scan from the canon. The AI records
 * one verdict with evidence and a normative source. Every enumerated obligation
 * must have a verdict, including PASS; an empty ledger that never enumerated its
 * obligations is INCOMPLETE, never PASS.
 */

const fs = require('node:fs');
const path = require('node:path');
const { writeTemporaryThenRename } = require('./atomic-write.js');

const LEDGER_FILE_NAME = 'OMISSION-JUDGMENT-LEDGER.json';

const JUDGMENT_STATUS = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  NOT_VERIFIABLE: 'NOT_VERIFIABLE',
});

const STATUS_SET = new Set(Object.values(JUDGMENT_STATUS));

/** The identity of one judgment across repeated rounds. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function judgmentKey(judgment) {
  return [judgment?.surface ?? '', judgment?.assetId ?? '', judgment?.criterion ?? ''].join('|');
}

/** A ledger with its enumerated obligations and no verdicts yet. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function createLedger({ obligations = [] } = {}) {
  return {
    version: 1,
    enumeration: { obligations: obligations.length, at: new Date().toISOString() },
    obligations: obligations.map((obligation) => ({ ...obligation })),
    judgments: [],
  };
}

/** Whether a value is a non-empty string. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Merge newly enumerated obligations into a ledger without losing verdicts. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function mergeObligations(ledger, obligations) {
  const existing = new Map((ledger?.obligations ?? []).map((obligation) => [judgmentKey(obligation), obligation]));
  for (const obligation of obligations ?? []) {
    if (!existing.has(judgmentKey(obligation))) existing.set(judgmentKey(obligation), { ...obligation });
  }
  return {
    version: 1,
    enumeration: { obligations: existing.size, at: new Date().toISOString() },
    obligations: [...existing.values()],
    judgments: Array.isArray(ledger?.judgments) ? ledger.judgments : [],
  };
}

/**
 * Record one judgment.
 *
 * PASS and FAIL require evidence and a normative source. NOT_APPLICABLE and
 * NOT_VERIFIABLE require a reason. A second verdict for the same surface, asset
 * and criterion replaces the first. A verdict for an obligation the scan did not
 * enumerate is refused, so the AI cannot invent coverage.
 */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function recordJudgment(ledger, judgment) {
  if (!judgment || typeof judgment !== 'object' || Array.isArray(judgment)) {
    return { ok: false, code: 'JUDGMENT_INVALID', problem: 'judgment must be an object' };
  }
  for (const field of ['surface', 'assetId', 'criterion']) {
    if (!isNonEmptyString(judgment[field])) {
      return { ok: false, code: 'JUDGMENT_INVALID', problem: field + ' is required' };
    }
  }
  if (!STATUS_SET.has(judgment.status)) {
    return { ok: false, code: 'JUDGMENT_STATUS_INVALID', problem: 'unknown judgment status: ' + judgment.status };
  }
  if (judgment.status === JUDGMENT_STATUS.PASS || judgment.status === JUDGMENT_STATUS.FAIL) {
    if (!Array.isArray(judgment.evidence) || judgment.evidence.length === 0) {
      return { ok: false, code: 'EVIDENCE_MISSING', problem: 'PASS and FAIL require evidence' };
    }
    if (!isNonEmptyString(judgment.normativeSource)) {
      return { ok: false, code: 'NORMATIVE_SOURCE_MISSING', problem: 'PASS and FAIL require a normative source' };
    }
  }
  if (judgment.status === JUDGMENT_STATUS.NOT_APPLICABLE || judgment.status === JUDGMENT_STATUS.NOT_VERIFIABLE) {
    if (!isNonEmptyString(judgment.reason)) {
      return { ok: false, code: 'REASON_MISSING', problem: judgment.status + ' requires a reason' };
    }
  }
  const enumerated = Array.isArray(ledger?.obligations) ? ledger.obligations : [];
  if (enumerated.length > 0 && !enumerated.some((obligation) => judgmentKey(obligation) === judgmentKey(judgment))) {
    return { ok: false, code: 'OBLIGATION_UNKNOWN', problem: 'the scan did not enumerate this obligation' };
  }

  const record = { ...judgment, evidence: Array.isArray(judgment.evidence) ? judgment.evidence : [] };
  const key = judgmentKey(record);
  ledger.judgments = Array.isArray(ledger.judgments) ? ledger.judgments : [];
  const existing = ledger.judgments.findIndex((entry) => judgmentKey(entry) === key);
  if (existing === -1) ledger.judgments.push(record);
  else ledger.judgments[existing] = record;
  return { ok: true, judgment: record };
}

/**
 * Whether every obligation has a verdict.
 *
 * A FAIL is a recorded verdict and an omission to repair; it is not an
 * unrecorded obligation. NOT_VERIFIABLE is recorded but keeps the verdict below
 * PASS. A ledger with no enumeration block is INCOMPLETE: it never enumerated
 * the obligations, so its empty judgment list proves nothing.
 */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function judgeCoverage(ledger) {
  const judgments = Array.isArray(ledger?.judgments) ? ledger.judgments : [];
  const obligations = Array.isArray(ledger?.obligations) ? ledger.obligations : [];
  const byStatus = {};
  for (const judgment of judgments) byStatus[judgment.status] = (byStatus[judgment.status] ?? 0) + 1;
  const recorded = new Set(judgments.map(judgmentKey));
  const unrecorded = obligations.filter((obligation) => !recorded.has(judgmentKey(obligation)));
  const notVerifiable = judgments.filter((judgment) => judgment.status === JUDGMENT_STATUS.NOT_VERIFIABLE);

  let verdict = JUDGMENT_STATUS.PASS;
  if (!ledger?.enumeration || unrecorded.length > 0) verdict = 'INCOMPLETE';
  else if ((byStatus.FAIL ?? 0) > 0) verdict = JUDGMENT_STATUS.FAIL;
  else if (notVerifiable.length > 0) verdict = JUDGMENT_STATUS.NOT_VERIFIABLE;

  return { unrecorded, byStatus, recorded: judgments.length, notVerifiable, verdict };
}

/** Read the ledger beside the package, or null when it does not exist. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function readLedger({ cwd }) {
  const filePath = path.join(cwd, LEDGER_FILE_NAME);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** Write the ledger beside the package. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function writeLedger({ cwd, ledger }) {
  const filePath = path.join(cwd, LEDGER_FILE_NAME);
  writeTemporaryThenRename(filePath, JSON.stringify(ledger, null, 2) + '\n');
  return filePath;
}

/** CLI: record one judgment from stdin, or report the current verdict. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const cwdArg = args.find((argument) => argument.startsWith('--cwd='));
  const cwd = path.resolve(cwdArg ? cwdArg.slice('--cwd='.length) : process.cwd());
  const ledger = readLedger({ cwd });
  if (ledger === null) {
    console.log(JSON.stringify({ ok: false, code: 'LEDGER_MISSING' }));
    process.exit(1);
  }
  if (args.includes('--report')) {
    console.log(JSON.stringify({ ok: true, ...judgeCoverage(ledger) }));
    process.exit(0);
  }
  let judgment;
  try {
    judgment = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    console.log(JSON.stringify({ ok: false, code: 'JUDGMENT_INVALID', problem: 'stdin must be JSON' }));
    process.exit(1);
  }
  const result = recordJudgment(ledger, judgment);
  if (!result.ok) {
    console.log(JSON.stringify(result));
    process.exit(1);
  }
  writeLedger({ cwd, ledger });
  console.log(JSON.stringify(result));
}

if (require.main === module) main();

module.exports = {
  JUDGMENT_STATUS,
  LEDGER_FILE_NAME,
  createLedger,
  judgeCoverage,
  judgmentKey,
  main,
  mergeObligations,
  readLedger,
  recordJudgment,
  writeLedger,
};
