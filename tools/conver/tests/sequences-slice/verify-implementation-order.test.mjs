// PX-323 @verifies C003 C005 C007
// PX-327 @verifies C001 C002 C003
// The package gate proves the ticket placement and the workspace gate writes the
// build/implementation pair without replacing the published build order. A failing
// verdict retracts the sidecar instead of publishing an unverified order, and the
// workspace gate re-derives every package's prerequisites before it trusts them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { verifyPackage, verifyWorkspace } from '../../.claude/scripts/sequences-slice/verify-implementation-order.mjs';

// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'px323-order-'));
  writeFileSync(join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify({
    artifact_kind: 'workspacify-allocate-manifest',
    contract_registry: [],
    implementation_order: { serial: ['pkg-1', 'pkg-2'], levels: [['pkg-1'], ['pkg-2']] },
  }));
  writeFileSync(join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({
    workspace: { packages: [{ id: 'pkg-1', path: 'crates/pkg-1' }, { id: 'pkg-2', path: 'crates/pkg-2' }] },
    dependencies: { dag: { canonical_edges: [{ from: 'pkg-2', to: 'pkg-1' }] } },
  }));
  writeFileSync(join(root, 'DESIGN-sequences.json'), JSON.stringify({ sequences: [], steps: [] }));
  mkdirSync(join(root, 'crates/pkg-1'), { recursive: true });
  mkdirSync(join(root, 'crates/pkg-2'), { recursive: true });
  writeFileSync(join(root, 'crates/pkg-1/SEQUENCES.json'), JSON.stringify({
    packageId: 'pkg-1',
    ownedOperationUnits: [
      { unitId: 'op-A', operationId: 'A', ownerPackageIds: ['pkg-1'], roleCandidate: 'implementer' },
      { unitId: 'op-B', operationId: 'B', ownerPackageIds: ['pkg-1'], roleCandidate: 'implementer' },
    ],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  }));
  writeFileSync(join(root, 'crates/pkg-1/DESIGN-GRAPH.json'), JSON.stringify({
    edges: [{ from: 'N0002', to: 'N0001', type: 'depends_on', attributes: { strength: 'hard' } }],
  }));
  return root;
}

// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function tickets(prerequisite, reversed = false) {
  const first = { id: 1, phaseId: 0, title: 'a', status: 'todo', contracts: [], nodeIds: ['N0001'], distribution: { units: [{ unitId: 'op-A', kind: 'operation', obligation: { mode: 'implement' } }] } };
  const second = { id: 2, phaseId: 0, title: 'b', status: 'todo', contracts: [], nodeIds: ['N0002'], distribution: { units: [{ unitId: 'op-B', kind: 'operation', obligation: { mode: 'implement' } }] } };
  if (prerequisite !== undefined) second.prerequisites = [prerequisite];
  return { title: 't', metadata: {}, phases: [{ id: 0, tickets: reversed ? [second, first] : [first, second] }] };
}

// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function writeTickets(root, document) {
  writeFileSync(join(root, 'crates/pkg-1/Tickets.json'), JSON.stringify(document));
}

const expected = { ticket: 'P0-1', kind: 'implementation', source: 'graph:depends_on:N0002->N0001' };

test('C005 a correctly attached prerequisite passes the package gate', () => {
  const root = workspace();
  writeTickets(root, tickets(expected));
  const result = verifyPackage({ packageDir: join(root, 'crates/pkg-1'), write: false });
  assert.equal(result.code, 0);
  assert.deepEqual(result.findings, []);
  rmSync(root, { recursive: true, force: true });
});

test('C005 a missing prerequisite is PREREQUISITE_SET_MISMATCH', () => {
  const root = workspace();
  writeTickets(root, tickets(undefined));
  const result = verifyPackage({ packageDir: join(root, 'crates/pkg-1'), write: false });
  assert.equal(result.code, 1);
  assert.ok(result.findings.some((entry) => entry.code === 'PREREQUISITE_SET_MISMATCH'));
  rmSync(root, { recursive: true, force: true });
});

