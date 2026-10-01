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
  isPlaceholderLine,
  markerOffsetInLine,
} from '../../../.claude/scripts/explain-seed/lib/markers.mjs';
import {
  ABSENT_RESIDUALS_STATEMENT,
  BOUND_POINTS_LABEL,
  CONTEXT_LABEL,
  COUNT_LABEL,
  FRAME_SECTIONS,
  HUMAN_ITEM_HEADING,
  PREDECIDED_ITEM_HEADING,
  SCOPE_LABEL,
  appendQuestionRound,
  buildFrame,
  renderQuestionBlock,
  roundSeparator,
} from '../../../.claude/scripts/explain-seed/lib/frame.mjs';

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
  { label: SCOPE_LABEL, prose: 'この答えで、残る論点のうち実装順と境界の扱いをまとめて決められる。' },
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

/**
 * The prose this line's label asks for, with the count marker resolved to the real count.
 *
 * The bound-points line is the one instruction whose prose is not a sentence but the ids the
 * caller hands in: a question binds points the test chose, and a helper that invented its own
 * ids would author a document about a different package.
 */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
function proseForLine(line, { humanDecisionCount, boundIds }) {
  if (line.includes(BOUND_POINTS_LABEL)) return boundIds.join(', ');
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
// [::TICKET::] PX-222, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-222|PX-229) --for-spec --no-implementation-order`.
function resolveMarkers(frameText, answers) {
  return frameText
    .split('\n')
    .map((line) => {
      const offset = markerOffsetInLine(line);
      if (offset < 0) return line;
      return `${line.slice(0, offset)}${proseForLine(line, answers)}`;
    })
    .join('\n');
}

/**
 * Author a frame the way an AI authors it: every marker becomes prose, the count the
 * introduction declares is the count of items the human is asked to decide, and every
 * placeholder is left for the human.
 *
 * `boundIds` is what the AI writes on each question's bound-points line. It defaults to every
 * recorded point, which is the one clustering a document with a single question can carry.
 *
 * @param {string} frameText - the frame as `buildFrame` produced it
 * @param {{ boundIds?: string[] }} [input]
 * @returns {string} a document the gate is expected to accept
 */
export function fillEveryMarker(frameText, { boundIds = [] } = {}) {
  return resolveMarkers(frameText, {
    humanDecisionCount: countHumanDecisionItems(frameText),
    boundIds,
  });
}

/**
 * Author a frame and then leave exactly one marker open, so a test can ask the gate for
 * the section it is in.
 *
 * @param {string} frameText - the frame as `buildFrame` produced it
 * @param {{ after: string, marker: string }} input - the heading to re-open under, and the marker line to put there
 * @returns {string} a document the gate is expected to refuse
 */
export function fillAllButOneMarker(frameText, { after, marker, boundIds = [] }) {
  return fillEveryMarker(frameText, { boundIds }).replace(`${after}\n\n`, `${after}\n\n${marker}\n\n`);
}

/**
 * An authored explanation, in the three steps the command itself takes: publish the frame,
 * append a round of questions, then write the prose.
 *
 * The frame no longer carries a question per recorded point, so a document the gate is meant to
 * accept is one a round has been appended to. Composing it here keeps every test that asserts
 * the gate against an accepted document reading the same way it did before.
 *
 * @param {{ facts: object, previous?: string|null, size?: number, boundIds?: string[] }} input
 * @returns {string} a document the gate is expected to accept
 */
export function authorExplanation({ facts, previous = null, size = 1, boundIds = [] }) {
  const published = buildFrame({ facts, previous }).text;
  return fillEveryMarker(appendQuestionRound({ documentText: published, size }), { boundIds });
}

/** Replace one section's body, keeping every other section exactly as it was. */
// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
function spliceSectionBody(documentText, title, bodyText) {
  const heading = `## ${title}`;
  const start = documentText.indexOf(heading);
  if (start < 0) throw new Error(`the frame carries no section headed ${title}`);
  const bodyStart = start + heading.length;
  const rest = documentText.slice(bodyStart);
  const end = rest.search(/\n## /);
  const tail = end < 0 ? '' : rest.slice(end);
  return `${documentText.slice(0, bodyStart)}\n\n${bodyText.trim()}\n${tail}`;
}

/** One question block, filled with the prose the caller asked for and the points it binds. */
// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
function authorQuestionBlock({ number, bound = [], answer = null }) {
  const rendered = renderQuestionBlock({ number });
  const filled = resolveMarkers(rendered, { humanDecisionCount: 0, boundIds: bound });
  if (answer === null) return filled;
  return filled
    .split('\n')
    .flatMap((line) => (isPlaceholderLine(line) ? [line, answer] : [line]))
    .join('\n');
}

/** The human's section as the AI authors it: one round, the questions the caller named. */
// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
function authorQuestionSection(questions) {
  if (questions.length === 0) return ABSENT_RESIDUALS_STATEMENT;
  const blocks = questions.map((question) => authorQuestionBlock(question));
  return [roundSeparator(1), '', ...blocks].join('\n\n');
}

/** The pre-decided section with the items the caller named, each grounded as asked. */
// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
function authorPreDecidedSection(preDecided) {
  return preDecided
    .map((item, index) =>
      [
        `${PREDECIDED_ITEM_HEADING} A${index + 1} — ${item.reference}`,
        '',
        '- 決定: この論点は、記録と他の答えからこう決まる。',
        `- 根拠: ${item.ground}`,
        '- 覆す条件:',
        '  [::MUST-FILL::] 覆す条件 — この決定をひっくり返すとしたら、どんな事実が現れたときか。絶対に発火しない定型文をそのまま書かない。',
        '',
      ].join('\n'),
    )
    .join('\n');
}

/**
 * An explanation with exactly the questions and pre-decisions a test names.
 *
 * `authorExplanation` composes the document the command itself produces; this composes one a
 * test needs to ask about a specific question number, a specific set of bound points, or a
 * decision grounded on an answer, which the command's own output cannot reach.
 *
 * @param {{ facts: object, questions?: Array<{ number: number, bound?: string[], answer?: string|null }>,
 *   preDecided?: Array<{ reference: string, ground: string }> }} input
 * @returns {string} a document the caller describes exactly
 */
// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
export function authorDocument({ facts, questions = [], preDecided = [] }) {
  const published = buildFrame({ facts, previous: null }).text;
  let text = spliceSectionBody(published, FRAME_SECTIONS[4].title, authorQuestionSection(questions));
  if (preDecided.length > 0) {
    text = spliceSectionBody(text, FRAME_SECTIONS[5].title, authorPreDecidedSection(preDecided));
  }
  return fillEveryMarker(text, { boundIds: [] });
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
