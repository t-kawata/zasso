// @verifies C001
// @verifies C002
// [::TICKET::] PX-178: workspacify-tree orchestration primitives tests.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-178 --for-spec --no-implementation-order`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonicalSerialize } from '../../../.claude/scripts/workspacify-tree/lib/canonical-json.mjs';
import { sha256Hex } from '../../../.claude/scripts/workspacify-tree/lib/hash.mjs';
import { assembleManifest, computeSelfHash, renderManifestText } from '../../../.claude/scripts/workspacify-tree/lib/render.mjs';
import { atomicPublish } from '../../../.claude/scripts/workspacify-tree/lib/atomic-publish.mjs';
import { formatSuccess, formatFailure } from '../../../.claude/scripts/workspacify-tree/lib/report.mjs';

test('render C001 [@verifies C001]: manifest_hash is computed over serialized bytes with an empty manifest_hash', () => {
  const base = { artifact_kind: 'workspacify-tree-manifest', schema_version: '1.0.0', status: 'COMPLETE', run: {}, input: {} };
  const manifest = assembleManifest(base);
  assert.match(manifest.integrity.manifest_hash, /^[0-9a-f]{64}$/);
  const withEmptyHash = { ...manifest, integrity: { ...manifest.integrity, manifest_hash: '' } };
  assert.equal(manifest.integrity.manifest_hash, sha256Hex(Buffer.from(canonicalSerialize(withEmptyHash), 'utf8')));
});

test('render C001 invariant [@verifies C001]: canonical serialization is idempotent for the assembled manifest', () => {
  const manifest = assembleManifest({ run: {}, input: {} });
  const text = renderManifestText(manifest);
  assert.equal(canonicalSerialize(JSON.parse(text)), text);
  assert.equal(computeSelfHash(manifest), sha256Hex(Buffer.from(canonicalSerialize({ ...manifest, integrity: { ...manifest.integrity, manifest_hash: '' } }), 'utf8')));
});

test('render: a 1-byte change to the canonical text changes the hash', () => {
  const manifest = assembleManifest({ run: {}, input: {} });
  const text = renderManifestText(manifest);
  const tampered = text.replace('COMPLETE', 'FAIL');
  assert.notEqual(sha256Hex(Buffer.from(tampered)), sha256Hex(Buffer.from(text)));
});

test('publish C002 [@verifies C002]: publishing over a manifest with a different source hash is BLOCKED', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-orch-'));
  const manifestPath = join(dir, 'WORKSPACIFY-TREE-MANIFEST.json');
  writeFileSync(manifestPath, JSON.stringify({ input: { source_hash: 'a'.repeat(64) } }));
  const content = JSON.stringify({ input: { source_hash: 'b'.repeat(64) } });
  const result = atomicPublish({ dir, fileName: 'WORKSPACIFY-TREE-MANIFEST.json', content, sourceHash: 'b'.repeat(64) });
  assert.equal(result.published, false);
  assert.equal(result.status, 'BLOCKED');
  assert.equal(readFileSync(manifestPath, 'utf8'), JSON.stringify({ input: { source_hash: 'a'.repeat(64) } }));
});

test('publish invariant [@verifies C002]: a failed publish never destroys an existing successful manifest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-orch-'));
  const manifestPath = join(dir, 'WORKSPACIFY-TREE-MANIFEST.json');
  writeFileSync(manifestPath, '{"old":true}');
  atomicPublish({ dir, fileName: 'WORKSPACIFY-TREE-MANIFEST.json', content: '{"new":true}', sourceHash: 'c'.repeat(64) });
  assert.equal(existsSync(manifestPath), true);
  assert.equal(readFileSync(manifestPath, 'utf8'), '{"old":true}');
});

test('publish: same source hash publishes and reload-verifies', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-orch-'));
  const manifest = assembleManifest({ input: { source_hash: 'd'.repeat(64) } });
  const content = renderManifestText(manifest);
  const result = atomicPublish({ dir, fileName: 'WORKSPACIFY-TREE-MANIFEST.json', content, sourceHash: 'd'.repeat(64) });
  assert.equal(result.published, true);
  assert.equal(result.reloadOk, true);
});

test('report: success and failure formatting carry the required fields', () => {
  const success = formatSuccess({ manifestAbsPath: '/tmp/M.json', sourceHash: 'aa', manifestHash: 'bb', gateSummary: 'G0:PASS G1:PASS' });
  assert.ok(success.includes('/tmp/M.json'));
  assert.ok(success.includes('aa') && success.includes('bb'));
  const failure = formatFailure({ gateId: 'G2', reason: 'review required', fixHint: 'approve or fix' });
  assert.ok(failure.includes('G2') && failure.includes('review required'));
});
