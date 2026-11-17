'use strict';

// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
/**
 * PX-437 C001/C002 — measured convergence and no baseline absorption.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  isConverged,
  recordRun,
  validateDisposition,
  expiredDeferrals,
  readState,
} = require('../../.claude/scripts/tickets/lib/omission-convergence.js');

/** A state that satisfies every v3 convergence condition. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function convergedState() {
  return {
    remainder: 0,
    expiredDeferred: 0,
    unclassified: 0,
    debt: { before: 1, after: 1 },
    runs: [
      { inventoryDigest: 'i', coverageDigest: 'c' },
      { inventoryDigest: 'i', coverageDigest: 'c' },
    ],
    newTickets: 0,
  };
}

test('C001: remainder zero converges; any unresolved remainder does not', () => {
  assert.equal(isConverged(convergedState()), true);
  assert.equal(isConverged({ ...convergedState(), remainder: 1 }), false);
});

test('C001: expired deferral, unclassified clause and debt increase block convergence', () => {
  assert.equal(isConverged({ ...convergedState(), expiredDeferred: 1 }), false);
  assert.equal(isConverged({ ...convergedState(), unclassified: 1 }), false);
  assert.equal(isConverged({ ...convergedState(), debt: { before: 1, after: 2 } }), false);
});

test('C001: two runs must share inventory and coverage digests', () => {
  const state = convergedState();
  state.runs = [{ inventoryDigest: 'i', coverageDigest: 'c' }, { inventoryDigest: 'i2', coverageDigest: 'c' }];
  assert.equal(isConverged(state), false);

  state.runs = [{ inventoryDigest: 'i', coverageDigest: 'c' }, { inventoryDigest: 'i', coverageDigest: 'c2' }];
  assert.equal(isConverged(state), false);
});

test('C001: a new ticket blocks convergence even at remainder zero', () => {
  assert.equal(isConverged({ ...convergedState(), newTickets: 1 }), false);
});

test('C002: a ticketed must-fix finding is never absorbed into baseline', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'px437-convergence-'));
  try {
    const state = recordRun({
      cwd,
      report: { findings: [{ stableKey: 'k', class: 'must-fix' }], digest: 'd' },
      newTickets: 0,
      ticketedKeys: ['k'],
      coverage: { remainder: { remainder: 1, debt: 0, notApplicable: 0, structural: 0 }, inventoryDigest: 'i', coverageDigest: 'c' },
    });

    assert.equal(state.baseline.includes('k'), false);
    assert.equal(state.runs.at(-1).remainder, 1);
    assert.equal(readState({ cwd }).baseline.includes('k'), false);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C001: two covered runs with stable digests converge after a ticketed finding', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'px437-convergence-'));
  try {
    recordRun({ cwd, report: { findings: [], digest: 'd' }, newTickets: 0, coverage: { remainder: { remainder: 0, debt: 0, notApplicable: 0, structural: 0 }, inventoryDigest: 'i', coverageDigest: 'c' } });
    const second = recordRun({ cwd, report: { findings: [], digest: 'd' }, newTickets: 0, coverage: { remainder: { remainder: 0, debt: 0, notApplicable: 0, structural: 0 }, inventoryDigest: 'i', coverageDigest: 'c' } });
    const latest = second.runs.at(-1);

    assert.equal(isConverged({
      remainder: latest.remainder,
      expiredDeferred: latest.expiredDeferred,
      unclassified: latest.unclassified,
      debt: latest.debt,
      runs: second.runs,
      newTickets: 0,
    }), true);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C001: NOT_APPLICABLE_VERIFIED requires rule, normative source and resolving evidence', () => {
  assert.equal(validateDisposition({ status: 'NOT_APPLICABLE_VERIFIED', ruleId: 'r1', normativeSource: 's', evidence: [{ artifact: 'a' }] }).ok, true);
  assert.equal(validateDisposition({ status: 'NOT_APPLICABLE_VERIFIED', ruleId: 'r1', normativeSource: 's', evidence: [] }).ok, false);
  assert.equal(validateDisposition({ status: 'NOT_APPLICABLE_VERIFIED', normativeSource: 's', evidence: [{ artifact: 'a' }] }).code, 'NOT_APPLICABLE_UNVERIFIED');
});

test('C001: DEFERRED requires owner, reason, normative source and expiry', () => {
  assert.equal(validateDisposition({ status: 'DEFERRED', owner: 'P1-1', reason: 'r', normativeSource: 's', createdAt: '2026-01-01', expiresAt: '2027-01-01' }).ok, true);
  assert.equal(validateDisposition({ status: 'DEFERRED', reason: 'r', normativeSource: 's', createdAt: '2026-01-01', expiresAt: '2027-01-01' }).ok, false);
  assert.equal(validateDisposition({ status: 'DEFERRED', owner: 'P1-1', reason: 'r', normativeSource: 's', createdAt: '2026-01-01' }).code, 'DEFERRED_INVALID');
});

test('C001: expired deferrals are the ones whose expiry is not in the future', () => {
  const now = new Date('2026-11-17T00:00:00Z');
  const expired = expiredDeferrals([
    { key: 'a', status: 'DEFERRED', expiresAt: '2026-11-16T00:00:00Z' },
    { key: 'b', status: 'DEFERRED', expiresAt: '2026-11-18T00:00:00Z' },
    { key: 'c', status: 'NOT_APPLICABLE_VERIFIED' },
  ], now);

  assert.deepEqual(expired.map((entry) => entry.key), ['a']);
});
