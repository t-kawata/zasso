'use strict';

/**
 * PX-441 C003/C007 — repeated find runs reuse an unchanged proof and re-prove
 * only a changed mutation target. The conver boundary contract is untouched.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { clauseKey } = require('../../.claude/scripts/tickets/lib/contract-clause.js');

const RUNNER = path.resolve(__dirname, '../../.claude/scripts/tickets/find-omissions-run.js');
const KEY = clauseKey({ scope: 'pkg-alpha', contractId: 'OBL-alpha', element: 'precondition', text: 'alpha returns one' });

/** A package whose one clause is testable by mutation of impl.js. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function fixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'px441-e2e-'));
  fs.writeFileSync(path.join(cwd, 'CONTRACT-INVENTORY-CONFIG.json'), JSON.stringify({
    adapter: { id: 'generic-manifest', version: 1, scope: 'pkg-alpha', contractIdScope: 'local', elements: ['precondition'], applicability: 'TESTABLE' },
    sources: [{ kind: 'manifest', artifact: 'CONTRACT-MANIFEST.json', clauses: [{ contractId: 'OBL-alpha', element: 'precondition', text: 'alpha returns one' }] }],
  }));
  fs.writeFileSync(path.join(cwd, 'CONTRACT-MANIFEST.json'), JSON.stringify({
    clauses: [{ contractId: 'OBL-alpha', element: 'precondition', text: 'alpha returns one' }],
  }));
  fs.writeFileSync(path.join(cwd, 'Tickets.json'), JSON.stringify({ title: 'fixture', round: 1, metadata: {}, phases: [] }));
  fs.writeFileSync(path.join(cwd, 'TEST-MANIFEST.json'), JSON.stringify({
    version: 1,
    tests: [{ id: 'alpha', file: 'impl.js', name: 'alpha', kind: 'unit', ignored: false, annotations: ['verifies:' + KEY] }],
  }));
  fs.writeFileSync(path.join(cwd, 'impl.js'), 'module.exports = { alpha: () => 1 };\n');
  fs.writeFileSync(path.join(cwd, 'runner.js'), [
    "'use strict';",
    "const { alpha } = require('./impl.js');",
    "if (alpha() === 1) { process.stdout.write('PASS alpha\\n'); }",
    "else { process.stdout.write('FAIL alpha\\n'); process.exit(1); }",
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(cwd, '.conver-boundary.json'), JSON.stringify({ version: 1, packageId: 'pkg-alpha', find: { status: 'COMPLETE' } }) + '\n');
  fs.writeFileSync(path.join(cwd, 'OMISSION-DISPOSITIONS.json'), JSON.stringify({
    version: 1,
    rules: [],
    dispositions: [{
      key: KEY,
      status: 'TESTABLE',
      proof: { mutation: { file: 'impl.js', find: '() => 1', replace: '() => 2' }, command: 'node runner.js {test}' },
    }],
  }, null, 2) + '\n');
  return cwd;
}

/** Run the wrapper and parse its machine report. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function run(cwd, args = []) {
  const result = spawnSync(process.execPath, [RUNNER, '--cwd=' + cwd, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, json: JSON.parse(result.stdout) };
}

test('C003/C007: an unchanged run reuses the proof; a changed mutation target re-proves once', () => {
  const cwd = fixture();
  try {
    const boundaryBefore = fs.readFileSync(path.join(cwd, '.conver-boundary.json'), 'utf8');
    const first = run(cwd);
    assert.equal(first.status, 0);
    assert.equal(fs.readFileSync(path.join(cwd, '.conver-boundary.json'), 'utf8'), boundaryBefore);
    assert.equal(first.json.proofCache.rerun, 1);
    assert.equal(first.json.proofCache.reused, 0);

    const second = run(cwd);
    assert.equal(second.status, 0);
    assert.equal(second.json.proofCache.rerun, 0);
    assert.equal(second.json.proofCache.reused, 1);

    fs.writeFileSync(path.join(cwd, 'impl.js'), 'module.exports = { alpha: () => 1 }; // changed\n');
    const third = run(cwd);
    assert.equal(third.json.proofCache.rerun, 1);
    assert.equal(third.json.proofCache.invalidatedBy.source, 1);
    assert.equal(third.status, 10);

    const fourth = run(cwd);
    assert.equal(fourth.status, 0);
    assert.equal(fourth.json.proofCache.rerun, 0);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C003: report-only writes nothing and executes no proof', () => {
  const cwd = fixture();
  try {
    const first = run(cwd, ['--report-only']);
    const second = run(cwd, ['--report-only']);

    assert.equal(first.stdout, second.stdout);
    assert.equal(first.json.proofCache.rerun, 0);
    for (const file of ['CONTRACT-INVENTORY.json', 'TEST-INDEX.json', 'CONTRACT-COVERAGE.json', 'OMISSION-CONVERGENCE-V3.json']) {
      assert.equal(fs.existsSync(path.join(cwd, file)), false, file);
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
