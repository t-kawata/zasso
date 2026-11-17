// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAssetTree, removeAssetTree } from './lib/asset-fixtures.mjs';
import { verifyAssetInstall } from '../../.claude/scripts/amend-rfc-up/okf-asset/verify.mjs';

test('installed asset roots match staging', () => {
  const staging = makeAssetTree({ 'assets/probe.py': 'print(1)\n' });
  const installed = makeAssetTree({ 'assets/probe.py': 'print(1)\n' });
  try {
    const result = verifyAssetInstall({
      stagingPath: staging,
      installedPath: installed,
      assetRoots: ['assets'],
    });
    assert.equal(result.ok, true);
  } finally {
    removeAssetTree(staging);
    removeAssetTree(installed);
  }
});

test('a missing installed asset is refused', () => {
  const staging = makeAssetTree({ 'assets/probe.py': 'print(1)\n' });
  const installed = makeAssetTree({});
  try {
    const result = verifyAssetInstall({
      stagingPath: staging,
      installedPath: installed,
      assetRoots: ['assets'],
    });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((finding) => finding.code === 'ASSET_INSTALL_MISSING'));
  } finally {
    removeAssetTree(staging);
    removeAssetTree(installed);
  }
});

test('a tampered installed asset is refused', () => {
  const staging = makeAssetTree({ 'assets/probe.py': 'print(1)\n' });
  const installed = makeAssetTree({ 'assets/probe.py': 'print(2)\n' });
  try {
    const result = verifyAssetInstall({
      stagingPath: staging,
      installedPath: installed,
      assetRoots: ['assets'],
    });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((finding) => finding.code === 'ASSET_HASH_MISMATCH'));
  } finally {
    removeAssetTree(staging);
    removeAssetTree(installed);
  }
});

test('empty asset roots are valid', () => {
  const staging = makeAssetTree({});
  const installed = makeAssetTree({});
  try {
    const result = verifyAssetInstall({
      stagingPath: staging,
      installedPath: installed,
      assetRoots: [],
    });
    assert.equal(result.ok, true);
  } finally {
    removeAssetTree(staging);
    removeAssetTree(installed);
  }
});
