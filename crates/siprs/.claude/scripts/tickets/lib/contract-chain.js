'use strict';

const { projectionMatches } = require('../../sequences-slice/lib/boundary-contract.mjs');

/** The graph-root field that declares whether edge contracts are state transitions. */
const POLICY_FIELD = 'contractChain';

/** The policy a graph with no declaration uses: interface obligations, not transitions. */
const POLICY_OBLIGATION = 'obligation';

/** The policy that enables the incoming-post -> outgoing-pre chain proof. */
const POLICY_TRANSITION = 'transition';

const POLICY_VALUES = Object.freeze([POLICY_OBLIGATION, POLICY_TRANSITION]);

/**
 * Resolve the graph's chain policy.
 *
 * An absent field is an obligation graph so every artifact authored before the field
 * existed keeps its old behavior. A present but unknown value is a named failure:
 * silently defaulting it would hide an authoring mistake.
 *
 * @param {object} graph — Parsed graph root
 * @returns {'transition'|'obligation'}
 * @throws {Error} With code INVALID_CONTRACT_CHAIN_POLICY
 */
// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-346 --for-spec --no-implementation-order`.
function chainPolicyOf(graph) {
  const value = graph?.[POLICY_FIELD];
  if (value === undefined) return POLICY_OBLIGATION;
  if (!POLICY_VALUES.includes(value)) {
    const error = new Error(
      POLICY_FIELD + ' must be one of ' + POLICY_VALUES.join('|') + '; got ' + JSON.stringify(value),
    );
    error.code = 'INVALID_CONTRACT_CHAIN_POLICY';
    throw error;
  }
  return value;
}

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
 * The edge list the chain proof may read.
 *
 * An obligation graph has no transition clauses, so every contract is removed. A
 * transition graph keeps the non-registry clauses: a boundary obligation is not a state
 * transition, and a projected contract carries no `boundaryId` on the graph edge, so the
 * registry rows are the only reliable discriminator.
 */
// [::TICKET::] PX-344, PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-344|PX-346) --for-spec --no-implementation-order`.
function chainEdges(edges = [], registryRows = [], policy = POLICY_TRANSITION) {
  const source = edges ?? [];
  if (policy === POLICY_OBLIGATION) {
    return source.map((edge) => ({ ...edge, contracts: [] }));
  }
  return source.map((edge) => ({
    ...edge,
    contracts: (Array.isArray(edge?.contracts) ? edge.contracts : [])
      .filter((contract) => !isRegistryProjection(contract, registryRows)),
  }));
}

/**
 * Every incoming postcondition at one node.
 *
 * The fan-in proof is existential: any provision at the node may satisfy an outgoing
 * precondition. It is deliberately not a per-source comparison; a convergence node has
 * one state, not one state per edge.
 *
 * @param {string} nodeId
 * @param {Array<{to: string, contracts?: Array<object>}>} edges
 * @returns {Array<object>} Contracts carrying a non-empty postcondition
 */
// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-346 --for-spec --no-implementation-order`.
function incomingProvisionsAt(nodeId, edges = []) {
  return (edges ?? [])
    .filter((edge) => edge?.to === nodeId)
    .flatMap((edge) => (Array.isArray(edge?.contracts) ? edge.contracts : []))
    .filter((contract) => typeof contract?.postcondition === 'string'
      && contract.postcondition.length > 0);
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
  POLICY_FIELD,
  POLICY_OBLIGATION,
  POLICY_TRANSITION,
  POLICY_VALUES,
  chainPolicyOf,
  normalizeClause,
  contractIdentityMatches,
  resolveSatisfiedBy,
  isRegistryProjection,
  chainEdges,
  incomingProvisionsAt,
  nodeChainGaps,
};
