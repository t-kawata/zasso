// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
// @verifies C006
/**
 * PX-424 — answer citation verification.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertAnswerVerified,
  verifyAnswer,
} from '../../../.claude/scripts/amend-rfc-up/okf-engine/scripts/lib/answer-verify.mjs';

const NODES = [
  { id: 'AUTH-01', summary: 'Tokens expire after 15 minutes.', text: 'Tokens expire after 15 minutes.' },
  { id: 'SESS-01', summary: 'Sessions persist until sign-out.', text: 'Sessions persist until sign-out.' },
];

test('C006: a fully cited answer is machine verified', () => {
  const result = verifyAnswer({ text: 'Tokens expire after 15 minutes [AUTH-01].\n', nodes: NODES });
  assert.equal(result.status, 'machine_verified');
  assert.deepEqual(result.citations, ['AUTH-01']);
  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(result.uncited, []);
  assert.equal(assertAnswerVerified(result), true);
});

test('C006: an uncited assertion and an unresolved citation fail', () => {
  const uncited = verifyAnswer({
    text: 'Tokens expire after 15 minutes [AUTH-01]. Sessions persist.\n',
    nodes: NODES,
  });
  assert.equal(uncited.status, 'failed');
  assert.deepEqual(uncited.uncited, ['Sessions persist.']);
  assert.throws(() => assertAnswerVerified(uncited), /UNCITED_ASSERTION/);

  const unresolved = verifyAnswer({ text: 'Tokens expire after 15 minutes [AUTH-99].\n', nodes: NODES });
  assert.equal(unresolved.status, 'failed');
  assert.deepEqual(unresolved.unresolved, ['AUTH-99']);
  assert.throws(() => assertAnswerVerified(unresolved), /CITATION_UNRESOLVED/);
});

test('C006: a quoted span must exist in the cited node', () => {
  const result = verifyAnswer({ text: 'Tokens expire after 15 minutes [AUTH-01: "expire after 15"].\n', nodes: NODES });
  assert.equal(result.status, 'machine_verified');
  assert.deepEqual(result.quoteMismatches, []);
  const wrong = verifyAnswer({ text: 'Tokens expire after 15 minutes [AUTH-01: "never expire"].\n', nodes: NODES });
  assert.equal(wrong.status, 'failed');
  assert.deepEqual(wrong.quoteMismatches, ['AUTH-01:never expire']);
  assert.throws(() => assertAnswerVerified(wrong), /QUOTE_MISMATCH/);
});
