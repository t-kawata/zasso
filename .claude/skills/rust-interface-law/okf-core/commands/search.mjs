/**
 * Deterministic lexical search over titles, descriptions, and bodies.
 */

import { conceptBody } from '../context/assemble.mjs';

export function searchConcepts({ bundle, query, limit = 20 }) {
  const terms = tokenize(query);
  const rows = [];
  for (const concept of bundle.concepts) {
    const title = String(concept.title ?? '').toLowerCase();
    const description = String(concept.description ?? '').toLowerCase();
    const body = conceptBody(concept).toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (title.includes(term)) score += 6;
      if (description.includes(term)) score += 3;
      if (body.includes(term)) score += 1;
    }
    if (score > 0) rows.push({ id: concept.id, title: concept.title, score, snippet: snippet(description || body, terms) });
  }
  return rows.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id)).slice(0, limit);
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function tokenize(query) {
  return String(query ?? '').toLowerCase().split(/\s+/).filter((term) => term.length > 0);
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function snippet(text, terms) {
  const term = terms.find((entry) => text.includes(entry));
  if (!term) return text.slice(0, 120);
  const at = text.indexOf(term);
  return text.slice(Math.max(0, at - 40), at + 80).trim();
}
