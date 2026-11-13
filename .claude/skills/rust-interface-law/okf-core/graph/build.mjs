/**
 * Map OKF library links to the engine's edge shape.
 *
 * The library already resolves a target against the bundle. This module only
 * names the state; it never re-implements path normalization.
 */

export function mapLinkState(link) {
  if (link.kind === 'external') return 'external';
  if (link.kind === 'anchor') return 'fragment-only';
  if (link.outside === true) return 'blocked';
  if (link.directory === true) return 'directory';
  if (link.exists === true && link.concept) return 'resolved';
  if (link.exists === true) return 'non-concept';
  return 'missing';
}

export function mapLinkToEdge(link) {
  return {
    from: conceptIdOf(link.from),
    rawTarget: link.target,
    resolvedPath: link.resolved ?? null,
    to: link.concept ?? null,
    origin: 'body-link',
    state: mapLinkState(link),
    line: link.line,
    column: link.column,
  };
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function conceptIdOf(path) {
  return String(path).endsWith('.md') ? String(path).slice(0, -3) : String(path);
}
