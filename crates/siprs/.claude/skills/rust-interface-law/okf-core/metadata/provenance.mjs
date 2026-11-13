// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
/**
 * Source and footnote provenance.
 */

export function sourceIds(concept) {
  return (concept?.sources ?? [])
    .map((source) => source.id)
    .filter((id) => typeof id === 'string' && id.length > 0);
}

export function footnoteLabels(concept) {
  return (concept?.footnotes ?? [])
    .map((footnote) => footnote.label)
    .filter((label) => typeof label === 'string' && label.length > 0);
}
