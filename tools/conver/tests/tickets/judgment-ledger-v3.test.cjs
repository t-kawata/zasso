'use strict';

// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
/**
 * PX-437 C001/C003/C005 — per-clause judgment ledger with proof-bound evidence.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  createLedger,
  recordJudgment,
  judgeCoverage,
} = require('../../.claude/scripts/tickets/lib/judgment-ledger.js');

const KEY = 'clause|pkg-alpha|C001|precondition|abcdef0123456789';

/** A ledger with one clause obligation. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function ledgerOf() {
  return createLedger({ obligations: [{ obligationKey: KEY, surface: 'contract-clause', criterion: 'B', detector: 'violation-detection' }] });
}

/** A fresh proof for the mapped test. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function contextOf(overrides = {}) {
  return {
    applicability: 'TESTABLE',
    testIndex: { tests: [{ id: 't', digest: 'sha256:test', ignored: false }] },
    proof: { status: 'PROVEN', verifiedAt: '2026-11-17T00:00:00Z', digests: { test: 'sha256:test' } },
    ...overrides,
  };
}

test('C001: a PASS on a TESTABLE clause without a proof is refused as EVIDENCE_UNPROVEN', () => {
  const result = recordJudgment(ledgerOf(), { obligationKey: KEY, criterion: 'B', status: 'PASS', evidence: [{ file: 'a.js' }], normativeSource: 's' }, contextOf({ proof: null }));

  assert.equal(result.ok, false);
  assert.equal(result.code, 'EVIDENCE_UNPROVEN');
});

test('C001: a PASS with a fresh proof is accepted', () => {
  const result = recordJudgment(ledgerOf(), { obligationKey: KEY, criterion: 'B', status: 'PASS', evidence: [{ file: 'a.js', test: 't' }], normativeSource: 's' }, contextOf());

  assert.equal(result.ok, true);
  assert.equal(result.judgment.obligationKey, KEY);
});

test('C001: an ignored mapped test cannot prove a PASS', () => {
  const context = contextOf({ testIndex: { tests: [{ id: 't', digest: 'sha256:test', ignored: true }] } });
  const result = recordJudgment(ledgerOf(), { obligationKey: KEY, criterion: 'B', status: 'PASS', evidence: [{ file: 'a.js', test: 't' }], normativeSource: 's' }, context);

  assert.equal(result.ok, false);
  assert.equal(result.code, 'TEST_IGNORED');
});

test('C001: a missing evidence file is EVIDENCE_UNRESOLVED', () => {
  const result = recordJudgment(ledgerOf(), { obligationKey: KEY, criterion: 'B', status: 'PASS', evidence: [{ file: 'missing.js', test: 't' }], normativeSource: 's' }, contextOf({ exists: () => false }));

  assert.equal(result.ok, false);
  assert.equal(result.code, 'EVIDENCE_UNRESOLVED');
});

test('C005: NOT_VERIFIABLE routes to the repair ladder and never remains terminal', () => {
  const result = recordJudgment(ledgerOf(), { obligationKey: KEY, criterion: 'B', status: 'NOT_VERIFIABLE', reason: 'runner unavailable' }, contextOf());

  assert.equal(result.ok, true);
  assert.equal(result.route, 'repair');
});

test('C001: judgeCoverage returns a remainder of unrecorded obligations', () => {
  const ledger = ledgerOf();
  recordJudgment(ledger, { obligationKey: KEY, criterion: 'B', status: 'PASS', evidence: [{ file: 'a.js', test: 't' }], normativeSource: 's' }, contextOf());
  const coverage = judgeCoverage(ledger);

  assert.equal(coverage.remainder, 0);
  assert.equal(coverage.verdict, 'PASS');
});
