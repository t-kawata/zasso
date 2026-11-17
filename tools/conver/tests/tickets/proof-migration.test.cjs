'use strict';

/**
 * PX-442 C003/C004/C005/C007/C010 — legacy artifact migration.
 *
 * A v1 proof is adopted only on an exact input match; a harness-artifact
 * mutation is dropped; a v1 judgment is bound only when its evidence predates
 * the ledger enumeration; a stored proof command survives an adapter change.
 *
 * @verifies C003
 * @verifies C004
 * @verifies C005
 * @verifies C007
 * @verifies C010
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  adoptLegacyProof,
  bindLegacyJudgment,
  classifyMutationTarget,
  migrateArtifacts,
} = require('../../.claude/scripts/tickets/lib/proof-migration.js');
const { isProofFresh } = require('../../.claude/scripts/tickets/lib/coverage-map.js');
const { resolveProofPlan } = require('../../.claude/scripts/tickets/lib/proof-plan.js');
const {
  computeProofInputs,
  fileDigestOf,
  sha256Of,
} = require('../../.claude/scripts/tickets/lib/proof-inputs.js');
const { judgeCoverage } = require('../../.claude/scripts/tickets/lib/judgment-ledger.js');
const { sha256 } = require('../../.claude/scripts/tickets/lib/adapters/helpers.js');

const KEY = 'clause|pkg-alpha|C001|precondition|0000000000000001';
const KEY2 = 'clause|pkg-alpha|C002|precondition|0000000000000002';
const ADAPTER = Object.freeze({
  id: 'fixture',
  version: 1,
  language: 'javascript',
  runner: 'node runner.js {test}',
  extensions: ['.js'],
});

/** A minimal package with one mutable source file. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function writePackage() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'px442-migrate-'));
  fs.writeFileSync(path.join(cwd, 'impl.js'), 'module.exports = { alpha: () => 1 };\n');
  fs.writeFileSync(path.join(cwd, 'runner.js'), "process.stdout.write('FAIL alpha\\n');\n");
  fs.writeFileSync(path.join(cwd, 'Tickets.json'), JSON.stringify({ title: 'fixture', phases: [] }) + '\n');
  fs.mkdirSync(path.join(cwd, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'docs/EVIDENCE.md'), 'evidence\n');
  return cwd;
}

/** The digest build-test-index assigns to one declared test. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function testDigestOf(cwd, testId) {
  return sha256(fs.readFileSync(path.join(cwd, 'impl.js'), 'utf8') + '\n' + testId);
}

/** A v1 proof without inputs. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function legacyProofOf({ cwd, clauseKey = KEY, mutation, command, testId = 'alpha' }) {
  return {
    kind: 'mutation',
    status: 'PROVEN',
    clauseKey,
    mutation,
    command,
    expected: { test: testId, outcome: 'fail' },
    observed: { exitCode: 1, failingTests: [testId] },
    digests: {
      source: fileDigestOf({ cwd, file: mutation.file }),
      test: testDigestOf(cwd, testId),
      command: sha256Of(command),
    },
    verifiedAt: '2026-11-17T00:00:00Z',
    restored: true,
  };
}

/** A coverage entry with one mapped test. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function coverageEntryOf({ cwd, key = KEY, proof, testId = 'alpha' }) {
  return {
    key,
    tests: [{ id: testId, file: 'impl.js', name: testId, kind: 'unit', ignored: false, digest: testDigestOf(cwd, testId) }],
    proof,
    applicability: 'TESTABLE',
  };
}

/** A stable mutation on impl.js. */
const STABLE_MUTATION = Object.freeze({ file: 'impl.js', find: '() => 1', replace: '() => 2' });

test('C003: harness artifacts are unstable mutation targets; a source file is stable', () => {
  assert.equal(classifyMutationTarget({ file: 'Tickets.json' }), 'UNSTABLE_PROOF_TARGET');
  assert.equal(classifyMutationTarget({ file: 'OMISSION-REPAIRS.json' }), 'UNSTABLE_PROOF_TARGET');
  assert.equal(classifyMutationTarget({ file: 'CONVER-report.json' }), 'UNSTABLE_PROOF_TARGET');
  assert.equal(classifyMutationTarget({ file: '_tmp-omissions-1.json' }), 'UNSTABLE_PROOF_TARGET');
  assert.equal(classifyMutationTarget({ file: 'CONVER-utils.js' }), 'STABLE_PROOF_TARGET');
  assert.equal(classifyMutationTarget({ file: 'src/lib.rs' }), 'STABLE_PROOF_TARGET');
});

