/**
 * Navigation commands return the one-hop payload and its traversal envelope.
 *
 * The legacy fields stay at the top level so existing callers keep working;
 * protocol, coverage, frontier, and guidance are additive. An absent id
 * throws UNKNOWN_CONCEPT so the CLI can exit 2 instead of returning empty
 * edges that look like a valid answer.
 */

import { getConcept, getOutgoing, getIncoming } from '../adapters/okforest.mjs';
import { conceptBody } from '../context/assemble.mjs';
import { buildTraversal, unknownConcept } from './traverse.mjs';

export function showConcept({ bundle, id, now = new Date(), profile = 'okf-wiki', hop = 0, stack = [] }) {
  const concept = requireConcept(bundle, id);
  const page = buildTraversal({ bundle, id, profile, hop, stack, now });
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
    ...page,
  };
}

export function outgoingEdges({ bundle, id }) {
  requireConcept(bundle, id);
  return getOutgoing(bundle, id);
}

export function incomingEdges({ bundle, id }) {
  requireConcept(bundle, id);
  return getIncoming(bundle, id);
}

export function neighborEdges({ bundle, id }) {
  requireConcept(bundle, id);
  return [...getOutgoing(bundle, id), ...getIncoming(bundle, id)];
}

export function requireConcept(bundle, id) {
  const concept = getConcept(bundle, id);
  if (!concept) throw unknownConcept(bundle, id);
  return concept;
}
