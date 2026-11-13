// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
// @verifies C003
/**
 * Human-readable renderers. Machine commands print JSON; these functions are
 * for explain, page, gaps, freshness, and conflicts.
 */

export function renderAskMarkdown({ query, rows }) {
  const lines = [`# Ask: ${query}`, '', `| Node | Source | Stale |`, `|---|---|---|`];
  for (const row of rows) lines.push(`| \`${row.id}\` | ${row.source} | ${row.stale ? 'yes' : 'no'} |`);
  if (rows.length === 0) lines.push('| (no cited node) | — | — |');
  return `${lines.join('\n')}\n`;
}

export function renderPageMarkdown(node) {
  return [
    `# ${node.id}`,
    '',
    node.summary,
    '',
    `- topic: ${node.topic}`,
    `- source: ${node.sources?.join(', ') ?? ''}`,
    `- span: ${node.span?.start_line ?? '?'}-${node.span?.end_line ?? '?'}`,
    `- content_sha256: ${node.content_sha256}`,
    '',
    node.text ?? '',
    '',
  ].join('\n');
}

export function renderFreshnessMarkdown({ stale }) {
  const lines = ['# Freshness', '', '| Node | Source | Expected | Actual |', '|---|---|---|---|'];
  for (const entry of stale) lines.push(`| \`${entry.node}\` | ${entry.alias} | ${entry.expected ?? 'missing'} | ${entry.actual ?? 'missing'} |`);
  if (stale.length === 0) lines.push('| (none) | — | — | — |');
  return `${lines.join('\n')}\n`;
}

export function renderConflictsMarkdown({ pairs }) {
  const lines = ['# Conflicts', '', '| Key | Left | Right |', '|---|---|---|'];
  for (const pair of pairs) lines.push(`| ${pair.key} | \`${pair.left}\` | \`${pair.right}\` |`);
  if (pairs.length === 0) lines.push('| (none) | — | — |');
  return `${lines.join('\n')}\n`;
}

export function renderResolveMarkdown({ lock }) {
  const lines = ['# Resolve', '', `- nodes: ${lock.nodes.length}`, `- topics: ${(lock.topics ?? []).join(', ')}`, `- closure: ${lock.closure_sha256}`, ''];
  return lines.join('\n');
}
