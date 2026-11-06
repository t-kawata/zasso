/**
 * The findings a mutation introduced, not the ones it inherited.
 *
 * A package can carry a pre-existing duplicate or a legacy receipt problem. A gate that
 * blocks every such finding forever cannot be adopted; a gate that ignores them cannot
 * protect the chain. This module keeps the two apart by comparing the before and after
 * observations with a stable key.
 */
'use strict';

/** The identity of one finding across two observations. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function findingKey(finding) {
  return [
    finding?.code ?? '',
    finding?.subject ?? finding?.formulaId ?? '',
    finding?.field ?? '',
    finding?.stage ?? '',
  ].join('|');
}

/** The findings present after the mutation and absent before it. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function diffFindings(before, after) {
  const inherited = new Set((Array.isArray(before) ? before : []).map(findingKey));
  return (Array.isArray(after) ? after : []).filter((finding) => !inherited.has(findingKey(finding)));
}

module.exports = { findingKey, diffFindings };
