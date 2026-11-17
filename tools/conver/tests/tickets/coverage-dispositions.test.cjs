'use strict';

/**
 * PX-440 C002 — verified dispositions in the coverage remainder.
 *
 * A verified non-testable disposition is not proof of a runtime test, but it is
 * a resolved obligation. The remainder counts TESTABLE work only, reports debt
 * and non-applicable clauses separately, and never counts one clause twice.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { computeRemainder, evaluateClause, scanClauseCoverage } = require('../../.claude/scripts/tickets/lib/coverage-map.js');
const { evidenceDigestOf } = require('../../.claude/scripts/tickets/lib/dispositions.js');
const { inputsDigestOf } = require('../../.claude/scripts/tickets/lib/proof-inputs.js');

const NOW = new Date('2026-11-17T00:00:00Z');

/** A canonical clause key for one suffix. */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function keyOf(suffix) {
  return 'clause|pkg-alpha|OBL-' + suffix + '|precondition|' + suffix.padEnd(16, '0');
}

/** A clause with a declared applicability. */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function clauseOf(suffix, applicability) {
  return { key: keyOf(suffix), scope: 'pkg-alpha', contractId: 'OBL-' + suffix, element: 'precondition', text: 'text ' + suffix, applicability };
}

/** A test index with one test mapped to the suffix. */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function indexFor(suffix) {
  const key = keyOf(suffix);
  return {
    version: 1,
    digest: 'sha256:index-' + suffix,
    tests: [{ id: 't-' + suffix, file: 'a.js', name: 't-' + suffix, kind: 'unit', ignored: false, digest: 'sha256:test-' + suffix, annotations: ['verifies:' + key] }],
  };
}

/** A proven coverage entry for the suffix. */
// [::TICKET::] PX-440, PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-440|PX-441) --for-spec --no-implementation-order`.
function proofInputsOf(suffix) {
  return {
    version: 1,
    clauseKey: keyOf(suffix),
    mutationFile: 'a.js',
    mutationFileDigest: 'sha256:source-' + suffix,
    mutationDigest: 'sha256:mutation-' + suffix,
    testId: 't-' + suffix,
    testDigest: 'sha256:test-' + suffix,
    commandTemplate: 'runner {test}',
    commandDigest: 'sha256:command-' + suffix,
    closureScope: 'package',
    closureDigest: 'sha256:closure-' + suffix,
    engineVersion: 2,
    adapterVersion: 1,
    toolchainDigest: 'sha256:toolchain-' + suffix,
  };
}

// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function provenEntry(suffix) {
  const inputs = proofInputsOf(suffix);
  return {
    key: keyOf(suffix),
    tests: [{ id: 't-' + suffix, digest: 'sha256:test-' + suffix }],
    proof: {
      status: 'PROVEN',
      verifiedAt: '2026-11-17T00:00:00Z',
      restored: true,
      inputsVersion: inputs.version,
      inputsDigest: inputsDigestOf(inputs),
      inputs,
      closureScope: inputs.closureScope,
      digests: { source: inputs.mutationFileDigest, test: inputs.testDigest, command: inputs.commandDigest },
    },
    applicability: 'TESTABLE',
  };
}

/** A verified disposition for a non-testable clause. */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function dispositionOf(suffix, status, extra = {}) {
  return {
    key: keyOf(suffix),
    status,
    normativeSource: 'HANDOVER003 5.5',
    evidence: [{ file: 'docs/HANDOVER.md', line: 652 }],
    evidenceDigest: evidenceDigestOf([{ file: 'docs/HANDOVER.md', line: 652 }]),
    ...extra,
  };
}

test('C002 Precondition: a TESTABLE clause with a fresh proof is PROVEN', () => {
  const entry = evaluateClause({
    clause: clauseOf('a', 'TESTABLE'),
    testIndex: indexFor('a'),
    coverageEntry: provenEntry('a'),
    proofInputs: proofInputsOf('a'),
    now: NOW,
  });

  assert.equal(entry.status, 'PROVEN');
  assert.deepEqual(entry.findings, []);
});

