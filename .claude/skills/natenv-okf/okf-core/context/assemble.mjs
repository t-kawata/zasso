/**
 * Assemble the one-hop context payload. Over budget is an error, never a
 * truncated answer.
 */

import { createHash } from 'node:crypto';
import { getConcept, getOutgoing, getIncoming } from '../adapters/okforest.mjs';

export const DEFAULT_BUDGET_BYTES = 1_000_000;
const EDGE_SUMMARY_LIMIT = 50;

export function buildContext({ bundle, requiredSet, budgetBytes = DEFAULT_BUDGET_BYTES, now = new Date() }) {
  const concepts = [];
  const hashes = [];
  for (const id of requiredSet.context) {
    const concept = getConcept(bundle, id);
    if (!concept) continue;
    const body = conceptBody(concept);
    const outgoing = getOutgoing(bundle, id);
    const incoming = getIncoming(bundle, id);
    concepts.push({
      id,
      body,
      outgoing: outgoing.slice(0, EDGE_SUMMARY_LIMIT).map(summarizeEdge),
      outgoingCount: outgoing.length,
      incoming: incoming.slice(0, EDGE_SUMMARY_LIMIT).map(summarizeEdge),
      incomingCount: incoming.length,
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

function hashText(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Keep the hop direction and kind without repeating every edge field.
 *
 * A hub concept can carry hundreds of edges; repeating rawTarget and line for
 * each one turns a context answer into an edge dump.
 */
function summarizeEdge(edge) {
  return {
    from: edge.from ?? null,
    to: edge.to ?? null,
    kind: edge.kind ?? null,
    origin: edge.origin ?? null,
  };
}
