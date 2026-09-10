#!/usr/bin/env node

/**
 * require-consolidated-manifest.js — Pre-flight prerequisite gate for /find-omissions.
 *
 * Passes when a consolidated unit manifest exists, OR when the stub scan finds 0
 * stubs (the manifest is then legitimately absent — there is nothing to
 * consolidate). Blocks (exit 2) when stubs exist without a manifest and when the
 * stub scan itself fails, so an unknown tree state is never misread as clean.
 *
 * Usage (run from the directory containing Tickets.json — the source root is cwd):
 *   node require-consolidated-manifest.js
 *
 * Exit codes:
 *   0 = a consolidated manifest exists, or the stub scan found 0 stubs
 *   2 = stubs exist without a manifest, or the stub scan failed (run /consolidate-stubs first)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { scanDirectory } = require('./review/find-all-stubs.js');

// Output directory (relative to cwd) and the manifest file prefix.
const MANIFESTS_DIR = 'manifests';
const MANIFEST_PREFIX = 'CONSOLIDATED-MANIFEST-';

// Stable action phrases single-sourced here so the gate and its tests assert the
// same text; the surrounding explanation is operator-facing prose that may reword.
const SKIP_STEP_1_PHRASE = 'SKIP Step 1';
const PROCEED_TO_STEP_2_PHRASE = 'Proceed to Step 2';

/**
 * Find the newest consolidated manifest file under a directory (read-only probe).
 * @param {string} dir — Root directory (manifests/ lives here)
 * @returns {string|null} — Absolute path to the newest matching manifest, or null
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
  // Newest first, matching the gate's `ls -t | head -1`: the printer names
  // manifests CONSOLIDATED-MANIFEST-<YYYYMMDDhhmmss>.json and never reuses a
  // timestamp, so the filename sort is chronological.
  const candidates = entries
    .filter((name) => name.startsWith(MANIFEST_PREFIX) && name.endsWith('.json'))
    .sort();
  const match = candidates[candidates.length - 1];
  return match ? path.join(manifestsDir, match) : null;
}

/**
 * Count [::STUB::] markers under a directory using the same scan /consolidate-stubs
 * Step 1 uses, so the 0-stub decision is consistent with the consolidate inventory.
 * @param {string} dir — Root directory to scan
 * @returns {number} — Number of stub markers found
 */
// [::TICKET::] PX-148 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-148 --for-spec --no-implementation-order`.
function countStubs(dir) {
  const stubs = [];
  scanDirectory(dir, stubs);
  return stubs.length;
}

/**
 * Decide the gate outcome for a directory — pure over the tree state.
 * @param {string} dir — Root directory to inspect
 * @param {Function} [countStubsImpl] — Injectable stub counter (defaults to countStubs)
 * @returns {'pass-manifest'|'pass-zero-stubs'|'block'}
 */
// [::TICKET::] PX-148 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-148 --for-spec --no-implementation-order`.
function decideGate(dir, countStubsImpl) {
  const count = typeof countStubsImpl === 'function' ? countStubsImpl : countStubs;
  if (findConsolidatedManifest(dir)) return 'pass-manifest';
  let stubCount;
  try {
    stubCount = count(dir);
  } catch {
    return 'block'; // a failed scan is never treated as 0 stubs
  }
  return stubCount === 0 ? 'pass-zero-stubs' : 'block';
}

/** CLI entry point — maps the decision to exit code and stdout/stderr messages. */
// [::TICKET::] PX-148 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-148 --for-spec --no-implementation-order`.
function main() {
  const decision = decideGate(process.cwd());
  if (decision === 'pass-manifest') {
    process.exit(0);
  }
  if (decision === 'pass-zero-stubs') {
    console.log('[find-omissions] PASS: No consolidated manifest was found, but the stub scan found 0 [::STUB::] markers.');
    console.log('[find-omissions] Why this passes: /consolidate-stubs writes CONSOLIDATED-MANIFEST-*.json only when there are markers to group into units. With 0 stubs there is nothing to consolidate, so the manifest is legitimately absent.');
    console.log('[find-omissions] Action: ' + SKIP_STEP_1_PHRASE + ' (re-ticketize) — it consumes the manifest and has nothing to do.');
    console.log('[find-omissions] ' + PROCEED_TO_STEP_2_PHRASE + ' and start the inspection loop.');
    process.exit(0);
  }
  console.error('[find-omissions] BLOCKED: No consolidated manifest found under ./manifests/ (CONSOLIDATED-MANIFEST-*.json).');
  console.error('Action: run /consolidate-stubs first (Steps 1-5), then re-run /find-omissions.');
  process.exit(2);
}

if (require.main === module) main();

module.exports = {
  findConsolidatedManifest,
  countStubs,
  decideGate,
  SKIP_STEP_1_PHRASE,
  PROCEED_TO_STEP_2_PHRASE,
  MANIFESTS_DIR,
  MANIFEST_PREFIX
};
