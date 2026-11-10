'use strict';

/**
 * PX-406 — the AI judgment ledger.
 *
 * A judgment obligation is enumerated by the registry; the AI adjudicates it and
 * records one verdict with evidence and a normative source. Every obligation must
 * have a verdict, including PASS. NOT_VERIFIABLE is recorded but never passes.
 */

const fs = require('node:fs');
const path = require('node:path');

const LEDGER_FILE_NAME = 'OMISSION-JUDGMENT-LEDGER.json';

const JUDGMENT_STATUS = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  NOT_VERIFIABLE: 'NOT_VERIFIABLE',
});

const STATUS_SET = new Set(Object.values(JUDGMENT_STATUS));

/** The identity of one judgment across repeated rounds. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function judgmentKey(judgment) {
  return [judgment?.surface ?? '', judgment?.assetId ?? '', judgment?.criterion ?? ''].join('|');
}

/** A ledger with its enumerated obligations and no verdicts yet. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function createLedger({ obligations = [] } = {}) {
  return {
    version: 1,
    obligations: obligations.map((obligation) => ({ ...obligation })),
    judgments: [],
  };
}

/** Whether a value is a non-empty string. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Record one judgment.
 *
 * PASS and FAIL require evidence and a normative source. NOT_APPLICABLE and
 * NOT_VERIFIABLE require a reason. A second verdict for the same surface, asset
 * and criterion replaces the first, so a round cannot accumulate duplicates.
 */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
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

  const record = {
    ...judgment,
    evidence: Array.isArray(judgment.evidence) ? judgment.evidence : [],
  };
  const key = judgmentKey(record);
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
 * PASS, so a clean run cannot hide a surface the AI could not judge.
 */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function judgeCoverage(ledger) {
  const judgments = Array.isArray(ledger?.judgments) ? ledger.judgments : [];
  const obligations = Array.isArray(ledger?.obligations) ? ledger.obligations : [];
  const byStatus = {};
  for (const judgment of judgments) {
    byStatus[judgment.status] = (byStatus[judgment.status] ?? 0) + 1;
  }
  const recorded = new Set(judgments.map(judgmentKey));
  const unrecorded = obligations.filter((obligation) => !recorded.has(judgmentKey(obligation)));
  const notVerifiable = judgments.filter((judgment) => judgment.status === JUDGMENT_STATUS.NOT_VERIFIABLE);

  let verdict = JUDGMENT_STATUS.PASS;
  if (unrecorded.length > 0) verdict = 'INCOMPLETE';
  else if ((byStatus.FAIL ?? 0) > 0) verdict = JUDGMENT_STATUS.FAIL;
  else if (notVerifiable.length > 0) verdict = JUDGMENT_STATUS.NOT_VERIFIABLE;

  return {
    unrecorded,
    byStatus,
    recorded: judgments.length,
    notVerifiable,
    verdict,
  };
}

/** Read the ledger beside the package, or null when it does not exist. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function readLedger({ cwd }) {
  const filePath = path.join(cwd, LEDGER_FILE_NAME);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** Write the ledger beside the package. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function writeLedger({ cwd, ledger }) {
  const filePath = path.join(cwd, LEDGER_FILE_NAME);
  fs.writeFileSync(filePath, JSON.stringify(ledger, null, 2) + '\n');
  return filePath;
}

module.exports = {
  JUDGMENT_STATUS,
  LEDGER_FILE_NAME,
  createLedger,
  judgeCoverage,
  judgmentKey,
  readLedger,
  recordJudgment,
  writeLedger,
};
