'use strict';

/**
 * PX-442 C004/C005/C006/C009/C010 — a v1 package enters the v2 loop.
 *
 * The find run adopts an eligible v1 proof, binds a v1 judgment, closes the
 * unrepairable repair and tickets the unstable mutation target. A second run
 * changes nothing; report-only writes nothing.
 *
 * @verifies C004
 * @verifies C005
 * @verifies C006
 * @verifies C009
 * @verifies C010
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { clauseKey } = require('../../.claude/scripts/tickets/lib/contract-clause.js');
const { fileDigestOf, sha256Of } = require('../../.claude/scripts/tickets/lib/proof-inputs.js');
const { sha256 } = require('../../.claude/scripts/tickets/lib/adapters/helpers.js');

const RUNNER = path.resolve(__dirname, '../../.claude/scripts/tickets/find-omissions-run.js');

const CONTRACT_A = { contractId: 'C001', element: 'precondition', text: 'alpha returns one' };
const CONTRACT_B = { contractId: 'C002', element: 'precondition', text: 'beta returns two' };
const KEY_A = clauseKey({ scope: 'pkg-alpha', ...CONTRACT_A });
const KEY_B = clauseKey({ scope: 'pkg-alpha', ...CONTRACT_B });
const PROVEN_AT = '2026-11-17T00:00:00Z';

/** The digest build-test-index assigns to one declared test. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function testDigestOf(cwd, testId) {
  return sha256(fs.readFileSync(path.join(cwd, 'impl.js'), 'utf8') + '\n' + testId);
}

/** A package with v1 proofs, a v1 judgment and an unrepairable repair. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function fixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'px442-e2e-migrate-'));
  fs.mkdirSync(path.join(cwd, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'CONTRACT-INVENTORY-CONFIG.json'), JSON.stringify({
    adapter: { id: 'generic-manifest', version: 1, scope: 'pkg-alpha', contractIdScope: 'local', elements: ['precondition'], applicability: 'TESTABLE' },
    sources: [{ kind: 'manifest', artifact: 'CONTRACT-MANIFEST.json', clauses: [CONTRACT_A, CONTRACT_B] }],
  }));
  fs.writeFileSync(path.join(cwd, 'CONTRACT-MANIFEST.json'), JSON.stringify({ clauses: [CONTRACT_A, CONTRACT_B] }));
  fs.writeFileSync(path.join(cwd, 'TEST-MANIFEST.json'), JSON.stringify({
    version: 1,
    tests: [
      { id: 'alpha', file: 'impl.js', name: 'alpha', kind: 'unit', ignored: false, annotations: ['verifies:' + KEY_A] },
      { id: 'beta', file: 'impl.js', name: 'beta', kind: 'unit', ignored: false, annotations: ['verifies:' + KEY_B] },
    ],
  }));
  fs.writeFileSync(path.join(cwd, 'impl.js'), 'module.exports = { alpha: () => 1, beta: () => 2 };\n');
  fs.writeFileSync(path.join(cwd, 'runner.js'), [
    "'use strict';",
    "const { alpha, beta } = require('./impl.js');",
    "const id = process.argv[2];",
    "const value = id === 'alpha' ? alpha() : beta();",
    "const expected = id === 'alpha' ? 1 : 2;",
    "if (value === expected) { process.stdout.write('PASS ' + id + '\\n'); process.exit(0); }",
    "process.stdout.write('FAIL ' + id + '\\n');",
    'process.exit(1);',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(cwd, 'docs/EVIDENCE.md'), 'evidence\n');
  fs.writeFileSync(path.join(cwd, '.conver-boundary.json'), JSON.stringify({ version: 1, packageId: 'pkg-alpha', find: { status: 'COMPLETE' } }) + '\n');

  fs.writeFileSync(path.join(cwd, 'Tickets.json'), JSON.stringify({
    title: 'fixture',
    round: 1,
    metadata: {},
    phases: [{ id: 0, name: 'P0', tickets: [{ id: 1, phaseId: 0, status: 'reviewed', contracts: [] }] }],
  }, null, 2) + '\n');

  const stableMutation = { file: 'impl.js', find: '() => 1', replace: '() => 2' };
  const unstableMutation = { file: 'Tickets.json', find: '"fixture"', replace: '"changed"' };
  const stableCommand = 'node runner.js alpha';
  const unstableCommand = 'node runner.js beta';

  fs.writeFileSync(path.join(cwd, 'CONTRACT-COVERAGE.json'), JSON.stringify({
    version: 1,
    inventoryDigest: null,
    testIndexDigest: null,
    clauses: [
      {
        key: KEY_A,
        tests: [{ id: 'alpha', file: 'impl.js', name: 'alpha', kind: 'unit', ignored: false, digest: testDigestOf(cwd, 'alpha') }],
        applicability: 'TESTABLE',
        proof: {
          kind: 'mutation', status: 'PROVEN', clauseKey: KEY_A,
          mutation: stableMutation, command: stableCommand,
          expected: { test: 'alpha', outcome: 'fail' },
          observed: { exitCode: 1, failingTests: ['alpha'] },
          digests: {
            source: fileDigestOf({ cwd, file: 'impl.js' }),
            test: testDigestOf(cwd, 'alpha'),
            command: sha256Of(stableCommand),
          },
          verifiedAt: PROVEN_AT,
          restored: true,
        },
      },
      {
        key: KEY_B,
        tests: [{ id: 'beta', file: 'impl.js', name: 'beta', kind: 'unit', ignored: false, digest: testDigestOf(cwd, 'beta') }],
        applicability: 'TESTABLE',
        proof: {
          kind: 'mutation', status: 'PROVEN', clauseKey: KEY_B,
          mutation: unstableMutation, command: unstableCommand,
          expected: { test: 'beta', outcome: 'fail' },
          observed: { exitCode: 1, failingTests: ['beta'] },
          digests: {
            source: fileDigestOf({ cwd, file: 'Tickets.json' }),
            test: testDigestOf(cwd, 'beta'),
            command: sha256Of(unstableCommand),
          },
          verifiedAt: PROVEN_AT,
          restored: true,
        },
      },
    ],
  }, null, 2) + '\n');

  fs.writeFileSync(path.join(cwd, 'OMISSION-DISPOSITIONS.json'), JSON.stringify({
    version: 1,
    rules: [],
    dispositions: [
      { key: KEY_A, status: 'TESTABLE', proof: { mutation: stableMutation, command: stableCommand } },
      { key: KEY_B, status: 'TESTABLE', proof: { mutation: unstableMutation, command: unstableCommand } },
    ],
  }, null, 2) + '\n');

  fs.writeFileSync(path.join(cwd, 'OMISSION-JUDGMENT-LEDGER.json'), JSON.stringify({
    version: 1,
    enumeration: { obligations: 1, at: '2999-01-01T00:00:00Z' },
    obligations: [{ surface: 'contract', assetId: 'C001', criterion: 'A' }],
    judgments: [{
      surface: 'contract', assetId: 'C001', criterion: 'A', status: 'PASS',
      evidence: [{ file: 'docs/EVIDENCE.md', line: 1 }], normativeSource: 'contract:C001',
    }],
  }, null, 2) + '\n');

  fs.writeFileSync(path.join(cwd, 'OMISSION-REPAIRS.json'), JSON.stringify({
    version: 1,
    records: [{ version: 1, repairKey: 'sha256:repair', kind: 'coverage', action: 'diagnostic-ticket', status: 'unrepairable', ticketKey: 'P0-1' }],
  }, null, 2) + '\n');

  return cwd;
}

/** Run the find wrapper. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function run(cwd, args = []) {
  const result = spawnSync(process.execPath, [RUNNER, '--cwd=' + cwd, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, json: JSON.parse(result.stdout) };
}

/** Read a JSON artifact. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function readJson(cwd, name) {
  return JSON.parse(fs.readFileSync(path.join(cwd, name), 'utf8'));
}

test('C004/C005/C006/C009/C010: the first run migrates once and the second run changes nothing', () => {
  const cwd = fixture();
  try {
    const boundaryBefore = fs.readFileSync(path.join(cwd, '.conver-boundary.json'), 'utf8');

    const first = run(cwd);
    assert.equal(first.status, 10);
    assert.equal(first.json.migration.adopted, 1);
    assert.equal(first.json.migration.dropped, 1);
    assert.equal(first.json.migration.judgmentsBound, 1);
    assert.equal(first.json.migration.repairsClosed, 1);
    assert.equal(first.json.migration.ticketsCreated, 1);
    assert.equal(first.json.proofCache.rerun, 0);
    assert.equal(first.json.proofCache.reused, 1);
    assert.equal(first.json.proofCache.invalidatedBy.legacy, 0);
    assert.equal(fs.readFileSync(path.join(cwd, '.conver-boundary.json'), 'utf8'), boundaryBefore);

    const ledger = readJson(cwd, 'OMISSION-JUDGMENT-LEDGER.json');
    assert.equal(typeof ledger.judgments[0].evidenceDigest, 'string');
    assert.equal(typeof ledger.judgments[0].legacyBoundAt, 'string');

    const repairs = readJson(cwd, 'OMISSION-REPAIRS.json');
    assert.equal(repairs.records[0].status, 'completed');
    assert.equal(typeof repairs.records[0].resolution, 'string');

    const afterFirst = readJson(cwd, 'Tickets.json');
    const omissionTickets = afterFirst.phases.flatMap((phase) => phase.tickets)
      .filter((ticket) => ticket.omissionStableKey === 'pkg-alpha|C002');
    assert.equal(omissionTickets.length, 1);

    const second = run(cwd);
    assert.equal(second.json.migration.adopted, 0);
    assert.equal(second.json.migration.dropped, 0);
    assert.equal(second.json.migration.judgmentsBound, 0);
    assert.equal(second.json.migration.repairsClosed, 0);
    assert.equal(second.json.migration.ticketsCreated, 0);
    assert.equal(second.json.createdTickets, 0);

    const afterSecond = readJson(cwd, 'Tickets.json');
    assert.equal(
      afterSecond.phases.flatMap((phase) => phase.tickets)
        .filter((ticket) => ticket.omissionStableKey === 'pkg-alpha|C002').length,
      1,
    );
    assert.equal(fs.readFileSync(path.join(cwd, '.conver-boundary.json'), 'utf8'), boundaryBefore);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C010 Invariant: report-only is byte-identical and writes nothing', () => {
  const cwd = fixture();
  try {
    const before = new Map();
    for (const name of ['Tickets.json', 'OMISSION-JUDGMENT-LEDGER.json', 'OMISSION-REPAIRS.json', 'OMISSION-DISPOSITIONS.json', '.conver-boundary.json']) {
      before.set(name, fs.readFileSync(path.join(cwd, name), 'utf8'));
    }

    const first = run(cwd, ['--report-only']);
    const second = run(cwd, ['--report-only']);

    assert.equal(first.status, 10);
    assert.equal(first.stdout, second.stdout);
    assert.equal(first.json.migration.adopted, 1);
    assert.equal(first.json.migration.dropped, 1);
    assert.equal(first.json.migration.judgmentsBound, 1);
    assert.equal(first.json.migration.ticketsCreated, 1);
    assert.equal(first.json.proofCache.rerun, 0);

    for (const [name, bytes] of before) {
      assert.equal(fs.readFileSync(path.join(cwd, name), 'utf8'), bytes, name);
    }
    for (const name of ['CONTRACT-INVENTORY.json', 'TEST-INDEX.json', 'OMISSION-CONVERGENCE-V3.json']) {
      assert.equal(fs.existsSync(path.join(cwd, name)), false, name);
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
