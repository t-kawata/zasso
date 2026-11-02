'use strict';

const { projectionMatches } = require('../../sequences-slice/lib/boundary-contract.mjs');

/**
 * The contract-chain predicate shared by the graphify gate and the split closure.
 *
 * A contract's postcondition describes the state after its edge; the next edge's
 * precondition describes what that transition requires. Prose containment is not a proof
 * (`not ready` contains `ready`), so the predicate accepts only normalized identity or an
 * explicit `satisfiedBy` link naming the source postcondition or source contract id.
 */

/** A normalized contract clause for the satisfaction comparison. */
// [::TICKET::] PX-344 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-344 --for-spec --no-implementation-order`.
function normalizeClause(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Whether one postcondition satisfies a later precondition.
 *
 * `satisfiedBy` names what the source provides: its postcondition clause or its contract
 * id. A value equal to the precondition alone is not a link and never satisfies it.
 */
// [::TICKET::] PX-344 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-344 --for-spec --no-implementation-order`.
function contractIdentityMatches(postcondition, precondition, satisfiedBy = null, sourceContractId = null) {
  const post = normalizeClause(postcondition);
  const pre = normalizeClause(precondition);
  if (post === '' || pre === '') return false;
  if (post === pre) return true;
  if (typeof satisfiedBy !== 'string' || satisfiedBy.trim() === '') return false;
  if (normalizeClause(satisfiedBy) === post) return true;
  return typeof sourceContractId === 'string' && satisfiedBy === sourceContractId;
}

/** Whether any incoming contract provides the target contract's precondition. */
// [::TICKET::] PX-344 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-344 --for-spec --no-implementation-order`.
function resolveSatisfiedBy(targetContract, incomingContracts = []) {
  if (targetContract === null || typeof targetContract?.precondition !== 'string') return false;
  return incomingContracts.some((source) => source !== null
    && contractIdentityMatches(
      source.postcondition,
      targetContract.precondition,
      targetContract.satisfiedBy,
      source.id,
    ));
}

/** Whether a contract is a registry boundary projection rather than a transition. */
// [::TICKET::] PX-344 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-344 --for-spec --no-implementation-order`.
function isRegistryProjection(contract, registryRows = []) {
  return (registryRows ?? []).some((row) => row?.clauses !== null
    && row?.clauses !== undefined
    && projectionMatches(contract, row));
}

/**
 * The edge list with registry projections removed.
 *
 * A boundary obligation is not a state transition: its clauses are the interface the two
 * sides share, and they do not participate in incoming-post -> outgoing-pre closure. A
 * projected contract carries no `boundaryId` on the graph edge, so the registry rows are
 * the only reliable discriminator.
 */
// [::TICKET::] PX-344 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-344 --for-spec --no-implementation-order`.
function chainEdges(edges = [], registryRows = []) {
  return (edges ?? []).map((edge) => ({
    ...edge,
    contracts: (Array.isArray(edge?.contracts) ? edge.contracts : [])
      .filter((contract) => !isRegistryProjection(contract, registryRows)),
  }));
}

/**
 * Every node-level chain gap in a graph.
 *
 * An edge contract's postcondition is the state after that edge, so it is an incoming
 * provision for the edge's target node. An edge contract's precondition is a requirement
 * at the edge's source node. A node with at least one incoming provision must have every
 * outgoing precondition satisfied by one of them. A terminal node has no outgoing
 * requirement and is skipped; a root node has no incoming provision and is also skipped.
 *
 * @param {Array<{from: string, to: string, contracts?: Array<object>}>} edges
 * @returns {Array<{nodeId: string, edge: object, contract: object}>}
 */
// [::TICKET::] PX-344 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-344 --for-spec --no-implementation-order`.
function nodeChainGaps(edges = []) {
  const incomingByNode = new Map();
  const outgoingByNode = new Map();

  const add = (map, nodeId, entry) => {
    const entries = map.get(nodeId) ?? [];
    entries.push(entry);
    map.set(nodeId, entries);
  };

  for (const edge of edges) {
    for (const contract of Array.isArray(edge?.contracts) ? edge.contracts : []) {
      if (typeof contract?.postcondition === 'string' && contract.postcondition.length > 0) {
        add(incomingByNode, edge.to, { edge, contract });
      }
      if (typeof contract?.precondition === 'string' && contract.precondition.length > 0) {
        add(outgoingByNode, edge.from, { edge, contract });
      }
    }
  }

  const gaps = [];
  for (const [nodeId, outgoingEntries] of outgoingByNode) {
    const incomingEntries = incomingByNode.get(nodeId) ?? [];
    if (incomingEntries.length === 0) continue;
    const incomingContracts = incomingEntries.map((entry) => entry.contract);
    for (const target of outgoingEntries) {
      if (resolveSatisfiedBy(target.contract, incomingContracts)) continue;
      gaps.push({ nodeId, edge: target.edge, contract: target.contract });
    }
  }
  return gaps;
}

module.exports = {
  normalizeClause,
  contractIdentityMatches,
  resolveSatisfiedBy,
  isRegistryProjection,
  chainEdges,
  nodeChainGaps,
};
