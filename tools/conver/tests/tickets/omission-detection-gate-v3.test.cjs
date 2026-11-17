'use strict';

// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
/**
 * PX-437 C001/C005 — ordered v3 gates, exit 0|10 and machine counts.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { runDetectionGate } = require('../../.claude/scripts/tickets/omission-detection-gate.js');

const KEY = 'clause|pkg-alpha|C001|precondition|abcdef0123456789';

/** A complete v3 artifact set: one mapped, non-ignored and freshly proved clause. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function completeArtifacts() {
  const inventory = {
    version: 1,
    digest: 'sha256:inventory',
    clauses: [{ key: KEY, contractId: 'C001', element: 'precondition', applicability: 'TESTABLE', owners: ['P1-1'] }],
    conflicts: [],
  };
  const testIndex = {
    version: 1,
    digest: 'sha256:index',
    adapters: [{ id: 'rust', version: 1, language: 'rust' }],
    tests: [{ id: 't', digest: 'sha256:test', ignored: false, annotations: ['verifies:' + KEY] }],
    findings: [],
  };
  const coverage = {
    version: 1,
    inventoryDigest: inventory.digest,
    testIndexDigest: testIndex.digest,
    clauses: [{
      key: KEY,
      status: 'PROVEN',
      applicability: 'TESTABLE',
      tests: [{ id: 't', digest: 'sha256:test' }],
      proof: { status: 'PROVEN', verifiedAt: '2026-11-17T00:00:00Z', digests: { source: 'sha256:source', test: 'sha256:test', command: 'sha256:command' } },
    }],
    remainder: { total: 1, proven: 1, unresolved: 0, structural: 0, remainder: 0, debt: 0, notApplicable: 0, repairs: 0, expiredDeferred: 0, unclassified: 0, unmapped: 0, unproven: 0, staleProof: 0, conflict: 0, duplicateOwner: 0 },
  };
  return { inventory, testIndex, coverage };
}

test('C001: a complete measured package exits 0 and reports machine counts', () => {
  const result = runDetectionGate({ cwd: process.cwd(), v3Artifacts: completeArtifacts() });

  assert.equal(result.exitCode, 0);
  assert.equal(result.complete, true);
  assert.equal(result.gates.every((gate) => gate.ok), true);
  assert.equal(result.counts.remainder, 0);
  assert.equal(result.counts.clauses.total, 1);
  assert.equal(result.counts.clauses.proven, 1);
});

test('C005: a missing proof exits 10 and never stops on a project condition', () => {
  const artifacts = completeArtifacts();
  artifacts.coverage.clauses[0].proof = null;
  artifacts.coverage.clauses[0].status = 'CLAUSE_PROOF_MISSING';
  artifacts.coverage.remainder.remainder = 1;
  artifacts.coverage.remainder.proven = 0;
  artifacts.coverage.remainder.unproven = 1;
  const result = runDetectionGate({ cwd: process.cwd(), v3Artifacts: artifacts });

  assert.equal(result.exitCode, 10);
  assert.equal(result.complete, false);
  assert.equal(result.gates.find((gate) => gate.name === 'proof').ok, false);
  assert.equal(result.gates.find((gate) => gate.name === 'remainder').ok, false);
});

test('C005: a missing inventory is work, never a process failure', () => {
  const result = runDetectionGate({ cwd: process.cwd(), v3Artifacts: { inventory: null, testIndex: null, coverage: null } });

  assert.equal(result.exitCode, 10);
  assert.equal(result.gates.find((gate) => gate.name === 'inventory').ok, false);
  assert.equal(result.gates.find((gate) => gate.name === 'repair').ok, false);
});

test('C001: an expired deferral blocks the debt gate', () => {
  const artifacts = completeArtifacts();
  artifacts.coverage.remainder.expiredDeferred = 1;
  artifacts.coverage.remainder.remainder = 1;
  const result = runDetectionGate({ cwd: process.cwd(), v3Artifacts: artifacts });

  assert.equal(result.exitCode, 10);
  assert.equal(result.gates.find((gate) => gate.name === 'debt').ok, false);
});

test('C001: an open repair blocks completion', () => {
  const result = runDetectionGate({ cwd: process.cwd(), v3Artifacts: completeArtifacts(), repairs: [{ repairKey: 'r', status: 'pending' }] });

  assert.equal(result.exitCode, 10);
  assert.equal(result.gates.find((gate) => gate.name === 'repair').ok, false);
});

test('C005: the gate report exposes the machine count block', () => {
  const result = runDetectionGate({ cwd: process.cwd(), v3Artifacts: completeArtifacts() });

  assert.equal(typeof result.counts.clauses.total, 'number');
  assert.equal(typeof result.counts.debt, 'number');
  assert.equal(typeof result.counts.repairs, 'number');
  assert.equal(result.counts.remainder, 0);
});
