// PX-223 @verifies C002
//
// The command promises that a failure writes one line and exits non-zero. A manifest that
// is missing the fields the order is derived from must therefore raise the command's own
// error naming the field, not a TypeError that reaches the operator as a stack trace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { materializeOrderWorkspace } from '../helpers/order-workspace.mjs';
import { WorkspacifyOrderError } from '../../../.claude/scripts/workspacify-order/lib/errors.mjs';
import { buildModel } from '../../../.claude/scripts/workspacify-order/lib/levels.mjs';

/**
 * A workspace whose manifest is written by hand, so a missing field can be expressed.
 *
 * @param {{ tree: object, allocate: object }} manifests — written verbatim
 */
// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
function handwrittenWorkspace(t, { tree, allocate }) {
  const root = mkdtempSync(join(tmpdir(), 'workspacify-order-shape-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify(tree));
  writeFileSync(join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify(allocate));
  return { root, treeManifest: tree, allocateManifest: allocate };
}

const PUBLISHED_ONE = { implementation_order: { serial: ['pkg-0001'], levels: [['pkg-0001']] } };
const ONE_PACKAGE = { id: 'pkg-0001', name: 'package-1', path: 'crates/protocol/package-1', layer: 'protocol' };

test('C002 precondition: a manifest without workspace.packages fails naming that field', (t) => {
  const workspace = handwrittenWorkspace(t, {
    tree: { dependencies: { dag: { canonical_edges: [] } } },
    allocate: { implementation_order: { serial: [], levels: [] } },
  });

  assert.throws(
    () => buildModel(workspace),
    (error) => error instanceof WorkspacifyOrderError && error.message.includes('workspace.packages'),
  );
});

test('C002 precondition: a manifest without dependencies.dag fails naming the edges field', (t) => {
  const workspace = handwrittenWorkspace(t, {
    tree: { workspace: { packages: [ONE_PACKAGE] } },
    allocate: PUBLISHED_ONE,
  });

  assert.throws(
    () => buildModel(workspace),
    (error) => error instanceof WorkspacifyOrderError && error.message.includes('dependencies.dag.canonical_edges'),
  );
});

test('C002 precondition: a workspace with no packages at all fails rather than rendering an empty plan', (t) => {
  const workspace = handwrittenWorkspace(t, {
    tree: { workspace: { packages: [] }, dependencies: { dag: { canonical_edges: [] } } },
    allocate: { implementation_order: { serial: [], levels: [] } },
  });

  assert.throws(
    () => buildModel(workspace),
    (error) => error instanceof WorkspacifyOrderError && error.message.includes('no packages'),
  );
});

test('C002 precondition: an edge naming a package the workspace does not hold fails rather than being dropped', (t) => {
  const workspace = handwrittenWorkspace(t, {
    tree: {
      workspace: { packages: [ONE_PACKAGE] },
      dependencies: { dag: { canonical_edges: [{ from: 'pkg-0001', to: 'pkg-9999' }] } },
    },
    allocate: PUBLISHED_ONE,
  });

  assert.throws(
    () => buildModel(workspace),
    (error) => error instanceof WorkspacifyOrderError && error.message.includes('pkg-9999'),
  );
});

test('C002 precondition: a package missing any field the plan prints fails naming that package', (t) => {
  const incomplete = {
    'no path': { id: 'pkg-0001', name: 'package-1' },
    'no name': { id: 'pkg-0001', path: 'crates/protocol/package-1' },
    'no id': { name: 'package-1', path: 'crates/protocol/package-1' },
    'an empty path': { id: 'pkg-0001', name: 'package-1', path: '' },
  };

  for (const [label, entry] of Object.entries(incomplete)) {
    const workspace = handwrittenWorkspace(t, {
      tree: { workspace: { packages: [entry] }, dependencies: { dag: { canonical_edges: [] } } },
      allocate: { implementation_order: { serial: [entry.id ?? null], levels: [[entry.id ?? null]] } },
    });

    assert.throws(
      () => buildModel(workspace),
      (error) => error instanceof WorkspacifyOrderError,
      `a package with ${label} must fail rather than reach the renderer`,
    );
  }
});

test('C002 precondition: a well-formed manifest of one package still builds, so the checks are not blanket refusals', (t) => {
  const workspace = materializeOrderWorkspace({ packages: ['pkg-0001'], edges: [], levels: [['pkg-0001']] });
  t.after(() => workspace.remove());

  const model = buildModel({
    root: workspace.root,
    treeManifest: workspace.treeManifest,
    allocateManifest: workspace.allocateManifest,
  });

  assert.deepEqual(model.levels, [['pkg-0001']]);
  assert.equal(model.pathWidth, 'crates/protocol/package-1'.length);
});
