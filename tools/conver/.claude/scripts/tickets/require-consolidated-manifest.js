#!/usr/bin/env node

/**
 * require-consolidated-manifest.js — Pre-flight prerequisite gate for /find-omissions.
 *
 * Makes /consolidate-stubs a hard prerequisite: /find-omissions must not proceed
 * until a consolidated unit manifest exists. Exits 0 if ./manifests/ contains a
 * CONSOLIDATED-MANIFEST-*.json; exits 2 with a stderr cause/action message
 * otherwise.
 *
 * Usage (run from the directory containing Tickets.json — the source root is cwd):
 *   node require-consolidated-manifest.js
 *
 * Exit codes:
 *   0 = a consolidated manifest exists
 *   2 = no CONSOLIDATED-MANIFEST-*.json under ./manifests/ (run /consolidate-stubs first)
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Output directory (relative to cwd) and the manifest file prefix.
const MANIFESTS_DIR = 'manifests';
const MANIFEST_PREFIX = 'CONSOLIDATED-MANIFEST-';

/**
 * Find a consolidated manifest file under a directory (read-only probe).
 * @param {string} dir — Root directory (manifests/ lives here)
 * @returns {string|null} — Absolute path to a matching manifest, or null
 */
// [::TICKET::] PX-138 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-138 --for-spec --no-implementation-order`.
function findConsolidatedManifest(dir) {
  const manifestsDir = path.join(dir, MANIFESTS_DIR);
  let entries;
  try {
    entries = fs.readdirSync(manifestsDir);
  } catch {
    return null; // manifests/ missing → no manifest
  }
  const match = entries.find((name) => name.startsWith(MANIFEST_PREFIX) && name.endsWith('.json'));
  return match ? path.join(manifestsDir, match) : null;
}

/** CLI entry point. */
// [::TICKET::] PX-138 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-138 --for-spec --no-implementation-order`.
function main() {
  const manifestPath = findConsolidatedManifest(process.cwd());
  if (!manifestPath) {
    console.error('[find-omissions] BLOCKED: No consolidated manifest found under ./manifests/ (CONSOLIDATED-MANIFEST-*.json).');
    console.error('Action: run /consolidate-stubs first (Steps 1-5), then re-run /find-omissions.');
    process.exit(2);
  }
  process.exit(0);
}

if (require.main === module) main();

module.exports = { findConsolidatedManifest, MANIFESTS_DIR, MANIFEST_PREFIX };
