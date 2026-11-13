// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
// @verifies C001
/**
 * Topic applicability.
 *
 * A wiki has no presence contract, so this is advisory: it tells the AI which
 * topics a task touches. It never blocks work.
 */

import { tokenize } from './retrieval.mjs';

export function matchTopics({ profile, paths }) {
  const topics = profile?.topics ?? [];
  if (topics.length === 0) return { matched: [], reason: 'profile has no topics' };
  const terms = new Set(paths.flatMap((path) => tokenize(path)));
  const matched = topics.filter((topic) => {
    const name = typeof topic === 'string' ? topic : topic.name;
    return String(name).split(/[.\-_/]/).some((part) => terms.has(part.toLowerCase()));
  });
  return { matched, reason: matched.length > 0 ? 'path matches topic vocabulary' : 'no topic matched' };
}
