// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
'use strict';

/**
 * PX-406 — the AI judgment ledger.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  JUDGMENT_STATUS,
  createLedger,
  recordJudgment,
  judgeCoverage,
} = require('../../.claude/scripts/tickets/lib/judgment-ledger.js');

const OBLIGATION = { surface: 'contract', assetId: 'C001', criterion: 'A' };

// @verifies C002
test('C002: an unrecorded obligation is visible, and a recorded PASS clears it', () => {
  const ledger = createLedger({ obligations: [OBLIGATION] });

  assert.equal(judgeCoverage(ledger).unrecorded.length, 1);

  const recorded = recordJudgment(ledger, {
    ...OBLIGATION,
    status: JUDGMENT_STATUS.PASS,
    evidence: [{ file: 'src/a.js', line: 1 }],
    normativeSource: 'contract:C001',
  });

  assert.equal(recorded.ok, true);
  assert.deepEqual(judgeCoverage(ledger).unrecorded, []);
});

// @verifies C002
test('C002: a judgment without a normative source is refused', () => {
  const ledger = createLedger({ obligations: [OBLIGATION] });

  const result = recordJudgment(ledger, {
    ...OBLIGATION,
    status: JUDGMENT_STATUS.PASS,
    evidence: [{ file: 'src/a.js', line: 1 }],
    normativeSource: null,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'NORMATIVE_SOURCE_MISSING');
});

// @verifies C002
test('C002: NOT_VERIFIABLE is recorded but never counts as PASS', () => {
  const ledger = createLedger({ obligations: [OBLIGATION] });

  const result = recordJudgment(ledger, {
    ...OBLIGATION,
    status: JUDGMENT_STATUS.NOT_VERIFIABLE,
    evidence: [],
    normativeSource: 'contract:C001',
    reason: 'the provider package is absent in this fixture',
  });

  assert.equal(result.ok, true);
  const coverage = judgeCoverage(ledger);
  assert.equal(coverage.byStatus.NOT_VERIFIABLE, 1);
  assert.notEqual(coverage.verdict, JUDGMENT_STATUS.PASS);
});

// @verifies C002
test('C002: a judgment is keyed by surface, asset and criterion, not by message', () => {
  const ledger = createLedger({ obligations: [OBLIGATION] });

  recordJudgment(ledger, {
    ...OBLIGATION,
    status: JUDGMENT_STATUS.PASS,
    evidence: [{ file: 'src/a.js', line: 1 }],
    normativeSource: 'contract:C001',
  });
  recordJudgment(ledger, {
    ...OBLIGATION,
    status: JUDGMENT_STATUS.FAIL,
    evidence: [{ file: 'src/a.js', line: 9 }],
    normativeSource: 'contract:C001',
    problem: 'the second observation replaces the first',
  });

  const coverage = judgeCoverage(ledger);
  assert.equal(coverage.recorded, 1);
  assert.equal(coverage.byStatus.FAIL, 1);
  assert.equal(coverage.byStatus.PASS, undefined);
});
