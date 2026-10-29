#!/usr/bin/env node
/**
 * sequences-material.js <rfc-dir> [--session-dir=<path>]
 *
 * Reports whether the package being drilled has sequences material, and where it is,
 * without ever failing.
 *
 * This is the drill's own entry point onto the rule in
 * `sequences-slice/lib/material.mjs`. It exists rather than the drill reaching into the
 * grill's directory because Step 1 of `/drill-rfc-down` is self-contained by contract:
 * it may call only `$DRILL_DIR` scripts and may not name another command. The rule is
 * written once; each command owns the entry point its own contract permits.
 *
 * The drill's session record carries no `materialPaths`, so a reader that stopped at the
 * session would always answer "absent". The rule therefore searches the session record,
 * then the package record, then the view's deterministic location.
 *
 * Exit-code contract:
 *   every input → 0, one JSON object on stdout. There is no failure exit, deliberately.
 *
 * Design context: tools/conver/README.md — 進化ループ / /drill-rfc-down (Step 1).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  defaultSessionDirFor,
  findSequenceMaterial,
  nodeFileSystem,
} from '../sequences-slice/lib/material.mjs';

const EXIT_OK = 0;
const SESSION_DIR_FLAG_PREFIX = '--session-dir=';
const USAGE = 'usage: sequences-material.js <rfc-dir> [--session-dir=<path>]';

/** The session directory a drill keeps, resolved from the package when none is named. */
// [::TICKET::] PX-256 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-256 --for-spec --no-implementation-order`.
function resolveSessionDir(argument, rfcDir) {
  if (argument === undefined) return defaultSessionDirFor(path.join, rfcDir);
  return path.resolve(argument.slice(SESSION_DIR_FLAG_PREFIX.length));
}

// [::TICKET::] PX-256, PX-270 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-256|PX-270) --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  const [rfcDirArgument, ...rest] = argv;
  if (rfcDirArgument === undefined) {
    process.stdout.write(`${JSON.stringify({ present: false, source: null, view: null, viewExists: false, materialPaths: [], staleMaterialPaths: [], recordedViewNames: [], searched: [], reason: USAGE })}\n`);
    return EXIT_OK;
  }

  const rfcDir = path.resolve(rfcDirArgument);
  const answer = findSequenceMaterial({
    rfcDir,
    sessionDir: resolveSessionDir(rest.find((argument) => argument.startsWith(SESSION_DIR_FLAG_PREFIX)), rfcDir),
    homeDirectory: os.homedir(),
    io: { ...nodeFileSystem(fs), basename: path.basename, join: path.join },
  });
  process.stdout.write(`${JSON.stringify(answer)}\n`);
  return EXIT_OK;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  process.exit(main());
}

export { main };
