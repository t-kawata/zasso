import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  makeAssetTree,
  removeAssetTree,
} from './lib/asset-fixtures.mjs';
import { measureAsset } from '../../.claude/scripts/amend-rfc-up/okf-asset/measure.mjs';
import { classifyAsset } from '../../.claude/scripts/amend-rfc-up/okf-asset/classify.mjs';
import { detectDuplicateConceptIds } from '../../.claude/scripts/amend-rfc-up/okf-asset/ledger.mjs';
import { loadAssetPolicy } from '../../.claude/scripts/amend-rfc-up/okf-asset/constants.mjs';
import { discoverAssets } from '../../.claude/scripts/amend-rfc-up/okf-asset/discover.mjs';

// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
function measurement(root, relativePath) {
  return measureAsset({ absolutePath: join(root, relativePath), relativePath, root });
}

test('CJK content is refused with ASSET_NOT_ENGLISH', () => {
  const root = makeAssetTree({ 'assets/ja.md': '# 見出し\n\n本文\n' });
  try {
    const result = classifyAsset(measurement(root, 'assets/ja.md'));
    assert.equal(result.include, false);
    assert.equal(result.code, 'ASSET_NOT_ENGLISH');
  } finally {
    removeAssetTree(root);
  }
});

test('a secret-bearing path is refused with ASSET_SECRET_EXCLUDED', () => {
  const root = makeAssetTree({ 'private/key.pem': '-----BEGIN PRIVATE KEY-----\n' });
  try {
    const result = classifyAsset(measurement(root, 'private/key.pem'));
    assert.equal(result.include, false);
    assert.equal(result.code, 'ASSET_SECRET_EXCLUDED');
  } finally {
    removeAssetTree(root);
  }
});

test('an oversized text asset is refused with ASSET_SIZE_EXCLUDED', () => {
  const root = makeAssetTree({ 'assets/big.txt': 'x'.repeat(64) });
  try {
    const result = classifyAsset(measurement(root, 'assets/big.txt'), { maxFileBytes: 16 });
    assert.equal(result.include, false);
    assert.equal(result.code, 'ASSET_SIZE_EXCLUDED');
  } finally {
    removeAssetTree(root);
  }
});

test('a binary asset is indexed as metadata, not embedded as text', () => {
  const root = makeAssetTree({});
  try {
    writeFileSync(join(root, 'assets.bin'), Buffer.from([0, 1, 2, 3]));
    const measured = measureAsset({
      absolutePath: join(root, 'assets.bin'),
      relativePath: 'assets.bin',
      root,
    });
    const result = classifyAsset(measured);
    assert.equal(measured.kind, 'binary');
    assert.equal(result.include, true);
    assert.equal(result.code, 'ASSET_BINARY_INDEXED');
    assert.equal(result.type, 'Reference');
  } finally {
    removeAssetTree(root);
  }
});

test('duplicate concept ids are reported', () => {
  const findings = detectDuplicateConceptIds([
    { path: 'EXEC_ASSETS/probe.py', conceptId: 'pages/assets/probe-py' },
    { path: 'other/probe.py', conceptId: 'pages/assets/probe-py' },
  ]);
  assert.ok(findings.some((finding) => finding.code === 'ASSET_ALIAS_DUPLICATE'));
});

test('manifest and profile policies override the defaults', () => {
  const policy = loadAssetPolicy({
    manifest: { assets: { max_file_bytes: 12, include_binary: false, low_confidence: 'exclude' } },
    profile: { limits: { asset_max_total_bytes: 34 } },
  });
  assert.equal(policy.maxFileBytes, 12);
  assert.equal(policy.maxTotalBytes, 34);
  assert.equal(policy.includeBinary, false);
  assert.equal(policy.lowConfidence, 'exclude');
});

test('a binary asset can be refused by policy', () => {
  const root = makeAssetTree({});
  try {
    writeFileSync(join(root, 'assets.bin'), Buffer.from([0, 1, 2]));
    const measured = measureAsset({
      absolutePath: join(root, 'assets.bin'),
      relativePath: 'assets.bin',
      root,
    });
    const result = classifyAsset(measured, { includeBinary: false });
    assert.equal(result.include, false);
    assert.equal(result.code, 'ASSET_BINARY_EXCLUDED');
  } finally {
    removeAssetTree(root);
  }
});

test('discoverAssets applies a manifest file-size policy', () => {
  const root = makeAssetTree({
    'PRE-OKF-ORIGINAL.md': '# Specification\n',
    'infra-kit/big.txt': 'x'.repeat(64),
  });
  try {
    const discovery = discoverAssets({
      sourcePaths: ['PRE-OKF-ORIGINAL.md'],
      sourceRoot: root,
      manifest: { assets: { roots: ['infra-kit'], max_file_bytes: 16 } },
      policy: { maxFileBytes: 16 },
    });
    assert.ok(discovery.excluded.some((entry) => entry.code === 'ASSET_SIZE_EXCLUDED'));
  } finally {
    removeAssetTree(root);
  }
});
