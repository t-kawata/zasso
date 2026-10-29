#!/usr/bin/env node

/**
 * Verify the smooth pass verdict and freeze it in the workspace receipt.
 *
 * Usage:
 *   node verify-smooth-verdict.mjs --package=<package-directory> [--write] [--json]
 *
 * Exit 0 when the verdict is fresh and passing, or when the package is outside a
 * workspacify workspace. Exit 1 with the named finding otherwise.
 */
import { pathToFileURL } from 'node:url';

import { verifySmoothVerdict } from '../sequences-slice/lib/smooth-verdict.mjs';

/** Parse `--name=value` or `--name value`. */
// [::TICKET::] PX-316 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-316 --for-spec --no-implementation-order`.
function argumentFor(argv, name) {
  const inline = argv.find((entry) => entry.startsWith(`--${name}=`));
  if (inline !== undefined) return inline.slice(`--${name}=`.length);
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? null : argv[index + 1] ?? null;
}

/** The CLI entry point. */
// [::TICKET::] PX-316 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-316 --for-spec --no-implementation-order`.
export function main(argv = process.argv.slice(2)) {
  const packageDir = argumentFor(argv, 'package');
  if (packageDir === null || packageDir === '') {
    console.error('[ERROR] MISSING_PACKAGE: --package=<package-directory> is required');
    console.error('Cause: the smooth verdict gate needs the package whose view it protects');
    console.error('Action: pass --package=<package-directory> and re-run');
    return 2;
  }
  const result = verifySmoothVerdict({ packageDir, writeReceipt: argv.includes('--write') });
  for (const entry of result.findings) {
    console.error(`${entry.code}: ${entry.subject ?? ''} ${entry.message}`);
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.ok ? 0 : 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
