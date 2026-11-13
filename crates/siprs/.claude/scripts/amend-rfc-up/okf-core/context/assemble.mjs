/**
 * Assemble the one-hop context payload. Over budget is an error, never a
 * truncated answer.
 */

import { createHash } from 'node:crypto';
import { getConcept, getOutgoing, getIncoming } from '../adapters/okforest.mjs';

export const DEFAULT_BUDGET_BYTES = 1_000_000;

export function buildContext({ bundle, requiredSet, budgetBytes = DEFAULT_BUDGET_BYTES, now = new Date() }) {
  const concepts = [];
  const hashes = [];
  for (const id of requiredSet.context) {
    const concept = getConcept(bundle, id);
    if (!concept) continue;
    const body = conceptBody(concept);
    concepts.push({
      id,
      body,
      outgoing: getOutgoing(bundle, id),
      incoming: getIncoming(bundle, id),
      sources: concept.sources,
      trustTier: concept.trustTier,
      freshness: {
        status: concept.status,
        stale: concept.isStale(now),
        staleAfter: concept.staleAfter ?? null,
      },
    });
    hashes.push([id, hashText(body)]);
  }
  const bytes = Buffer.byteLength(JSON.stringify(concepts), 'utf8');
  if (bytes > budgetBytes) {
    throw Object.assign(new Error(`BUDGET_EXCEEDED: ${bytes} > ${budgetBytes}`), {
      code: 'BUDGET_EXCEEDED',
      limit: budgetBytes,
      actual: bytes,
    });
  }
  return {
    concepts,
    manifest: { ids: concepts.map((concept) => concept.id), hashes, bytes, limit: budgetBytes },
    bytes,
  };
}

export function conceptBody(concept) {
  const lines = String(concept.text ?? '').split('\n');
  return lines.slice(Math.max(0, (concept.bodyStartLine ?? 1) - 1)).join('\n');
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function hashText(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
