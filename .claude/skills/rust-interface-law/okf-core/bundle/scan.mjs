// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
/**
 * Bundle scan is the library read plus the engine's classification.
 */

import { loadBundle } from '../adapters/okforest.mjs';
import { classifyPath } from './classify.mjs';

export async function scanBundle(root) {
  const bundle = await loadBundle(root);
  const entries = bundle.files.map((path) => ({ path, kind: classifyPath(path) }));
  return { bundle, entries, diagnostics: bundle.diagnostics };
}
