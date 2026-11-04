'use strict';

/**
 * The one ordering rule the split pipeline reads.
 *
 * The graph edge type names the default direction and strength; an explicit
 * `attributes.strength` overrides the strength but never the direction. Keeping this in
 * one CommonJS module is deliberate: phasify (phase design), validate-phasify (phase
 * gate) and the implementation-order library (ticket prerequisites) all read it, and a
 * second private table is how the three used to disagree.
 */

const PROVIDER_IS_TO = 'provider-is-to';
const PROVIDER_IS_FROM = 'provider-is-from';

const DIRECTION_BY_TYPE = Object.freeze({
  depends_on: PROVIDER_IS_TO,
  implements: PROVIDER_IS_TO,
  precedes: PROVIDER_IS_FROM,
  triggers: PROVIDER_IS_FROM,
  constrains: PROVIDER_IS_FROM,
});

const DEFAULT_STRENGTH_BY_TYPE = Object.freeze({
  depends_on: 'hard',
  implements: 'hard',
  constrains: 'hard',
  precedes: 'soft',
  triggers: 'soft',
  refines: 'none',
  references: 'none',
  extends: 'none',
  conflicts_with: 'none',
  supersedes: 'none',
  validates: 'none',
  part_of: 'none',
});

const DEFAULT_WEIGHT_BY_TYPE = Object.freeze({
  depends_on: Infinity,
  implements: Infinity,
  constrains: Infinity,
  precedes: 2,
  triggers: 1,
  refines: 0,
  references: 0,
  extends: 0,
  conflicts_with: 0,
  supersedes: 0,
  validates: 0,
  part_of: 0,
});

/** A soft edge retains a finite cost so phase grouping can prefer the stated order. */
const SOFT_WEIGHT_BY_TYPE = Object.freeze({
  depends_on: 2,
  implements: 2,
  constrains: 2,
  precedes: 2,
  triggers: 1,
});

/** Accept both the graph edge object and the legacy type string. */
// [::TICKET::] PX-343 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-343) --for-spec --no-implementation-order`.
function typeOf(edgeOrType) {
  return typeof edgeOrType === 'string' ? edgeOrType : edgeOrType?.type;
}

/** The phase/implementation direction an edge declares, or null for a non-ordering type. */
// [::TICKET::] PX-343 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-343) --for-spec --no-implementation-order`.
function directionOf(edgeOrType) {
  return DIRECTION_BY_TYPE[typeOf(edgeOrType)] ?? null;
}

/** The edge's effective strength: explicit attributes first, then the type default. */
// [::TICKET::] PX-343 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-343) --for-spec --no-implementation-order`.
function effectiveStrength(edgeOrType) {
  const type = typeOf(edgeOrType);
  if (typeof edgeOrType !== 'string') {
    const explicit = edgeOrType?.attributes?.strength;
    if (explicit === 'hard' || explicit === 'soft') return explicit;
  }
  return DEFAULT_STRENGTH_BY_TYPE[type] ?? 'none';
}

/** The weight a type carries when no edge object is available. */
// [::TICKET::] PX-343 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-343) --for-spec --no-implementation-order`.
function typeDefaultWeight(type) {
  return DEFAULT_WEIGHT_BY_TYPE[type] ?? 0;
}

/** Infinity for hard, the finite preference cost for soft, zero otherwise. */
// [::TICKET::] PX-343 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-343) --for-spec --no-implementation-order`.
function weightOf(edgeOrType) {
  // A type without an ordering direction never becomes an ordering constraint, even if
  // an author marks it `strength: hard`; strength modulates a direction, it cannot add one.
  if (directionOf(edgeOrType) === null) return 0;
  if (typeof edgeOrType === 'string') return typeDefaultWeight(edgeOrType);
  const strength = effectiveStrength(edgeOrType);
  if (strength === 'hard') return Infinity;
  if (strength === 'soft') return SOFT_WEIGHT_BY_TYPE[edgeOrType?.type] ?? 1;
  return 0;
}

/** Whether this edge is an absolute ordering constraint. */
// [::TICKET::] PX-343 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-343) --for-spec --no-implementation-order`.
function isHardEdge(edgeOrType) {
  return weightOf(edgeOrType) === Infinity;
}

/**
 * The edges an SCC condensation may read.
 *
 * Condensation groups nodes that are mutually reachable, and the group is later kept
 * adjacent. Only a hard edge with a direction states that one node must be implemented
 * before another, so only those edges may put two nodes in one group. A `references` or
 * `refines` cycle between two sections records that they quote each other: grouping them
 * moves one out of its ordered position and can land it ahead of the very node it is
 * constrained by.
 *
 * @param {Array<object>} edges — graph edges, any type
 * @returns {Array<object>} the hard, directed edges
 */
// [::TICKET::] PX-356 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-356 --for-spec --no-implementation-order`.
function orderingEdges(edges) {
  return (edges || []).filter((edge) => isHardEdge(edge) && directionOf(edge) !== null);
}

/**
 * The same edge stated in implementation order: provider first, consumer second.
 *
 * An edge's `from`/`to` are the orientation the author wrote, not the order it declares.
 * `A depends_on B` and `B constrains A` both order B before A, so a reader that walks the
 * raw orientation turns agreement into a cycle. A directionless edge has no order.
 *
 * This is a projection, not a toggle: apply it once to an edge as read from the graph.
 *
 * @param {object} edge — a graph edge
 * @returns {{from: string, to: string}|null} provider-first copy, or null
 */
// [::TICKET::] PX-358 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-358 --for-spec --no-implementation-order`.
function providerConsumerEdge(edge) {
  const direction = directionOf(edge);
  if (direction === null) return null;
  const provider = direction === PROVIDER_IS_TO ? edge.to : edge.from;
  const consumer = direction === PROVIDER_IS_TO ? edge.from : edge.to;
  return { ...edge, from: provider, to: consumer };
}

/** Backward-compatible alias used by the existing phasify helpers. */
// [::TICKET::] PX-343 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-343) --for-spec --no-implementation-order`.
function getWeight(edgeOrType) {
  return weightOf(edgeOrType);
}

/** Backward-compatible alias used by the existing phasify helpers. */
// [::TICKET::] PX-343 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-343) --for-spec --no-implementation-order`.
function isHard(edgeOrType) {
  return isHardEdge(edgeOrType);
}

module.exports = {
  PROVIDER_IS_TO,
  PROVIDER_IS_FROM,
  DIRECTION_BY_TYPE,
  DEFAULT_STRENGTH_BY_TYPE,
  DEFAULT_WEIGHT_BY_TYPE,
  directionOf,
  effectiveStrength,
  typeDefaultWeight,
  weightOf,
  isHardEdge,
  orderingEdges,
  providerConsumerEdge,
  getWeight,
  isHard,
};
