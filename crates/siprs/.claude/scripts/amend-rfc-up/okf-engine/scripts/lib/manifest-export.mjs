// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
// @verifies C002
/**
 * Export a portable manifest view. The lock remains the source of truth.
 */

import { sha256 } from './redact.mjs';
import { SPEC_VERSION } from './limits.mjs';

export function buildOkfManifest({ topics, nodes }) {
  return {
    schema: 'okf-manifest/v1',
    spec_version: SPEC_VERSION,
    topics: [...topics].sort(),
    nodes: nodes.map((node) => ({
      id: node.id,
      topic: node.topic,
      summary: node.summary,
      sources: node.sources,
      content_sha256: node.content_sha256,
    })),
    closure_sha256: sha256(nodes.map((node) => node.id).sort().join('\n')),
  };
}
