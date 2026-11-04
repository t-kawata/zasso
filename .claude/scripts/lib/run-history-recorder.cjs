'use strict';

/**
 * recordRunHistory — append one pipeline-run event from any script.
 *
 * A command file is not a reliable place for an observability instruction: the
 * AI may skip it, and every command already runs a fixed sequence of scripts.
 * This bridge lets those scripts record the run instead. It spawns the ESM
 * writer as a child so CommonJS and ESM callers need no module-system change,
 * and every failure stays silent: observability never changes the command's own
 * exit code.
 *
 * `operation` is `start` or `finish`; `finish` takes a `status`.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const HISTORY_SCRIPT = path.resolve(__dirname, '..', 'conver', 'run-history.js');

// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
function recordRunHistory(operation, options = {}) {
  const { command, stage, status, addedTicketKeys = [], cwd = process.cwd() } = options;
  if (!command || !stage) return { ok: false };

  const args = [HISTORY_SCRIPT, operation, `--command=${command}`, `--stage=${stage}`];
  if (status) args.push(`--status=${status}`);
  for (const key of addedTicketKeys) args.push(`--added-ticket-key=${key}`);

  try {
    const result = spawnSync(process.execPath, args, { cwd, stdio: 'ignore' });
    return { ok: result.status === 0 };
  } catch {
    return { ok: false };
  }
}

module.exports = { recordRunHistory, HISTORY_SCRIPT };
