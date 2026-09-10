// [::TICKET::] PX-203 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-203 --for-spec --no-implementation-order`.
/**
 * Aggregate test runner for the workspacify-reverse suite.
 *
 * Collects every *.test.mjs under tests/workspacify-reverse and runs them with
 * `node --test`, forwarding the child exit code. The Makefile is intentionally
 * not used for test execution.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SUITE_ROOT = fileURLToPath(new URL('.', import.meta.url));

function collectTestFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir).sort()) {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectTestFiles(fullPath));
    } else if (entry.endsWith('.test.mjs')) {
      files.push(fullPath);
    }
  }
  return files;
}

const testFiles = collectTestFiles(SUITE_ROOT);
const result = spawnSync(process.execPath, ['--test', ...testFiles], { stdio: 'inherit' });
process.exit(result.status ?? 1);