test('C005 an inverted placement is PREREQUISITE_NOT_BEFORE', () => {
  const root = workspace();
  writeTickets(root, tickets(expected, true));
  const result = verifyPackage({ packageDir: join(root, 'crates/pkg-1'), write: false });
  assert.equal(result.code, 1);
  assert.ok(result.findings.some((entry) => entry.code === 'PREREQUISITE_NOT_BEFORE'));
  rmSync(root, { recursive: true, force: true });
});

test('C008 a package without a view is skipped', () => {
  const root = workspace();
  rmSync(join(root, 'crates/pkg-1/SEQUENCES.json'));
  writeTickets(root, tickets(expected));
  const result = verifyPackage({ packageDir: join(root, 'crates/pkg-1'), write: false });
  assert.equal(result.code, 0);
  assert.equal(result.skipped, 'no-distribution');
  rmSync(root, { recursive: true, force: true });
});

test('C003 the workspace gate writes both orders and never rewrites the build order', () => {
  const root = workspace();
  const result = verifyWorkspace({ workspaceRoot: root, write: true });
  assert.equal(result.code, 0);
  const sidecar = JSON.parse(readFileSync(join(root, 'WORKSPACIFY-IMPLEMENTATION-ORDER.json'), 'utf8'));
  assert.deepEqual(sidecar.buildOrder.levels, [['pkg-1'], ['pkg-2']]);
  assert.deepEqual(sidecar.implementationOrder.levels, [['pkg-1'], ['pkg-2']]);
  assert.ok(Array.isArray(sidecar.prerequisites));
  assert.ok(existsSync(join(root, 'WORKSPACIFY-IMPLEMENTATION-ORDER.json')));
  rmSync(root, { recursive: true, force: true });
});

test('C002 a boundary that contradicts the build order is a cycle', () => {
  const root = workspace();
  writeFileSync(join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify({
    artifact_kind: 'workspacify-allocate-manifest',
    contract_registry: [{ boundary_id: 'boundary-001', provider_package: 'pkg-2', consumer_package: 'pkg-1', clauses: {} }],
    implementation_order: { serial: ['pkg-1', 'pkg-2'], levels: [['pkg-1'], ['pkg-2']] },
  }));
  const result = verifyWorkspace({ workspaceRoot: root, write: false });
  assert.equal(result.code, 1);
  assert.ok(result.findings.some((entry) => entry.code === 'IMPLEMENTATION_ORDER_CYCLE'));
  rmSync(root, { recursive: true, force: true });
});

