// @verifies C005
/**
 * PX-424 — symmetric conflict detection.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertSymmetricConflicts,
  findConflictPairs,
} from '../../../.claude/scripts/amend-rfc-up/okf-engine/scripts/lib/conflicts.mjs';

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function claimNode(id, topic, summary, conflicts = []) {
  return { id, topic, summary, conflicts };
}

test('C005: declared conflicts are returned symmetrically and never resolved silently', () => {
  const nodes = [
    claimNode('AUTH-01', 'auth.token.ttl', 'Access tokens expire after 15 minutes.', ['AUTH-02']),
    claimNode('AUTH-02', 'auth.token.ttl', 'Access tokens expire after 30 minutes.', ['AUTH-01']),
  ];
  const pairs = findConflictPairs({ nodes });
  assert.deepEqual(pairs, [{ key: 'auth.token.ttl', left: 'AUTH-01', right: 'AUTH-02' }]);
  assert.equal(assertSymmetricConflicts({ nodes }), true);
  const asymmetric = [nodes[0], { ...nodes[1], conflicts: [] }];
  assert.throws(
    () => assertSymmetricConflicts({ nodes: asymmetric }),
    (error) => error.code === 'CONFLICT_ASYMMETRIC',
  );
  assert.equal(nodes.length, 2, 'no node is deleted or silently resolved');
});
