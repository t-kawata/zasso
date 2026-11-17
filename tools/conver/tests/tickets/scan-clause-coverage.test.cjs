'use strict';

/**
 * PX-436 C001/C005 — coverage map and remainder arithmetic.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateClause,
  computeRemainder,
  scanClauseCoverage,
} = require('../../.claude/scripts/tickets/lib/coverage-map.js');

/** A test index with one mapped, one ignored and one missing test. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function indexOf() {
  return {
    version: 1,
    digest: 'sha256:index',
    tests: [
      { id: 'alpha_saves', file: 'alpha.rs', digest: 'sha256:alpha', ignored: false, annotations: ['verifies:clause|pkg-alpha|C001|precondition|abcdef0123456789'] },
      { id: 'alpha_ignored', file: 'alpha.rs', digest: 'sha256:alpha-ignored', ignored: true, annotations: ['verifies:clause|pkg-alpha|C001|precondition|abcdef0123456789'] },
    ],
  };
}

/** A clause matching the mapped annotation. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function clauseOf(key = 'clause|pkg-alpha|C001|precondition|abcdef0123456789') {
  return { key, contractId: 'C001', element: 'precondition', applicability: 'TESTABLE' };
}

/** A fresh proof bound to the mapped test digest. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function proofOf(testDigest = 'sha256:alpha') {
  return {
    kind: 'mutation',
    status: 'PROVEN',
    verifiedAt: '2026-11-17T00:00:00Z',
    digests: { source: 'sha256:source', test: testDigest, command: 'sha256:command' },
  };
}

test('C001: a clause with no applicability is CLAUSE_UNCLASSIFIED', () => {
  const clause = { key: 'clause|pkg-alpha|C001|precondition|abcdef0123456789', contractId: 'C001', element: 'precondition' };
  const result = evaluateClause({ clause, testIndex: indexOf(), coverageEntry: null });

  assert.equal(result.status, 'UNCLASSIFIED');
  assert.equal(result.findings[0].code, 'CLAUSE_UNCLASSIFIED');
});

test('C001: a clause with no mapped test is CLAUSE_UNMAPPED', () => {
  const result = evaluateClause({ clause: clauseOf('clause|pkg-alpha|C001|invariant|ffffffffffffffff'), testIndex: indexOf(), coverageEntry: null });
  assert.equal(result.status, 'UNMAPPED');
  assert.equal(result.findings[0].code, 'CLAUSE_UNMAPPED');
});

test('C001: a contract-level annotation covers no clause', () => {
  const index = { ...indexOf(), tests: [{ id: 'broad', file: 'a.rs', digest: 'sha256:broad', ignored: false, annotations: ['verifies:C001'] }] };
  const result = evaluateClause({ clause: clauseOf(), testIndex: index, coverageEntry: null });
  assert.equal(result.status, 'UNMAPPED');
});

test('C001: a clause-level annotation covers exactly one clause', () => {
  const result = evaluateClause({ clause: clauseOf(), testIndex: indexOf(), coverageEntry: null });
  assert.equal(result.tests.length, 2);
});

test('C001: an ignored mapped test is TEST_IGNORED', () => {
  const index = { ...indexOf(), tests: [indexOf().tests[1]] };
  const result = evaluateClause({ clause: clauseOf(), testIndex: index, coverageEntry: null });
  assert.equal(result.status, 'TEST_IGNORED');
  assert.equal(result.findings.some((finding) => finding.code === 'TEST_IGNORED'), true);
});

test('C001: a mapped test absent from the index is TEST_MISSING', () => {
  const coverageEntry = { key: clauseOf().key, tests: [{ id: 'gone' }], applicability: 'TESTABLE' };
  const result = evaluateClause({ clause: clauseOf(), testIndex: indexOf(), coverageEntry });
  assert.equal(result.status, 'TEST_MISSING');
});

test('C005: a mapped test with no proof is CLAUSE_PROOF_MISSING', () => {
  const result = evaluateClause({ clause: clauseOf(), testIndex: indexOf(), coverageEntry: { key: clauseOf().key, tests: [{ id: 'alpha_saves' }], applicability: 'TESTABLE' } });
  assert.equal(result.status, 'CLAUSE_PROOF_MISSING');
  assert.equal(result.findings.some((finding) => finding.code === 'CLAUSE_PROOF_MISSING'), true);
});

test('C005: a mapped test with a fresh proof is PROVEN', () => {
  const result = evaluateClause({ clause: clauseOf(), testIndex: indexOf(), coverageEntry: { key: clauseOf().key, tests: [{ id: 'alpha_saves' }], proof: proofOf(), applicability: 'TESTABLE' } });
  assert.equal(result.status, 'PROVEN');
  assert.deepEqual(result.findings, []);
});

test('C005: a proof bound to a different test digest is CLAUSE_PROOF_STALE', () => {
  const result = evaluateClause({ clause: clauseOf(), testIndex: indexOf(), coverageEntry: { key: clauseOf().key, tests: [{ id: 'alpha_saves' }], proof: proofOf('sha256:changed'), applicability: 'TESTABLE' } });
  assert.equal(result.status, 'CLAUSE_PROOF_STALE');
});

test('C005: a failed or unstable proof is never PROVEN', () => {
  const failed = evaluateClause({ clause: clauseOf(), testIndex: indexOf(), coverageEntry: { key: clauseOf().key, tests: [{ id: 'alpha_saves' }], proof: { ...proofOf(), status: 'CLAUSE_PROOF_FAILED' }, applicability: 'TESTABLE' } });
  const unstable = evaluateClause({ clause: clauseOf(), testIndex: indexOf(), coverageEntry: { key: clauseOf().key, tests: [{ id: 'alpha_saves' }], proof: { ...proofOf(), status: 'UNSTABLE' }, applicability: 'TESTABLE' } });
  assert.equal(failed.status, 'CLAUSE_PROOF_FAILED');
  assert.equal(unstable.status, 'UNSTABLE');
});

test('C001: remainder counts unresolved clauses plus structural findings once each', () => {
  const clauses = [
    { key: 'a', status: 'PROVEN' },
    { key: 'b', status: 'UNMAPPED' },
    { key: 'c', status: 'CLAUSE_PROOF_MISSING' },
    { key: 'd', status: 'NOT_APPLICABLE_VERIFIED' },
    { key: 'e', status: 'DEFERRED', disposition: { expiresAt: '2099-01-01T00:00:00Z' } },
    { key: 'f', status: 'DEFERRED', disposition: { expiresAt: '2000-01-01T00:00:00Z' } },
    { key: 'g', status: 'UNCLASSIFIED' },
  ];
  const remainder = computeRemainder({ clauses, conflicts: [{ keys: ['h'] }], duplicateOwners: [{ key: 'i' }], now: new Date('2026-11-17T00:00:00Z') });

  assert.equal(remainder.unresolved, 4);
  assert.equal(remainder.structural, 2);
  assert.equal(remainder.remainder, 6);
  assert.equal(remainder.debt, 1);
  assert.equal(remainder.notApplicable, 1);
  assert.equal(remainder.expiredDeferred, 1);
});

test('C001: a digest change invalidates the coverage binding', () => {
  const inventory = { digest: 'sha256:inventory-new', clauses: [clauseOf()], conflicts: [] };
  const result = scanClauseCoverage({ inventory, testIndex: indexOf(), coverage: { version: 1, inventoryDigest: 'sha256:inventory-old', testIndexDigest: indexOf().digest, clauses: [{ key: clauseOf().key, tests: [{ id: 'alpha_saves' }], proof: proofOf(), applicability: 'TESTABLE' }] } });

  assert.equal(result.bindingValid, false);
  assert.equal(result.findings.some((finding) => finding.code === 'INVENTORY_DIGEST_MISMATCH'), true);
});

test('C001: scan writes a remainder and never a text-matching verdict', () => {
  const inventory = { digest: 'sha256:inventory', clauses: [clauseOf()], conflicts: [] };
  const result = scanClauseCoverage({ inventory, testIndex: indexOf(), coverage: { version: 1, inventoryDigest: inventory.digest, testIndexDigest: indexOf().digest, clauses: [{ key: clauseOf().key, tests: [{ id: 'alpha_saves' }], proof: proofOf(), applicability: 'TESTABLE' }] } });

  assert.equal(result.bindingValid, true);
  assert.equal(result.coverage.clauses[0].status, 'PROVEN');
  assert.equal(result.coverage.remainder.remainder, 0);
});
