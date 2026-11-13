// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
// @verifies C006
/**
 * Verify an AI answer against the node set.
 *
 * An answer is machine verified only when every citation resolves, every quoted
 * span exists in the cited node, and every assertion sentence carries a
 * citation.
 */

const CITATION = /\[([A-Z][A-Z0-9-]*-\d+)(?:\s*:\s*"([^"]*)")?\]/g;

export function verifyAnswer({ text, nodes }) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const matches = [...String(text).matchAll(CITATION)].map((match) => ({
    id: match[1],
    quote: match[2] ?? null,
  }));
  const citations = matches.map((match) => match.id);
  const unresolved = [...new Set(citations.filter((id) => !byId.has(id)))].sort();
  const quoteMismatches = matches
    .filter((match) => match.quote && byId.has(match.id) && !String(byId.get(match.id).text ?? '').includes(match.quote))
    .map((match) => `${match.id}:${match.quote}`);

  const sentences = String(text)
    .split(/\n+/)
    .flatMap((line) => line.match(/[^.!?]+[.!?]?/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0 && !sentence.startsWith('#'));
  const uncited = sentences.filter((sentence) => {
    CITATION.lastIndex = 0;
    return !CITATION.test(sentence);
  });
  CITATION.lastIndex = 0;

  return {
    status: unresolved.length === 0 && uncited.length === 0 && quoteMismatches.length === 0
      ? 'machine_verified'
      : 'failed',
    citations,
    unresolved,
    uncited,
    quoteMismatches,
  };
}

export function assertAnswerVerified(result) {
  if (result.unresolved.length > 0) {
    throw Object.assign(new Error(`CITATION_UNRESOLVED: unresolved citations: ${result.unresolved.join(', ')}`), { code: 'CITATION_UNRESOLVED' });
  }
  if (result.quoteMismatches.length > 0) {
    throw Object.assign(new Error(`QUOTE_MISMATCH: quoted span not found: ${result.quoteMismatches.join(', ')}`), { code: 'QUOTE_MISMATCH' });
  }
  if (result.uncited.length > 0) {
    throw Object.assign(new Error(`UNCITED_ASSERTION: uncited assertions: ${result.uncited.join(' | ')}`), { code: 'UNCITED_ASSERTION' });
  }
  return true;
}
