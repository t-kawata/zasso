// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
/**
 * Persist the remaining open set, including the empty set.
 *
 * The previous detector skipped the write when the set was empty, which left a stale
 * worklist from an earlier generation. The worklist now always states its generation,
 * digest and remaining count.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export const WORKLIST_FILE_NAME = 'JUDGMENT-WORKLIST.json';
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export const WORKLIST_SCHEMA_VERSION = 2;

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function writeWorklist(root, items = [], {
  generation = null, worklistDigest = null, legacy = false,
} = {}) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const directory = join(root, 'smooth-sequences');
  mkdirSync(directory, { recursive: true });
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const body = legacy ? items : {
    schemaVersion: WORKLIST_SCHEMA_VERSION,
    generation,
    worklistDigest,
    remainingOpen: items.length,
    items,
  };
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const path = join(directory, WORKLIST_FILE_NAME);
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
  return path;
}

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function validateWorklistDigest(current, expected) {
  if ((current?.worklistDigest ?? null) !== (expected?.worklistDigest ?? null)) {
    return { ok: false, code: 'WORKLIST_STALE', problem: 'the worklist digest does not match the current run' };
  }
  return { ok: true, code: null, problem: null };
}
