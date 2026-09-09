// [::TICKET::] PX-189 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-189 --for-spec --no-implementation-order`.
// PX-189 @verifies C004
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildDirectoryPlan } from '../../../.claude/scripts/workspacify-allocate/lib/directory-plan.mjs';

function treeNode(name, path, children = []) {
  return { name, path, kind: 'dir', children };
}

test('C004 directory plan collects ancestors and leaves, sorted and unique', () => {
  const tree = [
    treeNode('crates', 'crates', [
      treeNode('protocol', 'crates/protocol', [treeNode('alpha', 'crates/protocol/alpha')]),
    ]),
  ];
  const packages = [{ id: 'pkg-alpha', path: 'crates/protocol/alpha', layer: 'protocol', kind: 'production-library', seed_required: true, name: "alpha", owns: {} }];
  const plan = buildDirectoryPlan({ tree, packages });
  assert.ok(plan.consistent, JSON.stringify(plan.errors));
  assert.deepEqual(plan.relativeDirs, ['crates', 'crates/protocol', 'crates/protocol/alpha']);
  assert.equal(plan.packageLeafByPackageId['pkg-alpha'], 'crates/protocol/alpha');
});

test('C004 duplicate leaf prefixes are deduplicated', () => {
  const tree = [
    treeNode('crates', 'crates', [
      treeNode('protocol', 'crates/protocol'),
      treeNode('protocol', 'crates/protocol', [treeNode('alpha', 'crates/protocol/alpha')]),
    ]),
  ];
  const packages = [{ id: 'pkg-a', path: 'crates/protocol', layer: 'protocol', kind: 'production-library', seed_required: true, name: "alpha", owns: {} }];
  const plan = buildDirectoryPlan({ tree, packages });
  // Duplicate node "crates/protocol" collapses to one entry; unsorted uniqueness holds.
  assert.deepEqual(plan.relativeDirs, ['crates', 'crates/protocol', 'crates/protocol/alpha']);
  // leaf<->package mismatch is still reported by the tree validator
  // (only "crates/protocol/alpha" is a leaf, but pkg-a points at "crates/protocol").
});

test('C004 determinism: identical inputs yield identical plans', () => {
  const tree = [treeNode('alpha', 'alpha')];
  const packages = [{ id: 'pkg-a', path: 'alpha', layer: 'protocol', kind: 'production-library', seed_required: true, name: "alpha", owns: {} }];
  const first = buildDirectoryPlan({ tree, packages });
  const second = buildDirectoryPlan({ tree, packages });
  assert.deepEqual(first.relativeDirs, second.relativeDirs);
  assert.deepEqual(first.errors, second.errors);
});

test('C004 empty workspace yields an empty plan', () => {
  const plan = buildDirectoryPlan({ tree: [], packages: [] });
  assert.deepEqual(plan.relativeDirs, []);
  assert.equal(plan.consistent, true);
  assert.deepEqual(plan.packageLeafByPackageId, {});
});

test('C004 packages declared without a tree is inconsistent', () => {
  const packages = [{ id: 'pkg-a', path: 'alpha', layer: 'protocol', kind: 'production-library', seed_required: true, name: "alpha", owns: {} }];
  const plan = buildDirectoryPlan({ tree: [], packages });
  assert.equal(plan.consistent, false);
  assert.ok(plan.errors.some((err) => err.includes('tree')));
});

test('C004 tree with no matching package is inconsistent', () => {
  const tree = [treeNode('alpha', 'alpha')];
  const plan = buildDirectoryPlan({ tree, packages: [] });
  assert.equal(plan.consistent, false);
  assert.ok(plan.errors.some((err) => err.includes('package')));
});

test('C004 unsafe tree path is reported as an error', () => {
  const tree = [treeNode('escape', '../escape')];
  const packages = [{ id: 'pkg-a', path: '../escape', layer: 'protocol', kind: 'production-library', seed_required: true, name: "alpha", owns: {} }];
  const plan = buildDirectoryPlan({ tree, packages });
  assert.equal(plan.consistent, false);
  assert.ok(plan.errors.some((err) => err.includes('unsafe')));
});

test('C004 invalid package catalog is reported', () => {
  const tree = [treeNode('alpha', 'alpha')];
  const packages = [{ id: 'pkg-a', path: 'alpha', layer: 'bogus-layer', kind: 'production-library', seed_required: true, name: "alpha", owns: {} }];
  const plan = buildDirectoryPlan({ tree, packages });
  assert.equal(plan.consistent, false);
  assert.ok(plan.errors.some((err) => err.includes('layer')));
});
