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
import { CONTEXT_LABEL, COUNT_LABEL, HUMAN_ITEM_HEADING } from '../../../.claude/scripts/explain-seed/lib/frame.mjs';

/**
 * The wording that identifies each of the new instructions, quoted from the instruction itself.
 *
 * The first entry whose wording a line contains decides the prose, so the longer headings are
 * listed before the shorter ones they begin with. `推奨 —` happens not to be a substring of
 * `推奨の理由 —`, but the order states that independence rather than leaving it to accident:
 * a reason line read as a recommendation line would author a document the gate refuses.
 */
const OPTION_A_INSTRUCTION = '案A —';
const OPTION_B_INSTRUCTION = '案B —';
const RECOMMENDATION_INSTRUCTION = '推奨 —';
const RECOMMENDATION_REASON_INSTRUCTION = '推奨の理由 —';
const RECOMMENDATION_OVERRIDE_INSTRUCTION = '推奨が覆る条件 —';

/** The prose an AI writes, chosen by the label or the standard the instruction carries. */
const PROSE_BY_LABEL = [
  // The context carries no record id: a test erases one open item's id from an authored
  // document to ask the gate about the item that vanished, and prose naming an id would
  // change what that surgery removes.
  { label: CONTEXT_LABEL, prose: 'この判断は、決められた範囲を越えた記録が届いたときに、それを受け取るか断るかの話である。' },
  { label: '誰の体験が変わるか', prose: 'この境界を実装する後続のエンジニア' },
  { label: '決めないと何が困るか', prose: '実装が止まり、grill で同じ議論をやり直すことになる。' },
  { label: `${COUNT_LABEL}:`, prose: `${COUNT_LABEL}: 0 件` },
  { label: '覆す条件', prose: '仕様が改訂され、この条項自体が変わったとき。' },
  { label: '用語', prose: 'この語が何を指すかを、設計を知らない人に先に説明する必要がある。' },
  { label: '越えると', prose: '越えると、層の向きが逆転し、下流の判断がすべて無効になる。' },
  { label: RECOMMENDATION_REASON_INSTRUCTION, prose: '理由を読み飛ばせないほうが、後から原因を追う人の体験を変えないため。' },
  { label: RECOMMENDATION_OVERRIDE_INSTRUCTION, prose: 'エラーコードの語彙が仕様から消え、真偽値だけが残ると決まったとき。' },
  { label: OPTION_A_INSTRUCTION, prose: 'A: 却下は理由を伴うエラーコードで返す。呼び出し側は理由を読み飛ばせない。' },
  { label: OPTION_B_INSTRUCTION, prose: 'B: 却下は真偽値で返す。呼び出し側は理由を知らないまま先へ進める。' },
  { label: RECOMMENDATION_INSTRUCTION, prose: 'A' },
];

/** The prose used when no label matches — still prose, never the marker. */
const FALLBACK_PROSE = 'この点は記録された事実だけでは決まらないため、ここで判断を仰ぐ。';

/** The prose this line's label asks for, with the count marker resolved to the real count. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
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
