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
  getWeight,
  isHard,
};
