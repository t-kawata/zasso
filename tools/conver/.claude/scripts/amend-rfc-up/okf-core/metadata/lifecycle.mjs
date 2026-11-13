// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
/**
 * Freshness and lifecycle. The clock is always supplied by the caller.
 */

import { isStaleAt } from '@okforest/okf';

export function isStale(metadata, now = new Date()) {
  if (!metadata) return false;
  if (metadata.status === 'deprecated') return true;
  return isStaleAt(metadata.stale_after ?? metadata.staleAfter, now);
}

export function isDeprecated(metadata) {
  return metadata?.status === 'deprecated';
}
