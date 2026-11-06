#!/usr/bin/env node
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-377 --for-spec --no-implementation-order`.
/**
 * author-ledger.js --rfc-dir=<dir> [--workspace=<root>] [--graph=<path>]
 *   [--dirs-tree=<path>] [--write]
 *
 * Drafts the Formula ledger and its sidecar from the specification the seed owns.
 * A field the pipeline does not determine is a named finding and the command writes
 * nothing; the gate stays the oracle, never this command.
 */
import { dirname, join, resolve } from 'node:path';

import { authorLedger } from './author-ledger.mjs';
import { resolveWorkspaceRoot } from './identity.mjs';

/** One `--name=value` argument, or null. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function argument(name) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((entry) => entry.startsWith(prefix));
  return match === undefined ? null : match.slice(prefix.length);
}

const rfcDirArgument = argument('rfc-dir');
if (rfcDirArgument === null) {
  process.stderr.write('Usage: author-ledger.js --rfc-dir=<dir> [--workspace=<root>] [--graph=<path>] [--dirs-tree=<path>] [--write]\n');
  process.exit(2);
}

const rfcDir = resolve(rfcDirArgument);
const workspaceRoot = argument('workspace') ?? resolveWorkspaceRoot(rfcDir) ?? dirname(rfcDir);
const graphPath = argument('graph') ?? join(rfcDir, 'RFC-GRAPH.json');
const dirsTreePath = argument('dirs-tree') ?? join(rfcDir, 'RFC-Dirs-Tree.json');
const write = process.argv.slice(2).includes('--write');

const result = authorLedger({ rfcDir, graphPath, dirsTreePath, workspaceRoot, write });
process.stdout.write(`${JSON.stringify({
  ok: result.ok,
  ownedFormulas: result.ownedFormulas ?? 0,
  rows: result.rows.length,
  findings: result.findings,
  written: result.written ?? false,
}, null, 2)}\n`);
process.exit(result.ok ? 0 : 1);
