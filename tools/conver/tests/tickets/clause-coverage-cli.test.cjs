'use strict';

/**
 * PX-436 — CLI contract for the four new v3 scripts.
 *
 * Each script is executed as the project would execute it. Report-only writes
 * nothing; a committed run writes the declared artifact atomically.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const INVENTORY_CLI = path.join(ROOT, '.claude/scripts/tickets/build-contract-inventory.js');
const INDEX_CLI = path.join(ROOT, '.claude/scripts/tickets/build-test-index.js');
const SCAN_CLI = path.join(ROOT, '.claude/scripts/tickets/scan-clause-coverage.js');
const PROOF_CLI = path.join(ROOT, '.claude/scripts/tickets/run-detection-proofs.js');

/** Run one CLI and parse its JSON stdout. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function runCli(script, args, cwd) {
  const result = spawnSync(process.execPath, [script, '--cwd=' + cwd, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, json: JSON.parse(result.stdout) };
}

/** A temp directory with the files the writer already has. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('C001/C003: build-contract-inventory report-only writes nothing and emits the v3 inventory', () => {
  const root = tempDir('px436-inventory-cli-');
  try {
    fs.writeFileSync(path.join(root, 'RFC-GRAPH.json'), JSON.stringify({ edges: [{ id: 'E001', contracts: [{ id: 'C001', precondition: 'input is present', postcondition: '', invariant: '' }] }] }));
    const result = runCli(INVENTORY_CLI, ['--report-only'], root);

    assert.equal(result.status, 0);
    assert.equal(result.json.version, 1);
    assert.equal(result.json.clauses.length, 1);
    assert.equal(fs.existsSync(path.join(root, 'CONTRACT-INVENTORY.json')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C001/C004: build-test-index report-only writes nothing and emits the v3 index', () => {
  const root = tempDir('px436-index-cli-');
  try {
    fs.writeFileSync(path.join(root, 'TEST-MANIFEST.json'), JSON.stringify({ version: 1, tests: [{ id: 'one', file: 'one.spec.js', name: 'one', kind: 'unit', ignored: false, annotations: [] }] }));
    const result = runCli(INDEX_CLI, ['--report-only'], root);

    assert.equal(result.status, 0);
    assert.equal(result.json.version, 1);
    assert.equal(result.json.tests.length, 1);
    assert.equal(fs.existsSync(path.join(root, 'TEST-INDEX.json')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C001/C005: scan-clause-coverage emits a remainder and writes the coverage artifact', () => {
  const root = tempDir('px436-scan-cli-');
  try {
    const key = 'clause|pkg-alpha|C001|precondition|abcdef0123456789';
    fs.writeFileSync(path.join(root, 'CONTRACT-INVENTORY.json'), JSON.stringify({ version: 1, digest: 'sha256:inventory', clauses: [{ key, contractId: 'C001', element: 'precondition', applicability: 'TESTABLE' }], conflicts: [] }));
    fs.writeFileSync(path.join(root, 'TEST-INDEX.json'), JSON.stringify({ version: 1, digest: 'sha256:index', tests: [{ id: 'one', digest: 'sha256:test', ignored: false, annotations: ['verifies:' + key] }] }));
    fs.writeFileSync(path.join(root, 'CONTRACT-COVERAGE.json'), JSON.stringify({ version: 1, inventoryDigest: 'sha256:inventory', testIndexDigest: 'sha256:index', clauses: [] }));
    const result = runCli(SCAN_CLI, [], root);

    assert.equal(result.status, 0);
    assert.equal(result.json.remainder.remainder, 1);
    assert.equal(fs.existsSync(path.join(root, 'CONTRACT-COVERAGE.json')), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C005: run-detection-proofs executes a declared proof and report-only writes nothing', () => {
  const root = tempDir('px436-proof-cli-');
  try {
    fs.copyFileSync(path.join(__dirname, 'fixtures/proof-project/implementation.js'), path.join(root, 'implementation.js'));
    fs.copyFileSync(path.join(__dirname, 'fixtures/proof-project/runner.js'), path.join(root, 'runner.js'));
    fs.writeFileSync(path.join(root, 'CONTRACT-COVERAGE.json'), JSON.stringify({
      version: 1,
      inventoryDigest: 'sha256:inventory',
      testIndexDigest: 'sha256:index',
      clauses: [{
        key: 'clause|pkg-alpha|C001|postcondition|abcdef0123456789',
        status: 'CLAUSE_PROOF_MISSING',
        applicability: 'TESTABLE',
        tests: [{ id: 'alpha_saves', digest: 'sha256:test' }],
        mutation: { file: 'implementation.js', strategy: 'replace-return', find: "return 'saved:' + value;", replace: "return 'corrupted';" },
        command: 'node runner.js {test}',
      }],
    }));
    const result = runCli(PROOF_CLI, ['--report-only', '--proofs=all'], root);

    assert.equal(result.status, 0);
    assert.equal(result.json.results[0].status, 'PROVEN');
    assert.equal(fs.readFileSync(path.join(root, 'implementation.js'), 'utf8').includes("return 'saved:' + value;"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
