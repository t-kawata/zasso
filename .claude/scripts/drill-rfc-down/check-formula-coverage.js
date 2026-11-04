#!/usr/bin/env node
// [::TICKET::] PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-365 --for-spec --no-implementation-order`.
// PX-365 @verifies C001
/**
 * Drill entry point for the shared per-package formula coverage gate.
 *
 * The gate must stay one implementation because the grill, graphify and drill all
 * read the same ledger. This wrapper keeps Step 1 under $DRILL_DIR.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TARGET = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../grill-me-for-rfc/check-formula-coverage.js');
const result = spawnSync(process.execPath, [TARGET, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(result.status ?? 1);
