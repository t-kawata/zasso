// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.

export function applyFreshness({ concepts, date, staleAfterDays = 365 }) {
  const staleAfter = addOneYear(date, staleAfterDays);
  return concepts.map((concept) => ({
    ...concept,
    frontmatter: {
      ...concept.frontmatter,
      generated: { ...(concept.frontmatter?.generated ?? {}), at: date },
      verified: [{ by: 'machine', at: date }],
      stale_after: staleAfter,
    },
  }));
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function addOneYear(date, days) {
  const [year, month, day] = String(date).split('-').map(Number);
  return `${year + 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
