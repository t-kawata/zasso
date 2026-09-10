// [::TICKET::] PX-192 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-192 --for-spec --no-implementation-order`.
// PX-192 @verifies C001
// The dependency proof must survive in the published manifest: the canonical edge
// list it was computed from, the existing consumers-first topological order, and a
// providers-first implementation order whose levels are stable and recomputable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';

import { runDagChecks } from '../../../.claude/scripts/workspacify-tree/lib/dag.mjs';
import { buildValidTreeManifest, materializeTreeFixture } from '../helpers/build-valid-tree-manifest.mjs';

const PACKAGES = ['pkg-a', 'pkg-b', 'pkg-c', 'pkg-d'].map((id) => ({
  id, name: id, path: id, layer: 'protocol', kind: 'production-library', responsibilities: ['x'], seed_required: true, owns: {},
}));
const EDGES = [
  { from: 'pkg-a', to: 'pkg-b' },
  { from: 'pkg-a', to: 'pkg-c' },
  { from: 'pkg-b', to: 'pkg-d' },
  { from: 'pkg-c', to: 'pkg-d' },
];

test('C001 a diamond graph yields canonical edges plus both orders', () => {
  const report = runDagChecks({ packages: PACKAGES, edges: EDGES });

  assert.equal(report.cycle_count, 0);
  assert.deepEqual(
    report.canonical_edges.map((edge) => `${edge.from}->${edge.to}`),
    ['pkg-a->pkg-b', 'pkg-a->pkg-c', 'pkg-b->pkg-d', 'pkg-c->pkg-d'],
  );

  // The existing Kahn order keeps its consumers-first semantics.
  assert.ok(report.topological_order.indexOf('pkg-a') < report.topological_order.indexOf('pkg-d'));

  // The implementation order puts providers first, in stable waves.
  assert.deepEqual(report.implementation_order.levels, [['pkg-d'], ['pkg-b', 'pkg-c'], ['pkg-a']]);
  assert.deepEqual(report.implementation_order.serial, ['pkg-d', 'pkg-b', 'pkg-c', 'pkg-a']);
});

test('C001 a cyclic graph never yields a usable proof', () => {
  const report = runDagChecks({ packages: PACKAGES, edges: [...EDGES, { from: 'pkg-d', to: 'pkg-a' }] });
  assert.equal(report.cycle_count, 1);
  assert.equal(report.cycles[0].path.length > 0, true);
  assert.deepEqual(report.implementation_order.serial, []);
  assert.deepEqual(report.implementation_order.levels, []);
});

test('C001 degenerate graphs are explicit', () => {
  const empty = runDagChecks({ packages: [], edges: [] });
  assert.equal(empty.edge_count, 0);
  assert.equal(empty.cycle_count, 0);
  assert.deepEqual(empty.topological_order, []);
  assert.deepEqual(empty.implementation_order, { serial: [], levels: [] });

  const single = runDagChecks({ packages: [PACKAGES[0]], edges: [] });
  assert.deepEqual(single.implementation_order.levels, [['pkg-a']]);

  const chain = runDagChecks({ packages: PACKAGES.slice(0, 3), edges: [{ from: 'pkg-a', to: 'pkg-b' }, { from: 'pkg-b', to: 'pkg-c' }] });
  assert.deepEqual(chain.implementation_order.levels, [['pkg-c'], ['pkg-b'], ['pkg-a']]);
});

test('C001 the proof is persisted in the manifest and recomputes identically', () => {
  const { manifest } = buildValidTreeManifest();
  const persisted = manifest.dependencies.dag;

  assert.equal(persisted.edge_count, 1);
  assert.equal(persisted.cycle_count, 0);
  assert.ok(Array.isArray(persisted.canonical_edges) && persisted.canonical_edges.length === 1);
  assert.deepEqual(persisted.implementation_order.levels, [['pkg-alpha'], ['pkg-beta']]);

  const recomputed = runDagChecks({ packages: manifest.workspace.packages, edges: persisted.canonical_edges });
  assert.deepEqual(recomputed.topological_order, persisted.topological_order);
  assert.deepEqual(recomputed.implementation_order, persisted.implementation_order);
});

test('C001 the published manifest carries the proof end to end', () => {
  const fixture = materializeTreeFixture();
  try {
    const dag = fixture.manifest.dependencies.dag;
    assert.ok(dag, 'dependencies.dag must be present in an assembled manifest');
    assert.equal(dag.cycle_count, 0);
    assert.equal(dag.implementation_order.serial.length, fixture.manifest.workspace.packages.length);
    assert.deepEqual(
      [...dag.implementation_order.serial].sort(),
      fixture.manifest.workspace.packages.map((pkg) => pkg.id).sort(),
    );
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});
