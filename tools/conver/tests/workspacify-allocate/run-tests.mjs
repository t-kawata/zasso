// [::TICKET::] PX-189 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-189 --for-spec --no-implementation-order`.
// PX-189 @verifies C001 C002 C003 C004 C005
/**
 * Aggregate test runner for the workspacify-allocate test suite.
 *
 * Collects every *.test.mjs under tests/workspacify-allocate and runs them with
 * `node --test`, forwarding the child exit code. Mirrors the stage-1 runner;
 * the Makefile is intentionally not used for test execution.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SUITE_ROOT = fileURLToPath(new URL('.', import.meta.url));

function collectTestFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectTestFiles(fullPath));
    } else if (entry.endsWith('.test.mjs')) {
      files.push(fullPath);
    }
  }
  return files;
}

const testFiles = collectTestFiles(SUITE_ROOT).sort();
const result = spawnSync(process.execPath, ['--test', ...testFiles], { stdio: 'inherit' });
process.exit(result.status ?? 1);
