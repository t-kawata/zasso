// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
// @verifies C004
/**
 * Freshness: compare the frozen lock with the current source bytes.
 *
 * A stale node is never presented as current. The caller must surface the
 * stale flag in ask/context/page output.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sha256 } from './redact.mjs';

export function detectStaleNodes({ lock, sourceRoot, aliasMap }) {
  const actualByAlias = new Map();
  const stale = [];
  const seen = new Set();

  for (const source of lock.sources ?? []) {
    const relative = aliasMap?.aliases?.[source.alias];
    if (!relative) {
      actualByAlias.set(source.alias, null);
      continue;
    }
    try {
      const text = readFileSync(resolve(sourceRoot, relative), 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      actualByAlias.set(source.alias, sha256(text));
    } catch {
      actualByAlias.set(source.alias, null);
    }
  }

  for (const node of lock.nodes ?? []) {
    for (const alias of node.sources ?? []) {
      const actual = actualByAlias.get(alias) ?? null;
      const expected = node.source_sha256;
      if (actual === expected && !seen.has(node.id)) continue;
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      stale.push({ node: node.id, alias, expected, actual });
    }
  }
  return { stale, actualByAlias };
}

export function markStale(rows, staleSet) {
  return rows.map((row) => ({
    ...row,
    stale: staleSet.has(row.node ?? row.id),
  }));
}

export function assertFreshForAnswer({ rows }) {
  const stale = rows.filter((row) => row.stale);
  if (stale.length > 0) {
    throw Object.assign(new Error(`STALE_NODE_PRESENTED: stale nodes presented: ${stale.map((row) => row.node ?? row.id).join(', ')}`), {
      code: 'STALE_NODE_PRESENTED',
    });
  }
  return true;
}
