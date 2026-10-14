// PX-259 @verifies C003
// PX-259 @verifies C004
// The gate is what makes the guarantee checkable: it is measured over the workspace, so every
// package's run reaches the same verdict, and it names the demand that nobody owes rather than
// letting it read as a satisfied obligation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const GATE = path.join(process.cwd(), '.claude/scripts/grill-me-for-rfc/check-obligation-coverage.js');

/** A minimal workspace whose single operation one package owns, so the verdict starts at holds. */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function workspaceWithOneOwnedOperation({ ownerDeclaration = null } = {}) {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'px259-coverage-'));
  const packageDir = path.join(root, 'crates', 'pkg-a');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'SyntheticSpec-sequences.json'), JSON.stringify({
    spec: { lines: 10 },
    pins: { enumerations: [] },
    operations: [{ id: 'R-0001', result_object_classes: ['Alpha'] }],
    sequences: [],
    steps: [],
    exemptions: [],
  }));
  fs.writeFileSync(path.join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify({ contract_registry: [] }));
  fs.writeFileSync(path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({ inventory: { objects: [] } }));
  writeView(packageDir, { ownedOperationUnits: [{ unitId: 'op-R-0001', operationId: 'R-0001' }], obligationUnits: ownerDeclaration ?? [] , obligationSource: ownerDeclaration === null ? 'undeclared' : 'declared' });
  return root;
}

// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function writeView(packageDir, view) {
  fs.writeFileSync(path.join(packageDir, 'SEQUENCES.json'), JSON.stringify({
    packageId: 'pkg-a',
    ownedOperationUnits: [], ownedSequenceUnits: [], crossBoundarySequenceUnits: [], obligationUnits: [], obligationSource: 'undeclared',
    ...view,
  }));
}

// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function runGate(root) {
  const result = spawnSync(process.execPath, [GATE, root], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('C003 a workspace whose every demand is assigned holds, and the gate says so at exit 0', () => {
  const root = workspaceWithOneOwnedOperation();
  try {
    const result = runGate(root);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /verdict: holds/);
    assert.doesNotMatch(result.stdout, /unassigned/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C003 a demand nobody owes is reported by axis and id, and the gate exits 1', () => {
  const root = workspaceWithOneOwnedOperation();
  try {
    writeView(path.join(root, 'crates', 'pkg-a'), { ownedOperationUnits: [] });
    const result = runGate(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /verdict: not established/);
    assert.match(result.stdout, /unassigned operations: 1/);
    assert.match(result.stdout, /operations: R-0001/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C004 a declaration that bound to no unit is reported apart from an unserved demand', () => {
  const root = workspaceWithOneOwnedOperation({ ownerDeclaration: [] });
  try {
    const result = runGate(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /declared but unbound: pkg-a/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C003 a missing argument is refused with the usage line and exit 1', () => {
  const result = spawnSync(process.execPath, [GATE], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /usage: check-obligation-coverage\.js <WORKSPACE_ROOT>/);
});

test('C003 a root without an artifact is refused by name rather than measured as empty', () => {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'px259-empty-'));
  try {
    const result = runGate(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /does not hold both an artifact/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
