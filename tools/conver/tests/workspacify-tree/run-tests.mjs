// [::TICKET::] PX-178 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-178 --for-spec --no-implementation-order`.
/**
 * Aggregate test runner for the workspacify-tree test suite.
 *
 * Collects every *.test.mjs under tests/workspacify-tree and runs them with
 * `node --test`, forwarding the child exit code. The Makefile is intentionally
 * not used for test execution.
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { collectTestFilesUnder } from '../lib/test-discovery.mjs';

// [::TICKET::] PX-204 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-204 --for-spec --no-implementation-order`.
const SUITE_ROOT = fileURLToPath(new URL('.', import.meta.url));

const testFiles = collectTestFilesUnder(SUITE_ROOT, { extensions: ['.test.mjs'] });
const result = spawnSync(process.execPath, ['--test', ...testFiles], { stdio: 'inherit' });
process.exit(result.status ?? 1);
