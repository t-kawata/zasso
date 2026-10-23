// PX-223 @verifies C002
//
// The levels are re-derived here and then required to equal the published order. The
// published order in every fixture below is authored by the test, not computed by the
// helper, so a passing comparison is evidence about the implementation rather than a
// restatement of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { materializeOrderWorkspace, packageIdAt } from '../helpers/order-workspace.mjs';
import { WorkspacifyOrderError } from '../../../.claude/scripts/workspacify-order/lib/errors.mjs';
import {
  assertMatchesPublished,
  buildModel,
  deriveLevels,
  displayWidth,
  findCriticalChain,
  markColumnFor,
} from '../../../.claude/scripts/workspacify-order/lib/levels.mjs';

/** Three packages, two of which depend on the first. */
// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
function twoLevelFixture() {
  return materializeOrderWorkspace({
    packages: ['pkg-0001', 'pkg-0002', 'pkg-0003'],
    edges: [
      ['pkg-0002', 'pkg-0001'],
      ['pkg-0003', 'pkg-0001'],
    ],
    levels: [['pkg-0001'], ['pkg-0002', 'pkg-0003']],
  });
}

test('C002 precondition: edges are read in the manifest orientation, consumer then provider', (t) => {
  const workspace = twoLevelFixture();
  t.after(() => workspace.remove());

  const edges = workspace.treeManifest.dependencies.dag.canonical_edges;
  assert.deepEqual(edges[0], { from: 'pkg-0002', to: 'pkg-0001' });
  assert.equal(workspace.allocateManifest.implementation_order.levels.length, 2);
});

test('C002 postcondition: derived levels equal the published levels and their flattening equals the published serial', (t) => {
  const workspace = twoLevelFixture();
  t.after(() => workspace.remove());

  const derived = deriveLevels({
    packageIds: workspace.treeManifest.workspace.packages.map((pkg) => pkg.id),
    edges: workspace.treeManifest.dependencies.dag.canonical_edges,
  });

  assert.deepEqual(derived, [['pkg-0001'], ['pkg-0002', 'pkg-0003']]);
  assertMatchesPublished({ derivedLevels: derived, allocateManifest: workspace.allocateManifest });
  assert.deepEqual(derived.flat(), workspace.allocateManifest.implementation_order.serial);
});

test('C002 postcondition: a package sits one level after its deepest provider, not its nearest', (t) => {
  const workspace = materializeOrderWorkspace({
    packages: ['pkg-0001', 'pkg-0002', 'pkg-0003', 'pkg-0004'],
    edges: [
      ['pkg-0002', 'pkg-0001'],
      ['pkg-0003', 'pkg-0002'],
      ['pkg-0004', 'pkg-0001'],
      ['pkg-0004', 'pkg-0003'],
    ],
    levels: [['pkg-0001'], ['pkg-0002'], ['pkg-0003'], ['pkg-0004']],
  });
  t.after(() => workspace.remove());

  const derived = deriveLevels({
    packageIds: workspace.treeManifest.workspace.packages.map((pkg) => pkg.id),
    edges: workspace.treeManifest.dependencies.dag.canonical_edges,
  });

  assert.deepEqual(derived, [['pkg-0001'], ['pkg-0002'], ['pkg-0003'], ['pkg-0004']]);
});

test('C002 invariant: a published order that disagrees with the edges throws before anything is rendered', (t) => {
  const workspace = twoLevelFixture();
  t.after(() => workspace.remove());
  const derived = [['pkg-0001'], ['pkg-0002', 'pkg-0003']];
  const broken = {
    implementation_order: { serial: ['pkg-0001', 'pkg-0003', 'pkg-0002'], levels: [['pkg-0001'], ['pkg-0003', 'pkg-0002']] },
  };

  assert.throws(
    () => assertMatchesPublished({ derivedLevels: derived, allocateManifest: broken }),
    (error) => error instanceof WorkspacifyOrderError && error.message.includes('disagrees'),
  );
});

