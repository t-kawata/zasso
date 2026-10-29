// [::TICKET::] PX-310 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-310 --for-spec --no-implementation-order`.
// A risk obligation's id names the risk class; the artifact row names the field that
// carries it. An anchor that repeats the class name puts every risk judgment out of
// scope, so the obligation stays open even when the judgment cites the right value.
import test from 'node:test';
import assert from 'node:assert/strict';

import { anchorSetFor } from '../../.claude/scripts/smooth-sequences/run.mjs';

test('PX-310 a concurrency risk anchors allowed_status_transitions', () => {
  const anchors = anchorSetFor({ id: 'RISK:AcceptCommercialOffer:concurrency' });

  assert.deepEqual(anchors.artifact, [{
    id: 'AcceptCommercialOffer',
    field: 'allowed_status_transitions',
  }]);
});

test('PX-310 an idempotency risk anchors idempotency_scope', () => {
  const anchors = anchorSetFor({ id: 'RISK:AcceptCommercialOffer:idempotency' });

  assert.deepEqual(anchors.artifact, [{
    id: 'AcceptCommercialOffer',
    field: 'idempotency_scope',
  }]);
});

test('PX-310 an unknown risk class keeps the class name as its field', () => {
  const anchors = anchorSetFor({ id: 'RISK:AcceptCommercialOffer:unmapped-risk' });

  assert.deepEqual(anchors.artifact, [{
    id: 'AcceptCommercialOffer',
    field: 'unmapped-risk',
  }]);
});
