// [::TICKET::] PX-193 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-193 --for-spec --no-implementation-order`.
// PX-193 @verifies C001
// The three reference paths are machine-injected: the AI can neither omit nor
// rewrite them, and any disagreement with the files on disk is a gate failure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildReferenceBlock } from '../../../.claude/scripts/workspacify-allocate/lib/reference-block.mjs';
import { materializeManifestDir } from '../helpers/build-valid-manifest.mjs';

/**
 * A block input whose overrides land in the group they belong to, so a test can replace
 * the manifest inside the manifestRef or any seed fact without nesting the spread by hand.
 */
function blockArgs(fixture, overrides = {}) {
  const {
    manifest = fixture.manifest, manifestPath = fixture.manifestPath, manifestDir = fixture.dir,
    package: packageOverride, ...seedOverrides
  } = overrides;
  return {
    manifestRef: { manifest, manifestPath, manifestDir },
    seed: {
      package: packageOverride ?? fixture.manifest.workspace.packages[0],
      orderEntry: { before: [], after: ['pkg-b'], parallel_with: [], serial_index: 0, wave: 0 },
      contractIds: ['contract-boundary-001'],
      sourceSegments: ['s-000001'],
      ...seedOverrides,
    },
  };
}

test('C001 the block carries the three references resolved from disk and the manifest', () => {
  const fixture = materializeManifestDir();
  try {
    const block = buildReferenceBlock(blockArgs(fixture));
    assert.equal(block.package.id, 'pkg-a');
    assert.ok(block.package.responsibilities.length > 0);
    assert.equal(block.source_spec.path, 'spec.md');
    assert.equal(block.source_spec.sha256, fixture.manifest.input.source_hash);
    assert.equal(block.stage1_manifest.path, 'WORKSPACIFY-TREE-MANIFEST.json');
    assert.equal(block.stage1_manifest.hash, fixture.manifest.integrity.manifest_hash);
    assert.equal(block.stage2_manifest.path, 'WORKSPACIFY-ALLOCATE-MANIFEST.json');
    assert.deepEqual(block.implementation_order, { before: [], after: ['pkg-b'], parallel_with: [], serial_index: 0, wave: 0 });
    assert.deepEqual(block.contract_refs, ['contract-boundary-001']);
    assert.deepEqual(block.source_segments, ['s-000001']);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('C001 a spec hash that disagrees with the manifest fails the block', () => {
  const fixture = materializeManifestDir();
  try {
    const tampered = { ...fixture.manifest, input: { ...fixture.manifest.input, source_hash: 'f'.repeat(64) } };
    assert.throws(
      () => buildReferenceBlock(blockArgs(fixture, { manifest: tampered })),
      (error) => error.gateId === 'G3.1' && /source_hash/.test(error.message),
    );
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('C001 a missing or edited specification fails the block', () => {
  const fixture = materializeManifestDir();
  try {
    writeFileSync(join(fixture.dir, 'spec.md'), '# Spec\n\nedited\n');
    assert.throws(() => buildReferenceBlock(blockArgs(fixture)), (error) => error.gateId === 'G3.1');

    rmSync(join(fixture.dir, 'spec.md'));
    assert.throws(() => buildReferenceBlock(blockArgs(fixture)), (error) => error.gateId === 'G3.1');
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('C001 a stage-1 hash that disagrees with the manifest on disk fails the block', () => {
  const fixture = materializeManifestDir();
  try {
    const edited = JSON.parse(readFileSync(fixture.manifestPath, 'utf8'));
    edited.integrity.manifest_hash = 'a'.repeat(64);
    const args = blockArgs(fixture, { manifest: edited });
    assert.throws(() => buildReferenceBlock(args), (error) => error.gateId === 'G3.1' && /stage1_manifest|manifest/.test(error.message));
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('C001 the canonical stage-2 path cannot be overridden', () => {
  const fixture = materializeManifestDir();
  try {
    const block = buildReferenceBlock(blockArgs(fixture));
    assert.match(block.stage2_manifest.path, /^WORKSPACIFY-ALLOCATE-MANIFEST\.json$/);
    const injected = buildReferenceBlock(blockArgs(fixture, { stage2ManifestPath: '../elsewhere/OTHER.json' }));
    assert.equal(injected.stage2_manifest.path, 'WORKSPACIFY-ALLOCATE-MANIFEST.json');
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('C001 a package without responsibilities cannot produce a block', () => {
  const fixture = materializeManifestDir();
  try {
    const stripped = JSON.parse(JSON.stringify(fixture.manifest));
    stripped.workspace.packages[0].responsibilities = [];
    assert.throws(
      () => buildReferenceBlock(blockArgs(fixture, { manifest: stripped, package: stripped.workspace.packages[0] })),
      (error) => error.gateId === 'G3.1' && /responsibilit/i.test(error.message),
    );
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});
