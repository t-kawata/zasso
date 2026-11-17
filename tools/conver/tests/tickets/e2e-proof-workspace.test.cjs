'use strict';

/**
 * PX-442 C001/C002/C008 — proofs execute in a layout-preserving workspace and
 * the Rust runner matches a bare test id.
 *
 * @verifies C001
 * @verifies C002
 * @verifies C008
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runProofEntries } = require('../../.claude/scripts/tickets/lib/proof-plan.js');
const { runDetectionProof } = require('../../.claude/scripts/tickets/lib/proof-engine.js');
const { resolveProofWorkspace } = require('../../.claude/scripts/tickets/lib/proof-workspace.js');
const { RUNNER } = require('../../.claude/scripts/tickets/lib/adapters/rust.js');

const KEY = 'clause|pkg-alpha|C001|precondition|0000000000000001';

/** A package whose runner needs a sibling include file to start. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function writeWorkspaceProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px442-e2e-ws-'));
  fs.mkdirSync(path.join(root, '.git'));
  const pkg = path.join(root, 'pkg');
  fs.mkdirSync(path.join(pkg, 'src/tests'), { recursive: true });
  fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
  fs.writeFileSync(path.join(root, 'shared/SPEC.md'), 'alpha spec\n');
  fs.writeFileSync(path.join(pkg, 'impl.js'), 'module.exports = { alpha: () => 1 };\n');
  fs.writeFileSync(
    path.join(pkg, 'src/tests/contract.js'),
    '// include_str!("../../../shared/SPEC.md")\nmodule.exports = {};\n',
  );
  fs.writeFileSync(path.join(pkg, 'runner.js'), [
    "'use strict';",
    "const fs = require('node:fs');",
    "const { alpha } = require('./impl.js');",
    "if (!fs.existsSync('../shared/SPEC.md')) { process.stdout.write('missing external SPEC\\n'); process.exit(2); }",
    "if (alpha() === 1) { process.stdout.write('PASS alpha\\n'); process.exit(0); }",
    "process.stdout.write('FAIL alpha\\n');",
    'process.exit(1);',
    '',
  ].join('\n'));
  return { root, pkg };
}

/** A bare package for the runner-shape test. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function writeCargoFixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'px442-e2e-cargo-'));
  fs.mkdirSync(path.join(cwd, 'src'), { recursive: true });
  fs.mkdirSync(path.join(cwd, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'src/lib.rs'), 'pub fn f() { 1 }\n');
  const cargo = path.join(cwd, 'bin/cargo');
  fs.writeFileSync(cargo, [
    '#!/bin/sh',
    'case "$*" in',
    '  *--exact*) echo "0 tests"; exit 0;;',
    '  *) echo "running 1 test"; echo "test alpha ... FAILED"; exit 101;;',
    'esac',
    '',
  ].join('\n'), { mode: 0o755 });
  return { cwd, bin: path.join(cwd, 'bin') };
}

test('C001 Postcondition: the proof runs in the package copy with the sibling include present', () => {
  const { root, pkg } = writeWorkspaceProject();
  try {
    const entry = {
      key: KEY,
      test: { id: 'alpha', file: 'src/tests/contract.js', digest: 'sha256:test' },
      proof: null,
      mutation: { file: 'impl.js', find: '() => 1', replace: '() => 2' },
      command: 'node runner.js',
      inputs: null,
      files: [],
    };

    const run = runProofEntries({ entries: [entry], mode: 'all', cwd: pkg });

    assert.equal(run.results.length, 1);
    assert.equal(run.results[0].status, 'PROVEN');
    assert.equal(run.results[0].workspaceRoots.includes('shared/SPEC.md'), true);
    assert.equal(fs.readFileSync(path.join(pkg, 'impl.js'), 'utf8'), 'module.exports = { alpha: () => 1 };\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C008 Postcondition: the default Rust runner matches a bare id and never emits --exact', () => {
  assert.equal(RUNNER, 'cargo test {test}');
  assert.equal(RUNNER.includes('--exact'), false);

  const { cwd, bin } = writeCargoFixture();
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = bin + path.delimiter + originalPath;
    const workspace = resolveProofWorkspace({ cwd });
    const result = runDetectionProof({
      clause: { key: KEY },
      testId: 'alpha',
      testDigest: 'sha256:test',
      mutation: { file: 'src/lib.rs', find: '1', replace: '2' },
      command: RUNNER,
      workspace,
    });

    assert.equal(result.status, 'PROVEN');
    assert.equal(result.observed.failingTests.includes('alpha'), true);
  } finally {
    process.env.PATH = originalPath;
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C008 Invariant: the exact form matches no bare id and is never chosen', () => {
  const { cwd, bin } = writeCargoFixture();
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = bin + path.delimiter + originalPath;
    const workspace = resolveProofWorkspace({ cwd });
    const result = runDetectionProof({
      clause: { key: KEY },
      testId: 'alpha',
      testDigest: 'sha256:test',
      mutation: { file: 'src/lib.rs', find: '1', replace: '2' },
      command: RUNNER + ' -- --exact',
      workspace,
    });

    assert.equal(result.status, 'CLAUSE_PROOF_FAILED');
    assert.notEqual(result.status, 'PROVEN');
  } finally {
    process.env.PATH = originalPath;
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
