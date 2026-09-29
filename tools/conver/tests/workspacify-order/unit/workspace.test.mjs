// PX-223 @verifies C001
//
// The workspace root is discovered, never configured. These cases pin the discovery rule:
// exactly one ancestor may hold both manifests, and every other shape fails with a message
// naming the artefact that was missing, because a plan printed from a guessed root would
// describe a different workspace than the one on disk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ALLOCATE_MANIFEST_FILE_NAME,
  TREE_MANIFEST_FILE_NAME,
  materializeOrderWorkspace,
} from '../helpers/order-workspace.mjs';
import { WorkspacifyOrderError } from '../../../.claude/scripts/workspacify-order/lib/errors.mjs';
import { ancestorsOf, loadWorkspace, resolveWorkspaceRoot } from '../../../.claude/scripts/workspacify-order/lib/workspace.mjs';

// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
function scratchDirectory(t, prefix) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('C001 precondition: the root and any directory inside it resolve to the same root', (t) => {
  const workspace = materializeOrderWorkspace({ packages: ['pkg-0001'] });
  t.after(() => workspace.remove());
  const nested = join(workspace.root, 'crates', 'protocol', 'package-1');

  assert.equal(resolveWorkspaceRoot(workspace.root), workspace.root);
  assert.equal(resolveWorkspaceRoot(nested), workspace.root);
});

test('C001 precondition: ancestorsOf lists the start directory first and the filesystem root last', (t) => {
  const workspace = materializeOrderWorkspace({ packages: ['pkg-0001'] });
  t.after(() => workspace.remove());
  const nested = join(workspace.root, 'crates', 'protocol', 'package-1');

  const ancestors = ancestorsOf(nested);
  assert.equal(ancestors[0], nested);
  assert.ok(ancestors.includes(workspace.root));
  assert.equal(ancestors.at(-1), '/');
});

test('C001 postcondition: loadWorkspace returns both manifests parsed, unmodified', (t) => {
  const workspace = materializeOrderWorkspace({ packages: ['pkg-0001', 'pkg-0002'], edges: [['pkg-0002', 'pkg-0001']] });
  t.after(() => workspace.remove());

  const loaded = loadWorkspace(workspace.root);

  assert.equal(loaded.root, workspace.root);
  assert.equal(loaded.treeManifestPath, join(workspace.root, TREE_MANIFEST_FILE_NAME));
  assert.equal(loaded.allocateManifestPath, join(workspace.root, ALLOCATE_MANIFEST_FILE_NAME));
  assert.deepEqual(loaded.treeManifest, workspace.treeManifest);
  assert.deepEqual(loaded.allocateManifest, workspace.allocateManifest);
});

test('C001 invariant: no manifest above the directory fails naming the tree manifest', (t) => {
  const empty = scratchDirectory(t, 'workspacify-order-empty-');

  assert.throws(
    () => resolveWorkspaceRoot(empty),
    (error) => error instanceof WorkspacifyOrderError && error.message.includes(TREE_MANIFEST_FILE_NAME),
  );
});

test('C001 invariant: two ancestors holding both manifests fail as ambiguous rather than picking the nearer one', (t) => {
  const workspace = materializeOrderWorkspace({ packages: ['pkg-0001'] });
  t.after(() => workspace.remove());
  const nested = join(workspace.root, 'crates', 'protocol', 'package-1');
  writeFileSync(join(nested, TREE_MANIFEST_FILE_NAME), '{}');
  writeFileSync(join(nested, ALLOCATE_MANIFEST_FILE_NAME), '{}');

  assert.throws(
    () => resolveWorkspaceRoot(nested),
    (error) => error instanceof WorkspacifyOrderError && error.message.includes('more than one'),
  );
});

test('C001 invariant: a tree manifest without an allocate manifest fails naming the allocate manifest', (t) => {
  const half = scratchDirectory(t, 'workspacify-order-half-');
  writeFileSync(join(half, TREE_MANIFEST_FILE_NAME), '{}');

  assert.throws(
    () => resolveWorkspaceRoot(half),
    (error) => error instanceof WorkspacifyOrderError && error.message.includes(ALLOCATE_MANIFEST_FILE_NAME),
  );
});

test('C001 invariant: an unreadable manifest reports the artefact that could not be parsed', (t) => {
  const workspace = materializeOrderWorkspace({ packages: ['pkg-0001'] });
  t.after(() => workspace.remove());
  writeFileSync(workspace.allocateManifestPath, '{ this is not json');

  assert.throws(
    () => loadWorkspace(workspace.root),
    (error) => error instanceof WorkspacifyOrderError && error.message.includes(ALLOCATE_MANIFEST_FILE_NAME),
  );
});
