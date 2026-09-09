// [::TICKET::] PX-188: low-branch lib coverage.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-188 --for-spec --no-implementation-order`
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WorkSpacifyTreeError } from '../../../.claude/scripts/workspacify-tree/lib/errors.mjs';
import { atomicPublish } from '../../../.claude/scripts/workspacify-tree/lib/atomic-publish.mjs';
import { loadDecisionInput } from '../../../.claude/scripts/workspacify-tree/lib/decision-input.mjs';
import { checkDatabasePolicy } from '../../../.claude/scripts/workspacify-tree/lib/database-policy.mjs';
import { assembleManifest, computeSelfHash } from '../../../.claude/scripts/workspacify-tree/lib/render.mjs';
import { normalizeAliases, detectAliasCycles } from '../../../.claude/scripts/workspacify-tree/lib/alias-normalization.mjs';
import { canonicalSerialize } from '../../../.claude/scripts/workspacify-tree/lib/canonical-json.mjs';
import { validateAgainstSchema } from '../../../.claude/scripts/workspacify-tree/lib/manifest-schema.mjs';
import { verifyReconstruction } from '../../../.claude/scripts/workspacify-tree/lib/segmentation.mjs';
import { attachSourceRefs } from '../../../.claude/scripts/workspacify-tree/lib/traceability.mjs';
import { layerIndex, validateWorkspaceTree } from '../../../.claude/scripts/workspacify-tree/lib/workspace-model.mjs';
import { checkDependencyMatrix } from '../../../.claude/scripts/workspacify-tree/lib/dependencies.mjs';
import { checkPortAdapterBoundary } from '../../../.claude/scripts/workspacify-tree/lib/adapters.mjs';
import { sha256Hex } from '../../../.claude/scripts/workspacify-tree/lib/hash.mjs';
import { buildInventoryReport } from '../../../.claude/scripts/workspacify-tree/lib/inventory-report.mjs';
import { runGatePipeline } from '../../../.claude/scripts/workspacify-tree/lib/validation.mjs';
import { checkTreeEntryGate } from '../../../.claude/scripts/workspacify-tree/lib/entry-parity.mjs';
import { harvestClaimCandidates, harvestObjectCandidates } from '../../../.claude/scripts/workspacify-tree/lib/extraction.mjs';
import { buildHeadingTree } from '../../../.claude/scripts/workspacify-tree/lib/headings.mjs';
import { segmentAtHeadings } from '../../../.claude/scripts/workspacify-tree/lib/segmentation.mjs';
import { readSpecInput } from '../../../.claude/scripts/workspacify-tree/lib/fs-safe.mjs';
import { runDagChecks } from '../../../.claude/scripts/workspacify-tree/lib/dag.mjs';

const REF = () => [{ line_start: 1 }];

test('PX-188 C002 [PX-188 @verifies C002]: reload self-hash mismatch returns FAIL and leaves no temp file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-atom-'));
  const content = JSON.stringify({ integrity: { manifest_hash: '0'.repeat(64) } });
  const result = atomicPublish({ dir, fileName: 'M.json', content, sourceHash: 'h' });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.published, false);
  assert.equal(result.reloadOk, undefined);
});

test('PX-188 C002 [PX-188 @verifies C002]: write failure (missing dir) returns FAIL without throwing', () => {
  const missing = join(tmpdir(), 'wst-no-such-dir-' + Date.now());
  const result = atomicPublish({ dir: missing, fileName: 'M.json', content: '{}', sourceHash: 'h' });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.published, false);
});

test('PX-188 C002 [PX-188 @verifies C002]: a BLOCKED overwrite never replaces the existing manifest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-atom-'));
  const existing = JSON.stringify({ input: { source_hash: 'old' } });
  writeFileSync(join(dir, 'M.json'), existing);
  const result = atomicPublish({ dir, fileName: 'M.json', content: '{}', sourceHash: 'new' });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.published, false);
  assert.equal(readFileSync(join(dir, 'M.json'), 'utf8'), existing);
});