test('C004 Postcondition: a matching v1 proof is adopted once and isProofFresh is true', () => {
  const cwd = writePackage();
  try {
    const proof = legacyProofOf({ cwd, mutation: STABLE_MUTATION, command: 'node runner.js alpha' });
    const coverageEntry = coverageEntryOf({ cwd, proof });

    const adopted = adoptLegacyProof({ cwd, clauseKey: KEY, coverageEntry, proof, adapter: ADAPTER });

    assert.equal(adopted.ok, true);
    assert.equal(adopted.alreadyAdopted, undefined);
    assert.equal(adopted.proof.inputsVersion, 1);
    assert.equal(adopted.proof.closureScope, 'package');
    assert.equal(typeof adopted.proof.inputsDigest, 'string');
    assert.equal(typeof adopted.proof.legacyAdoptedAt, 'string');
    assert.equal(isProofFresh({ proof: adopted.proof, inputs: adopted.proof.inputs }), true);

    const again = adoptLegacyProof({ cwd, clauseKey: KEY, coverageEntry, proof: adopted.proof, adapter: ADAPTER });
    assert.equal(again.ok, true);
    assert.equal(again.alreadyAdopted, true);
    assert.equal(JSON.stringify(again.proof), JSON.stringify(adopted.proof));
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C004 Invariant: a source, test, command or restore mismatch prevents adoption', () => {
  const cwd = writePackage();
  try {
    const proof = legacyProofOf({ cwd, mutation: STABLE_MUTATION, command: 'node runner.js alpha' });
    const coverageEntry = coverageEntryOf({ cwd, proof });

    const sourceMismatch = adoptLegacyProof({
      cwd, clauseKey: KEY, coverageEntry,
      proof: { ...proof, digests: { ...proof.digests, source: 'sha256:changed' } }, adapter: ADAPTER,
    });
    assert.equal(sourceMismatch.ok, false);
    assert.equal(sourceMismatch.code, 'LEGACY_SOURCE_CHANGED');

    const testMismatch = adoptLegacyProof({
      cwd, clauseKey: KEY, coverageEntry,
      proof: { ...proof, digests: { ...proof.digests, test: 'sha256:changed' } }, adapter: ADAPTER,
    });
    assert.equal(testMismatch.ok, false);
    assert.equal(testMismatch.code, 'LEGACY_TEST_CHANGED');

    const commandMismatch = adoptLegacyProof({
      cwd, clauseKey: KEY, coverageEntry,
      proof: { ...proof, digests: { ...proof.digests, command: 'sha256:changed' } }, adapter: ADAPTER,
    });
    assert.equal(commandMismatch.ok, false);
    assert.equal(commandMismatch.code, 'LEGACY_COMMAND_CHANGED');

    const notRestored = adoptLegacyProof({
      cwd, clauseKey: KEY, coverageEntry, proof: { ...proof, restored: false }, adapter: ADAPTER,
    });
    assert.equal(notRestored.ok, false);
    assert.equal(notRestored.code, 'LEGACY_RESTORE_FAILED');

    const unstable = adoptLegacyProof({
      cwd, clauseKey: KEY2,
      coverageEntry: coverageEntryOf({ cwd, key: KEY2, proof: null }),
      proof: legacyProofOf({ cwd, clauseKey: KEY2, mutation: { file: 'Tickets.json', find: 'fixture', replace: 'x' }, command: 'node runner.js alpha' }),
      adapter: ADAPTER,
    });
    assert.equal(unstable.ok, false);
    assert.equal(unstable.code, 'UNSTABLE_PROOF_TARGET');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C004 Invariant: a lockfile newer than verifiedAt prevents adoption', () => {
  const cwd = writePackage();
  try {
    fs.writeFileSync(path.join(cwd, 'package-lock.json'), '{}\n');
    const proof = { ...legacyProofOf({ cwd, mutation: STABLE_MUTATION, command: 'node runner.js alpha' }), verifiedAt: '2000-01-01T00:00:00Z' };
    const result = adoptLegacyProof({ cwd, clauseKey: KEY, coverageEntry: coverageEntryOf({ cwd, proof }), proof, adapter: ADAPTER });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'LEGACY_TOOLCHAIN_CHANGED');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C005 Postcondition: a v1 judgment binds to evidence older than the enumeration and judgeCoverage reuses it', () => {
  const cwd = writePackage();
  try {
    const judgment = {
      surface: 'contract',
      assetId: 'C001',
      criterion: 'A',
      status: 'PASS',
      evidence: [{ file: 'docs/EVIDENCE.md', line: 1 }],
      normativeSource: 'contract:C001',
    };

    const bound = bindLegacyJudgment({ judgment, cwd, enumerationAt: '2999-01-01T00:00:00Z' });

    assert.equal(bound.ok, true);
    assert.equal(bound.judgment.evidence[0].fileDigest.startsWith('sha256:'), true);
    assert.equal(typeof bound.judgment.evidenceDigest, 'string');
    assert.equal(typeof bound.judgment.legacyBoundAt, 'string');

    const coverage = judgeCoverage({
      version: 1,
      enumeration: { obligations: 1, at: '2999-01-01T00:00:00Z' },
      obligations: [judgment],
      judgments: [bound.judgment],
    }, { cwd });
    assert.equal(coverage.recorded, 1);
    assert.deepEqual(coverage.invalid, []);
    assert.deepEqual(coverage.stale, []);

    const again = bindLegacyJudgment({ judgment: bound.judgment, cwd, enumerationAt: '2999-01-01T00:00:00Z' });
    assert.equal(again.ok, true);
    assert.equal(again.alreadyBound, true);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C005 Invariant: newer or missing evidence is never bound', () => {
  const cwd = writePackage();
  try {
    const judgment = {
      surface: 'contract',
      assetId: 'C001',
      criterion: 'A',
      status: 'PASS',
      evidence: [{ file: 'docs/EVIDENCE.md', line: 1 }],
      normativeSource: 'contract:C001',
    };

    const newer = bindLegacyJudgment({ judgment, cwd, enumerationAt: '2000-01-01T00:00:00Z' });
    assert.equal(newer.ok, false);
    assert.equal(newer.code, 'LEGACY_EVIDENCE_NEWER');

    const missing = bindLegacyJudgment({
      judgment: { ...judgment, evidence: [{ file: 'docs/ABSENT.md', line: 1 }] },
      cwd,
      enumerationAt: '2999-01-01T00:00:00Z',
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.code, 'LEGACY_EVIDENCE_MISSING');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C007 Invariant: an existing proof keeps its stored command template; a new proof uses the adapter runner', () => {
  const cwd = writePackage();
  try {
    const existing = coverageEntryOf({
      cwd,
      proof: { status: 'PROVEN', command: 'cargo test alpha', inputs: { commandTemplate: 'cargo test {test}' } },
    });
    const adapter = { id: 'rust', version: 1, runner: 'cargo test {test}' };

    const plan = resolveProofPlan({ coverageEntry: existing, disposition: null, adapter });
    assert.equal(plan.commandTemplate, 'cargo test {test}');

    const computed = computeProofInputs({
      cwd,
      clauseKey: KEY,
      coverageEntry: existing,
      mutation: STABLE_MUTATION,
      commandTemplate: plan.commandTemplate,
      adapter,
    });
    assert.equal(computed.inputs.commandDigest, sha256Of('cargo test alpha'));

    const disposition = { proof: { command: 'node fallback.js {test}' } };
    const fromDisposition = resolveProofPlan({ coverageEntry: { key: KEY, proof: null }, disposition, adapter });
    assert.equal(fromDisposition.commandTemplate, 'node fallback.js {test}');

    const fresh = resolveProofPlan({ coverageEntry: { key: KEY, proof: null }, disposition: null, adapter });
    assert.equal(fresh.commandTemplate, 'cargo test {test}');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C003 Postcondition: migration drops an unstable proof and creates one ticket; the second run changes nothing', () => {
  const cwd = writePackage();
  try {
    const unstable = legacyProofOf({
      cwd, clauseKey: KEY2,
      mutation: { file: 'Tickets.json', find: 'fixture', replace: 'changed' },
      command: 'node runner.js beta',
      testId: 'beta',
    });
    const coverage = {
      version: 1,
      inventoryDigest: null,
      testIndexDigest: null,
      clauses: [coverageEntryOf({ cwd, key: KEY2, proof: unstable, testId: 'beta' })],
    };
    const inventory = {
      scope: 'pkg-alpha',
      digest: 'sha256:inventory',
      clauses: [{ key: KEY2, contractId: 'C002', element: 'precondition', owners: ['P9-1'] }],
      conflicts: [],
    };
    const ticketsData = { title: 'fixture', phases: [] };

    const first = migrateArtifacts({ cwd, coverage, ledger: null, repairs: null, ticketsData, inventory, testIndex: { version: 1, digest: 'sha256:index', tests: [] }, adapters: [ADAPTER] });

    assert.equal(first.report.dropped, 1);
    assert.equal(first.report.ticketsCreated, 1);
    assert.equal(first.coverage.clauses[0].proof, null);
    assert.equal(first.coverage.clauses[0].proofDropped, 'UNSTABLE_PROOF_TARGET');
    assert.equal(first.ticketsData.phases.flatMap((phase) => phase.tickets).length, 1);
    assert.equal(first.ticketsData.phases.flatMap((phase) => phase.tickets)[0].omissionStableKey, 'pkg-alpha|C002');

    const second = migrateArtifacts({
      cwd,
      coverage: first.coverage,
      ledger: first.ledger,
      repairs: first.repairs,
      ticketsData: first.ticketsData,
      inventory,
      testIndex: { version: 1, digest: 'sha256:index', tests: [] },
      adapters: [ADAPTER],
    });
    assert.equal(second.report.dropped, 0);
    assert.equal(second.report.ticketsCreated, 0);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C010 Postcondition: the migration report is complete, idempotent and names unsupported versions', () => {
  const cwd = writePackage();
  try {
    const proof = legacyProofOf({ cwd, mutation: STABLE_MUTATION, command: 'node runner.js alpha' });
    const coverage = {
      version: 1,
      inventoryDigest: null,
      testIndexDigest: null,
      clauses: [coverageEntryOf({ cwd, proof })],
    };
    const ledger = {
      version: 1,
      enumeration: { obligations: 1, at: '2999-01-01T00:00:00Z' },
      obligations: [{ surface: 'contract', assetId: 'C001', criterion: 'A' }],
      judgments: [{
        surface: 'contract', assetId: 'C001', criterion: 'A', status: 'PASS',
        evidence: [{ file: 'docs/EVIDENCE.md', line: 1 }], normativeSource: 'contract:C001',
      }],
    };
    const repairs = {
      version: 1,
      records: [{ version: 1, repairKey: 'sha256:repair', kind: 'coverage', action: 'diagnostic-ticket', status: 'unrepairable', ticketKey: 'P0-1' }],
    };
    const ticketsData = {
      title: 'fixture',
      phases: [{ id: 0, name: 'P0', tickets: [{ id: 1, phaseId: 0, status: 'reviewed', contracts: [] }] }],
    };

    const first = migrateArtifacts({ cwd, coverage, ledger, repairs, ticketsData, inventory: null, testIndex: null, adapters: [ADAPTER] });

    for (const field of ['adopted', 'reproved', 'dropped', 'workspaceFindings', 'judgmentsBound', 'judgmentsUnbound', 'ticketsCreated', 'ticketsReused']) {
      assert.equal(field in first.report, true, field);
    }
    assert.equal(first.report.adopted, 1);
    assert.equal(first.report.judgmentsBound, 1);
    assert.equal(first.report.repairsClosed, 1);
    assert.equal(first.repairs.records[0].status, 'completed');

    const second = migrateArtifacts({
      cwd, coverage: first.coverage, ledger: first.ledger, repairs: first.repairs,
      ticketsData: first.ticketsData, inventory: null, testIndex: null, adapters: [ADAPTER],
    });
    assert.equal(second.report.adopted, 0);
    assert.equal(second.report.reproved, 0);
    assert.equal(second.report.dropped, 0);
    assert.equal(second.report.judgmentsBound, 0);
    assert.equal(second.report.repairsClosed, 0);
    assert.equal(second.report.ticketsCreated, 0);

    const unsupported = migrateArtifacts({
      cwd, coverage: { version: 99, clauses: [] }, ledger: null, repairs: null, ticketsData: { phases: [] },
      inventory: null, testIndex: null, adapters: [ADAPTER],
    });
    assert.equal(unsupported.report.unsupported.length, 1);
    assert.equal(unsupported.report.unsupported[0].version, 99);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
