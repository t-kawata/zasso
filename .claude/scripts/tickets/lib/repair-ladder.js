'use strict';

/**
 * PX-437 — deterministic self-repair ladder.
 *
 * A project condition is a work item, never an exit. Each step is idempotent,
 * carries a stable repairKey, and either repairs configuration/derived
 * artifacts automatically or creates one deduplicated repair ticket. A repair
 * that would need a destructive change, the network or a secret is never
 * automatic.
 */

const { createHash } = require('node:crypto');

const RECORD_VERSION = 1;
const MAX_NO_PROGRESS_ATTEMPTS = 2;

/** Normalize a runner error into a stable identity component. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function normalizeError(error) {
  return String(error ?? '').trim().replace(/\s+/g, ' ');
}

/** The stable identity of one blocker. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function repairKeyOf(blocker) {
  const identity = [blocker?.kind ?? 'unknown', blocker?.artifact ?? 'unknown', normalizeError(blocker?.error)].join('|');
  return 'sha256:' + createHash('sha256').update(identity).digest('hex');
}

/** The action a blocker kind selects. */
// [::TICKET::] PX-437, PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-437|PX-440) --for-spec --no-implementation-order`.
function actionFor(kind) {
  if (kind === 'missing-config') return 'rediscover-config';
  if (kind === 'missing-adapter') return 'synthesize-adapter';
  if (kind === 'missing-runner' || kind === 'missing-test') return 'synthesize-runner';
  if (kind === 'stale-artifact' || kind === 'missing-inventory' || kind === 'missing-coverage') return 'repair-artifact';
  if (kind === 'unprovable-clause') return 'repair-clause';
  if (kind === 'unclassified-clause' || kind === 'invalid-disposition') return 'repair-clause';
  return null;
}

/** The IO function that performs one action. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function performAction(action, { blocker, io }) {
  if (action === 'rediscover-config') return io.rediscoverConfig?.(blocker) ?? { ok: false };
  if (action === 'synthesize-adapter') return io.synthesizeAdapter?.(blocker) ?? { ok: false };
  if (action === 'synthesize-runner') return io.synthesizeRunner?.(blocker) ?? { ok: false };
  if (action === 'repair-artifact') return io.repairArtifact?.(blocker) ?? { ok: false };
  if (action === 'repair-clause') return io.repairClause?.(blocker) ?? { ok: false };
  return { ok: false };
}

/** A record with evidence for the repair ledger. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function recordOf({ repairKey, blocker, action, status, ticketKey, attempts, stateDigest, reused = false }) {
  const now = new Date().toISOString();
  return {
    version: RECORD_VERSION,
    repairKey,
    kind: blocker?.kind ?? 'unknown',
    action,
    status,
    ticketKey: ticketKey ?? null,
    evidence: [{
      command: 'repair:' + String(action),
      exitCode: status === 'completed' ? 0 : null,
      outputDigest: 'sha256:' + createHash('sha256').update(JSON.stringify(blocker ?? {})).digest('hex'),
    }],
    attempts,
    stateDigest,
    reused,
    createdAt: now,
    verifiedAt: status === 'completed' ? now : null,
  };
}

/**
 * Run the repair ladder for one blocker.
 *
 * @param {{blocker:object, io?:object, previous?:object|null}} input
 * @returns {object} repair record
 */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function runRepairLadder({ blocker, io = {}, previous = null }) {
  const repairKey = repairKeyOf(blocker);
  const unsafe = blocker?.requiresDestructive === true || blocker?.requiresNetwork === true || blocker?.requiresSecret === true;

  if (unsafe) {
    const ticket = io.createRepairTicket?.(blocker) ?? { ok: false, ticketKey: null };
    const record = recordOf({ repairKey, blocker, action: 'repair-ticket', status: 'pending', ticketKey: ticket.ticketKey ?? null, attempts: 0, stateDigest: 'unsafe' });
    io.writeState?.(record);
    return record;
  }

  const prior = previous ?? io.readState?.() ?? null;
  const stateDigest = io.stateDigest?.() ?? 'same';

  if (prior !== null && prior.repairKey === repairKey) {
    if (prior.status === 'completed') return { ...prior, reused: true };
    if ((prior.attempts ?? 0) >= MAX_NO_PROGRESS_ATTEMPTS && prior.stateDigest === stateDigest) {
      const diagnostic = io.createDiagnosticTicket?.(prior) ?? { ok: false, ticketKey: null };
      const record = recordOf({ repairKey, blocker, action: 'diagnostic-ticket', status: 'unrepairable', ticketKey: diagnostic.ticketKey ?? null, attempts: prior.attempts, stateDigest });
      io.writeState?.(record);
      return record;
    }
  }

  const action = actionFor(blocker?.kind);
  const attempts = (prior?.attempts ?? 0) + 1;

  if (action !== null) {
    const result = performAction(action, { blocker, io });
    if (result.ok === true) {
      const record = recordOf({ repairKey, blocker, action, status: 'completed', attempts, stateDigest });
      io.writeState?.(record);
      return record;
    }
  }

  const ticket = io.createRepairTicket?.(blocker) ?? { ok: false, ticketKey: null };
  const record = recordOf({ repairKey, blocker, action: 'repair-ticket', status: 'pending', ticketKey: ticket.ticketKey ?? null, attempts, stateDigest });
  io.writeState?.(record);
  return record;
}

module.exports = {
  MAX_NO_PROGRESS_ATTEMPTS,
  RECORD_VERSION,
  actionFor,
  normalizeError,
  repairKeyOf,
  runRepairLadder,
};
