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
function atomOf(blocker, clauseKey, contract, blockingClass) {
  return {
    key: clauseKey,
    group: blocker.group,
    contractId: blocker.contractId,
    owner: blocker.owner ?? null,
    blockingClass: blockingClass ?? blocker.blockingClass,
    contract,
    plannedTest: { id: 'omission-test:' + clauseKey, kind: 'unit' },
  };
}

/** The per-clause classes a blocker carries, with a legacy single-class fallback. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function clauseClassesOf(blocker) {
  if (Array.isArray(blocker?.clauseClasses) && blocker.clauseClasses.length > 0) return blocker.clauseClasses;
  return (blocker?.clauses ?? [blocker?.key]).map((key) => ({ key, blockingClass: blocker?.blockingClass }));
}

/**
 * Split blockers into implementation atoms and named non-ticket sinks.
 *
 * Each clause is routed by its own measured class. A contract can hold a
 * test-missing clause and a proof-missing clause at the same time; routing the
 * whole group by its first class would either ticket the repair or drop the
 * implementation work.
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
    const implementation = [];
    const repair = [];
    const classification = [];
    const classByKey = new Map();
    for (const entry of clauseClassesOf(blocker)) {
      classByKey.set(entry.key, entry.blockingClass);
      const kind = workKindOf(entry.blockingClass);
      if (kind === WORK_KIND.IMPLEMENTATION) implementation.push(entry.key);
      else if (kind === WORK_KIND.CLASSIFICATION) classification.push(entry.key);
      else repair.push(entry.key);
    }

    if (implementation.length > 0) {
      const contract = projectContract(inventory, blocker.contractId);
      if (contract === null) {
        unprojectable.push({ ...blocker, clauses: [...new Set(implementation)].sort() });
      } else {
        for (const clauseKey of [...new Set(implementation)].sort()) {
          atoms.push(atomOf(blocker, clauseKey, contract, classByKey.get(clauseKey)));
        }
      }
    }
    if (repair.length > 0) repairs.push({ ...blocker, clauses: [...new Set(repair)].sort() });
    if (classification.length > 0) classifications.push({ ...blocker, clauses: [...new Set(classification)].sort() });
  }

  return { atoms, repairs, classifications, unprojectable };
}

module.exports = {
  WORK_KIND,
  atomsOfImplementation,
  projectContract,
  workKindOf,
};
