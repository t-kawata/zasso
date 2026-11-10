// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
'use strict';

/**
 * PX-406 — stable finding identity and the finite convergence predicate.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  FINDING_CLASS,
  stableFindingKey,
  classifyFinding,
  isConverged,
  debtDelta,
} = require('../../.claude/scripts/tickets/lib/omission-convergence.js');

// @verifies C004
test('C004: the stable key ignores line numbers and observation order', () => {
  const first = { surface: 'contract', assetId: 'C001', criterion: 'B', code: 'CONTRACT_CLAUSE_UNTESTED', line: 10 };
  const second = { ...first, line: 99, problem: 'a different message' };

  assert.equal(stableFindingKey(first), stableFindingKey(second));
});

// @verifies C004
test('C004: only a normative finding is must-fix; an unsourced observation is improvement backlog', () => {
  const finding = { surface: 'contract', assetId: 'C001', criterion: 'B', code: 'X', severity: 'high' };

  assert.equal(classifyFinding({ ...finding, normativeSource: 'contract:C001' }), FINDING_CLASS.MUST_FIX);
  assert.equal(classifyFinding({ ...finding, normativeSource: null }), FINDING_CLASS.IMPROVEMENT_BACKLOG);
  assert.equal(
    classifyFinding({ ...finding, normativeSource: 'contract:C001', justification: 'not required by the canon', outOfScope: true }),
    FINDING_CLASS.OUT_OF_SCOPE,
  );
});

// @verifies C004
test('C004: convergence requires every surface adjudicated, no unticketed must-fix, non-increasing debt, two identical runs and no new ticket', () => {
  const state = {
    unrecorded: [],
    unticketedMustFix: [],
    debt: { before: 2, after: 2 },
    runs: [{ digest: 'd' }, { digest: 'd' }],
    newTickets: 0,
  };

  assert.equal(isConverged(state), true);
  assert.equal(isConverged({ ...state, unrecorded: [{ surface: 'contract' }] }), false);
  assert.equal(isConverged({ ...state, unticketedMustFix: [{ surface: 'contract' }] }), false);
  assert.equal(isConverged({ ...state, debt: { before: 2, after: 3 } }), false);
  assert.equal(isConverged({ ...state, runs: [{ digest: 'a' }, { digest: 'b' }] }), false);
  assert.equal(isConverged({ ...state, newTickets: 1 }), false);
});

// @verifies C004
test('C004: debtDelta reports the direction of the debt change', () => {
  assert.equal(debtDelta({ before: 2, after: 2 }), 0);
  assert.equal(debtDelta({ before: 2, after: 3 }), 1);
  assert.equal(debtDelta({ before: 3, after: 2 }), -1);
});
