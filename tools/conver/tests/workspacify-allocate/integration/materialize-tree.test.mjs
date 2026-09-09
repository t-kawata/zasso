// [::TICKET::] PX-189 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-189 --for-spec --no-implementation-order`.
// PX-189 @verifies C001 C003 C004 C005
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { loadTreeManifest, checkAllocateEntryGate, readManifestSource } from '../../../.claude/scripts/workspacify-allocate/lib/tree-manifest-input.mjs';
import { buildDirectoryPlan } from '../../../.claude/scripts/workspacify-allocate/lib/directory-plan.mjs';
import { checkPlannedPathSafety } from '../../../.claude/scripts/workspacify-allocate/lib/path-safety.mjs';
import { checkExistingOutputPolicy, createStagingRoot, materializeDirectories, verifyStaging, publishStagedTree, verifyDirectorySet } from '../../../.claude/scripts/workspacify-allocate/lib/tree-staging.mjs';
import { materializeManifestDir } from '../helpers/build-valid-manifest.mjs';

const TREE = [
  {
    name: 'crates',
    path: 'crates',
    kind: 'dir',
    children: [
      {
        name: 'protocol',
        path: 'crates/protocol',
        kind: 'dir',
        children: [{ name: 'alpha', path: 'crates/protocol/alpha', kind: 'dir', children: [] }],
      },
    ],
  },
];

test('IT materialize full pipeline in a temp manifest directory', () => {
  // Arrange: a real manifest + co-located spec, with one protocol package.
  const { dir, manifestPath, sourceHash } = materializeManifestDir({
    workspace: {
      tree: TREE,
      packages: [
        { id: 'pkg-alpha', name: 'alpha', path: 'crates/protocol/alpha', layer: 'protocol', kind: 'production-library', seed_required: true, owns: { objects: ['obj-000001'] } },
      ],
      ownership: { entries: [{ inventory_ref: 'obj-000001', canonical_name: 'obj-000001', category: 'object', owner_package: 'pkg-alpha' }], packages: ['pkg-alpha'] },
    },
  });
  const manifestBytesBefore = readFileSync(manifestPath);
  try {
    // Act: full module pipeline.
    const loaded = loadTreeManifest(manifestPath);
    const gate = checkAllocateEntryGate(loaded, dir);
    assert.ok(gate.ok, JSON.stringify(gate.errors));
    const { sourceText } = readManifestSource(loaded, dir);
    assert.ok(sourceText.length > 0);

    const plan = buildDirectoryPlan({ tree: loaded.workspace.tree, packages: loaded.workspace.packages });
    assert.ok(plan.consistent, JSON.stringify(plan.errors));
    assert.ok(plan.relativeDirs.includes('crates/protocol/alpha'));

    const safety = checkPlannedPathSafety({ root: dir, relativeDirs: plan.relativeDirs });
    assert.ok(safety.ok, JSON.stringify(safety.unsafe));

    const policy = checkExistingOutputPolicy(dir, plan.relativeDirs);
    assert.ok(policy.ok, policy.reason);

    const staging = createStagingRoot(dir);
    materializeDirectories(staging.path, plan.relativeDirs);
    assert.ok(verifyStaging(staging.path, plan.relativeDirs).ok);
    const published = publishStagedTree(staging.path, dir, plan.relativeDirs);
    assert.ok(published.published, published.reason);
    assert.ok(verifyDirectorySet(dir, plan.relativeDirs).ok);

    // Assert: the real directory exists and the manifest/spec files are untouched.
    assert.ok(existsSync(join(dir, 'crates', 'protocol', 'alpha')));
    assert.equal(readFileSync(manifestPath).equals(manifestBytesBefore), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('IT BLOCKED existing non-empty planned dir preserves pre-state end to end', () => {
  const { dir, manifestPath } = materializeManifestDir({
    workspace: { tree: TREE, packages: [{ id: 'pkg-alpha', name: 'alpha', path: 'crates/protocol/alpha', layer: 'protocol', kind: 'production-library', seed_required: true, owns: {} }], ownership: { entries: [], packages: ['pkg-alpha'] } },
  });
  try {
    // Pre-create a non-empty planned leaf dir.
    mkdirSync(join(dir, 'crates', 'protocol', 'alpha'), { recursive: true });
    writeFileSync(join(dir, 'crates', 'protocol', 'alpha', 'sentinel.txt'), 'keep');
    const loaded = loadTreeManifest(manifestPath);
    const plan = buildDirectoryPlan({ tree: loaded.workspace.tree, packages: loaded.workspace.packages });
    const policy = checkExistingOutputPolicy(dir, plan.relativeDirs);
    assert.equal(policy.ok, false);
    // The sentinel is untouched.
    assert.equal(readFileSync(join(dir, 'crates', 'protocol', 'alpha', 'sentinel.txt'), 'utf8'), 'keep');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
