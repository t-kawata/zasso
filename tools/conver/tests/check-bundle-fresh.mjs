#!/usr/bin/env node
// [::TICKET::] PX-208 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-208 --for-spec --no-implementation-order`.
/**
 * check-bundle-fresh — report whether the committed `conver.js` is the artefact
 * its source produces.
 *
 * Exits 0 when a fresh build is byte-identical, 1 when it differs. A build that
 * could not be run is reported as unavailable rather than as a stale bundle: a
 * broken instrument and a moved subject call for different responses, and an
 * unavailable prerequisite reported as drift makes the check cry wolf.
 */
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// [::TICKET::] PX-206 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-206 --for-spec --no-implementation-order`.
// [::TICKET::] PX-207 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-207 --for-spec --no-implementation-order`.
// [::TICKET::] PX-205 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-205 --for-spec --no-implementation-order`.
import { COMMITTED_BUNDLE_PATH, readBundleComparison, renderFreshnessReport } from './lib/bundle-freshness.mjs';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// [::TICKET::] PX-207 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-207 --for-spec --no-implementation-order`.

try {
  const comparison = readBundleComparison({ projectRoot: PROJECT_ROOT });
  process.stdout.write(`${renderFreshnessReport(comparison)}\n`);
  process.exitCode = comparison.identical ? 0 : 1;
} catch (error) {
  process.stdout.write(`${renderFreshnessReport({ unavailable: error.message }, COMMITTED_BUNDLE_PATH)}\n`);
  process.exitCode = 1;
}
