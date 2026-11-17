import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assetFiles,
  docsOnlyFiles,
  makeAssetTree,
  manifestFor,
  removeAssetTree,
} from './lib/asset-fixtures.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { discoverAssets } from '../../.claude/scripts/amend-rfc-up/okf-asset/discover.mjs';
import { writeAssetDiscovery } from '../../.claude/scripts/amend-rfc-up/okf-asset/ledger.mjs';

// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
function discover(root, options = {}) {
  return discoverAssets({
    sourcePaths: ['PRE-OKF-ORIGINAL.md'],
    sourceRoot: root,
    freeForm: '',
    manifest: null,
    fileSystem: null,
    ...options,
  });
}

test('manifest declares an arbitrary asset root without EXEC_ASSETS', () => {
  const root = makeAssetTree(assetFiles('infra-kit'));
  try {
    const discovery = discover(root, { manifest: manifestFor('infra-kit') });
    assert.equal(discovery.mode, 'manifest');
    assert.deepEqual(discovery.roots, ['infra-kit']);
    assert.ok(discovery.included.some((entry) => entry.path === 'infra-kit/probe.py'));
    assert.ok(discovery.excluded.some((entry) => entry.code === 'ASSET_SECRET_EXCLUDED'));
  } finally {
    removeAssetTree(root);
  }
});

test('a specification reference selects an asset without a conventional directory', () => {
  const root = makeAssetTree({
    'PRE-OKF-ORIGINAL.md': '# Specification\n\nRun `ops-kit/probe.py`.\n',
    'ops-kit/probe.py': '#!/usr/bin/env python3\nprint("probe")\n',
  });
  try {
    const discovery = discover(root);
    assert.equal(discovery.mode, 'spec-reference');
    assert.ok(
      discovery.included.some(
        (entry) => entry.path === 'ops-kit/probe.py' && entry.selectedBy === 'spec-reference',
      ),
    );
  } finally {
    removeAssetTree(root);
  }
});

test('content signals select a shebang script and a Containerfile', () => {
  const root = makeAssetTree({
    'PRE-OKF-ORIGINAL.md': '# Specification\n\nNo explicit path.\n',
    bootstrap: '#!/usr/bin/env bash\necho bootstrap\n',
    Containerfile: 'FROM ubuntu:24.04\n',
  });
  try {
    const discovery = discover(root);
    assert.equal(discovery.mode, 'heuristic');
    assert.ok(discovery.included.some((entry) => entry.path === 'bootstrap'));
    assert.ok(discovery.included.some((entry) => entry.path === 'Containerfile'));
  } finally {
    removeAssetTree(root);
  }
});

test('document-only input stays in mode none and records weak signals', () => {
  const root = makeAssetTree(docsOnlyFiles());
  try {
    const discovery = discover(root);
    assert.equal(discovery.mode, 'none');
    assert.deepEqual(discovery.roots, []);
    assert.equal(discovery.included.length, 0);
    assert.ok(discovery.excluded.some((entry) => entry.code === 'ASSET_WEAK_CANDIDATE'));
  } finally {
    removeAssetTree(root);
  }
});

test('a missing strong reference is ambiguous, not silent', () => {
  const root = makeAssetTree({
    'PRE-OKF-ORIGINAL.md': '# Specification\n\nRun `scripts/missing.py`.\n',
  });
  try {
    const discovery = discover(root);
    assert.ok(discovery.ambiguous.some((entry) => entry.code === 'ASSET_REFERENCE_MISSING'));
  } finally {
    removeAssetTree(root);
  }
});

test('a missing manifest root is a named failure', () => {
  const root = makeAssetTree({ 'PRE-OKF-ORIGINAL.md': '# Specification\n' });
  try {
    const discovery = discover(root, { manifest: manifestFor('missing-root') });
    assert.ok(discovery.ambiguous.some((entry) => entry.code === 'ASSET_ROOT_MISSING'));
  } finally {
    removeAssetTree(root);
  }
});

test('the discovery ledger is written as a build artifact', () => {
  const root = makeAssetTree({ 'PRE-OKF-ORIGINAL.md': '# Specification\n' });
  const out = makeAssetTree({});
  try {
    const discovery = discover(root);
    writeAssetDiscovery({ outDir: out, discovery });
    const written = JSON.parse(readFileSync(join(out, 'asset-discovery.json'), 'utf8'));
    assert.equal(written.mode, 'none');
    assert.equal(written.counts.included, 0);
  } finally {
    removeAssetTree(root);
    removeAssetTree(out);
  }
});