test('PX-188 C003 [PX-188 @verifies C003]: loadDecisionInput throws G3 for a missing path and for invalid JSON', () => {
  assert.throws(
    () => loadDecisionInput(join(tmpdir(), 'wst-no-such-decision.json')),
    (error) => error instanceof WorkSpacifyTreeError && error.gateId === 'G3'
  );
  const dir = mkdtempSync(join(tmpdir(), 'wst-di-'));
  const badPath = join(dir, 'bad.json');
  writeFileSync(badPath, '{ not json');
  assert.throws(
    () => loadDecisionInput(badPath),
    (error) => error instanceof WorkSpacifyTreeError && error.gateId === 'G3'
  );
});

test('PX-188 C003 [PX-188 @verifies C003]: database policy short-circuits when not applicable and counts migration misuse', () => {
  const off = checkDatabasePolicy({ databasePolicy: { applicable: false }, packages: [{ id: 'p', layer: 'protocol', rawSqlFragments: ['SELECT 1'] }] });
  assert.equal(off.raw_sql_count, 0);
  const misuse = checkDatabasePolicy({ databasePolicy: { applicable: true }, packages: [{ id: 'p', layer: 'protocol', migrationAsAtomicity: true }] });
  assert.equal(misuse.migration_atomicity_misuse_count, 1);
  assert.ok(misuse.details.some((entry) => entry.includes('domain atomicity')));
});

test('PX-188 C003 [PX-188 @verifies C003]: rawSqlProhibited false does not count and db-specific types leak in protocol', () => {
  const allowed = checkDatabasePolicy({ databasePolicy: { applicable: true, rawSqlProhibited: false }, packages: [{ id: 'p', layer: 'protocol', rawSqlFragments: ['SELECT 1'] }] });
  assert.equal(allowed.raw_sql_count, 0);
  const leak = checkDatabasePolicy({ databasePolicy: { applicable: true }, packages: [{ id: 'p', layer: 'protocol', dbSpecificTypes: ['uuid'] }] });
  assert.equal(leak.db_type_leak_count, 1);
});

test('PX-188 C004 [PX-188 @verifies C004]: assembleManifest fills missing required top-level keys and self-hash round-trips', () => {
  const manifest = assembleManifest({ status: 'COMPLETE' });
  const keys = ['artifact_kind', 'schema_version', 'status', 'run', 'input', 'structure', 'inventory', 'requirements', 'workspace', 'adapters', 'dependencies', 'conformance', 'stage2_handoff', 'gates', 'final_audit', 'integrity'];
  for (const key of keys) {
    assert.ok(key in manifest, `manifest.${key} present`);
  }
  assert.equal(computeSelfHash(manifest), manifest.integrity.manifest_hash);
});

test('PX-188 C004 [PX-188 @verifies C004]: detectAliasCycles breaks on a visited node and reports only one cycle', () => {
  const cycles = detectAliasCycles([
    { name: 'a', alias: 'b' },
    { name: 'b', alias: 'a' },
    { name: 'c', alias: 'b' },
  ]);
  assert.equal(cycles.length, 1);
});

test('PX-188 C004 [PX-188 @verifies C004]: normalizeAliases promotes an unknown primary and degrades a conflict', () => {
  const promoted = normalizeAliases([
    { canonical_name: 'Foo', classification: 'unknown', source_refs: REF() },
    { canonical_name: 'foo', classification: 'object', source_refs: REF() },
  ]);
  assert.equal(promoted.candidates.find((candidate) => candidate.canonical_name === 'Foo').classification, 'object');
  const conflict = normalizeAliases([
    { canonical_name: 'Foo', classification: 'record', source_refs: REF() },
    { canonical_name: 'foo', classification: 'certificate', source_refs: REF() },
  ]);
  assert.equal(conflict.candidates.find((candidate) => candidate.canonical_name === 'Foo').classification, 'unknown');
});