// PX-327 @verifies C001 — a sidecar exists only for a zero-finding verdict.
test('C001 a failing package gate retracts its sidecar and returns 1', () => {
  const root = workspace();
  try {
    writeTickets(root, tickets(expected, true));
    writeFileSync(join(root, 'crates/pkg-1/IMPLEMENTATION-ORDER.json'), '{"sentinel":true}');
    const result = verifyPackage({ packageDir: join(root, 'crates/pkg-1'), write: true });
    assert.equal(result.code, 1);
    assert.ok(result.findings.some((entry) => entry.code === 'PREREQUISITE_NOT_BEFORE'));
    assert.equal(existsSync(join(root, 'crates/pkg-1/IMPLEMENTATION-ORDER.json')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// PX-327 @verifies C001 — the clean path still publishes the sidecar.
test('C001 a passing package gate publishes its sidecar', () => {
  const root = workspace();
  try {
    writeTickets(root, tickets(expected));
    const result = verifyPackage({ packageDir: join(root, 'crates/pkg-1'), write: true });
    assert.equal(result.code, 0);
    assert.equal(existsSync(join(root, 'crates/pkg-1/IMPLEMENTATION-ORDER.json')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// PX-327 @verifies C002 — the display's source of truth is never published unverified.
test('C002 a failing workspace gate retracts its sidecar and returns 1', () => {
  const root = workspace();
  try {
    writeTickets(root, tickets(expected, true));
    writeFileSync(join(root, 'WORKSPACIFY-IMPLEMENTATION-ORDER.json'), '{"sentinel":true}');
    const result = verifyWorkspace({ workspaceRoot: root, write: true });
    assert.equal(result.code, 1);
    assert.ok(result.findings.some((entry) => entry.code === 'PREREQUISITE_NOT_BEFORE'));
    assert.equal(existsSync(join(root, 'WORKSPACIFY-IMPLEMENTATION-ORDER.json')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// PX-327 @verifies C002 — the clean path still publishes the workspace sidecar.
test('C002 a passing workspace gate publishes its sidecar', () => {
  const root = workspace();
  try {
    writeTickets(root, tickets(expected));
    const result = verifyWorkspace({ workspaceRoot: root, write: true });
    assert.equal(result.code, 0);
    assert.equal(existsSync(join(root, 'WORKSPACIFY-IMPLEMENTATION-ORDER.json')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// PX-327 @verifies C003 — the workspace gate applies the package gate's derivation.
test('C003 the workspace gate rejects an empty prerequisite set', () => {
  const root = workspace();
  try {
    writeTickets(root, tickets(undefined));
    const result = verifyWorkspace({ workspaceRoot: root, write: false });
    assert.equal(result.code, 1);
    assert.ok(result.findings.some((entry) => entry.code === 'PREREQUISITE_SET_MISMATCH'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// PX-327 @verifies C003 — an attached prerequisite still passes the workspace gate.
test('C003 the workspace gate accepts a matching prerequisite set', () => {
  const root = workspace();
  try {
    writeTickets(root, tickets(expected));
    const result = verifyWorkspace({ workspaceRoot: root, write: false });
    assert.equal(result.code, 0);
    assert.deepEqual(result.findings, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// PX-327 @verifies C003 — a package with no tickets is skipped by the derivation loop.
test('C003 a package without Tickets.json is skipped, not failed', () => {
  const root = workspace();
  try {
    const result = verifyWorkspace({ workspaceRoot: root, write: false });
    assert.equal(result.code, 0);
    assert.deepEqual(result.findings, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// PX-328 @verifies C003 — the workspace gate uses the same active-operation filter as smooth.
// [::TICKET::] PX-328 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-328 --for-spec --no-implementation-order`.
function activeWorkspace(disposition) {
  const root = mkdtempSync(join(tmpdir(), 'px328-active-'));
  writeFileSync(join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify({
    artifact_kind: 'workspacify-allocate-manifest',
    contract_registry: [],
    implementation_order: { serial: ['pkg-1', 'pkg-2'], levels: [['pkg-1'], ['pkg-2']] },
  }));
  writeFileSync(join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({
    workspace: { packages: [{ id: 'pkg-1', path: 'crates/pkg-1' }, { id: 'pkg-2', path: 'crates/pkg-2' }] },
    dependencies: { dag: { canonical_edges: [] } },
  }));
  writeFileSync(join(root, 'DESIGN-sequences.json'), JSON.stringify({
    operations: [{ id: 'Shared', disposition }],
    sequences: [],
    steps: [],
  }));
  for (const id of ['pkg-1', 'pkg-2']) {
    mkdirSync(join(root, 'crates', id), { recursive: true });
    writeFileSync(join(root, 'crates', id, 'SEQUENCES.json'), JSON.stringify({
      packageId: id,
      ownedOperationUnits: [{
        unitId: 'op-Shared',
        operationId: 'Shared',
        ownerPackageIds: ['pkg-1', 'pkg-2'],
        roleCandidate: 'undecided',
      }],
      ownedSequenceUnits: [],
      crossBoundarySequenceUnits: [],
      obligationUnits: [],
    }));
  }
  writeFileSync(join(root, 'crates/pkg-1/DESIGN-GRAPH.json'), JSON.stringify({ nodes: [], edges: [] }));
  return root;
}

test('C003 the workspace gate accepts a framework-only ambiguity', () => {
  const root = activeWorkspace('framework');
  try {
    const result = verifyWorkspace({ workspaceRoot: root, write: false });
    assert.equal(result.code, 0);
    assert.deepEqual(result.findings, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C003 the workspace gate still rejects an active operation with no implementer', () => {
  const root = activeWorkspace('active');
  try {
    const result = verifyWorkspace({ workspaceRoot: root, write: false });
    assert.equal(result.code, 1);
    assert.ok(result.findings.some((entry) => entry.code === 'OWNER_ROLE_UNDECIDED' && entry.subject === 'Shared'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
