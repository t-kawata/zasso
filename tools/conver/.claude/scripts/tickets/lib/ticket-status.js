'use strict';

/**
 * ticket-status — one status vocabulary for condensation, stub validation and
 * the omission loop.
 *
 * A round-aware status (`R1`, `R2`, ...) is a completed past round. It is not a
 * merge candidate, and it must never be downgraded by a merge. Only `todo` is
 * mergeable; every other status is a barrier.
 */

const ROUND_COMPLETED_STATUS_RE = /^R[1-9]\d*$/;
const TODO_STATUS = 'todo';
const REMANDED_STATUS = 'remanded';

const COMPLETED_STATUSES = Object.freeze(['done', 'reviewed']);
const MERGEABLE_STATUSES = Object.freeze([TODO_STATUS]);

const STATUS_RANKS = Object.freeze({
  todo: 0,
  made: 1,
  planned: 2,
  done: 3,
  reviewed: 4,
});

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function isRoundCompletedStatus(status) {
  return typeof status === 'string' && ROUND_COMPLETED_STATUS_RE.test(status);
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function isCompletedStatus(status) {
  return COMPLETED_STATUSES.includes(status) || isRoundCompletedStatus(status);
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function isMergeableStatus(status) {
  const effectiveStatus = status === undefined || status === null || status === '' ? TODO_STATUS : status;
  return MERGEABLE_STATUSES.includes(effectiveStatus);
}

module.exports = {
  ROUND_COMPLETED_STATUS_RE,
  TODO_STATUS,
  REMANDED_STATUS,
  COMPLETED_STATUSES,
  MERGEABLE_STATUSES,
  STATUS_RANKS,
  isRoundCompletedStatus,
  isCompletedStatus,
  isMergeableStatus,
};
