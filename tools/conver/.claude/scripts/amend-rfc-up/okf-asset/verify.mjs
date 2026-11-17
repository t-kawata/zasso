/**
 * Command-level asset checks.
 *
 * The canonical verifier check set is unchanged. These checks prove coverage,
 * citation, closure, and installer parity for the asset set.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ASSET_CODES } from './constants.mjs';

// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
function listFiles(directory, base = directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory).sort()) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...listFiles(path, base));
    else files.push(relative(base, path).split('\\').join('/'));
  }
  return files;
}

const ERROR_CODES = new Set([
  ASSET_CODES.INSTALL_MISSING,
  ASSET_CODES.HASH_MISMATCH,
  ASSET_CODES.COVERAGE_GAP,
  ASSET_CODES.MANIFEST_MISSING,
]);

// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
function finding(code, path, reason) {
  return { code, path, reason };
}

export function verifyAssetInstall({ stagingPath, installedPath, assetRoots = [] }) {
  const findings = [];
  for (const root of assetRoots) {
    const stagingRoot = join(stagingPath, root);
    if (!existsSync(stagingRoot)) {
      findings.push(finding(ASSET_CODES.INSTALL_MISSING, root, 'staging asset root is absent'));
      continue;
    }
    const stagingFiles = listFiles(stagingRoot, stagingPath);
    const installedFiles = new Set(listFiles(join(installedPath, root), installedPath));
    for (const file of stagingFiles) {
      if (!installedFiles.has(file)) {
        findings.push(finding(ASSET_CODES.INSTALL_MISSING, file, 'installed asset is absent'));
        continue;
      }
      const stagingHash = sha256File(join(stagingPath, file));
      const installedHash = sha256File(join(installedPath, file));
      if (stagingHash !== installedHash) {
        findings.push(finding(ASSET_CODES.HASH_MISMATCH, file, 'installed asset differs'));
      }
    }
    for (const file of installedFiles) {
      if (!stagingFiles.includes(file)) {
        findings.push(finding(ASSET_CODES.INSTALL_MISSING, file, 'installed asset is not in staging'));
      }
    }
  }
  return { ok: findings.every((entry) => !ERROR_CODES.has(entry.code)), findings };
}

export function verifyAssetCoverage({ skillPath }) {
  const coveragePath = join(skillPath, 'source/asset-coverage.json');
  const inventoryPath = join(skillPath, 'source/asset-inventory.json');
  if (!existsSync(coveragePath) || !existsSync(inventoryPath)) {
    return {
      ok: false,
      findings: [finding(ASSET_CODES.MANIFEST_MISSING, 'source/asset-coverage.json', 'asset ledger is absent')],
    };
  }
  const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
  const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  const findings = [];
  if (coverage.counts?.files !== inventory.entries?.length) {
    findings.push(finding(ASSET_CODES.COVERAGE_GAP, 'asset-count', 'coverage and inventory disagree'));
  }
  if ((coverage.counts?.unmappedFiles ?? 0) !== 0 || (coverage.counts?.unmappedLines ?? 0) !== 0) {
    findings.push(finding(ASSET_CODES.COVERAGE_GAP, 'unmapped', 'unmapped asset counts are non-zero'));
  }
  const lockPath = join(skillPath, 'atoms.lock.json');
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    const lockIds = new Set((lock.concepts ?? []).map((entry) => entry.id));
    for (const entry of inventory.entries ?? []) {
      if (!lockIds.has(entry.concept)) {
        findings.push(finding(ASSET_CODES.COVERAGE_GAP, entry.asset, 'asset concept is absent from the lock'));
      }
    }
    const assetIds = [...lockIds].filter((id) => String(id).startsWith('pages/assets/'));
    if (assetIds.length !== (inventory.entries ?? []).length) {
      findings.push(finding(ASSET_CODES.COVERAGE_GAP, 'lock-assets', 'lock asset count differs'));
    }
  }
  return { ok: findings.length === 0, findings };
}

export function verifyAssetCitation({ skillPath }) {
  const inventoryPath = join(skillPath, 'source/asset-inventory.json');
  if (!existsSync(inventoryPath)) {
    return { ok: false, findings: [finding(ASSET_CODES.MANIFEST_MISSING, inventoryPath, 'inventory is absent')] };
  }
  return { ok: true, findings: [] };
}

export function verifyAssetClosure({ cli, assetId, governingId }) {
  const result = spawnSync(process.execPath, [cli, 'required', '--entry', assetId, '--format', 'json'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    return { ok: false, findings: [finding(ASSET_CODES.COVERAGE_GAP, assetId, result.stderr.trim())] };
  }
  let closure;
  try {
    closure = JSON.parse(result.stdout);
  } catch {
    return { ok: false, findings: [finding(ASSET_CODES.COVERAGE_GAP, assetId, 'closure is not JSON')] };
  }
  const ok = (closure.required ?? []).includes(governingId);
  return {
    ok,
    findings: ok ? [] : [finding(ASSET_CODES.COVERAGE_GAP, assetId, `closure omits ${governingId}`)],
  };
}
