// [::TICKET::] PX-233 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-233 --for-spec --no-implementation-order`.
/**
 * Reading the human's reply.
 *
 * A reply is answered when it carries a letter; prose is added to the letter, never
 * put in its place. A reply with no letter is therefore not an answer.
 *
 * It is also not nothing. A person who answers a question with something else has
 * told the AI that the question was misclassified — that what was asked was a fact
 * the records held, or that the axis was not the one they think in — and discarding
 * that observation would lose the only evidence of it. So what a letterless reply
 * raised is recorded as a point, and the caller re-runs the settle test on that point
 * before rewriting any prose.
 */

/**
 * An option letter used to answer: the reply's first token is a letter, and the
 * lookahead keeps a word that merely begins with one ("Above all…") from reading
 * as an answer.
 */
const ANSWER_LETTER = /^\s*\**\s*[A-C](?![A-Za-z0-9])/;

/**
 * Whether a reply answers by letter.
 *
 * @param {{ answer: unknown }} input
 * @returns {boolean}
 */
export function isAnsweredByLetter({ answer }) {
  return typeof answer === 'string' && ANSWER_LETTER.test(answer);
}

/**
 * How far a round of questions has got.
 *
 * @param {{ questions?: Array<{ number: number, answer: unknown }> }} input
 * @returns {{ asked: number, answered: number, unanswered: number[] }}
 */
export function readAnswers({ questions = [] }) {
  const unanswered = questions
    .filter((question) => !isAnsweredByLetter({ answer: question.answer }))
    .map((question) => question.number);

  return { asked: questions.length, answered: questions.length - unanswered.length, unanswered };
}

/**
 * What a reply raises when it is not an answer to the question that was asked.
 *
 * The origin is the human's own words: a point refined from them must be able to
 * show what it was refined from, or the refinement is the AI's invention.
 *
 * @param {{ reply: string }} input
 * @returns {{ answered: boolean, raised: { origin: string } | null }}
 */
export function refineLetterlessAnswer({ reply }) {
  if (isAnsweredByLetter({ answer: reply })) return { answered: true, raised: null };
  return { answered: false, raised: { origin: reply } };
}
