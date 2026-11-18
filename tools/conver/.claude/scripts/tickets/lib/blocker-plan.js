'use strict';

/**
 * PX-442 — map the measured v3 remainder to ticket groups.
 *
 * conver stops on the ticket set, not on the find exit code. Every blocking
 * class therefore has to become a ticket: an unticketed remainder would let an
 * endpoint be declared while the v3 verdict is still 10. One group per
 * contract deduplicates the clauses that share a contract.
 */

const { parseClauseKey } = require('./contract-clause.js');

const PROVEN_STATUSES = new Set([
  'PROVEN',
  'NOT_APPLICABLE_VERIFIED',
  'DESIGN_PREDICATE_VERIFIED',
  'PROCESS_VERIFIED',
  'EXTERNAL_VERIFIED',
  'DEFERRED',
]);

const PROOF_WORK_STATUSES = new Set([
  'CLAUSE_PROOF_MISSING',
  'CLAUSE_PROOF_STALE',
  'CLAUSE_PROOF_FAILED',
  'UNSTABLE',
]);

/** The blocking class of one measured clause. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function blockingClassOf(clause) {
  if (clause?.proofDropped === 'UNSTABLE_PROOF_TARGET') return 'unstable-target';
  if (clause?.status === 'UNCLASSIFIED') return 'unclassified';
  if (clause?.status === 'UNMAPPED') return 'unmapped';
  if (clause?.status === 'TEST_MISSING' || clause?.status === 'TEST_IGNORED') return 'test-missing';
  if (clause?.status === 'CLAUSE_DISPOSITION_UNVERIFIED') return 'disposition-unverified';
  if (clause?.status === 'DEFERRED_EXPIRED') return 'deferred-expired';
  if (PROOF_WORK_STATUSES.has(clause?.status)) return 'proof-missing';
  return 'unresolved';
}

/** Add one entry or merge its clause keys into the existing contract group. */
// [::TICKET::] PX-442, PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-442|PX-443) --for-spec --no-implementation-order`.
function accumulateGroupClauses(groups, blocker) {
  const incoming = Array.isArray(blocker.clauses) && blocker.clauses.length > 0
    ? blocker.clauses
    : [blocker.key];
  const existing = groups.get(blocker.group);
  if (existing === undefined) {
    groups.set(blocker.group, { ...blocker, clauses: [...incoming].sort() });
    return;
  }
  existing.clauses = [...new Set([...existing.clauses, ...incoming])].sort();
}

/** The clause owner named by the inventory. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-442 --for-spec --no-implementation-order`.
function ownerOf({ clausesByKey, key }) {
  return (clausesByKey.get(key)?.owners ?? [])[0] ?? null;
}

/**
 * Emit one deduplicated group per contract for every blocking class.
 *
 * @param {{inventory:object|null, coverage:object, testIndex?:object, classes?:string[]|null}} input
 * @returns {object[]}
 */
// [::TICKET::] PX-442, PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-442|PX-443) --for-spec --no-implementation-order`.
function blockerEntriesOf({ inventory, coverage, classes = null }) {
  const clausesByKey = new Map((inventory?.clauses ?? []).map((clause) => [clause.key, clause]));
  const groups = new Map();

  for (const conflict of inventory?.conflicts ?? []) {
    const firstKey = (conflict.keys ?? [])[0] ?? null;
    const parsed = parseClauseKey(firstKey);
    const scope = parsed?.scope ?? inventory?.scope ?? 'package';
    const contractId = conflict.contractId ?? parsed?.contractId ?? 'unknown';
    accumulateGroupClauses(groups, {
      key: 'conflict|' + String(conflict.code ?? 'conflict') + '|' + [...(conflict.keys ?? [])].sort().join(','),
      clauses: [...(conflict.keys ?? [])].sort(),
      contractId,
      element: conflict.element ?? null,
      group: scope + '|' + contractId,
      owner: ownerOf({ clausesByKey, key: firstKey }),
      blockingClass: 'conflict',
      conflictCode: conflict.code ?? null,
    });
  }

  for (const clause of coverage?.clauses ?? []) {
    if (PROVEN_STATUSES.has(clause.status)) continue;
    const parsed = parseClauseKey(clause.key);
    const scope = parsed?.scope ?? inventory?.scope ?? 'package';
    const contractId = parsed?.contractId ?? 'unknown';
    accumulateGroupClauses(groups, {
      key: clause.key,
      clauses: [clause.key],
      contractId,
      element: parsed?.element ?? null,
      group: scope + '|' + contractId,
      owner: ownerOf({ clausesByKey, key: clause.key }),
      blockingClass: blockingClassOf(clause),
    });
  }

  return [...groups.values()]
    .filter((entry) => classes === null || classes.includes(entry.blockingClass))
    .sort((left, right) => (left.group < right.group ? -1 : left.group > right.group ? 1 : 0));
}

module.exports = {
  PROOF_WORK_STATUSES,
  PROVEN_STATUSES,
  blockerEntriesOf,
  blockingClassOf,
};
