// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
/**
 * Navigation commands return the one-hop payload.
 */

import { getConcept, getOutgoing, getIncoming } from '../adapters/okforest.mjs';
import { conceptBody } from '../context/assemble.mjs';

export function showConcept({ bundle, id, now = new Date() }) {
  const concept = getConcept(bundle, id);
  if (!concept) throw Object.assign(new Error(`unknown concept: ${id}`), { code: 'UNKNOWN_CONCEPT' });
  return {
    id: concept.id,
    path: concept.path,
    type: concept.type,
    title: concept.title,
    description: concept.description,
    body: conceptBody(concept),
    outgoing: getOutgoing(bundle, id),
    incoming: getIncoming(bundle, id),
    sources: concept.sources,
    trustTier: concept.trustTier,
    freshness: {
      status: concept.status,
      stale: concept.isStale(now),
      staleAfter: concept.staleAfter ?? null,
    },
  };
}

export function outgoingEdges({ bundle, id }) {
  return getOutgoing(bundle, id);
}

export function incomingEdges({ bundle, id }) {
  return getIncoming(bundle, id);
}

export function neighborEdges({ bundle, id }) {
  return [...getOutgoing(bundle, id), ...getIncoming(bundle, id)];
}