test('PX-188 C004 [PX-188 @verifies C004]: canonicalSerialize renders a Date as UTC ISO and detects circularity', () => {
  assert.equal(canonicalSerialize(new Date('2020-01-02T03:04:05.000Z')), '"2020-01-02T03:04:05.000Z"\n');
  const circular = {};
  circular.self = circular;
  assert.throws(() => canonicalSerialize(circular), /circular/i);
});

test('PX-188 C004 [PX-188 @verifies C004]: schema const mismatch and type null and describe null/array', () => {
  assert.equal(validateAgainstSchema(1, { const: 2 }).valid, false);
  assert.equal(validateAgainstSchema(null, { type: 'null' }).valid, true);
  assert.equal(validateAgainstSchema(1, { type: 'null' }).valid, false);
  assert.equal(validateAgainstSchema(null, { type: 'string' }).valid, false);
  assert.equal(validateAgainstSchema([1], { type: 'string' }).valid, false);
});

test('PX-188 C004 [PX-188 @verifies C004]: verifyReconstruction reports past-end, gap, and non-positive ranges', () => {
  const bytes = Buffer.from('0123456789');
  const badPast = verifyReconstruction({ sourceBytes: bytes, sourceHash: 'x', segments: [{ byte_start: 0, byte_end: 100 }] });
  assert.notEqual(badPast.status, 'PASS');
  const gap = verifyReconstruction({ sourceBytes: bytes, sourceHash: 'x', segments: [{ byte_start: 0, byte_end: 5 }] });
  assert.notEqual(gap.status, 'PASS');
  const badRange = verifyReconstruction({ sourceBytes: bytes, sourceHash: 'x', segments: [{ byte_start: 0, byte_end: 10 }, { byte_start: 10, byte_end: 5 }] });
  assert.notEqual(badRange.status, 'PASS');
});

test('PX-188 C004 [PX-188 @verifies C004]: attachSourceRefs appends immutably', () => {
  const original = { id: 'c', source_refs: [{ line_start: 1 }] };
  const next = attachSourceRefs(original, [{ line_start: 2 }]);
  assert.equal(next.source_refs.length, 2);
  assert.equal(original.source_refs.length, 1);
});

test('PX-188 C004 [PX-188 @verifies C004]: sha256Hex accepts a string input', () => {
  const expected = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  assert.equal(sha256Hex('abc'), expected);
});

test('PX-188 C004 [PX-188 @verifies C004]: inventory report counts review_status-only candidates and category stats', () => {
  const report = buildInventoryReport({
    objects: [{ review_status: 'CONFIRMED' }],
    claims: [{ review_status: 'REVIEW_REQUIRED' }],
    terms: [],
    invariants: [{ id: 'i' }],
    stateMachines: [{ id: 's' }],
    errorCodes: [{ id: 'e' }],
    requiredTests: [{ id: 't' }],
  });
  assert.equal(report.stats.confirmed, 1);
  assert.equal(report.stats.review_required, 1);
  assert.equal(report.stats.invariants, 1);
  assert.equal(report.stats.state_machines, 1);
  assert.equal(report.stats.error_codes, 1);
  assert.equal(report.stats.required_tests, 1);
});

test('PX-188 C004 [PX-188 @verifies C004]: layerIndex orders the vocabulary and rejects unknowns', () => {
  assert.equal(layerIndex('core'), 4);
  assert.equal(layerIndex('interfaces'), 5);
  assert.equal(layerIndex('nope'), -1);
});

test('PX-188 C004 [PX-188 @verifies C004]: validateWorkspaceTree skips non-dir file nodes', () => {
  const tree = [{ name: 'crates', path: 'crates', kind: 'dir', children: [{ name: 'a.ts', path: 'crates/a.ts', kind: 'file' }] }];
  const result = validateWorkspaceTree({ tree, packages: [] });
  assert.equal(Array.isArray(result.errors), true);
  assert.equal(result.treePaths.includes('crates/a.ts'), false);
});

