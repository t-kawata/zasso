// PX-233 @verifies C005
// [::TICKET::] PX-233 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-233 --for-spec --no-implementation-order`.
/**
 * Reading the human's reply.
 *
 * A reply is answered when it carries a letter; prose is added to the letter, never
 * put in its place. A reply with no letter is not an answer — and it is also not
 * nothing: what it raised is recorded as a point, because a person who answers a
 * question with something else has told the AI that the question was misclassified,
 * and discarding that observation would lose the only evidence of it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isAnsweredByLetter, readAnswers, refineLetterlessAnswer } from '../../../.claude/scripts/question-gate/answers.mjs';

const LETTERLESS = 'サーバーにも保存すべきだと思うが、運用のことはよく分からない';

test('C005 postcondition: a reply carrying a letter is answered', () => {
  const reading = readAnswers({
    questions: [
      { number: 1, answer: 'A — 利用者の端末にだけ置く' },
      { number: 2, answer: LETTERLESS },
    ],
  });

  assert.equal(reading.asked, 2);
  assert.equal(reading.answered, 1);
  assert.deepEqual(reading.unanswered, [2]);
});

test('C005 boundary: a bare letter is an answer and prose beside it does not replace it', () => {
  assert.equal(isAnsweredByLetter({ answer: 'A' }), true);
  assert.equal(isAnsweredByLetter({ answer: 'B: サーバーにも保存する' }), true);
  assert.equal(isAnsweredByLetter({ answer: LETTERLESS }), false);
  assert.equal(isAnsweredByLetter({ answer: '' }), false);
  assert.equal(isAnsweredByLetter({ answer: null }), false);
});

test('C005 postcondition: what a letterless reply raised is recorded, never discarded', () => {
  const refined = refineLetterlessAnswer({ reply: LETTERLESS });

  assert.equal(refined.answered, false);
  assert.equal(refined.raised.origin, LETTERLESS, "the human's own words are the point's origin");
});

test('C005 boundary: a reply answering with a fact is still letterless, and still raises a point', () => {
  const refined = refineLetterlessAnswer({ reply: 'その値は src/api/session_storage.rs にあります' });

  assert.equal(refined.answered, false);
  assert.match(refined.raised.origin, /session_storage\.rs/);
});

test('C005 invariant: an unanswered question is reported by its number, not by its text', () => {
  const reading = readAnswers({ questions: [{ number: 7, answer: LETTERLESS }] });

  assert.deepEqual(reading.unanswered, [7]);
});

test('C005 boundary: a round with no questions reads as nothing asked rather than as a failure', () => {
  const reading = readAnswers({ questions: [] });

  assert.deepEqual(reading, { asked: 0, answered: 0, unanswered: [] });
});
