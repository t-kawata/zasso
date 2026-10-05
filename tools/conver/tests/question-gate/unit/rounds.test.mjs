// PX-233 @verifies C005
// [::TICKET::] PX-233 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-233 --for-spec --no-implementation-order`.
/**
 * Numbering and the end of the loop.
 *
 * A number a question was asked under never moves, so a reply always names its
 * question. And a refusal because nothing is open is a normal end rather than a
 * failure: that is the shape a run takes when the records grounded every point,
 * which is the outcome this mechanism exists to make reachable.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_ROUNDS, nextNumbers, withinRoundCap } from '../../../.claude/scripts/question-gate/rounds.mjs';

test('C005 postcondition: numbers continue from the highest the document already holds', () => {
  const existingNumbers = [1, 2, 3];
  const frozen = JSON.stringify(existingNumbers);

  const result = nextNumbers({ existingNumbers, n: 2, openCount: 4 });

  assert.equal(result.ok, true);
  assert.deepEqual(result.numbers, [4, 5]);
  assert.equal(JSON.stringify(existingNumbers), frozen, 'no existing number is rewritten');
});

test('C005 postcondition: a first round numbers from one', () => {
  assert.deepEqual(nextNumbers({ existingNumbers: [], n: 3, openCount: 4 }).numbers, [1, 2, 3]);
});

test('C005 boundary: numbers continue across a gap rather than filling it', () => {
  assert.deepEqual(nextNumbers({ existingNumbers: [1, 5], n: 1, openCount: 4 }).numbers, [6]);
});

test('C005 invariant: a refusal because nothing is open is a normal end of the loop', () => {
  const refused = nextNumbers({ existingNumbers: [1], n: 3, openCount: 0 });

  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'no point is open');
  assert.equal('numbers' in refused, false, 'a refused round opens no question');
});

test('C005 boundary: the round cap is a named constant and is reported when reached', () => {
  assert.equal(MAX_ROUNDS, 5);
  assert.equal(withinRoundCap({ roundsUsed: MAX_ROUNDS }), false);
  assert.equal(withinRoundCap({ roundsUsed: MAX_ROUNDS - 1 }), true);
});

test('C005 invariant: refusing past the cap names the cap rather than silently stopping', () => {
  const refused = nextNumbers({ existingNumbers: [1], n: 1, openCount: 2, roundsUsed: MAX_ROUNDS });

  assert.equal(refused.ok, false);
  assert.match(refused.reason, new RegExp(String(MAX_ROUNDS)));
});
