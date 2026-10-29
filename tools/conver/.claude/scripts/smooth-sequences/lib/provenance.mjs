/**
 * The provenance a report states beside its verdict.
 *
 * The prose contract of a step can be typed (`contract_prose`), legacy (`contract` as a
 * string) or absent. The three counts must sum to the step count; a report that prints
 * a total without a partition is the failure this module exists to prevent. A v3 to v2
 * downgrade is recorded in the schema history, because a gate that can lose its typed
 * surfaces must not read the later state as a fresh baseline.
 */
import { recordIdOf } from '../../shared-obligations/evidence.mjs';
import { SmoothSequencesError } from './errors.mjs';

const SCHEMA_V2 = 2;
const SCHEMA_V3 = 3;

/** The stable id of a record, re-exported so callers need one import for provenance. */
export { recordIdOf };

/**
 * Replace a record with a new one that names what it supersedes.
 *
 * The original is never mutated: a re-anchor performed by a later reader is a new
 * record, so the earlier reader's signature and quote remain auditable.
 */
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
export function supersedeRecord(record, patch = {}, { reader } = {}) {
  const supersedes = record?.recordId ?? recordIdOf(record);
  const next = { ...record, ...patch, supersedes };
  if (reader !== undefined) next.reader = reader;
  return { ...next, recordId: recordIdOf(next) };
}

/**
 * Report whether an object answer's cited line still names its object.
 *
 * The report is the whole answer: this function never moves the line or the quote, so a
 * stale anchor stays visible instead of being rewritten into a passing one.
 */
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
export function detectStaleAnchor(record, lines = []) {
  if (typeof record?.subject !== 'string' || !record.subject.startsWith('@object:')) {
    return { stale: false, reason: null };
  }
  const name = record.subject.slice('@object:'.length);
  const line = Number.isInteger(record.line) ? lines[record.line - 1] ?? '' : '';
  if (typeof line === 'string' && line.includes(name)) return { stale: false, reason: null };
  return { stale: true, reason: 'ANCHOR_DOES_NOT_NAME_OBJECT', expectedLine: record.line ?? null };
}

/** The provenance of an artifact with no migration record. */
export function emptyProvenance() {
  return {
    status: 'not-recorded',
    fromSchemaVersion: null,
    toSchemaVersion: null,
    sourceDigest: null,
    migratedBy: null,
    proseContract: { total: 0, typed: 0, legacy: 0, absent: 0 },
    schemaHistory: [],
    downgrade: null,
  };
}

/** Whether a step carries a non-empty typed prose contract. */
// [::TICKET::] PX-283, PX-284, PX-285 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-283|PX-284|PX-285) --for-spec --no-implementation-order`.
// [::TICKET::] PX-293 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-293 --for-spec --no-implementation-order`.
function hasTypedProse(step) {
  return typeof step?.contract_prose === 'string' && step.contract_prose.trim() !== '';
}

/** Whether a step carries a non-empty legacy prose contract. */
// [::TICKET::] PX-285 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-285 --for-spec --no-implementation-order`.
function hasLegacyProse(step) {
  return typeof step?.contract === 'string' && step.contract.trim() !== '';
}

/**
 * Refuse a prose partition whose parts do not sum to its total.
 *
 * @param {{ total: number, typed: number, legacy: number, absent: number }} proseContract
 */
// [::TICKET::] PX-285 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-285 --for-spec --no-implementation-order`.
export function assertProsePartition(proseContract) {
  const { total, typed, legacy, absent } = proseContract;
  if (typed + legacy + absent !== total) {
    throw new SmoothSequencesError(
      `prose partition does not sum: typed ${typed} + legacy ${legacy} + absent ${absent} != total ${total}`,
      {
        code: 'PROSE_PARTITION_MISMATCH',
        repair: 'Count every step exactly once as typed, legacy or absent before writing the report.',
      },
    );
  }
}

