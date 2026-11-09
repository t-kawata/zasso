/**
 * Compact execution history for the five-layer pipeline.
 *
 * One JSON object per line, append-only. The history is observability: a malformed
 * record or an unwritable file is a warning, never a reason to stop a command. The
 * drawing code reads this file only through readHistoryFile, so a bad line can never
 * take the animation down with it.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The file every package and the workspace root may carry. */
export const HISTORY_FILE_NAME = '.conver-history.jsonl';

/** The schema version this reader accepts. */
export const HISTORY_SCHEMA_VERSION = 1;

/** The two record kinds a run writes. */
export const HISTORY_EVENTS = Object.freeze(['start', 'finish']);

/** The terminal statuses a finish may carry. STARTED is the start-only marker. */
export const HISTORY_STATUSES = Object.freeze([
  'STARTED',
  'COMPLETE',
  'BLOCKED_PREREQUISITE',
  'REPAIR_NO_PROGRESS',
]);

/**
 * The stage vocabulary, copied from the drawing model because importing loop.js here
 * would make the two modules import each other. run-history.test.mjs asserts that this
 * list equals STAGE_ORDER, so a stage added to the renderer cannot silently disappear
 * from the history validator.
 */
export const HISTORY_STAGES = Object.freeze([
  'educe', 'explain', 'grill', 'smooth', 'graphify', 'boundify', 'split',
  'make', 'plan', 'start', 'review', 'resolve', 'consolidate', 'find',
  'crystalize', 'drill',
]);

/** A single record must stay small enough to append atomically. */
const MAX_RECORD_BYTES = 4096;

/** The history file inside one target directory. */
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
export function historyPathOf(targetDir) {
  return join(targetDir, HISTORY_FILE_NAME);
}

/**
 * The first reason a record is not usable, or null when it is.
 * Start records carry no status and no addedTicketKeys; finish records carry both.
 */
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
export function validateHistoryRecord(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return 'is not an object';
  if (record.v !== HISTORY_SCHEMA_VERSION) return 'has an unknown version';
  if (typeof record.runId !== 'string' || record.runId.length === 0) return 'has no runId';
  if (!HISTORY_EVENTS.includes(record.event)) return 'has an unknown event';
  if (!HISTORY_STAGES.includes(record.stage)) return 'has an unknown stage';
  if (typeof record.command !== 'string' || record.command.length === 0) return 'has no command';
  if (record.packageId !== null && typeof record.packageId !== 'string') return 'has an invalid packageId';
  if (typeof record.at !== 'string' || Number.isNaN(Date.parse(record.at))) return 'has no ISO-8601 at';
  if (record.event === 'finish' && !HISTORY_STATUSES.includes(record.status)) return 'has an unknown status';
  if (record.event === 'finish' && !Array.isArray(record.addedTicketKeys)) return 'has no addedTicketKeys';
  return null;
}

/** Read every valid record, reporting each bad line with its line number. */
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
export function readHistoryFile(file) {
  if (!existsSync(file)) return { records: [], warnings: [] };
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    return { records: [], warnings: [`[history] ${file}: ${error.message}`] };
  }

  const records = [];
  const warnings = [];
  text.split('\n').forEach((line, index) => {
    if (line.trim() === '') return;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      warnings.push(`[history] ${file}: line ${index + 1} is not JSON`);
      return;
    }
    const problem = validateHistoryRecord(record);
    if (problem !== null) {
      warnings.push(`[history] ${file}: line ${index + 1} ${problem}`);
      return;
    }
    records.push(record);
  });
  return { records, warnings };
}

/**
 * Append one record unless the same runId and event is already present.
 * Returns a result instead of throwing; the caller decides how loudly to warn.
 */
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
export function appendHistoryRecord(targetDir, record) {
  const problem = validateHistoryRecord(record);
  if (problem !== null) return { ok: false, appended: false, warning: `[history] ${problem}` };

  const line = JSON.stringify(record);
  if (Buffer.byteLength(line, 'utf8') > MAX_RECORD_BYTES) {
    return { ok: false, appended: false, warning: `[history] record exceeds ${MAX_RECORD_BYTES} bytes` };
  }

  const file = historyPathOf(targetDir);
  const { records } = readHistoryFile(file);
  if (records.some((entry) => entry.runId === record.runId && entry.event === record.event)) {
    return { ok: true, appended: false };
  }

  appendFileSync(file, `${line}\n`, 'utf8');
  return { ok: true, appended: true };
}

/**
 * The marker one COMPLETE run contributes to the animation. A start-only or
 * failed attempt is not a completion, so it is never drawn and never moves the
 * displayed stage.
 */
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
// [::TICKET::] PX-401 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-401 --for-spec --no-implementation-order`.
export function historyRunMarkers(packageId, records) {
  const markers = [];
  for (const record of records ?? []) {
    if (record.event !== 'finish' || record.status !== 'COMPLETE') continue;
    const timestamp = Date.parse(record.at);
    if (!Number.isFinite(timestamp)) continue;
    markers.push({
      t: timestamp,
      prec: 'ms',
      stage: record.stage,
      packageId: packageId ?? null,
      status: record.status,
      runId: record.runId,
      command: record.command,
      evidence: 'history',
    });
  }
  return markers;
}
