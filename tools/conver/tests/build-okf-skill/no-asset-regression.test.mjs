// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  docsOnlyFiles,
  makeAssetTree,
  removeAssetTree,
} from './lib/asset-fixtures.mjs';
import { discoverAssets } from '../../.claude/scripts/amend-rfc-up/okf-asset/discover.mjs';
import { buildAssetLedgers } from '../../.claude/scripts/amend-rfc-up/okf-asset/ledger.mjs';

test('document-only discovery stays in mode none', () => {
  const root = makeAssetTree(docsOnlyFiles());
  try {
    const discovery = discoverAssets({
      sourcePaths: ['PRE-OKF-ORIGINAL.md'],
      sourceRoot: root,
      freeForm: '',
      manifest: null,
    });
    assert.equal(discovery.mode, 'none');
    assert.deepEqual(discovery.roots, []);
    assert.equal(discovery.included.length, 0);
  } finally {
    removeAssetTree(root);
  }
});

test('zero assets produce zero-count ledgers with no roots', () => {
  const ledgers = buildAssetLedgers({ assets: [], assetRoots: [] });
  assert.equal(ledgers.coverage.schema, 'okf-asset-coverage/v1');
  assert.equal(ledgers.coverage.counts.files, 0);
  assert.equal(ledgers.coverage.counts.concepts, 0);
  assert.equal(ledgers.coverage.counts.unmappedFiles, 0);
  assert.equal(ledgers.coverage.counts.unmappedLines, 0);
  assert.deepEqual(ledgers.coverage.asset_roots, []);
  assert.deepEqual(ledgers.inventory.entries, []);
  assert.match(ledgers.manifest, /spec_version/);
});