test('C002 invariant: a missing published order throws rather than being treated as agreement', (t) => {
  const derived = [['pkg-0001']];

  assert.throws(
    () => assertMatchesPublished({ derivedLevels: derived, allocateManifest: {} }),
    (error) => error instanceof WorkspacifyOrderError && error.message.includes('implementation_order'),
  );
});

test('C002 invariant: the critical chain holds one member per level and every step is a declared edge', (t) => {
  const workspace = twoLevelFixture();
  t.after(() => workspace.remove());
  const edges = workspace.treeManifest.dependencies.dag.canonical_edges;
  const levels = [['pkg-0001'], ['pkg-0002', 'pkg-0003']];

  const chain = findCriticalChain({ levels, edges });
  const declared = new Set(edges.map((edge) => `${edge.from}>${edge.to}`));

  assert.equal(chain.length, levels.length);
  for (let index = 1; index < chain.length; index += 1) {
    assert.ok(declared.has(`${chain[index]}>${chain[index - 1]}`), `step ${index} is not a declared edge`);
  }
  assert.deepEqual(chain, ['pkg-0001', 'pkg-0002']);
});

test('C002 invariant: the chain starts at a package with no providers and is stable across calls', (t) => {
  const workspace = twoLevelFixture();
  t.after(() => workspace.remove());
  const edges = workspace.treeManifest.dependencies.dag.canonical_edges;
  const levels = [['pkg-0001'], ['pkg-0002', 'pkg-0003']];

  const chain = findCriticalChain({ levels, edges });
  const providers = edges.filter((edge) => edge.from === chain[0]);

  assert.deepEqual(providers, []);
  assert.deepEqual(findCriticalChain({ levels, edges }), chain);
});

test('C002 postcondition: buildModel indexes providers, consumers and the chain by package id', (t) => {
  const workspace = twoLevelFixture();
  t.after(() => workspace.remove());

  const model = buildModel({ root: workspace.root, ...loadPair(workspace) });

  assert.deepEqual(model.levels, [['pkg-0001'], ['pkg-0002', 'pkg-0003']]);
  assert.deepEqual(model.criticalChain, ['pkg-0001', 'pkg-0002']);
  assert.deepEqual(model.providersOf.get('pkg-0003'), ['pkg-0001']);
  assert.deepEqual(model.consumersOf.get('pkg-0001'), ['pkg-0002', 'pkg-0003']);
  assert.deepEqual(model.levelOf.get('pkg-0003'), 1);
  assert.equal(model.pathOf.get('pkg-0002'), workspace.pathOf.get('pkg-0002'));
  assert.equal(model.pathWidth, Math.max(...[...workspace.pathOf.values()].map((value) => value.length)));
});

test('C002 postcondition: buildModel refuses a workspace whose published order disagrees', (t) => {
  const workspace = twoLevelFixture();
  t.after(() => workspace.remove());
  workspace.writeAllocateManifest({
    implementation_order: { serial: ['pkg-0001', 'pkg-0003', 'pkg-0002'], levels: [['pkg-0001'], ['pkg-0003', 'pkg-0002']] },
    seed_index: [],
  });

  assert.throws(
    () => buildModel({ root: workspace.root, ...loadPair(workspace) }),
    (error) => error instanceof WorkspacifyOrderError && error.message.includes('disagrees'),
  );
});

test('C002 boundary: a single-package workspace yields one level and a chain of length one', (t) => {
  const workspace = materializeOrderWorkspace({ packages: [packageIdAt(0)], edges: [], levels: [['pkg-0001']] });
  t.after(() => workspace.remove());

  const model = buildModel({ root: workspace.root, ...loadPair(workspace) });

  assert.deepEqual(model.levels, [['pkg-0001']]);
  assert.deepEqual(model.criticalChain, ['pkg-0001']);
  assert.deepEqual(model.providersOf.get('pkg-0001'), []);
});

/** Re-read a fixture's manifests the way the command does, without importing the loader. */
// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
function loadPair(workspace) {
  return {
    treeManifest: JSON.parse(readFileSync(workspace.treeManifestPath, 'utf8')),
    allocateManifest: JSON.parse(readFileSync(workspace.allocateManifestPath, 'utf8')),
  };
}

