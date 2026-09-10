#!/usr/bin/env node

/**
 * clean-consolidation-artifacts.js — Remove transient consolidation artifacts.
 *
 * Runs on FULL /find-omissions success: removes manifests/CONSOLIDATED-MANIFEST-*.json
 * and manifests/ROLLBACK-*.json (the handoff + the undo backup), then removes
 * manifests/ itself iff empty. Idempotent — exit 0 when nothing to remove.
 * Files other than the two artifact globs are never touched.
 *
 * Usage (run from the directory containing Tickets.json — the source root is cwd):
 *   node clean-consolidation-artifacts.js
 *
 * Exit codes:
 *   0 = artifacts removed (or nothing to remove)
 *   1 = fs error while cleaning (stderr carries the cause)
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Output directory and the two artifact prefixes written by the consolidate flow.
const MANIFESTS_DIR = 'manifests';
const CONSOLIDATED_PREFIX = 'CONSOLIDATED-MANIFEST-';
const ROLLBACK_PREFIX = 'ROLLBACK-';

/**
 * List the transient artifact files under manifests/ (the two glob prefixes only).
 * @param {string} dir — Root directory (manifests/ lives here)
 * @returns {Array<string>} — Absolute paths to matching artifact files
 */
// [::TICKET::] PX-138 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-138 --for-spec --no-implementation-order`.
function listArtifactsToRemove(dir) {
  const manifestsDir = path.join(dir, MANIFESTS_DIR);
  let entries;
  try {
    entries = fs.readdirSync(manifestsDir);
  } catch {
    return []; // manifests/ missing → nothing to remove
  }
  return entries
    .filter(
      (name) =>
        (name.startsWith(CONSOLIDATED_PREFIX) || name.startsWith(ROLLBACK_PREFIX)) && name.endsWith('.json')
    )
    .map((name) => path.join(manifestsDir, name));
}

/**
 * Remove the consolidation artifacts in a directory and the dir itself iff empty.
 * @param {string} dir — Root directory
 * @returns {{ok: boolean, removed: Array<string>, removedDir: boolean, error?: string}}
 */
// [::TICKET::] PX-138 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-138 --for-spec --no-implementation-order`.
function cleanConsolidationArtifacts(dir) {
  const manifestsDir = path.join(dir, MANIFESTS_DIR);
  const removed = [];
  try {
    for (const artifactPath of listArtifactsToRemove(dir)) {
      fs.unlinkSync(artifactPath);
      removed.push(artifactPath);
    }
    let removedDir = false;
    try {
      if (fs.readdirSync(manifestsDir).length === 0) {
        fs.rmdirSync(manifestsDir);
        removedDir = true;
      }
    } catch (e) {
      if (e.code !== 'ENOENT') throw e; // already gone → not an error (idempotent)
    }
    return { ok: true, removed, removedDir };
  } catch (e) {
    return { ok: false, removed, removedDir: false, error: 'cannot clean consolidation artifacts: ' + e.message };
  }
}

/** CLI entry point. */
// [::TICKET::] PX-138 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-138 --for-spec --no-implementation-order`.
function main() {
  const res = cleanConsolidationArtifacts(process.cwd());
  if (!res.ok) {
    console.error('[clean-consolidation-artifacts] FAIL -- ' + res.error);
    process.exit(1);
  }
  process.exit(0);
}

if (require.main === module) main();

module.exports = {
  listArtifactsToRemove,
  cleanConsolidationArtifacts,
  MANIFESTS_DIR,
  CONSOLIDATED_PREFIX,
  ROLLBACK_PREFIX,
};
