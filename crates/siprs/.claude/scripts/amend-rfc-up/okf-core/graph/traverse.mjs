// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
/**
 * Bounded graph traversal. The visited set is the cycle guard.
 */

import { getOutgoing } from '../adapters/okforest.mjs';

export function traverse(bundle, startId, depth = 1) {
  const visited = new Set([startId]);
  const rows = [];
  let frontier = [startId];
  for (let level = 0; level < depth; level += 1) {
    const next = [];
    for (const id of frontier) {
      for (const edge of getOutgoing(bundle, id)) {
        if (edge.state !== 'resolved' || !edge.to || visited.has(edge.to)) continue;
        visited.add(edge.to);
        rows.push(edge);
        next.push(edge.to);
      }
    }
    frontier = next;
  }
  return rows;
}