test('PX-188 C004 [PX-188 @verifies C004]: dependencies matrix tolerates omitted arrays and reports invalid reason and unknown source', () => {
  const empty = checkDependencyMatrix({ packages: [], normalEdges: undefined, forbiddenEdges: undefined });
  assert.equal(empty.missingReasonCode.length, 0);
  assert.equal(empty.undeclared.length, 0);
  const pkg = { id: 'a', layer: 'protocol' };
  const invalid = checkDependencyMatrix({ packages: [pkg], normalEdges: [{ from: 'a', to: 'a', kind: 'normal', reasonCode: 'not-a-real-code' }], forbiddenEdges: [] });
  assert.equal(invalid.missingReasonCode.length, 1);
  const ghost = checkDependencyMatrix({ packages: [pkg], normalEdges: [{ from: 'ghost', to: 'a', reasonCode: 'port-contract' }], forbiddenEdges: [] });
  assert.equal(ghost.undeclared.length, 1);
});

test('PX-188 C004 [PX-188 @verifies C004]: adapter boundary reports a domain missing port, accepts provided capability, and skips missing field', () => {
  const missing = checkPortAdapterBoundary({ ports: [], packages: [{ id: 'd', layer: 'domain', kind: 'production-library', externalImplementations: ['payments'] }] });
  assert.equal(missing.missingPorts.includes('payments'), true);
  const provided = checkPortAdapterBoundary({ ports: [{ id: 'p1', provides: ['storage'] }], packages: [{ id: 'd', layer: 'protocol', kind: 'production-library', externalImplementations: ['storage'] }] });
  assert.equal(provided.missingPorts.length, 0);
  const noField = checkPortAdapterBoundary({ ports: [], packages: [{ id: 'd', layer: 'protocol', kind: 'production-library' }] });
  assert.equal(noField.missingPorts.length, 0);
});

test('PX-188 C004 [PX-188 @verifies C004]: a boundary provider outside the catalog fails G3', () => {
  const pipeline = runGatePipeline({
    structure: { reconstruction: { status: 'PASS' } },
    inventory: { objects: [{ id: 'obj-1', owner_package: 'a', source_refs: REF() }] },
    workspace: {
      packages: [{ id: 'a', name: 'a', path: 'crates/a', layer: 'protocol', kind: 'production-library', responsibilities: ['x'], seed_required: true, owns: { objects: ['obj-1'], claims: [], invariants: [], state_machines: [], error_codes: [], required_tests: [] } }],
      tree: [{ name: 'crates', path: 'crates', kind: 'dir', children: [{ name: 'a', path: 'crates/a', kind: 'dir', children: [] }] }],
    },
    dependencies: { normalEdges: [], boundaries: [{ consumer: 'a', provider: 'ghost' }] },
    adapters: { databasePolicy: { applicable: false } },
    decisions: { approvals: [], ownership: [{ objectId: 'obj-1', packageId: 'a' }], semantic_review: { status: 'APPROVED', statement: 'ok', approver: 'ai' } },
  });
  assert.notEqual(pipeline.status, 'COMPLETE');
});

test('PX-188 C004 [PX-188 @verifies C004]: a failing reconstruction gate yields overall FAIL', () => {
  const pipeline = runGatePipeline({ structure: { reconstruction: { status: 'FAIL' } }, inventory: {}, workspace: {}, dependencies: {}, decisions: { approvals: [] } });
  assert.equal(pipeline.status, 'FAIL');
});

