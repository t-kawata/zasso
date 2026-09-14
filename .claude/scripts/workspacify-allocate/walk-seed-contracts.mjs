// [::TICKET::] PX-194 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-194 --for-spec --no-implementation-order`.
// PX-194 @verifies C004
/**
 * Walk the published workspace and lift every seed's machine block.
 *
 * This is the verification path that reads what was actually written: the
 * coupling contracts and the three reference paths are re-read from the directory
 * tree, so the gates judge the published artefacts rather than the renderer's
 * memory. The walker is read-only, stays inside the workspace and is idempotent.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { parseSeed } from './lib/seed-parse.mjs';
import { SEED_FILE_NAME } from './lib/seed-model.mjs';

const LOGICAL_SEPARATOR = '/';

/**
 * Walk every planned package leaf and parse its seed.
 *
 * @param {{ root: string, plan: { relativeDirs?: string[] }, manifest?: object, manifestPath?: string }} input
 * @returns {{ byPackage: Map<string, object>, missingSeeds: string[], unreadableSeeds: string[], missingReferences: string[], leafDirs: string[] }}
 */
export function walkSeedContracts({ root, plan, manifest, manifestPath }) {
  const plannedDirs = plan?.relativeDirs ?? [];
  const leafDirs = findLeafDirectories(plannedDirs);
  const byPackage = new Map();
  const missingSeeds = [];
  const unreadableSeeds = [];
  const missingReferences = [];

  for (const leaf of leafDirs) {
    const seedPath = path.join(root, leaf, SEED_FILE_NAME);
    if (!existsSync(seedPath)) {
      missingSeeds.push(leaf);
      continue;
    }
    let parsed;
    try {
      parsed = parseSeed(readFileSync(seedPath, 'utf8'));
    } catch {
      unreadableSeeds.push(leaf);
      continue;
    }
    const missing = findMissingReferences(parsed);
    if (missing.length > 0) {
      missingReferences.push(leaf);
    }
    const packageId = parsed.referenceBlock?.package?.id ?? leaf;
    byPackage.set(packageId, { ...parsed, seed_path: leaf, missing_references: missing });
  }

  return { byPackage, missingSeeds, unreadableSeeds, missingReferences, leafDirs };
}

/** A planned directory that has no planned descendant is a package leaf. */
function findLeafDirectories(plannedDirs) {
  return plannedDirs
    .filter((candidate) => !plannedDirs.some((other) => other !== candidate && other.startsWith(`${candidate}${LOGICAL_SEPARATOR}`)))
    .sort();
}

/** The three reference paths a seed section 1 must carry. */
function findMissingReferences(parsed) {
  const block = parsed?.referenceBlock ?? {};
  const missing = [];
  if (!block.source_spec?.path) {
    missing.push('source_spec.path');
  }
  if (!block.stage1_manifest?.path) {
    missing.push('stage1_manifest.path');
  }
  if (!block.stage2_manifest?.path) {
    missing.push('stage2_manifest.path');
  }
  return missing;
}

/** Re-export the manifest binding so callers can pass it through unchanged. */
export function describeWalkTargets({ plan }) {
  return findLeafDirectories(plan?.relativeDirs ?? []);
}
