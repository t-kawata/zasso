'use strict';

/**
 * PX-437 — per-package find lock.
 *
 * Two invocations must never mutate one worktree concurrently. A stale lock is
 * recovered with evidence rather than ignored.
 */

const fs = require('node:fs');
const path = require('node:path');
const { writeTemporaryThenRename } = require('./atomic-write.js');

const LOCK_FILE_NAME = '.conver-find.lock';
const DEFAULT_STALE_MS = 6 * 60 * 60 * 1000;

/** The lock path for a package. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function packageLockPath(cwd) {
  return path.join(cwd, LOCK_FILE_NAME);
}

/** Read the lock record, or null when absent or corrupt. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function readPackageLock({ cwd }) {
  const file = packageLockPath(cwd);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { corrupt: true, at: 0, pid: null };
  }
}

/**
 * Acquire the package lock.
 *
 * @param {{cwd:string, pid?:number, now?:number, staleMs?:number}} input
 * @returns {{acquired:boolean, stale:boolean, holder:object|null, recovered?:object}}
 */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function acquirePackageLock({ cwd, pid = process.pid, now = Date.now(), staleMs = DEFAULT_STALE_MS }) {
  const existing = readPackageLock({ cwd });
  if (existing === null) {
    writeTemporaryThenRename(packageLockPath(cwd), JSON.stringify({ pid, at: now }) + '\n');
    return { acquired: true, stale: false, holder: { pid, at: now } };
  }

  const age = now - Number(existing.at ?? 0);
  if (!existing.corrupt && age <= staleMs) {
    return { acquired: false, stale: false, holder: existing };
  }

  const recovered = { ...existing, age };
  writeTemporaryThenRename(packageLockPath(cwd), JSON.stringify({ pid, at: now, recovered }) + '\n');
  return { acquired: true, stale: true, holder: { pid, at: now }, recovered };
}

/** Release the package lock. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function releasePackageLock({ cwd }) {
  fs.rmSync(packageLockPath(cwd), { force: true });
}

module.exports = {
  DEFAULT_STALE_MS,
  LOCK_FILE_NAME,
  acquirePackageLock,
  packageLockPath,
  readPackageLock,
  releasePackageLock,
};
