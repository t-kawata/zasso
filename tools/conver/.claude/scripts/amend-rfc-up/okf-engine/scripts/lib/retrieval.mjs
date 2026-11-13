// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
// @verifies C003
/**
 * Deterministic lexical retrieval over the node index.
 *
 * Ranking is a pure function of the query and the index rows. No filesystem
 * order, mtime, or random tie-breaker is consulted.
 */

import {
  ID_MATCH_WEIGHT,
  MAX_ANSWER_NODES,
  MAX_QUERY_LENGTH,
  SUMMARY_MATCH_WEIGHT,
  TOPIC_MATCH_WEIGHT,
} from './limits.mjs';

const STOPWORDS = new Set(['the', 'a', 'an', 'when', 'what', 'how', 'do', 'does', 'is', 'are', 'of', 'to', 'in', 'for', 'and']);

export function assertQuery(query) {
  const text = String(query ?? '').trim();
  if (text.length === 0) throw Object.assign(new Error('query is empty'), { code: 'INVALID_QUERY' });
  if (text.length > MAX_QUERY_LENGTH) throw Object.assign(new Error('query is too long'), { code: 'INVALID_QUERY' });
  return text;
}

export function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

export function rankNodes({ index, query, limit = MAX_ANSWER_NODES }) {
  const text = assertQuery(query);
  const terms = tokenize(text);
  const scored = index.map((row) => {
    const topic = row.topic ?? '';
    const summary = row.summary ?? '';
    let score = 0;
    for (const term of terms) {
      if (topic.includes(term)) score += TOPIC_MATCH_WEIGHT;
      if (summary.toLowerCase().includes(term)) score += SUMMARY_MATCH_WEIGHT;
      if (row.id.toLowerCase().includes(term)) score += ID_MATCH_WEIGHT;
    }
    return { ...row, score };
  });
  return scored
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, limit)
    .map(({ score, ...row }) => row);
}
