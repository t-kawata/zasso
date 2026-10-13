#!/usr/bin/env node
/**
 * sequences-material.js <rfc-dir> [--session-dir=<path>]
 *
 * Reports whether this package has sequences material, and where it is, without ever failing.
 *
 * This exists because the grill records its material in Status.json and then refuses to run
 * when a recorded path is gone: `init.js` prints `Material not found` and `list-files.js`
 * prints `Material path not found`, both with exit 1, both before any phase runs. Seeds a
 * human supplies are never deleted, so that assumption has held. A generated view is
 * different — the live workspace records that a later `/educe-sequences` run absorbed the
 * per-crate sequence artifacts and deleted them — and a path that disappears after being
 * recorded wedges the session permanently, before anything can notice.
 *
 * The fix is ordering, not tolerance in the strict readers: a reader that cannot fail runs
 * before the readers that can, so the state that would stop them is repaired first. This
 * entry point is that reader. It reports; it decides nothing and writes nothing.
 *
 * Exit-code contract:
 *   every input → 0, one JSON object on stdout. There is no failure exit, deliberately.
 *
 * Design context: tools/conver/README.md — 上流ループ / /grill-me-for-rfc (STEP 0).
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  defaultSessionDirFor,
  findSequenceMaterial,
  nodeFileSystem,
} from '../sequences-slice/lib/material.mjs';

const EXIT_OK = 0;
const SESSION_DIR_FLAG_PREFIX = '--session-dir=';
const USAGE = 'usage: sequences-material.js <rfc-dir> [--session-dir=<path>]';

/** The answer for a command line that named no directory. */
// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
function usageAnswer() {
  return {
    present: false,
    source: null,
    view: null,
    viewExists: false,
    materialPaths: [],
    staleMaterialPaths: [],
    recordedViewNames: [],
    searched: [],
    reason: USAGE,
  };
}

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  const [rfcDirArgument, ...rest] = argv;
  if (rfcDirArgument === undefined) {
    process.stdout.write(`${JSON.stringify(usageAnswer())}\n`);
    return EXIT_OK;
  }

  const explicitSessionDir = rest.find((argument) => argument.startsWith(SESSION_DIR_FLAG_PREFIX));
  const rfcDir = path.resolve(rfcDirArgument);
  const sessionDir = explicitSessionDir === undefined
    ? defaultSessionDirFor(path.join, rfcDir)
    : path.resolve(explicitSessionDir.slice(SESSION_DIR_FLAG_PREFIX.length));

  const answer = findSequenceMaterial({
    rfcDir,
    sessionDir,
    io: { ...nodeFileSystem(fs), basename: path.basename, join: path.join },
  });
  process.stdout.write(`${JSON.stringify(answer)}\n`);
  return EXIT_OK;
}

// Run only when invoked as a command: a module that read process.argv on import would
// answer about whatever process happened to load it.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  process.exit(main());
}

export { main };
