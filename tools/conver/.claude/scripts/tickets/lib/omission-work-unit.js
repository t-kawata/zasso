'use strict';

// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
/**
 * omission-work-unit — classify a measured blocker and turn implementation
 * clauses into the atoms the ticket partition consumes.
 *
 * A detected clause is evidence. Only the clause whose work is authored
 * implementation becomes an atom; deterministic repair and classification are
 * named sinks, never tickets. The contract projection returns null rather than
 * guessing a clause, so an unprojectable obligation becomes a named repair.
 */

const WORK_KIND = Object.freeze({
  IMPLEMENTATION: 'implementation',
  REPAIR: 'repair',
  CLASSIFICATION: 'classification',
});

const IMPLEMENTATION_CLASSES = new Set(['test-missing', 'unmapped']);
const CLASSIFICATION_CLASSES = new Set(['unclassified', 'disposition-unverified', 'unresolved']);

const REQUIRED_ELEMENTS = Object.freeze(['precondition', 'postcondition', 'invariant']);

/** The work a blocking class requires. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
function workKindOf(blockingClass) {
  if (IMPLEMENTATION_CLASSES.has(blockingClass)) return WORK_KIND.IMPLEMENTATION;
  if (CLASSIFICATION_CLASSES.has(blockingClass)) return WORK_KIND.CLASSIFICATION;
  return WORK_KIND.REPAIR;
}

/** The first non-empty text of one contract element. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
function elementText(clauses, element) {
  const match = clauses.find((clause) => clause.element === element
    && typeof clause.text === 'string'
    && clause.text.trim().length > 0);
  return match === undefined ? null : match.text;
}

/** The first non-empty source edge of a contract's clauses. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function sourceEdgeOf(clauses, scope, contractId) {
  const source = clauses
    .map((clause) => clause.source)
    .find((value) => typeof value === 'string' && value.length > 0);
  return source ?? `${scope}→${contractId}`;
}

/**
 * Project one contract into the ticket schema shape.
 *
 * @returns {{id:string,sourceEdge:string,precondition:string,postcondition:string,invariant:string}|null}
 */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function projectContract(inventory, contractId) {
  const clauses = (inventory?.clauses ?? []).filter((clause) => String(clause.contractId) === String(contractId));
  const elements = {};
  for (const element of REQUIRED_ELEMENTS) {
    const text = elementText(clauses, element);
    if (text === null) return null;
    elements[element] = text;
  }
  const scope = inventory?.scope ?? clauses.find((clause) => typeof clause.key === 'string')?.key.split('|')[1] ?? 'package';
  return {
    id: String(contractId),
    sourceEdge: sourceEdgeOf(clauses, scope, contractId),
    precondition: elements.precondition,
    postcondition: elements.postcondition,
    invariant: elements.invariant,
  };
}

/** One implementation clause as the partition atom. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function atomOf(blocker, clauseKey, contract) {
  return {
    key: clauseKey,
    group: blocker.group,
    contractId: blocker.contractId,
    owner: blocker.owner ?? null,
    blockingClass: blocker.blockingClass,
    contract,
    plannedTest: { id: 'omission-test:' + clauseKey, kind: 'unit' },
  };
}

/**
 * Split blockers into implementation atoms and named non-ticket sinks.
 *
 * @returns {{atoms:object[], repairs:object[], classifications:object[], unprojectable:object[]}}
 */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function atomsOfImplementation(blockers, inventory) {
  const atoms = [];
  const repairs = [];
  const classifications = [];
  const unprojectable = [];

  for (const blocker of blockers ?? []) {
    const kind = workKindOf(blocker.blockingClass);
    if (kind === WORK_KIND.REPAIR) {
      repairs.push(blocker);
      continue;
    }
    if (kind === WORK_KIND.CLASSIFICATION) {
      classifications.push(blocker);
      continue;
    }
    const contract = projectContract(inventory, blocker.contractId);
    if (contract === null) {
      unprojectable.push(blocker);
      continue;
    }
    for (const clauseKey of [...(blocker.clauses ?? [blocker.key])].sort()) {
      atoms.push(atomOf(blocker, clauseKey, contract));
    }
  }

  return { atoms, repairs, classifications, unprojectable };
}

module.exports = {
  WORK_KIND,
  atomsOfImplementation,
  projectContract,
  workKindOf,
};
