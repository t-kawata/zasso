// PX-323 @verifies C003 C005 C007
// The package gate proves the ticket placement and the workspace gate writes the
// build/implementation pair without replacing the published build order.
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
