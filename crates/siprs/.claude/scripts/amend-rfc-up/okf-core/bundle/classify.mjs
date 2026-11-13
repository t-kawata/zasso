// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
/**
 * Classify a bundle-relative path without reading the file.
 */

export function classifyPath(path) {
  if (path === 'index.md' || path.endsWith('/index.md')) return 'reserved-index';
  if (path === 'log.md' || path.endsWith('/log.md')) return 'reserved-log';
  if (path.endsWith('.md')) return 'concept';
  return 'asset';
}
