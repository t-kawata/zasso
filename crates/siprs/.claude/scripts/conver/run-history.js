#!/usr/bin/env node
/**
 * run-history.js start|finish — record one pipeline command invocation.
 *
 * The command name and stage come from the caller. The workspace root is found by
 * walking up to WORKSPACIFY-TREE-MANIFEST.json; the package is found by matching the
 * current directory to tree.workspace.packages[].path. A command run outside any
 * package writes workspace-level history (packageId null).
 *
 * The writer never changes a command's exit code: every failure is printed as a
 * [history] warning and the process exits 0.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  HISTORY_STAGES,
  HISTORY_STATUSES,
  appendHistoryRecord,
  historyPathOf,
  readHistoryFile,
} from './progress-gif/history.js';

const USAGE = 'usage: run-history.js start|finish --command=<name> --stage=<stage> [--status=<status>] [--added-ticket-key=<key>] [--root=<dir>] [--package=<id>]';

/** Walk up from start until the workspace tree manifest is found. */
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
export function resolveWorkspaceRoot(start = process.cwd()) {
  let cursor = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(cursor, 'WORKSPACIFY-TREE-MANIFEST.json'))) return cursor;
    const parent = path.dirname(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
}

// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
function readTree(root) {
  if (root === null) return null;
  try {
    return JSON.parse(readFileSync(path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), 'utf8'));
  } catch {
    return null;
  }
}

