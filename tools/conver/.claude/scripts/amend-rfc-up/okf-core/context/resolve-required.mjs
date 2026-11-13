/**
 * Required-set closure over x-requires.
 *
 * The closure is either complete or it names the missing requirement. A cycle
 * is reported once and does not recurse forever.
 */

import { getConcept, getOutgoing } from '../adapters/okforest.mjs';

export function resolveRequired({ bundle, entryIds = [], additionalRequires = {}, reachDepth = 1 } = {}) {
  const required = [];
  const findings = [];
  const cycles = [];
  const visiting = new Set();
  const visited = new Set();
  const cycleKeys = new Set();

  for (const entryId of entryIds) {
    visit(entryId);
  }

  const reachable = new Set();
  for (const id of required) {
    for (const edge of getOutgoing(bundle, id)) {
      if (edge.state === 'resolved' && edge.to && !required.includes(edge.to)) reachable.add(edge.to);
    }
  }

  const context = [...new Set([...required, ...reachable])].sort();
  return { entry: [...entryIds], required: [...required].sort(), reachable: [...reachable].sort(), context, cycles, findings };

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
  function visit(id) {
    if (visited.has(id)) return;
    const concept = getConcept(bundle, id);
    if (!concept) {
      findings.push({ code: 'REQUIREMENT_MISSING', id, message: `required concept ${id} is absent` });
      return;
    }
    if (visiting.has(id)) {
      const key = `${id}`;
      if (!cycleKeys.has(key)) {
        cycleKeys.add(key);
        cycles.push({ from: id, to: id });
      }
      return;
    }
    visiting.add(id);
    if (!required.includes(id)) required.push(id);
    const requires = Object.hasOwn(additionalRequires, id)
      ? additionalRequires[id]
      : (concept.frontmatter?.['x-requires'] ?? []);
    for (const dependency of requires) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
}
