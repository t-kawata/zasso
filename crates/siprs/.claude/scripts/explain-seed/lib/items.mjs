/**
 * What an explanation item is: a heading, the body under it, and the place a person writes.
 *
 * The gate judges an item and the reader that looks into a neighbour's explanation reads one,
 * so both have to answer "is this one item", "which record is it about" and "where did the
 * person write" the same way. Duplicating any of those answers would allow a document the
 * gate accepts to be read as saying something it does not — the reason `markers.mjs` already
 * gives for keeping one predicate per token.
 *
 * The reference separator is here rather than beside the heading that prints it because
 * `referenceOf` reads it back: a heading and its reader are one definition, not two.
 */
import { isPlaceholderLine } from './markers.mjs';

// [::TICKET::] PX-225 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-225 --for-spec --no-implementation-order`.
export const HUMAN_ITEM_HEADING = '### 判断';

export const PREDECIDED_ITEM_HEADING = '### 先に決めた';

/** Separates an item's ordinal from the record it is about. */
export const REFERENCE_SEPARATOR = ' — ';

/**
 * The record an item's heading is about, or nothing when the heading names none.
 *
 * @param {string} heading
 * @returns {string|null}
 */
export function referenceOf(heading) {
  const parts = String(heading).split(REFERENCE_SEPARATOR);
  return parts.length < 2 ? null : parts[parts.length - 1].trim();
}

/** The shape a question heading has when it carries only the number the frame gave it. */
const QUESTION_HEADING = /^### 判断 Q(\d+)\s*$/u;

/**
 * The number a question's heading gives it, or nothing when the heading names no question.
 *
 * A question is identified by its number and not by the record it was about: the frame no
 * longer writes one question per recorded point, so a heading carrying a record reference
 * after a separator is the shape an earlier frame wrote, and reading it as a number would let
 * a legacy document pass as one this frame wrote.
 *
 * @param {string} heading
 * @returns {number|null}
 */
// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
export function questionNumberOf(heading) {
  const matched = String(heading).match(QUESTION_HEADING);
  return matched === null ? null : Number(matched[1]);
}

/**
 * One section's items, in document order.
 *
 * A heading is recognised only at the start of a line, so prose that mentions one is prose.
 *
 * @param {string} sectionBodyText
 * @param {string} heading
 * @returns {Array<{ id: string|null, heading: string, body: string }>}
 */
export function splitItems(sectionBodyText, heading) {
  const items = [];
  let current = null;
  for (const line of String(sectionBodyText).split('\n')) {
    if (line.startsWith(heading)) {
      if (current !== null) items.push(current);
      current = { heading: line, lines: [] };
      continue;
    }
    if (current !== null) current.lines.push(line);
  }
  if (current !== null) items.push(current);
  return items.map((item) => ({ id: referenceOf(item.heading), heading: item.heading, body: item.lines.join('\n') }));
}

/**
 * What a person wrote under an item's placeholder, or nothing.
 *
 * Nothing is returned for an item whose placeholder is its last line, for one that carries no
 * placeholder at all, and for one whose writing is only whitespace: all three mean the same
 * thing to a reader — this question has no answer yet — and a reader that told them apart
 * would be inventing a distinction nothing downstream can act on.
 *
 * An item carrying more than one placeholder is not resolved here. The first one is the one
 * read, deterministically, and the caller is expected to have refused the document already:
 * deciding which place a person meant is exactly the guess this module exists to avoid.
 *
 * @param {string} itemBody
 * @returns {string|null}
 */
export function decisionUnderPlaceholder(itemBody) {
  const lines = String(itemBody).split('\n');
  const placeholderLine = lines.findIndex((line) => isPlaceholderLine(line));
  if (placeholderLine < 0) return null;

  const written = lines.slice(placeholderLine + 1).join('\n').trim();
  return written === '' ? null : written;
}
