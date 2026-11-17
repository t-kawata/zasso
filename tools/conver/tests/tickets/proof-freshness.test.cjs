'use strict';

/**
 * PX-441 C001/C002 — source-bound proof freshness and per-clause invalidation.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  evaluateClause,
  isProofFresh,
  scanClauseCoverage,
} = require('../../.claude/scripts/tickets/lib/coverage-map.js');
const {
  computeProofInputs,
  inputsDigestOf,
} = require('../../.claude/scripts/tickets/lib/proof-inputs.js');

const KEY = 'clause|pkg-alpha|C001|precondition|aaaaaaaaaaaaaaaa';

/** A package with one implementation and one mapped test. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function world() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'px441-fresh-'));
  fs.writeFileSync(path.join(cwd, 'alpha.js'), 'module.exports = () => 1;\n');
  fs.writeFileSync(path.join(cwd, 'alpha.test.js'), "test('alpha', () => {});\n");
  const adapter = { id: 'typescript', language: 'typescript', runner: 'node runner.js {test}', version: 1, extensions: ['.js'] };
  const testEntry = { id: 'alpha', file: 'alpha.test.js', digest: 'sha256:test-alpha', ignored: false };
  const computed = computeProofInputs({
    cwd,
    clauseKey: KEY,
    mutation: { file: 'alpha.js', find: '=> 1', replace: '=> 2' },
    testEntry,
    adapter,
  });
  const proof = {
    kind: 'mutation',
    status: 'PROVEN',
    verifiedAt: '2026-11-17T00:00:00Z',
    restored: true,
    inputsVersion: computed.inputs.version,
    inputsDigest: computed.inputsDigest,
    inputs: computed.inputs,
    closureScope: computed.inputs.closureScope,
    digests: {
      source: computed.inputs.mutationFileDigest,
      test: computed.inputs.testDigest,
      command: computed.inputs.commandDigest,
    },
  };
  const clause = { key: KEY, contractId: 'C001', element: 'precondition', applicability: 'TESTABLE' };
  const testIndex = { version: 1, digest: 'sha256:index', tests: [{ ...testEntry, name: 'alpha', kind: 'unit', annotations: ['verifies:' + KEY] }] };
  const coverageEntry = { key: KEY, tests: [testEntry], proof, applicability: 'TESTABLE' };
  return { cwd, adapter, testEntry, computed, proof, clause, testIndex, coverageEntry };
}

test('C001 Postcondition: a proof with every input equal is fresh', () => {
  const w = world();
  try {
    assert.equal(isProofFresh({ proof: w.proof, inputs: w.computed.inputs }), true);
    const evaluated = evaluateClause({ clause: w.clause, testIndex: w.testIndex, coverageEntry: w.coverageEntry, proofInputs: w.computed.inputs });
    assert.equal(evaluated.status, 'PROVEN');
    assert.deepEqual(evaluated.findings, []);
  } finally {
    fs.rmSync(w.cwd, { recursive: true, force: true });
  }
});

test('C001 Postcondition: one changed input makes the proof stale', () => {
  const w = world();
  try {
    const fields = ['mutationFileDigest', 'mutationDigest', 'testDigest', 'commandDigest', 'closureDigest', 'toolchainDigest'];
    for (const field of fields) {
      const changed = { ...w.computed.inputs, [field]: 'sha256:changed-' + field };
      assert.equal(isProofFresh({ proof: w.proof, inputs: changed }), false, field);
    }
  } finally {
    fs.rmSync(w.cwd, { recursive: true, force: true });
  }
});

test('C001 Invariant: failed, unstable, unrestored or legacy proofs are never fresh', () => {
  const w = world();
  try {
    assert.equal(isProofFresh({ proof: { ...w.proof, status: 'UNSTABLE' }, inputs: w.computed.inputs }), false);
    assert.equal(isProofFresh({ proof: { ...w.proof, status: 'CLAUSE_PROOF_FAILED' }, inputs: w.computed.inputs }), false);
    assert.equal(isProofFresh({ proof: { ...w.proof, restored: false }, inputs: w.computed.inputs }), false);
    assert.equal(isProofFresh({ proof: { ...w.proof, inputsDigest: undefined }, inputs: w.computed.inputs }), false);
    assert.equal(isProofFresh({ proof: w.proof, inputs: null }), false);
  } finally {
    fs.rmSync(w.cwd, { recursive: true, force: true });
  }
});

test('C001 Invariant: proof verification uses the canonical inputs digest', () => {
  const w = world();
  try {
    const reordered = Object.fromEntries(Object.entries(w.computed.inputs).reverse());
    assert.equal(inputsDigestOf(w.computed.inputs), inputsDigestOf(reordered));
    assert.equal(isProofFresh({ proof: w.proof, inputs: reordered }), true);
  } finally {
    fs.rmSync(w.cwd, { recursive: true, force: true });
  }
});

test('C002 Postcondition: a global digest mismatch does not null an unchanged proof', () => {
  const w = world();
  try {
    const inventory = { digest: 'sha256:inventory-new', clauses: [w.clause], conflicts: [] };
    const testIndex = { ...w.testIndex, digest: 'sha256:index-new' };
    const coverage = {
      version: 1,
      inventoryDigest: 'sha256:inventory-old',
      testIndexDigest: 'sha256:index-old',
      clauses: [w.coverageEntry],
    };
    const proofInputsByKey = new Map([[KEY, w.computed.inputs]]);
    const scan = scanClauseCoverage({ inventory, testIndex, coverage, proofInputsByKey });

    assert.equal(scan.bindingValid, false);
    assert.equal(scan.coverage.clauses[0].status, 'PROVEN');
    assert.notEqual(scan.coverage.clauses[0].proof, null);
    assert.equal(scan.findings.some((finding) => finding.code === 'INVENTORY_DIGEST_MISMATCH'), true);
  } finally {
    fs.rmSync(w.cwd, { recursive: true, force: true });
  }
});

test('C002 Postcondition: changing the mutation target invalidates only that clause', () => {
  const w = world();
  try {
    fs.writeFileSync(path.join(w.cwd, 'alpha.js'), 'module.exports = () => 1; // changed\n');
    const recomputed = computeProofInputs({
      cwd: w.cwd,
      clauseKey: KEY,
      mutation: { file: 'alpha.js', find: '=> 1', replace: '=> 2' },
      testEntry: w.testEntry,
      adapter: w.adapter,
    });
    const inventory = { digest: 'sha256:inventory', clauses: [w.clause], conflicts: [] };
    const scan = scanClauseCoverage({
      inventory,
      testIndex: w.testIndex,
      coverage: { version: 1, inventoryDigest: inventory.digest, testIndexDigest: w.testIndex.digest, clauses: [w.coverageEntry] },
      proofInputsByKey: new Map([[KEY, recomputed.inputs]]),
    });

    assert.equal(scan.coverage.clauses[0].status, 'CLAUSE_PROOF_STALE');
    assert.equal(isProofFresh({ proof: w.proof, inputs: recomputed.inputs }), false);
  } finally {
    fs.rmSync(w.cwd, { recursive: true, force: true });
  }
});

test('C002 Invariant: an unrelated test addition leaves the clause proven', () => {
  const w = world();
  try {
    const inventory = { digest: 'sha256:inventory', clauses: [w.clause], conflicts: [] };
    const testIndex = {
      ...w.testIndex,
      digest: 'sha256:index-with-new-test',
      tests: [...w.testIndex.tests, { id: 'unrelated', file: 'other.test.js', digest: 'sha256:other', ignored: false, annotations: [] }],
    };
    const scan = scanClauseCoverage({
      inventory,
      testIndex,
      coverage: { version: 1, inventoryDigest: inventory.digest, testIndexDigest: 'sha256:index', clauses: [w.coverageEntry] },
      proofInputsByKey: new Map([[KEY, w.computed.inputs]]),
    });

    assert.equal(scan.bindingValid, false);
    assert.equal(scan.coverage.clauses[0].status, 'PROVEN');
  } finally {
    fs.rmSync(w.cwd, { recursive: true, force: true });
  }
});

test('C001 Invariant: a proof without current inputs is stale, never proven', () => {
  const w = world();
  try {
    const evaluated = evaluateClause({ clause: w.clause, testIndex: w.testIndex, coverageEntry: w.coverageEntry, proofInputs: null });
    assert.equal(evaluated.status, 'CLAUSE_PROOF_STALE');
    assert.match(evaluated.findings[0].problem, /proof inputs/);
  } finally {
    fs.rmSync(w.cwd, { recursive: true, force: true });
  }
});
