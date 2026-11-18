// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.

import { failRevision } from '../revision/errors.mjs';

export function recomputeRequires({ concepts, operations = [] }) {
  const known = new Set(concepts.map((concept) => concept.id));
  return concepts.map((concept) => {
    const operation = operations.find((entry) => entry.id === concept.id);
    const requires = operation?.requires ?? concept.frontmatter?.['x-requires'] ?? [];
    return { ...concept, frontmatter: { ...concept.frontmatter, 'x-requires': requires.filter((id) => known.has(id)) } };
  });
}

export function assertGraph({ concepts }) {
  const known = new Set(concepts.map((concept) => concept.id));
  for (const concept of concepts) {
    for (const required of concept.frontmatter?.['x-requires'] ?? []) {
      if (!known.has(required)) {
        failRevision('CONCEPT_REQUIRES_MISSING', `concept requires an absent concept: ${concept.id} -> ${required}`, { target: required });
      }
    }
  }
  return true;
}
