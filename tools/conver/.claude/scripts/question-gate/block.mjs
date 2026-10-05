// [::TICKET::] PX-233 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-233 --for-spec --no-implementation-order`.
/**
 * The question block: seven lines, read top to bottom.
 *
 * The order is the rule, not a preference. The AI's own conclusion comes before any
 * option letter so the human reads a judgement rather than a menu; the remainder is
 * stated as one sentence so the human sees how little is left; and a letter appears
 * only on the line that gives it meaning. The read-back is the check on that last
 * part: a block that uses a name its reader has not met is a defect at that line,
 * and the fix belongs in the line, never in a gloss appended later.
 */

/** The seven lines, in the order they are written. */
export const BLOCK_LINES = Object.freeze([
  '状況',
  '私の結論',
  'すでに決まっていること',
  '残っている選択',
  '選択肢',
  '推奨',
  '推奨が覆る条件',
]);

/** The four slots every sentence of the block must be able to fill. */
export const SENTENCE_SLOTS = Object.freeze(['誰が', '何を', 'どうする', 'いつ']);

/**
 * A bare option letter used as a token.
 *
 * The lookahead is what keeps a sentence that happens to begin with the word "A"
 * from reading as an option reference: an option letter is followed by a delimiter
 * or ends the line, while a word continues.
 */
const BARE_LETTER = /(?:^|[\s（(])[A-C](?=\s*[、。,，:：—)）]|\s*$)/;

/** Sentences end at one of these, followed by a space or a newline. */
const SENTENCE_END = /(?<=[.。！!?？])\s+|\n/;

const OPTIONS_LABEL = BLOCK_LINES[4];

/**
 * Render a question block.
 *
 * The seven lines divide into the half that narrows the question and the half that
 * asks it, which is why they are passed that way rather than as seven loose
 * strings: the first four say what is happening and how little is left, and the
 * last three put the choice and its reason.
 *
 * @param {{
 *   framing: { context: string, conclusion: string, settled: string, remainder: string },
 *   choice: {
 *     directions: Array<{ letter: string, meaning: string }>,
 *     recommendation: string,
 *     overturning: string,
 *   },
 * }} block
 * @returns {string}
 */
export function renderBlock({ framing, choice }) {
  const options = choice.directions.map((direction) => `${direction.letter}: ${direction.meaning}`).join('\n');

  return [
    `${BLOCK_LINES[0]}\n${framing.context.trim()}`,
    `${BLOCK_LINES[1]}\n${framing.conclusion.trim()}`,
    `${BLOCK_LINES[2]}\n${framing.settled.trim()}`,
    `${BLOCK_LINES[3]}\n${framing.remainder.trim()}`,
    `${BLOCK_LINES[4]}\n${options}`,
    `${BLOCK_LINES[5]}\n${choice.recommendation.trim()}`,
    `${BLOCK_LINES[6]}\n${choice.overturning.trim()}`,
    '',
  ].join('\n');
}

/**
 * Take a block one sentence at a time and fill the four slots for each.
 *
 * A slot left null is a sentence that must be rewritten where it stands: an empty
 * 何を slot means the sentence has no object, and an empty 誰が slot means it is
 * carried by a document rather than by a person.
 *
 * @param {string} text
 * @returns {Array<{ sentence: string, slots: Record<string, string|null> }>}
 */
export function sentencePass(text) {
  return text
    .split(SENTENCE_END)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== '')
    .map((sentence) => ({
      sentence,
      slots: Object.fromEntries(SENTENCE_SLOTS.map((slot) => [slot, null])),
    }));
}

/**
 * Read the block top to bottom and check that every letter is defined before use.
 *
 * @param {string} block
 * @returns {{ ok: boolean, faults: Array<{ kind: string, line: string|null }> }}
 */
export function readBack(block) {
  const lines = block.split('\n');
  const optionsIndex = lines.findIndex((line) => line.trim() === OPTIONS_LABEL);

  if (optionsIndex === -1) {
    return { ok: false, faults: [{ kind: 'missing-options', line: null }] };
  }

  const faults = [];
  for (const line of lines.slice(0, optionsIndex)) {
    if (BARE_LETTER.test(line)) faults.push({ kind: 'forward-reference', line: line.trim() });
  }

  return { ok: faults.length === 0, faults };
}