/** The tree path of a directory, using the separators the manifest carries. */
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-366 --for-spec --no-implementation-order`.
function relativePackagePath(root, cwd) {
  const relative = path.relative(root, cwd);
  return relative === '' ? '.' : relative.split(path.sep).join('/');
}

/** The package id whose tree path equals cwd, or null at the workspace root. */
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
export function resolvePackageId(root, cwd = process.cwd(), explicit = null) {
  if (explicit !== null) return explicit;
  const tree = readTree(root);
  const relative = relativePackagePath(root, cwd);
  const entry = (tree?.workspace?.packages ?? []).find((candidate) => (candidate.path ?? '.') === relative);
  return entry?.id ?? null;
}

// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
function packageDirOf(root, packageId) {
  const tree = readTree(root);
  const entry = (tree?.workspace?.packages ?? []).find((candidate) => candidate.id === packageId);
  return entry ? path.resolve(root, entry.path ?? '.') : root;
}

/** The directory whose .conver-history.jsonl receives the record. */
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
export function historyTargetDir(root, packageId) {
  return packageId === null ? root : packageDirOf(root, packageId);
}

// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
function newRunId(command) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  return `${stamp}-${command}-${randomBytes(3).toString('hex')}`;
}

// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
function resolveTarget(options) {
  const cwd = options.cwd ?? process.cwd();
  const root = options.root ?? resolveWorkspaceRoot(cwd);
  if (root === null) return { ok: false, warning: '[history] no WORKSPACIFY-TREE-MANIFEST.json above the working directory' };
  const packageId = resolvePackageId(root, cwd, options.packageId ?? null);
  return { ok: true, root, cwd, packageId, targetDir: historyTargetDir(root, packageId) };
}

// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
function readFinishes(targetDir) {
  return new Set(
    readHistoryFile(historyPathOf(targetDir)).records
      .filter((record) => record.event === 'finish')
      .map((record) => record.runId),
  );
}

/** Append a start record. Never throws; a failure is returned as a warning. */
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
export function recordStart({ root, cwd, command, stage, packageId } = {}) {
  const target = resolveTarget({ root, cwd, packageId });
  if (!target.ok) return target;
  if (!HISTORY_STAGES.includes(stage)) return { ok: false, warning: `[history] unknown stage ${stage}` };

  try {
    return appendHistoryRecord(target.targetDir, {
      v: 1,
      runId: newRunId(command),
      event: 'start',
      command,
      stage,
      packageId: target.packageId,
      at: new Date().toISOString(),
    });
  } catch (error) {
    return { ok: false, warning: `[history] ${error.message}` };
  }
}

/**
 * Append a finish record. It pairs with the latest unmatched start of the same
 * command and package; without one it stands alone. A repeated finish with no new
 * start is a no-op, so an accidental double call does not create a second run.
 */
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
export function recordFinish(options = {}) {
  const { root, cwd, command, stage, status, addedTicketKeys = [], packageId } = options;
  const target = resolveTarget({ root, cwd, packageId });
  if (!target.ok) return target;
  if (!HISTORY_STAGES.includes(stage)) return { ok: false, warning: `[history] unknown stage ${stage}` };
  if (!HISTORY_STATUSES.includes(status)) return { ok: false, warning: `[history] unknown status ${status}` };

  try {
    const { records } = readHistoryFile(historyPathOf(target.targetDir));
    const finished = readFinishes(target.targetDir);
    const unmatchedStart = [...records].reverse().find(
      (record) => record.event === 'start'
        && record.command === command
        && record.packageId === target.packageId
        && !finished.has(record.runId),
    );
    const latest = [...records].reverse().find(
      (record) => record.command === command && record.packageId === target.packageId,
    );
    if (unmatchedStart === undefined && latest?.event === 'finish') {
      return { ok: true, appended: false };
    }

    return appendHistoryRecord(target.targetDir, {
      v: 1,
      runId: unmatchedStart?.runId ?? newRunId(command),
      event: 'finish',
      command,
      stage,
      packageId: target.packageId,
      at: new Date().toISOString(),
      status,
      addedTicketKeys: [...new Set(addedTicketKeys)],
    });
  } catch (error) {
    return { ok: false, warning: `[history] ${error.message}` };
  }
}

/**
 * Wrap one script entry point so the run is recorded without a command-file
 * instruction. The exit hook closes the run even when the script calls process.exit
 * or throws: a non-zero exit is BLOCKED_PREREQUISITE, zero is COMPLETE.
 */
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
export async function withRunHistory(options, work) {
  recordStart(options);
  let finished = false;
  const finish = (status) => {
    if (finished) return;
    finished = true;
    recordFinish({ ...options, status });
  };
  const useExitHook = options.exitHook !== false;
  if (useExitHook) process.once('exit', (code) => finish(code === 0 ? 'COMPLETE' : 'BLOCKED_PREREQUISITE'));

  try {
    const result = await work();
    const exitCode = typeof result === 'number' ? result : 0;
    finish(exitCode === 0 ? 'COMPLETE' : 'BLOCKED_PREREQUISITE');
    return result;
  } catch (error) {
    finish('BLOCKED_PREREQUISITE');
    throw error;
  }
}

// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
export function parseArgs(argv) {
  const options = { operation: null, command: null, stage: null, status: 'COMPLETE', root: null, packageId: undefined, addedTicketKeys: [] };
  for (const argument of argv) {
    if (!argument.startsWith('--') && options.operation === null) options.operation = argument;
    else if (argument.startsWith('--command=')) options.command = argument.slice('--command='.length);
    else if (argument.startsWith('--stage=')) options.stage = argument.slice('--stage='.length);
    else if (argument.startsWith('--status=')) options.status = argument.slice('--status='.length);
    else if (argument.startsWith('--root=')) options.root = argument.slice('--root='.length);
    else if (argument.startsWith('--package=')) {
      const value = argument.slice('--package='.length);
      options.packageId = value === '' || value === 'null' ? null : value;
    } else if (argument.startsWith('--added-ticket-key=')) options.addedTicketKeys.push(argument.slice('--added-ticket-key='.length));
  }
  return options;
}

// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (!['start', 'finish'].includes(options.operation) || !options.command || !options.stage) {
    process.stderr.write(`${USAGE}\n`);
    return 0;
  }
  const result = options.operation === 'start'
    ? recordStart(options)
    : recordFinish({ ...options, addedTicketKeys: options.addedTicketKeys });
  if (result.warning) process.stderr.write(`${result.warning}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