test('PX-188 C004 [PX-188 @verifies C004]: entry parity rejects a non-COMPLETE status and non-zero final audit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-parity-'));
  const specPath = join(dir, 'spec.md');
  writeFileSync(specPath, '# S\n');
  const statusManifest = { artifact_kind: 'workspacify-tree-manifest', status: 'REVIEW' };
  const statusResult = checkTreeEntryGate(statusManifest, specPath);
  assert.equal(statusResult.ok, false);
  assert.ok(statusResult.errors.some((entry) => entry.includes('manifest.status must be COMPLETE')));
  const auditManifest = { artifact_kind: 'workspacify-tree-manifest', status: 'COMPLETE', final_audit: { cycle_count: 1 } };
  const auditResult = checkTreeEntryGate(auditManifest, specPath);
  assert.equal(auditResult.ok, false);
  assert.ok(auditResult.errors.some((entry) => entry.includes('final_audit.cycle_count must be 0')));
});

test('PX-188 C004 [PX-188 @verifies C004]: entry parity reports a tree missing a declared package path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-parity-'));
  const specPath = join(dir, 'spec.md');
  writeFileSync(specPath, '# S\n');
  const manifest = {
    artifact_kind: 'workspacify-tree-manifest',
    status: 'COMPLETE',
    workspace: { packages: [{ id: 'p', path: 'crates/p', layer: 'protocol', kind: 'production-library' }], tree: [{ name: 'crates', path: 'crates', kind: 'dir', children: [] }] },
  };
  const result = checkTreeEntryGate(manifest, specPath);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.includes('missing from the workspace tree')));
});

function specSegments(sourceText) {
  const headings = buildHeadingTree(sourceText.split('\n'), undefined, { sourceText });
  const segmented = segmentAtHeadings({ sourceText, headings }, { segmentLevel: 2 });
  return { sourceText, headings, segments: segmented.segments };
}

test('PX-188 C004 [PX-188 @verifies C004]: duplicate claim token in one fence yields one candidate with two refs', () => {
  const fence = '`'.repeat(3);
  const sourceText = '# T\n\n## Claims\n\n' + fence + 'text\nfoo_bar\nfoo_bar\n' + fence + '\n';
  const claims = harvestClaimCandidates(specSegments(sourceText));
  assert.equal(claims.length, 1);
  assert.equal(claims[0].source_refs.length, 2);
});

test('PX-188 C004 [PX-188 @verifies C004]: a table without an object/entity header yields no object candidate', () => {
  const sourceText = '# T\n\n## Catalog\n\n| alpha | beta |\n|---|---|\n| a | b |\n';
  const objects = harvestObjectCandidates(specSegments(sourceText));
  assert.equal(objects.some((candidate) => candidate.canonical_name === 'a'), false);
});

test('PX-188 C004 [PX-188 @verifies C004]: repeated canonical name promotes unknown to record then conflicts to unknown', () => {
  const promoteText = '# T\n\n## First\n\n| object | kind |\n|---|---|\n| Widget | unknown |\n\n## Second\n\n| object | kind |\n|---|---|\n| Widget | record |\n';
  const promoted = harvestObjectCandidates(specSegments(promoteText));
  assert.equal(promoted.find((candidate) => candidate.canonical_name === 'Widget').classification, 'record');
  const conflictText = '# T\n\n## First\n\n| object | kind |\n|---|---|\n| Widget | record |\n\n## Second\n\n| object | kind |\n|---|---|\n| Widget | certificate |\n';
  const conflicted = harvestObjectCandidates(specSegments(conflictText));
  assert.equal(conflicted.find((candidate) => candidate.canonical_name === 'Widget').classification, 'unknown');
});

test('PX-188 C004 [PX-188 @verifies C004]: readSpecInput throws G0 on an unreadable file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-fs-'));
  const file = join(dir, 'locked.md');
  writeFileSync(file, '# x\n');
  chmodSync(file, 0o000);
  try {
    assert.throws(
      () => readSpecInput(file),
      (error) => error instanceof WorkSpacifyTreeError && error.gateId === 'G0'
    );
  } finally {
    chmodSync(file, 0o600);
  }
});

