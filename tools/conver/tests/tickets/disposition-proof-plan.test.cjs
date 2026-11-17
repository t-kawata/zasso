'use strict';

/**
 * PX-441 C003 — an optional TESTABLE proof plan.
 *
 * A TESTABLE disposition may carry the mutation and command that prove the
 * clause. The harness never guesses them; an absent or malformed plan is a
 * repair item, not a proof.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  evidenceDigestOf,
  validateDisposition,
  validateDispositionLedger,
} = require('../../.claude/scripts/tickets/lib/dispositions.js');

const KEY = 'clause|pkg-alpha|C001|precondition|aaaaaaaaaaaaaaaa';

/** A valid TESTABLE disposition with a proof plan. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function dispositionOf(overrides = {}) {
  return {
    key: KEY,
    status: 'TESTABLE',
    proof: {
      mutation: { file: 'alpha.js', find: '=> 1', replace: '=> 2' },
      command: 'node runner.js {test}',
    },
    ...overrides,
  };
}

test('C003 Precondition: a valid TESTABLE proof plan is accepted', () => {
  const findings = validateDisposition({ record: dispositionOf(), rulesById: new Map(), clauseKeys: new Set([KEY]) });
  assert.deepEqual(findings, []);
});

test('C003 Postcondition: a malformed proof plan is a DISPOSITION_PROOF_INVALID finding', () => {
  const missingMutation = validateDisposition({
    record: dispositionOf({ proof: { command: 'node runner.js {test}' } }),
    rulesById: new Map(),
    clauseKeys: new Set([KEY]),
  });
  assert.equal(missingMutation.some((finding) => finding.code === 'DISPOSITION_PROOF_INVALID'), true);

  const emptyFind = validateDisposition({
    record: dispositionOf({ proof: { mutation: { file: 'alpha.js', find: '' }, command: 'node runner.js {test}' } }),
    rulesById: new Map(),
    clauseKeys: new Set([KEY]),
  });
  assert.equal(emptyFind.some((finding) => finding.code === 'DISPOSITION_PROOF_INVALID'), true);
});

test('C003 Invariant: a proof plan on a non-TESTABLE status does not make it TESTABLE work', () => {
  const ledger = {
    version: 1,
    rules: [{ id: 'R-NA', kind: 'not-applicable', normativeSource: 'rule:1' }],
    dispositions: [{
      key: KEY,
      status: 'NOT_APPLICABLE_VERIFIED',
      ruleId: 'R-NA',
      normativeSource: 'rule:1',
      evidence: [{ file: 'docs/rule.md', line: 1 }],
      evidenceDigest: evidenceDigestOf([{ file: 'docs/rule.md', line: 1 }]),
      proof: { mutation: { file: 'alpha.js', find: '=> 1', replace: '=> 2' }, command: 'node runner.js {test}' },
    }],
  };
  const result = validateDispositionLedger({ ledger, clauseKeys: new Set([KEY]) });

  assert.deepEqual(result.findings, []);
  assert.equal(result.dispositions.length, 1);
  assert.equal(result.dispositions[0].status, 'NOT_APPLICABLE_VERIFIED');
});