// [::TICKET::] PX-282 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-282 --for-spec --no-implementation-order`.
test('C005 postcondition: markColumn is one column after the longest rendered path', (t) => {
  const workspace = materializeOrderWorkspace({
    packages: ['pkg-0001', 'pkg-0002', 'pkg-0003'],
    edges: [['pkg-0002', 'pkg-0001'], ['pkg-0003', 'pkg-0002']],
    levels: [['pkg-0001'], ['pkg-0002'], ['pkg-0003']],
    paths: {
      'pkg-0001': 'crates/core/gaia-core',
      'pkg-0002': 'crates/foundation/gaia-foundation',
      'pkg-0003': 'crates/adapters/storage/gaia-store-postgres',
    },
  });
  t.after(() => workspace.remove());

  const model = buildModel({ root: workspace.root, ...loadPair(workspace) });

  assert.equal(model.pathWidth, 43);
  // The prefix is four columns, so the longest line ends at 47 and the mark starts at 48.
  // A tab-stop calculation would round 29 up to 32 for a 24-column path; the exact gap
  // is one column, which keeps the view compact and independent of the viewer's tab width.
  assert.equal(model.markColumn, 48);
  assert.equal(markColumnFor(43), 48);
  assert.equal(markColumnFor(29), 34);
  assert.equal(markColumnFor(24), 29);
});

// [::TICKET::] PX-282 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-282 --for-spec --no-implementation-order`.
test('C005 postcondition: a full-width path is measured in terminal columns, not code units', (t) => {
  const workspace = materializeOrderWorkspace({
    packages: ['pkg-0001', 'pkg-0002'],
    edges: [['pkg-0002', 'pkg-0001']],
    levels: [['pkg-0001'], ['pkg-0002']],
    paths: {
      'pkg-0001': 'crates/core/日本',
      'pkg-0002': 'crates/core/日本語パッケージ',
    },
  });
  t.after(() => workspace.remove());

  const model = buildModel({ root: workspace.root, ...loadPair(workspace) });

  assert.equal(model.pathWidth, 28);
  assert.equal(model.markColumn, 33);
  assert.equal(markColumnFor(28), 33);
});

test('C005 invariant: displayWidth counts wide, zero-width and emoji clusters', () => {
  assert.equal(displayWidth('crates/protocol/package-1'), 25);
  assert.equal(displayWidth('aあ'), 3);
  assert.equal(displayWidth('🟤'), 2);
  // U+274C is East Asian Wide even though it sits below the CJK block, so a path carrying
  // it must reserve two columns.
  assert.equal(displayWidth('❌'), 2);
  // A base plus a combining mark is one terminal column, not two.
  assert.equal(displayWidth('e\u0301'), 1);
  // A ZWJ sequence and an emoji presentation selector are each one two-column glyph.
  assert.equal(displayWidth('👨\u200D👩\u200D👧'), 2);
  assert.equal(displayWidth('❤\uFE0F'), 2);
  assert.equal(displayWidth('❤'), 1);
  assert.equal(displayWidth('Ａ'), 2);
  assert.equal(displayWidth('ｱ'), 1);
});

test('C001/C002/C003 postcondition: buildModel carries the root and per-package counters', (t) => {
// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
  const workspace = materializeOrderWorkspace({
    packages: ['pkg-0001', 'pkg-0002'],
    edges: [['pkg-0002', 'pkg-0001']],
    levels: [['pkg-0001'], ['pkg-0002']],
    rootCounters: { educe: 10, smooth: 2 },
    counters: {
      'pkg-0001': { grillGeneration: 3, distributionGeneration: 3 },
      'pkg-0002': { completedSessions: 0 },
    },
  });
  t.after(() => workspace.remove());

  const model = buildModel({ root: workspace.root, ...loadPair(workspace) });

  assert.deepEqual(model.rootCounters, { edu: 10, smo: 2 });
  assert.equal(model.grillGenerations.get('pkg-0001'), 3);
  assert.equal(model.grillGenerations.get('pkg-0002'), null);
  assert.equal(model.distributionGenerations.get('pkg-0001'), 3);
  assert.equal(model.distributionGenerations.get('pkg-0002'), null);
});
