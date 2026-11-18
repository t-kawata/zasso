// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-445 --for-spec --no-implementation-order`.

export function renderDeliveredSourceView({ sources = [], includeRevision = false }) {
  const delivered = sources.filter((source) => includeRevision || source.role !== 'revision');
  const parts = ['# Source View', '', 'Generated from the source documents. Do not edit.', ''];
  for (const source of delivered) {
    parts.push(`# Source: ${source.alias}`, '', source.text ?? '', '');
  }
  return parts.join('\n');
}
