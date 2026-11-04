#!/usr/bin/env node
// [::TICKET::] PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-365 --for-spec --no-implementation-order`.
// PX-365 @verifies C001
/**
 * Drill entry point for the shared source identity gate.
 *
 * The gate lives beside the grill because both commands read the same three records.
 * This wrapper keeps Step 1 self-contained under $DRILL_DIR while preserving one
 * implementation of the check.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TARGET = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../grill-me-for-rfc/verify-source-identity.js');
const result = spawnSync(process.execPath, [TARGET, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(result.status ?? 1);