test('C002 Postcondition: verified non-testable dispositions are excluded from the blocking remainder', () => {
  const clauses = [
    evaluateClause({ clause: clauseOf('a', 'DESIGN_PREDICATE'), testIndex: indexFor('a'), coverageEntry: null, disposition: dispositionOf('a', 'DESIGN_PREDICATE_VERIFIED', { ruleId: 'R-D', predicate: 'title', command: 'check' }), now: NOW }),
    evaluateClause({ clause: clauseOf('b', 'PROCESS'), testIndex: indexFor('b'), coverageEntry: null, disposition: dispositionOf('b', 'PROCESS_VERIFIED', { ruleId: 'R-P', command: 'check' }), now: NOW }),
    evaluateClause({ clause: clauseOf('c', 'EXTERNAL'), testIndex: indexFor('c'), coverageEntry: null, disposition: dispositionOf('c', 'EXTERNAL_VERIFIED', { ruleId: 'R-E', owner: 'P1-1', reason: 'remote', command: 'check' }), now: NOW }),
    evaluateClause({ clause: clauseOf('d', 'NOT_APPLICABLE'), testIndex: indexFor('d'), coverageEntry: null, disposition: dispositionOf('d', 'NOT_APPLICABLE_VERIFIED', { ruleId: 'R-NA' }), now: NOW }),
  ];

  const remainder = computeRemainder({ clauses, now: NOW });

  assert.equal(remainder.design, 1);
  assert.equal(remainder.process, 1);
  assert.equal(remainder.external, 1);
  assert.equal(remainder.notApplicable, 1);
  assert.equal(remainder.remainder, 0);
});

test('C002 Postcondition: an unexpired DEFERRED is debt, not a blocker; an expired one is unresolved', () => {
  const open = evaluateClause({
    clause: clauseOf('a', 'PROCESS'),
    testIndex: indexFor('a'),
    coverageEntry: null,
    disposition: dispositionOf('a', 'DEFERRED', { owner: 'P1-1', reason: 'later', createdAt: '2026-11-17', expiresAt: '2027-01-01' }),
    now: NOW,
  });
  const expired = evaluateClause({
    clause: clauseOf('b', 'PROCESS'),
    testIndex: indexFor('b'),
    coverageEntry: null,
    disposition: dispositionOf('b', 'DEFERRED', { owner: 'P1-1', reason: 'late', createdAt: '2025-01-01', expiresAt: '2025-02-01' }),
    now: NOW,
  });

  const remainder = computeRemainder({ clauses: [open, expired], now: NOW });

  assert.equal(open.status, 'DEFERRED');
  assert.equal(expired.status, 'DEFERRED_EXPIRED');
  assert.equal(remainder.deferred, 1);
  assert.equal(remainder.debt, 1);
  assert.equal(remainder.expiredDeferred, 1);
  assert.equal(remainder.remainder, 1);
});

test('C002 Postcondition: no declaration is UNCLASSIFIED and blocks', () => {
  const entry = evaluateClause({ clause: clauseOf('a', null), testIndex: indexFor('a'), coverageEntry: null, now: NOW });
  const remainder = computeRemainder({ clauses: [entry], now: NOW });

  assert.equal(entry.status, 'UNCLASSIFIED');
  assert.equal(remainder.unclassified, 1);
  assert.equal(remainder.remainder, 1);
});

test('C002 Postcondition: a bare non-testable applicability without a verified disposition is unverified', () => {
  const entry = evaluateClause({ clause: clauseOf('a', 'DESIGN_PREDICATE'), testIndex: indexFor('a'), coverageEntry: null, now: NOW });

  assert.equal(entry.status, 'CLAUSE_DISPOSITION_UNVERIFIED');
  assert.equal(entry.findings[0].code, 'CLAUSE_DISPOSITION_UNVERIFIED');
});

test('C002 Invariant: a clause covered by a conflict is counted once as structural', () => {
  const entry = evaluateClause({ clause: clauseOf('a', null), testIndex: indexFor('a'), coverageEntry: null, now: NOW });
  const remainder = computeRemainder({
    clauses: [entry],
    conflicts: [{ code: 'CLAUSE_TEXT_CONFLICT', keys: [keyOf('a')] }],
    now: NOW,
  });

  assert.equal(remainder.structural, 1);
  assert.equal(remainder.remainder, 1);
  assert.equal(remainder.unclassified, 1);
});

test('C002 Invariant: two scans over identical inputs produce identical counts', () => {
  const inventory = {
    digest: 'sha256:inventory',
    clauses: [clauseOf('a', 'NOT_APPLICABLE')],
    conflicts: [],
    duplicateOwners: [],
  };
  const testIndex = { version: 1, digest: 'sha256:index', tests: [], findings: [] };
  const coverage = { version: 1, inventoryDigest: 'sha256:inventory', testIndexDigest: 'sha256:index', clauses: [] };
  const dispositions = [dispositionOf('a', 'NOT_APPLICABLE_VERIFIED', { ruleId: 'R-NA' })];

  const first = scanClauseCoverage({ inventory, testIndex, coverage, dispositions, now: NOW });
  const second = scanClauseCoverage({ inventory, testIndex, coverage, dispositions, now: NOW });

  assert.deepEqual(first.remainder, second.remainder);
  assert.equal(first.remainder.remainder, 0);
});
