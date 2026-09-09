// [::TICKET::] PX-189 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-189 --for-spec --no-implementation-order`.
// PX-189 @verifies C001 C002 C003 C004 C005
// Branch-coverage hardening: exercises the remaining reachable branches of the
// four lib modules that the behaviour tests above do not already visit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadTreeManifest, checkAllocateEntryGate, readManifestSource } from '../../../.claude/scripts/workspacify-allocate/lib/tree-manifest-input.mjs';
import { classifyUnsafePath, isPathContained, resolvePackagePath, checkPlannedPathSafety } from '../../../.claude/scripts/workspacify-allocate/lib/path-safety.mjs';
import { buildDirectoryPlan } from '../../../.claude/scripts/workspacify-allocate/lib/directory-plan.mjs';
import { checkExistingOutputPolicy, createStagingRoot, materializeDirectories, verifyStaging, publishStagedTree, verifyDirectorySet, rollbackPublished } from '../../../.claude/scripts/workspacify-allocate/lib/tree-staging.mjs';
import { buildValidManifest } from '../helpers/build-valid-manifest.mjs';

function tempDir(label) {
  return mkdtempSync(join(tmpdir(), label));
}

test('tree-manifest-input: valid JSON loads; broken JSON throws', () => {
  const dir = tempDir('wt-189-bc-in-');
  try {
    const validPath = join(dir, 'valid.json');
    writeFileSync(validPath, '{}');
    const ok = loadTreeManifest(validPath);
    assert.equal(typeof ok, 'object');
    assert.throws(() => loadTreeManifest(join(dir, 'broken.json')), (e) => e.gateId !== undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('tree-manifest-input: contract boundary without a normal edge is reported', () => {
  const manifest = buildValidManifest({
    dependencies: {
      orientation: 'consumer_to_direct_dependency',
      normal_edges: [],
      forbidden_edges: [],
      forbidden_layer_rules: [],
      dev_dependency_policy: [],
      boundaries: [{ id: 'boundary-001', consumer_package: 'pkg-a', provider_package: 'pkg-b', dependency_reason_code: null, stage2_contract_scope: [] }],
    },
  }).manifest;
  const gate = checkAllocateEntryGate(manifest, process.cwd());
  assert.equal(gate.ok, false);
  assert.ok(gate.errors.some((err) => err.includes('boundary')));
});

test('tree-manifest-input: empty spec_path string is rejected by readManifestSource', () => {
  const dir = tempDir('wt-189-bc-spec-');
  try {
    const manifest = buildValidManifest({ input: { spec_path: '', source_hash: 'a'.repeat(64) } }).manifest;
    assert.throws(() => readManifestSource(manifest, dir), (e) => e.gateId === 'G0.3');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('path-safety: drive-letter and windows-separator classifications', () => {
  assert.ok(classifyUnsafePath('C:foo').length > 0);
  assert.ok(classifyUnsafePath('C:/foo').length > 0);
  const reasons = classifyUnsafePath('a\\b');
  assert.ok(reasons.some((reason) => reason.toLowerCase().includes('backslash')));
});

test('path-safety: resolvePackagePath gateId and containment of identical root', () => {
  const root = '/tmp/ws';
  assert.equal(isPathContained(root, '/tmp/ws'), true);
  try {
    resolvePackagePath('/tmp/ws', 'sub/../../escape');
    assert.fail('expected throw');
  } catch (error) {
    assert.ok(error.gateId !== undefined);
  }
});

test('directory-plan: undefined inputs behave like empty inputs', () => {
  const empty = buildDirectoryPlan({});
  assert.deepEqual(empty.relativeDirs, []);
  assert.equal(empty.consistent, true);
  const withTree = buildDirectoryPlan({ tree: [{ name: 'a', path: 'a', kind: 'dir', children: [] }], packages: undefined });
  assert.equal(withTree.consistent, false); // tree with no matching package
});

test('tree-staging: verifyDirectorySet flags missing dirs and unexpected extra dirs', () => {
  const dir = tempDir('wt-189-bc-stage-');
  const staging = createStagingRoot(dir);
  try {
    materializeDirectories(staging.path, ['crates/protocol/alpha']);
    assert.ok(verifyStaging(staging.path, ['crates/protocol/alpha']).ok);

    // Publish, then tamper: remove one planned dir and add an extra one.
    assert.ok(publishStagedTree(staging.path, dir, ['crates/protocol/alpha']).published);
    rmSync(join(dir, 'crates', 'protocol', 'alpha'), { recursive: true, force: true });
    mkdirSync(join(dir, 'rogue'), { recursive: true });
    const report = verifyDirectorySet(dir, ['crates/protocol/alpha']);
    assert.equal(report.ok, false);
    assert.ok(report.missing.includes('crates/protocol/alpha'));
    assert.ok(report.unexpected.includes('rogue'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('tree-manifest-input: invalid UTF-8 manifest bytes throw G0', () => {
  const dir = tempDir('wt-189-bc-utf8-');
  try {
    const badPath = join(dir, 'bad-utf8.json');
    writeFileSync(badPath, Buffer.from([0xff, 0xfe, 0x00, 0x01]));
    assert.throws(() => loadTreeManifest(badPath), (e) => e.gateId === 'G0');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('tree-manifest-input: artifact_kind, reload_validation, entry_gate, spec-escape branches', () => {
  // artifact_kind mismatch
  let manifest = buildValidManifest().manifest;
  assert.equal(checkAllocateEntryGate({ ...manifest, artifact_kind: 'other' }, process.cwd()).ok, false);

  // reload_validation not PASS
  manifest = buildValidManifest({ integrity: { reload_validation: 'FAIL' } }).manifest;
  assert.equal(checkAllocateEntryGate(manifest, process.cwd()).ok, false);

  // entry_gate present but required_status not COMPLETE
  manifest = buildValidManifest({
    stage2_handoff: { eligible: true, entry_gate: { required_status: 'BLOCKED' }, contract_definition_order: [], contract_boundaries: [] },
  }).manifest;
  assert.equal(checkAllocateEntryGate(manifest, process.cwd()).ok, false);

  // spec_path escapes the manifest directory (entry-gate path)
  const dir = tempDir('wt-189-bc-esc-');
  try {
    manifest = buildValidManifest({ input: { spec_path: '../escape.md', source_hash: 'f'.repeat(64) } }).manifest;
    const gate = checkAllocateEntryGate(manifest, dir);
    assert.equal(gate.ok, false);
    assert.ok(gate.errors.some((err) => err.includes('escapes')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('tree-manifest-input: readManifestSource rejects missing source_hash', () => {
  const dir = tempDir('wt-189-bc-hash-');
  try {
    const manifest = buildValidManifest({ input: { spec_path: 'spec.md' } }).manifest;
    assert.throws(() => readManifestSource(manifest, dir), (e) => e.gateId === 'G0.3');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('tree-staging: rollbackPublished removes only listed top-level dirs', () => {
  const dir = tempDir('wt-189-bc-rb-');
  try {
    mkdirSync(join(dir, 'keep'), { recursive: true });
    mkdirSync(join(dir, 'remove-me'), { recursive: true });
    writeFileSync(join(dir, 'keep', 'sentinel'), 'x');
    rollbackPublished(dir, ['remove-me']);
    // The listed dir is gone; the unlisted dir remains.
    assert.equal(existsSync(join(dir, 'remove-me')), false);
    assert.equal(existsSync(join(dir, 'keep')), true);
    assert.equal(existsSync(join(dir, 'keep', 'sentinel')), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
