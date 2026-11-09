'use strict';
// PX-397 @verifies C001

/**
 * PX-397 — the shared finding schema.
 *
 * A finding is the only shape a gate may emit: it names the broken asset, the
 * problem, an executable repair and the rerun that proves the repair. A gate
 * that cannot name a repair has a defect, not a reason to stop the pipeline.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  createFinding,
  validateFinding,
  findingIdentity,
  findingsDigest,
  stableStringify,
  GateFindingError,
} = require('../../.claude/scripts/tickets/lib/gate-finding.js');

/** A complete finding input with optional overrides. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function completeInput(overrides = {}) {
  return {
    code: 'CONTRACT_TEST_MISSING',
    asset: 'PX-1/C001',
    problem: 'contract C001 has no @verifies test',
    fixes: [{
      tool: 'insert-verifies',
      input: { file: 'tests/a.test.cjs', line: 1, contractId: 'C001' },
    }],
    rerun: 'node .claude/scripts/tickets/verify-plan-contracts.js --ticket-key=PX-1 --tickets=Tickets.json',
    ...overrides,
  };
}

test('C001: a complete finding is accepted and frozen', () => {
  const finding = createFinding(completeInput());

  assert.equal(finding.code, 'CONTRACT_TEST_MISSING');
  assert.equal(finding.asset, 'PX-1/C001');
  assert.deepEqual(finding.fixes, completeInput().fixes);
  assert.ok(Object.isFrozen(finding));
  assert.ok(Object.isFrozen(finding.fixes));
  assert.deepEqual(validateFinding(finding), { ok: true, problems: [] });
});

test('C001: a finding without fix or rerun is rejected as a gate defect', () => {
  assert.throws(
    () => createFinding(completeInput({ fixes: [] })),
    (error) => error instanceof GateFindingError && error.code === 'GATE_FINDING_INCOMPLETE',
  );
  assert.throws(
    () => createFinding(completeInput({ rerun: '   ' })),
    (error) => error.code === 'GATE_FINDING_INCOMPLETE',
  );

  const verdict = validateFinding({
    code: 'X',
    asset: 'a',
    problem: 'p',
    fixes: [{ tool: 'patch-ticket', input: {} }],
  });
  assert.equal(verdict.ok, false);
  assert.match(verdict.problems.join(' '), /rerun/);
});

test('C001: a fix without a tool or input is rejected', () => {
  const withoutTool = validateFinding(completeInput({ fixes: [{ input: {} }] }));
  assert.equal(withoutTool.ok, false);
  assert.match(withoutTool.problems.join(' '), /fixes\[0\]\.tool/);

  const withoutInput = validateFinding(completeInput({ fixes: [{ tool: 'patch-ticket' }] }));
  assert.equal(withoutInput.ok, false);
  assert.match(withoutInput.problems.join(' '), /fixes\[0\]\.input/);
});

test('C001: identity is stable and independent of fix detail', () => {
  const left = createFinding(completeInput());
  const right = createFinding(completeInput({
    fixes: [{ tool: 'scaffold-test', input: {} }],
    rerun: 'another rerun',
  }));

  assert.equal(findingIdentity(left), findingIdentity(right));
  assert.equal(
    findingIdentity(left),
    'CONTRACT_TEST_MISSING|PX-1/C001|contract C001 has no @verifies test',
  );
});

test('C001: the findings digest is order-independent and stable for the empty set', () => {
  const first = createFinding(completeInput());
  const second = createFinding(completeInput({ code: 'TEST_MISSING', asset: 'PX-1', problem: 'no test' }));

  assert.equal(findingsDigest([first, second]), findingsDigest([second, first]));
  assert.equal(findingsDigest([]), findingsDigest([]));
  assert.match(findingsDigest([]), /^[0-9a-f]{64}$/);
});

test('C001: stable stringify sorts object keys', () => {
  assert.equal(stableStringify({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(stableStringify([{ b: [2, 1], a: 1 }]), '[{"a":1,"b":[2,1]}]');
});
