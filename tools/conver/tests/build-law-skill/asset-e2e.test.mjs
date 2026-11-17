// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeAssetTree, removeAssetTree } from '../build-okf-skill/lib/asset-fixtures.mjs';
import { integrateLawAssets, installAssetRoots } from '../../.claude/scripts/amend-rfc-up/law-asset/integrate.mjs';
import { verifyAssetInstall } from '../../.claude/scripts/amend-rfc-up/okf-asset/verify.mjs';

const RULES = [
  { id: 'AUTH-01', statement: 'Require a bearer token.', verification: 'assets/check.py' },
];

function fixtureFiles() {
  return {
    'guide.md': '# Guide\n\nRequire a bearer token.\n',
    'assets/check.py': '#!/usr/bin/env python3\nprint("check")\n',
  };
}

test('law assets flow from discovery to rule link, delivery, concepts, ledgers, and install', () => {
  const sourceRoot = makeAssetTree(fixtureFiles());
  const targetRoot = makeAssetTree({});
  try {
    const result = integrateLawAssets({
      sourceRoot,
      sourcePaths: ['guide.md'],
      manifest: { assets: { roots: ['assets'] } },
      rules: RULES,
      delivery: { entries: [{ asset: 'assets/check.py', mode: 'must' }] },
      ruleConcepts: { 'AUTH-01': 'rules/auth/auth-01' },
    });
    assert.equal(result.discovery.mode, 'manifest');
    assert.equal(result.concepts.length, 1);
    assert.deepEqual(result.concepts[0].frontmatter['x-enforces'], ['AUTH-01']);
    assert.deepEqual(result.concepts[0].frontmatter['x-requires'], ['rules/auth/auth-01']);
    assert.equal(result.delivery.findings.length, 0);
    assert.equal(result.ledgers.coverage.counts.files, 1);
    assert.deepEqual(result.ledgers.coverage.asset_roots, ['assets']);

    installAssetRoots({
      sourceRoot,
      targetRoot,
      assetRoots: result.ledgers.coverage.asset_roots,
    });
    assert.ok(existsSync(join(targetRoot, 'assets/check.py')));
    const parity = verifyAssetInstall({
      stagingPath: sourceRoot,
      installedPath: targetRoot,
      assetRoots: result.ledgers.coverage.asset_roots,
    });
    assert.equal(parity.ok, true);
  } finally {
    removeAssetTree(sourceRoot);
    removeAssetTree(targetRoot);
  }
});

test('a missing law asset root fails install', () => {
  const sourceRoot = makeAssetTree({ 'guide.md': '# Guide\n' });
  const targetRoot = makeAssetTree({});
  try {
    assert.throws(
      () => installAssetRoots({ sourceRoot, targetRoot, assetRoots: ['missing'] }),
      (error) => error.code === 'ASSET_INSTALL_MISSING',
    );
  } finally {
    removeAssetTree(sourceRoot);
    removeAssetTree(targetRoot);
  }
});
