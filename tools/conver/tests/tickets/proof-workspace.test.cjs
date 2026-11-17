'use strict';

/**
 * PX-442 C001/C002 — workspace-level proof isolation.
 *
 * A proof must run in a tree that preserves the project-relative layout of the
 * package and every external include it needs. A missing or escaping external
 * path is REPAIR_REQUIRED, never PROVEN, and never a package-only fallback.
 *
 * @verifies C001
 * @verifies C002
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  resolveProofWorkspace,
} = require('../../.claude/scripts/tickets/lib/proof-workspace.js');
const { runDetectionProof } = require('../../.claude/scripts/tickets/lib/proof-engine.js');

const KEY = 'clause|pkg-alpha|C001|precondition|0000000000000001';

/** A project root with a package and a sibling external include. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function writeProject({ includeText } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px442-ws-'));
  fs.mkdirSync(path.join(root, '.git'));
  const pkg = path.join(root, 'pkg');
  fs.mkdirSync(path.join(pkg, 'src/tests'), { recursive: true });
  fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
  fs.writeFileSync(path.join(pkg, 'src/impl.rs'), 'pub fn f() { 1 }\n');
  fs.writeFileSync(
    path.join(pkg, 'src/tests/contract.rs'),
    includeText ?? 'const SPEC: &str = include_str!("../../../shared/SPEC.md");\n',
  );
  fs.writeFileSync(path.join(root, 'shared/SPEC.md'), 'alpha spec\n');
  return { root, pkg };
}

/** Remove a fixture tree. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function remove(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

test('C001 Postcondition: the package and the sibling include path are copied at the same relative location', () => {
  const { root, pkg } = writeProject();
  try {
    const workspace = resolveProofWorkspace({
      cwd: pkg,
      mutationFiles: ['src/impl.rs'],
      includeFiles: ['src/tests/contract.rs'],
    });

    assert.equal(workspace.ok, true);
    assert.equal(workspace.workspaceRoots.includes('shared/SPEC.md'), true);
    assert.equal(fs.readFileSync(path.join(workspace.root, 'shared/SPEC.md'), 'utf8'), 'alpha spec\n');
    assert.equal(
      fs.readFileSync(path.join(workspace.packageRoot, 'src/tests/contract.rs'), 'utf8').includes('include_str!'),
      true,
    );
    assert.notEqual(workspace.packageRoot, workspace.root);

    const isolatedRoot = workspace.root;
    workspace.cleanup();
    assert.equal(fs.existsSync(isolatedRoot), false);
  } finally {
    remove(root);
  }
});

test('C001 Precondition: proofWorkspaceRoots declares the project root when no .git ancestor exists', () => {
  const { root, pkg } = writeProject();
  try {
    fs.rmSync(path.join(root, '.git'), { recursive: true, force: true });
    fs.writeFileSync(path.join(pkg, 'CONTRACT-INVENTORY-CONFIG.json'), JSON.stringify({ proofWorkspaceRoots: ['..'] }));

    const workspace = resolveProofWorkspace({ cwd: pkg, includeFiles: ['src/tests/contract.rs'] });

    assert.equal(workspace.ok, true);
    assert.equal(workspace.workspaceRoots.includes('shared/SPEC.md'), true);
    workspace.cleanup();
  } finally {
    remove(root);
  }
});

test('C001 Boundary: an external directory is copied recursively', () => {
  const { root, pkg } = writeProject();
  try {
    fs.mkdirSync(path.join(root, 'shared/docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'shared/docs/guide.md'), 'guide\n');

    const workspace = resolveProofWorkspace({ cwd: pkg, externalPaths: ['shared/docs'] });

    assert.equal(workspace.ok, true);
    assert.equal(fs.readFileSync(path.join(workspace.root, 'shared/docs/guide.md'), 'utf8'), 'guide\n');
    workspace.cleanup();
  } finally {
    remove(root);
  }
});

test('C002 Precondition: a missing external include is PROOF_WORKSPACE_INCOMPLETE and the proof is REPAIR_REQUIRED', () => {
  const { root, pkg } = writeProject();
  try {
    fs.rmSync(path.join(root, 'shared/SPEC.md'));
    const originalBytes = fs.readFileSync(path.join(pkg, 'src/impl.rs'), 'utf8');
    const workspace = resolveProofWorkspace({ cwd: pkg, includeFiles: ['src/tests/contract.rs'] });

    assert.equal(workspace.ok, false);
    assert.equal(workspace.code, 'PROOF_WORKSPACE_INCOMPLETE');
    assert.deepEqual(workspace.missing, ['shared/SPEC.md']);
    assert.equal(workspace.root, undefined);

    let commandRan = false;
    const result = runDetectionProof({
      clause: { key: KEY },
      testId: 'alpha',
      testDigest: 'sha256:test',
      mutation: { file: 'src/impl.rs', find: '1', replace: '2' },
      command: 'node runner.js',
      workspace,
      io: { runCommand: () => { commandRan = true; return { status: 0, stdout: '', stderr: '' }; } },
    });

    assert.equal(result.status, 'REPAIR_REQUIRED');
    assert.notEqual(result.status, 'PROVEN');
    assert.equal(commandRan, false);
    assert.equal(fs.readFileSync(path.join(pkg, 'src/impl.rs'), 'utf8'), originalBytes);
  } finally {
    remove(root);
  }
});

test('C002 Invariant: an include path that escapes the project root is reported, not skipped', () => {
  const { root, pkg } = writeProject({
    includeText: [
      'const SPEC: &str = include_str!("../../../shared/SPEC.md");',
      'const OUT: &str = include_str!("../../../../outside/SPEC.md");',
      '',
    ].join('\n'),
  });
  try {
    const workspace = resolveProofWorkspace({ cwd: pkg, includeFiles: ['src/tests/contract.rs'] });

    assert.equal(workspace.ok, false);
    assert.equal(workspace.code, 'PROOF_WORKSPACE_INCOMPLETE');
    assert.equal(workspace.escaped.length, 1);
    assert.match(workspace.escaped[0], /outside\/SPEC\.md$/);
  } finally {
    remove(root);
  }
});
