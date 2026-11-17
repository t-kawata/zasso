/**
 * Build and write the asset ledgers.
 *
 * The manifest is TOML; the inventory and coverage are JSON. Zero assets are
 * represented explicitly so the installer and tests do not need a special
 * absence branch.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ASSET_CODES } from './constants.mjs';
import { pathInsideRoot } from './render.mjs';

// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
function assetInsideRoot(asset) {
  return pathInsideRoot(asset.path);
}

export function assetTreeDigest(assets = []) {
  const records = assets
    .map((asset) => `${assetInsideRoot(asset)}\0${asset.sha256 ?? ''}\0`)
    .sort();
  return sha256(records.join(''));
}

export function detectDuplicateConceptIds(assets = []) {
  const seen = new Map();
  const findings = [];
  for (const asset of assets) {
    const conceptId = asset.conceptId;
    if (!conceptId) continue;
    if (seen.has(conceptId)) {
      findings.push({
        code: ASSET_CODES.ALIAS_DUPLICATE,
        path: asset.path,
        reason: `duplicate concept id ${conceptId}`,
      });
    } else {
      seen.set(conceptId, asset.path);
    }
  }
  return findings;
}

export function buildAssetLedgers({ assets = [], assetRoots = [] }) {
  const coverage = {
    schema: 'okf-asset-coverage/v1',
    asset_roots: [...assetRoots],
    records: assetRoots.map((root) => ({
      asset_root: root,
      files: assets.filter((asset) => asset.root === root).length,
      concepts: assets.filter((asset) => asset.root === root).length,
      unmappedFiles: 0,
      unmappedLines: 0,
    })),
    counts: {
      files: assets.length,
      concepts: assets.length,
      unmappedFiles: 0,
      unmappedLines: 0,
    },
  };
  const inventory = {
    schema: 'okf-asset-inventory/v1',
    entries: assets
      .map((asset) => ({
        asset: asset.path,
        concept: asset.conceptId ?? `pages/assets/${assetInsideRoot(asset).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
        sha256: asset.sha256,
        lines: asset.lines,
        bytes: asset.bytes,
        type: asset.type,
      }))
      .sort((left, right) => left.asset.localeCompare(right.asset)),
  };
  const lines = [
    'spec_version = "okf-asset-manifest/v1"',
    'asset_root = ' + JSON.stringify(assetRoots.length === 1 ? assetRoots[0] : assetRoots),
    `asset_tree_sha256 = ${JSON.stringify(assetTreeDigest(assets))}`,
    '',
  ];
  for (const asset of [...assets].sort((left, right) => left.path.localeCompare(right.path))) {
    lines.push('[[file]]');
    lines.push(`path = ${JSON.stringify(asset.path)}`);
    lines.push(`sha256 = ${JSON.stringify(asset.sha256 ?? '')}`);
    lines.push(`bytes = ${JSON.stringify(String(asset.bytes ?? 0))}`);
    lines.push(`lines = ${JSON.stringify(String(asset.lines ?? 0))}`);
    lines.push(`concept = ${JSON.stringify(asset.conceptId ?? '')}`);
    lines.push(`type = ${JSON.stringify(asset.type ?? 'Reference')}`);
    lines.push('');
  }
  return { manifest: lines.join('\n'), inventory, coverage };
}

export function writeAssetDiscovery({ outDir, discovery }) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'asset-discovery.json'), `${JSON.stringify(discovery, null, 2)}\n`);
  return discovery;
}

export function writeAssetLedgers({ skillRoot, assets = [], assetRoots = [] }) {
  const ledgers = buildAssetLedgers({ assets, assetRoots });
  const sourceDir = join(skillRoot, 'source');
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(join(sourceDir, 'asset-manifest.toml'), ledgers.manifest);
  writeFileSync(join(sourceDir, 'asset-inventory.json'), `${JSON.stringify(ledgers.inventory, null, 2)}\n`);
  writeFileSync(join(sourceDir, 'asset-coverage.json'), `${JSON.stringify(ledgers.coverage, null, 2)}\n`);
  return ledgers;
}

export function mergeInputLedger({ skillRoot, assets = [] }) {
  const path = join(skillRoot, 'source/input-ledger.json');
  const ledger = existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8'))
    : { schema: 'okf-input-ledger/v1', roots: [], inputs: [], counts: { included: 0, excluded: 0 } };
  const existing = new Set((ledger.inputs ?? []).map((entry) => entry.path));
  for (const asset of assets) {
    if (existing.has(asset.path)) continue;
    ledger.inputs.push({
      path: asset.path,
      status: 'included',
      reason: 'execution asset indexed as an OKF concept',
    });
  }
  ledger.counts = {
    included: ledger.inputs.filter((entry) => entry.status === 'included').length,
    excluded: ledger.inputs.filter((entry) => entry.status === 'excluded').length,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(ledger, null, 2)}\n`);
  return ledger;
}
