// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
// @verifies C003
/**
 * Topic-scoped context delivery.
 *
 * Unlike the law predecessor ledger, a wiki topic has no required predecessor:
 * the caller asks for the topics relevant to the task and receives every must
 * node in those topics.
 */

import { existsSync, readFileSync } from 'node:fs';
import { sha256 } from './redact.mjs';

export function deliverTopicContext({ lock, topics, ledger }) {
  const requested = topics.filter((topic) => (lock.topics ?? []).includes(topic));
  if (requested.length !== topics.length) {
    const unknown = topics.filter((topic) => !(lock.topics ?? []).includes(topic));
    throw Object.assign(new Error(`unknown topic: ${unknown.join(', ')}`), { code: 'UNKNOWN_TOPIC' });
  }
  const nodes = (lock.nodes ?? []).filter((node) => requested.includes(node.topic));
  const hash = sha256(nodes.map((node) => `${node.id}\0${node.content_sha256}`).join('\n'));
  const history = existsSync(ledger) ? readFileSync(ledger, 'utf8') : '';
  return { topics: requested, nodes, hash, deliveredBefore: history.includes(hash) };
}
