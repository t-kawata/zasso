import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyCheck } from '../../.claude/scripts/smooth-sequences/lib/check-status.mjs';

// [::TICKET::] PX-289 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-289 --for-spec --no-implementation-order`.
test('executed requires at least one evaluated claim', () => {
  assert.equal(classifyCheck({ denominator: 1, evaluatedClaims: 0, required: true }).status, 'vacuous');
  assert.equal(classifyCheck({ denominator: 1, evaluatedClaims: 1, required: true }).status, 'executed');
  assert.equal(classifyCheck({ denominator: 0, evaluatedClaims: 0, required: true }).status, 'blocked');
});