/** The schema history with the current schema appended. */
// [::TICKET::] PX-285 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-285 --for-spec --no-implementation-order`.
function mergeSchemaHistory(previousSchemaVersions, schemaVersion) {
  const history = [...previousSchemaVersions];
  if (schemaVersion !== null && history.at(-1) !== schemaVersion) history.push(schemaVersion);
  return history;
}

/**
 * Summarize how an artifact came to be and what happened to its prose contracts.
 *
 * @param {object|null} artifact
 * @param {{ previousSchemaVersions?: number[] }} [options]
 * @returns {{status: string, fromSchemaVersion: number|null, toSchemaVersion: number|null,
 *   sourceDigest: string|null, migratedBy: string|null,
 *   proseContract: {total: number, typed: number, legacy: number, absent: number},
 *   schemaHistory: number[], downgrade: object|null}}
 */
// [::TICKET::] PX-283 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-283 --for-spec --no-implementation-order`.
// [::TICKET::] PX-285 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-285 --for-spec --no-implementation-order`.
export function summarizeProvenance(artifact, { previousSchemaVersions = [] } = {}) {
  const steps = Array.isArray(artifact?.steps) ? artifact.steps : [];
  const migration = artifact?.migration;
  const schemaVersion = typeof artifact?.schema_version === 'number' ? artifact.schema_version : null;

  const typed = steps.filter(hasTypedProse).length;
  const legacy = steps.filter(hasLegacyProse).length;
  const absent = steps.length - typed - legacy;
  const proseContract = { total: steps.length, typed, legacy, absent };
  assertProsePartition(proseContract);

  const schemaHistory = mergeSchemaHistory(previousSchemaVersions, schemaVersion);
  const downgrade = schemaVersion === SCHEMA_V2 && schemaHistory.includes(SCHEMA_V3)
    ? { code: 'UNPROVEN_DOWNGRADE', from: SCHEMA_V3, to: SCHEMA_V2 }
    : null;

  if (schemaVersion === SCHEMA_V2) {
    return {
      status: 'v2',
      fromSchemaVersion: SCHEMA_V2,
      toSchemaVersion: null,
      sourceDigest: null,
      migratedBy: null,
      proseContract,
      schemaHistory,
      downgrade,
    };
  }

  if (migration === undefined || migration === null) {
    return {
      status: 'not-recorded',
      fromSchemaVersion: null,
      toSchemaVersion: schemaVersion === SCHEMA_V3 ? SCHEMA_V3 : null,
      sourceDigest: null,
      migratedBy: null,
      proseContract,
      schemaHistory,
      downgrade,
    };
  }

  return {
    status: 'recorded',
    fromSchemaVersion: migration.from_schema_version ?? null,
    toSchemaVersion: migration.to_schema_version ?? null,
    sourceDigest: typeof migration.source_digest === 'string' ? migration.source_digest : null,
    migratedBy: typeof migration.migrated_by === 'string' ? migration.migrated_by : null,
    proseContract,
    schemaHistory,
    downgrade,
  };
}

/** One line for the console and the Markdown report. */
// [::TICKET::] PX-285 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-285 --for-spec --no-implementation-order`.
export function formatProvenanceLine(provenance) {
  const prose = provenance.proseContract ?? { total: 0, typed: 0, legacy: 0, absent: 0 };
  const partition = `prose total ${prose.total}: typed ${prose.typed}, legacy ${prose.legacy}, absent ${prose.absent}`;
  if (provenance.status === 'not-recorded') return `not-recorded (no migration field; ${partition})`;
  if (provenance.status === 'v2') return `v2 (${partition}; not migrated)`;
  const direction = `${provenance.fromSchemaVersion ?? '?'}->${provenance.toSchemaVersion ?? '?'}`;
  const by = provenance.migratedBy === null ? 'unknown producer' : provenance.migratedBy;
  return `${direction} by ${by}; ${partition}`;
}
