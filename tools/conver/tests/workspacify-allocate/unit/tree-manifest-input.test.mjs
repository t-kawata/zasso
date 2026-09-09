// [::TICKET::] PX-189 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-189 --for-spec --no-implementation-order`.
// PX-189 @verifies C001 C002
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadTreeManifest, checkAllocateEntryGate, readManifestSource } from '../../../.claude/scripts/workspacify-allocate/lib/tree-manifest-input.mjs';
import { materializeManifestDir, buildValidManifest, zeroAudit } from '../helpers/build-valid-manifest.mjs';

function tempDir(label) {
  return mkdtempSync(join(tmpdir(), label));
}

test('C001 entry gate ok and source read', () => {
  // Arrange: manifest + co-located spec on disk in a temp dir.
  const { dir, manifestPath, sourceHash } = materializeManifestDir();
  try {
    // Act
    const loaded = loadTreeManifest(manifestPath);
    const gate = checkAllocateEntryGate(loaded, dir);
    const { sourceText, sourceHash: readHash } = readManifestSource(loaded, dir);
    // Assert
    assert.ok(gate.ok, JSON.stringify(gate.errors));
    assert.equal(readHash, sourceHash);
    assert.ok(sourceText.includes('obj-000001'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C001 loadTreeManifest rejects missing, directory, empty, and non-JSON inputs', () => {
  const dir = tempDir('wt-189-load-');
  try {
    // missing
    assert.throws(() => loadTreeManifest(join(dir, 'nope.json')), (e) => e.gateId !== undefined);
    // directory
    assert.throws(() => loadTreeManifest(dir), (e) => e.gateId !== undefined);
    // empty file
    const emptyPath = join(dir, 'empty.json');
    writeFileSync(emptyPath, '');
    assert.throws(() => loadTreeManifest(emptyPath), (e) => e.gateId !== undefined);
    // invalid JSON
    const badPath = join(dir, 'bad.json');
    writeFileSync(badPath, '{ not json');
    assert.throws(() => loadTreeManifest(badPath), (e) => e.gateId !== undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C001 self-hash mismatch is reported', () => {
  const { manifest } = buildValidManifest();
  const tampered = JSON.parse(JSON.stringify(manifest));
  tampered.integrity.manifest_hash = '0'.repeat(64);
  const gate = checkAllocateEntryGate(tampered, process.cwd());
  assert.equal(gate.ok, false);
  assert.ok(gate.errors.some((err) => err.includes('self-hash')));
});

test('C001 status/final_audit/handoff/orientation violations are reported', () => {
  const base = () => buildValidManifest().manifest;
  const cases = [
    { ...base(), status: 'REVIEW_REQUIRED' },
    { ...base(), final_audit: { ...zeroAudit(), unresolved_count: 2 } },
    { ...base(), final_audit: { ...zeroAudit(), status: 'FAIL' } },
    { ...base(), stage2_handoff: { ...base().stage2_handoff, eligible: false } },
    { ...base(), dependencies: { ...base().dependencies, orientation: 'provider_to_consumer' } },
  ];
  for (const candidate of cases) {
    const gate = checkAllocateEntryGate(candidate, process.cwd());
    assert.equal(gate.ok, false);
    assert.ok(gate.errors.length > 0);
  }
});

test('C001 edge<->boundary parity and ownership/category coverage violations are reported', () => {
  const withEdges = buildValidManifest({
    workspace: {
      tree: [{ name: 'crates', path: 'crates', kind: 'dir', children: [] }],
      packages: [{ id: 'pkg-a', name: 'alpha', path: 'crates', layer: 'protocol', kind: 'production-library', seed_required: true, owns: { objects: ['obj-000001'] } }],
      ownership: { entries: [{ inventory_ref: 'obj-000001', canonical_name: 'obj-000001', category: 'object', owner_package: 'pkg-a' }], packages: ['pkg-a'] },
    },
    dependencies: {
      orientation: 'consumer_to_direct_dependency',
      normal_edges: [{ from: 'pkg-a', to: 'pkg-b' }],
      forbidden_edges: [],
      forbidden_layer_rules: [],
      dev_dependency_policy: [],
      boundaries: [],
    },
  }).manifest;
  const parityGate = checkAllocateEntryGate(withEdges, process.cwd());
  assert.equal(parityGate.ok, false);
  assert.ok(parityGate.errors.some((err) => err.includes('normal edge')));

  // Ownership entry targeting an unknown package.
  const unknownOwner = buildValidManifest({
    workspace: {
      tree: [],
      packages: [],
      ownership: { entries: [{ inventory_ref: 'obj-1', canonical_name: 'obj-1', category: 'object', owner_package: 'missing' }], packages: [] },
    },
  }).manifest;
  const ownerGate = checkAllocateEntryGate(unknownOwner, process.cwd());
  assert.equal(ownerGate.ok, false);
  assert.ok(ownerGate.errors.some((err) => err.includes('unknown package')));

  // Category inventory item with no ownership entry.
  const missingCategory = buildValidManifest({
    inventory: { objects: [], claims: [], invariants: [{ id: 'inv-1' }], state_machines: [], error_codes: [], required_tests: [], terms: [], normalization_decisions: [], unresolved_candidates: [] },
    workspace: { tree: [], packages: [], ownership: { entries: [], packages: [] } },
  }).manifest;
  const categoryGate = checkAllocateEntryGate(missingCategory, process.cwd());
  assert.equal(categoryGate.ok, false);
  assert.ok(categoryGate.errors.some((err) => err.includes('invariants')));
});

test('C001 schema-invalid manifest is rejected', () => {
  const { manifest } = buildValidManifest();
  delete manifest.workspace;
  const gate = checkAllocateEntryGate(manifest, process.cwd());
  assert.equal(gate.ok, false);
  assert.ok(gate.errors.some((err) => err.includes('workspace') || err.includes('required')));
});

test('C002 spec re-hash mismatch BLOCKs with gateId G0.3', () => {
  const dir = tempDir('wt-189-spec-');
  try {
    const { manifest } = buildValidManifest();
    writeFileSync(join(dir, 'spec.md'), '# Different spec content\n');
    assert.throws(() => readManifestSource(manifest, dir), (e) => e.gateId === 'G0.3');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C002 spec absent, directory, or escaping path BLOCKs with gateId G0.3', () => {
  const dir = tempDir('wt-189-spec2-');
  try {
    // Absent spec file.
    const absent = buildValidManifest().manifest;
    assert.throws(() => readManifestSource(absent, dir), (e) => e.gateId === 'G0.3');
    // Spec path escaping the manifest directory must not be probed.
    const escaping = buildValidManifest({
      input: { spec_path: '../elsewhere.md', source_hash: 'f'.repeat(64) },
    }).manifest;
    assert.throws(() => readManifestSource(escaping, dir), (e) => e.gateId === 'G0.3');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C002 spec_path present resolves and returns LF-normalized text', () => {
  const dir = tempDir('wt-189-spec3-');
  try {
    const { manifest, specText, sourceHash } = buildValidManifest();
    writeFileSync(join(dir, 'spec.md'), specText);
    const { sourceText, sourceHash: actualHash } = readManifestSource(manifest, dir);
    assert.equal(actualHash, sourceHash);
    assert.equal(sourceText, specText);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
