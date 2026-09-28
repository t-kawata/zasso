// PX-222 @verifies C005
// PX-222 @verifies C006
// PX-222 @verifies C007
//
// What the AI does to a frame: replace every `[::MUST-FILL::]` and the instruction that
// follows it with prose, and state the count it ended up with. It lives here rather than
// inline in each test because the gate is asserted against a document that satisfies
// every rule, and five copies of that authoring would be five chances to disagree about
// what the rules are.
import {
  countOpenMarkers,
  countPlaceholdersIn,
  markerOffsetInLine,
} from '../../../.claude/scripts/explain-seed/lib/markers.mjs';
import { COUNT_LABEL, HUMAN_ITEM_HEADING } from '../../../.claude/scripts/explain-seed/lib/frame.mjs';

/** The prose an AI writes, chosen by the label or the standard the instruction carries. */
const PROSE_BY_LABEL = [
  { label: '誰の体験が変わるか', prose: 'この境界を実装する後続のエンジニア' },
  { label: '決めないと何が困るか', prose: '実装が止まり、grill で同じ議論をやり直すことになる。' },
  { label: `${COUNT_LABEL}:`, prose: `${COUNT_LABEL}: 0 件` },
  { label: '覆す条件', prose: '仕様が改訂され、この条項自体が変わったとき。' },
  { label: '用語', prose: 'この語が何を指すかを、設計を知らない人に先に説明する必要がある。' },
  { label: '越えると', prose: '越えると、層の向きが逆転し、下流の判断がすべて無効になる。' },
];

/** The prose used when no label matches — still prose, never the marker. */
const FALLBACK_PROSE = 'この点は記録された事実だけでは決まらないため、ここで判断を仰ぐ。';

/** The prose this line's label asks for, with the count marker resolved to the real count. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function proseForLine(line, humanDecisionCount) {
  const matched = PROSE_BY_LABEL.find((entry) => line.includes(entry.label));
  if (matched === undefined) return FALLBACK_PROSE;
  if (matched.label === `${COUNT_LABEL}:`) return `${COUNT_LABEL}: ${humanDecisionCount} 件`;
  return matched.prose;
}

/** How many items the human is being asked to decide, counted from the frame's own headings. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function countHumanDecisionItems(frameText) {
  return frameText.split('\n').filter((line) => line.startsWith(HUMAN_ITEM_HEADING)).length;
}

/** Resolve every marker, leaving the labels, the headings and the placeholders in place. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function resolveMarkers(frameText, humanDecisionCount) {
  return frameText
    .split('\n')
    .map((line) => {
      const offset = markerOffsetInLine(line);
      if (offset < 0) return line;
      return `${line.slice(0, offset)}${proseForLine(line, humanDecisionCount)}`;
    })
    .join('\n');
}

/**
 * Author a frame the way an AI authors it: every marker becomes prose, the count the
 * introduction declares is the count of items the human is asked to decide, and every
 * placeholder is left for the human.
 *
 * @param {string} frameText - the frame as `buildFrame` produced it
 * @returns {string} a document the gate is expected to accept
 */
export function fillEveryMarker(frameText) {
  const count = countHumanDecisionItems(frameText);
  return resolveMarkers(frameText, count);
}

/**
 * Author a frame and then leave exactly one marker open, so a test can ask the gate for
 * the section it is in.
 *
 * @param {string} frameText - the frame as `buildFrame` produced it
 * @param {{ after: string, marker: string }} input - the heading to re-open under, and the marker line to put there
 * @returns {string} a document the gate is expected to refuse
 */
export function fillAllButOneMarker(frameText, { after, marker }) {
  return fillEveryMarker(frameText).replace(`${after}\n\n`, `${after}\n\n${marker}\n\n`);
}

/**
 * The state of an authored document, which each gate test asserts against.
 *
 * @param {string} documentText - an authored EXPLAIN document
 * @returns {{ openMarkers: number, placeholders: number, humanDecisionItems: number }}
 */
export function describeAuthoredDocument(documentText) {
  return {
    openMarkers: countOpenMarkers(documentText),
    placeholders: countPlaceholdersIn(documentText),
    humanDecisionItems: countHumanDecisionItems(documentText),
  };
}