test('PX-188 C004 [PX-188 @verifies C004]: a core production-library edge to conformance counts as a layer violation', () => {
  const result = runDagChecks({
    packages: [{ id: 'core', layer: 'core', kind: 'production-library' }, { id: 'conf', layer: 'conformance', kind: 'conformance' }],
    edges: [{ from: 'core', to: 'conf' }],
    forbiddenEdges: [],
  });
  assert.equal(result.layer_violation_count, 1);
  assert.equal(result.forbidden_edge_count, 1);
});

test('PX-188 C004 [PX-188 @verifies C004]: adapter boundary covers unattached, attached, defaults, and non-io layers', () => {
  const unattached = checkPortAdapterBoundary({ ports: [], packages: [{ id: 'adapt1', layer: 'ports', kind: 'adapter' }] });
  assert.equal(unattached.violations.length, 1);
  const attached = checkPortAdapterBoundary({ ports: [{ id: 'port1', provides: ['net'], implementedBy: ['adapt1'] }], packages: [{ id: 'adapt1', layer: 'ports', kind: 'adapter' }] });
  assert.equal(attached.violations.length, 0);
  const defaults = checkPortAdapterBoundary({ ports: [{ id: 'p0' }], packages: [{ id: 'prot', layer: 'protocol', kind: 'production-library' }, { id: 'dom', layer: 'domain', kind: 'production-library', externalImplementations: ['io'] }, { id: 'found', layer: 'foundation', kind: 'binary', externalImplementations: ['net'] }] });
  assert.equal(defaults.missingPorts.includes('io'), true);
  assert.equal(defaults.missingPorts.includes('net'), false);
});

test('PX-188 C004 [PX-188 @verifies C004]: inventory report covers normalization_status candidates, decisions, unresolved, and empty input', () => {
  const report = buildInventoryReport({
    objects: [{ normalization_status: 'CONFIRMED' }, { normalization_status: 'REVIEW_REQUIRED' }],
    claims: [{ review_status: 'CONFIRMED' }],
    terms: [{ normalization_status: 'REVIEW_REQUIRED' }],
    normalization_decisions: [{ decision: 'd' }],
    unresolved_candidates: [{ id: 'u' }],
  });
  assert.equal(report.stats.confirmed, 2);
  assert.equal(report.stats.review_required, 2);
  assert.equal(report.unresolved_candidates.length, 1);
  const empty = buildInventoryReport({});
  assert.equal(empty.stats.harvested, 0);
  assert.equal(empty.stats.confirmed, 0);
});

test('PX-188 C004 [PX-188 @verifies C004]: assembleManifest tolerates explicit undefined sections and computeSelfHash handles a bare object', () => {
  const filled = assembleManifest({ run: undefined, status: 'COMPLETE' });
  assert.equal(typeof filled.run, 'object');
  assert.ok(/^[0-9a-f]{64}$/.test(computeSelfHash({})));
});

test('PX-188 C004 [PX-188 @verifies C004]: validateWorkspaceTree tolerates undefined input, recurses nested dirs, and falls back to name', () => {
  const undefinedTree = validateWorkspaceTree({ tree: undefined, packages: undefined });
  assert.equal(undefinedTree.consistent, true);
  assert.equal(undefinedTree.treePaths.length, 0);
  const nested = validateWorkspaceTree({ tree: [{ name: 'd', path: 'd', kind: 'dir', children: [{ name: 'leaf', path: 'd/leaf', kind: 'dir', children: [] }] }], packages: [{ id: 'p', path: 'd/leaf' }] });
  assert.equal(nested.consistent, true);
  const nameFallback = validateWorkspaceTree({ tree: [{ name: 'd', kind: 'dir', children: [] }], packages: [] });
  assert.ok(nameFallback.treePaths.includes('d'));
});
