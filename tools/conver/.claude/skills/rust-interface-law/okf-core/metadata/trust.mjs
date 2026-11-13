// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
/**
 * Trust tiers are the OKF library's derivation, not a second vocabulary.
 */

import { deriveTrustTier as deriveFromLibrary } from '@okforest/okf';

export function deriveTrustTier(verified) {
  if (!verified) return 'unverified';
  const events = Array.isArray(verified) ? verified : [verified];
  const usable = events.filter((event) => event && typeof event.by === 'string' && event.by.length > 0);
  return deriveFromLibrary(usable);
}
