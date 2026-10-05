/**
 * The explanation's frame: the structure, the questions, and the places the human writes.
 *
 * This is the other half of a split the command exists to make. `render.mjs` states the
 * facts; this module writes a document addressed to the human, in which every point that
 * needs prose is an open `[::MUST-FILL::]` instruction for the AI, every point that needs
 * a human judgement carries a `<!-- 人間の判断 -->` place for the human to write,
 * and every engineering question the facts and conventions already settle is decided here,
 * with the ground it rests on and the condition that would overturn it. The point of
 * deciding those here is that the human should arrive at the grill holding only what only
 * a human can answer: whether the result feels right to the people who will live with it.
 *
 * Two rules keep that honest. Nothing the manifests recorded as open may disappear — each
 * such item is either asked of the human or decided here — and an open item may never be
 * the ground of a decision, because a decision resting on an undecided question would look
 * settled while resting on nothing.
 *
 * The document is maintained rather than regenerated. Each section records the digest of
 * the facts it rests on, so a re-run keeps the sections whose facts did not move — prose
 * and human notes together — and reopens only the ones whose facts did, carrying the
 * person's note across and saying which fact moved.
 */
import {
  DIGEST_BLOCK_OPEN,
  EXPLAIN_SECTION_FACTS,
  computeFrameDigests,
  movedFactNames,
  readDigestBlock,
  renderDigestBlock,
} from './digest.mjs';
import {
  HUMAN_PLACEHOLDER,
  MUST_FILL_MARKER,
  countPlaceholdersIn,
  findOpenMarkers,
  isPlaceholderLine,
  markerOffsetInLine as markerOffsetOf,
} from './markers.mjs';
import {
  HUMAN_ITEM_HEADING,
  PREDECIDED_ITEM_HEADING,
  REFERENCE_SEPARATOR,
  decisionUnderPlaceholder,
  questionNumberOf,
  splitItems,
} from './items.mjs';
import { ExplainSeedError } from './errors.mjs';
import { deriveLedger } from './ledger.mjs';
import { INFO_SECTION_TITLES, truncateExcerpt } from './render.mjs';
// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
import { toHomeRelative } from '../../lib/path-utils.js';

export { HUMAN_ITEM_HEADING, PREDECIDED_ITEM_HEADING };

/** The explanation document, which the AI fills and a person writes into. */
export const EXPLAIN_FILE_NAME = 'EXPLAIN-RFC-SEED.md';

/**
 * This document's own words for the two absences.
 *
 * They are declared here rather than imported from the facts renderer because the two
 * documents are written in different languages and each must say its own absences in its
 * own. One shared constant would put the facts renderer's wording into a document written
 * for a person, or the reverse, the first time either was edited.
 */
export const ABSENT_RESIDUALS_STATEMENT = 'このパッケージが所有する未解決の論点は登録されていません。';

export const ABSENT_SECTION_STATEMENT = '該当する記録はありません。';

/** How this document says that a trimmed list left entries out. */
export const renderRemainder = (count) => `- …ほか ${count} 件`;

/** How this document says that a line was cut short. */
export const renderOmitted = (count) => `…（以下 ${count} 文字省略）`;

/** A line of this document's prose, shortened in this document's words. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function truncate(text) {
  return truncateExcerpt(text, { notice: renderOmitted });
}

/** This document's words for which side of a contract the package is on. */
const DIRECTION_NAMES = Object.freeze({ provides: '提供する側', consumes: '消費する側' });

/** The seven sections, in the order the human reads them. */
export const FRAME_SECTIONS = Object.freeze([
  Object.freeze({ id: 'E1', title: '30秒でわかるこのディレクトリ' }),
  Object.freeze({ id: 'E2', title: '全体の中での位置' }),
  Object.freeze({ id: 'E3', title: 'このディレクトリが担うもの' }),
  Object.freeze({ id: 'E4', title: '他のディレクトリとの約束ごと' }),
  Object.freeze({ id: 'E5', title: '人間が決めること（ここだけ）' }),
  Object.freeze({ id: 'E6', title: '先に決めておいたこと' }),
  Object.freeze({ id: 'E7', title: '踏むと壊れる線と用語ミニ辞典' }),
]);

/**
 * The section the human decides in, as `FRAME_SECTIONS` declares it.
 *
 * Named rather than indexed at each use because three readers need it — the gate that judges a
 * question, the merge that decides whether an earlier section was written by this frame, and
 * the asking round that reports how far it has got — and three copies of the index would be
 * three chances to move the section without moving one of its readers.
 */
export const HUMAN_SECTION_ID = FRAME_SECTIONS[4].id;

/**
 * The section the AI decides in, as `FRAME_SECTIONS` declares it.
 *
 * Named rather than indexed at each use because the gate that judges a pre-decision and the
 * reader that derives the ledger both need it, and two copies of the index would be two
 * chances to move the section without moving one of its readers.
 */
export const PREDECIDED_SECTION_ID = FRAME_SECTIONS[5].id;

/** The line that declares how many things the human is being asked to decide. */
export const COUNT_LABEL = '人間が決めること';

/**
 * The line that says what the question is about, in words a person who knows nothing can read.
 *
 * The question is put to someone who knows neither the implementation nor the design, so the
 * context it needs is carried by the question itself rather than left in the document around
 * it. Without this the reader's entry point is the record — contract ids, boundary ids, clause
 * text in the manifest's own words — and a question whose answer needs the design recalled is
 * not a question but a confirmation asked of someone who already holds it.
 */
export const CONTEXT_LABEL = '判断の前提';

/** The line that opens the directions a person may choose between. */
export const OPTIONS_LABEL = '選択肢';

/** The line that names the one direction being recommended. */
export const RECOMMENDATION_LABEL = '推奨';

/** The line that says why that direction is recommended, in terms the records can be checked against. */
export const RECOMMENDATION_REASON_LABEL = '推奨の理由';

/** The line that states the fact which would overturn the recommendation. */
export const RECOMMENDATION_OVERRIDE_LABEL = '推奨が覆る条件';

/** The line that names whose experience changes if the human decides one way or the other. */
export const PARTY_LABEL = '誰の体験が変わるか';

/** The line that names what goes wrong if the question is left undecided. */
export const HARM_LABEL = '決めないと何が困るか';

/** The line that states what was decided. */
export const DECISION_LABEL = '決定';

/** The line that names the manifest field or record the decision rests on. */
export const GROUND_LABEL = '根拠';

/** The line that states what would overturn the decision. */
export const OVERRIDE_LABEL = '覆す条件';

/**
 * The line that names the recorded points one question settles.
 *
 * It stands in the AI-only region, because a question is a direction and the points it settles
 * are the record's own vocabulary — the thing the person is not asked to read. The gate reads
 * this line to know what the question carries, and the ledger reads it to know what is bound.
 */
export const BOUND_POINTS_LABEL = '束ねた論点';

/**
 * The line that records why the records could not settle this point.
 *
 * The settle gate's output is the three lines 決定・根拠・覆す条件: a point they can be written
 * for is settled and never asked. This line is what remains of that test when it fails — which
 * records were read and why none of them was decisive — so a question carries the evidence that
 * it was asked only after the test failed in writing. It stands in the AI-only region because
 * the person answering is asked for a judgement, not for the AI's search.
 */
export const SETTLE_TRACE_LABEL = '決められなかった理由';

/** The line that states, in one line, what an answer lets the AI settle. */
export const SCOPE_LABEL = 'この質問で決まること';

/**
 * The id a point the document adds carries, and the shape that reserves it.
 *
 * A reserved id can never collide with a recorded id, so the two origins can never be
 * confused: an id under this prefix came from the document, and one that is not did not.
 */
// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
export const ADDED_POINT_ID_PREFIX = 'added-';

export const RESERVED_POINT_ID = /^added-\d{3}$/;

/**
 * The line that opens an added-point block, and the line that closes it.
 *
 * The block is written as an HTML comment so the readers that stop at a comment — the label
 * reader and the note reader — skip it, and the block is invisible to every rule but its own.
 */
// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
export const ADDED_POINT_OPEN = '<!-- explain-seed:added-point';

export const ADDED_POINT_CLOSE = '<!-- /explain-seed:added-point -->';

/** The two lines inside an added-point block: where it came from, and what it is. */
// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
export const ADDED_POINT_ORIGIN_LABEL = '出どころ';

export const ADDED_POINT_STATEMENT_LABEL = '論点';

/** How many recorded points one direction question must settle before it is worth asking. */
export const MIN_BOUND_POINTS = 2;

/** How many questions one round may put to the human. */
export const MAX_AXES_PER_ROUND = 3;

/**
 * How many rounds the loop may run.
 *
 * A bound rather than a target: the command exists to remove work from the human, and a loop
 * that never ends would be the largest possible version of the burden it was written to lift.
 */
export const MAX_ROUNDS = 5;

/** The line that opens a round of questions, and the text that closes it. */
export const ROUND_SEPARATOR_OPEN = '<!-- explain-seed:round ';
export const ROUND_SEPARATOR_CLOSE = ' -->';

/**
 * The line that tells the person the material under it is a copy of the record, not required reading.
 *
 * The records stay verbatim — a translated quote is no longer a record of it — so the only
 * honest way to keep them from being a precondition is to say in the frame's own voice what
 * they are. The frame writes this line rather than the AI, because the `[::MUST-FILL::]`
 * instruction above it disappears once it is answered, and the finished document has to say
 * who the question was written for.
 */
export const RECORD_REFERENCE_NOTICE =
  'この判断は、実装も設計も知らない人がこの節だけで決められるように書いています。ここから下は記録の言葉のままの写しで、読まなくても判断できます。';

/** How many directions a question must offer before a person can answer it by choosing. */
export const MIN_OPTION_COUNT = 2;

/** The bound on the glossary, which is a help rather than a dictionary of everything. */
export const MAX_GLOSSARY_TERMS = 12;

/** The bound on how many forbidden lines are explained in prose. */
export const MAX_FORBIDDEN_NOTES = 4;

/** The bound on the pre-decided list, whose detail the facts document already carries. */
export const MAX_PREDECIDED_ITEMS = 12;

/** A ground names something the human can go and check. */
const GROUND_SOURCE = /contract_registry|dependencies\.|inventory\.|adapters\.|conformance\.|obj-|claim-|inv-|err-|test-|sm-|req-|contract-|boundary-/;

/** The heading a person is expected to find at the top of a section, or nothing. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function sectionIdOf(line) {
  const matched = FRAME_SECTIONS.find((section) => line === `## ${section.title}`);
  return matched === undefined ? null : matched.id;
}

/**
 * Whether a text names this token as a whole word rather than inside a longer one.
 *
 * A plain substring test would not do, for two readers that both need the same boundary: a
 * record id, where `boundary-001` is a substring of `contract-boundary-001`, and an option
 * letter, where `A` is a substring of every English article.
 *
 * @param {string} text
 * @param {string} token
 * @returns {boolean}
 */
export function mentionsStandalone(text, token) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`).test(text);
}

/**
 * Whether a text names this record.
 *
 * A coverage check built on a substring test would report an open item as carried when only a
 * longer, different id was there — and, worse, would report a decision as resting on an
 * undecided question whenever a contract id happened to end in one.
 *
 * @param {string} text
 * @param {string} id
 * @returns {boolean}
 */
export function mentionsId(text, id) {
  return mentionsStandalone(text, id);
}

/**
 * The lines belonging to a labelled line: whatever stands beside the label, then the indented
 * lines under it, up to the first line that ends the label's reach.
 *
 * One reader for the boundary, because two would be two answers to "where does this label
 * stop". A list read to a different boundary than the value beside it would let the gate count
 * a line the item does not own, and the count is what decides whether a question offers enough
 * directions to be answerable.
 *
 * @param {string} itemBody
 * @param {string} label
 * @returns {Array<string>|null} the lines, or nothing when the item carries no such label
 */
// [::TICKET::] PX-222, PX-226, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-222|PX-226|PX-229) --for-spec --no-implementation-order`.
function labelledLines(itemBody, label) {
  const lines = itemBody.split('\n');
  const prefix = `- ${label}:`;
  const index = lines.findIndex((line) => line.trimStart().startsWith(prefix));
  if (index < 0) return null;

  const inline = lines[index].slice(lines[index].indexOf(prefix) + prefix.length).trim();
  const collected = inline === '' ? [] : [inline];
  for (const line of lines.slice(index + 1)) {
    if (line.trim() === '' || line.startsWith('- ') || line.startsWith('#') || isPlaceholderLine(line)) break;
    if (line.startsWith('<!--')) break;
    if (markerOffsetOf(line) >= 0) break;
    collected.push(line.trim());
  }
  return collected;
}

/**
 * The value of a labelled line inside an item, or nothing when it is absent or unfilled.
 *
 * The answer sits on the line below its label rather than beside it. A label and an
 * instruction cannot share a line: the marker is only a marker when it is a line's first
 * token, so an instruction behind a label would read as a sentence that mentions one, and
 * the gate would neither see it nor be able to trust what it saw.
 */
// [::TICKET::] PX-222, PX-226, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-222|PX-226|PX-229) --for-spec --no-implementation-order`.
export function labelledValue(itemBody, label) {
  const collected = labelledLines(itemBody, label);
  if (collected === null) return null;

  const value = collected.join(' ').trim();
  if (value === '' || value.includes(MUST_FILL_MARKER) || value.includes(HUMAN_PLACEHOLDER)) return null;
  return value;
}

/**
 * The recorded points a question binds, read from its AI-only line.
 *
 * The ids are what makes a question a direction rather than a point put to the human, so this
 * reader is what the gate counts and what the ledger derives `bound` from. An unfilled line
 * binds nothing rather than binding something guessed: a question whose ids are still an
 * instruction has not been written yet, and the gate refuses it for that.
 *
 * @param {string} itemBody
 * @returns {Array<string>}
 */
// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
export function boundPointIds(itemBody) {
  const collected = labelledLines(itemBody, BOUND_POINTS_LABEL);
  if (collected === null) return [];

  return collected
    .join(' ')
    .split(/[,、]/)
    .map((token) => token.trim())
    .filter((token) => token !== '' && !token.includes(MUST_FILL_MARKER));
}

/**
 * A whole line that is an added-point opening marker, with the id it carries.
 *
 * The marker has to be the line's whole content: a sentence that only mentions the marker is
 * prose, and reading it as a block would turn a question about the format into one.
 */
// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
const ADDED_POINT_OPENING = new RegExp(`^${ADDED_POINT_OPEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} id="([^"]+)" -->$`, 'u');

/** The id an added-point opening line carries, or nothing when the line is not one. */
// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
function addedPointIdIn(line) {
  const matched = String(line).trim().match(ADDED_POINT_OPENING);
  return matched === null ? null : matched[1];
}

/** The value of a labelled line inside an added-point block, or the empty string when absent. */
// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
function addedPointValue(blockBody, label) {
  const matched = blockBody.match(new RegExp(`^- ${label}:[ \\t]*(.*)$`, 'mu'));
  return matched === null ? '' : matched[1].trim();
}

/**
 * The points the document adds, read in document order.
 *
 * A block runs from its opening marker to its closing marker; a marker with no close is not a
 * block, because a point admitted halfway is a point whose statement was never written. The
 * origin and the statement are empty when their line is missing or blank, so the gate can tell
 * an absent origin from a present one and refuse the block.
 *
 * @param {{ documentText: string }} input
 * @returns {Array<{ id: string, origin: string, statement: string }>}
 */
// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
export function readAddedPoints({ documentText }) {
  const lines = String(documentText).split('\n');
  const points = [];

  for (let index = 0; index < lines.length; index += 1) {
    const id = addedPointIdIn(lines[index]);
    if (id === null) continue;

    const body = [];
    let cursor = index + 1;
    for (; cursor < lines.length && lines[cursor].trim() !== ADDED_POINT_CLOSE; cursor += 1) {
      body.push(lines[cursor]);
    }
    if (cursor >= lines.length) continue;

    const blockBody = body.join('\n');
    points.push({
      id,
      origin: addedPointValue(blockBody, ADDED_POINT_ORIGIN_LABEL),
      statement: addedPointValue(blockBody, ADDED_POINT_STATEMENT_LABEL),
    });
    index = cursor;
  }
  return points;
}

/**
 * One added-point block, written the way the reader reads it.
 *
 * The writer lives beside the reader and the opening constant, so the format is defined once:
 * a block written here can always be read back, and a reader changed without the writer would
 * be caught by the round-trip a test performs rather than in a finished document.
 *
 * @param {{ id: string, origin: string, statement: string }} point
 * @returns {string}
 */
// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
export function renderAddedPointBlock({ id, origin, statement }) {
  return [
    `${ADDED_POINT_OPEN} id="${id}" -->`,
    `- ${ADDED_POINT_ORIGIN_LABEL}: ${origin}`,
    `- ${ADDED_POINT_STATEMENT_LABEL}: ${statement}`,
    ADDED_POINT_CLOSE,
  ].join('\n');
}

/**
 * The faults in the points the document adds.
 *
 * A block is refused unless its id is reserved and unused and it carries both an origin and a
 * statement. The origin is required because it is the only mechanical guard against the AI
 * inventing a point to look responsive: a point admitted without one is a point nobody raised.
 *
 * @param {{ documentText: string, recordedIds: Set<string> }} input
 * @returns {Array<{ kind: string, section: string, id: string }>}
 */
// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
export function faultsOfAddedPoints({ documentText, recordedIds }) {
  const faults = [];
  const used = new Set();

  for (const point of readAddedPoints({ documentText })) {
    if (!RESERVED_POINT_ID.test(point.id)) {
      faults.push({ kind: 'unreserved-added-point', section: HUMAN_SECTION_ID, id: point.id });
    }
    if (used.has(point.id) || recordedIds.has(point.id)) {
      faults.push({ kind: 'duplicate-added-point', section: HUMAN_SECTION_ID, id: point.id });
    }
    used.add(point.id);
    if (point.origin === '') faults.push({ kind: 'uncited-added-point', section: HUMAN_SECTION_ID, id: point.id });
    if (point.statement === '') faults.push({ kind: 'unstated-added-point', section: HUMAN_SECTION_ID, id: point.id });
  }
  return faults;
}

/** The letter a direction opens with, or nothing when the line opens with none. */
// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
function letterOf(line) {
  const matched = String(line).match(/^([^\s:：]+)\s*[:：]/);
  return matched === null ? null : matched[1];
}

/**
 * The letters the directions of a question are written under.
 *
 * The letters are read from the document rather than from an alphabet fixed here: how many
 * readings a boundary has is a property of its records, so a question offering three
 * directions is judged against the three it wrote, not against a list this module would have
 * had to guess at.
 */
// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
function readOptionLetters(itemBody) {
  return (labelledLines(itemBody, OPTIONS_LABEL) ?? []).map(letterOf).filter((letter) => letter !== null);
}

/**
 * The directions a question actually offers: two lines written under one letter are one
 * choice, however many lines the question wrote. A question offering "A" twice offers one
 * direction, and a person cannot answer it by choosing — which is what the count is for.
 */
// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
function directionsOffered(itemBody) {
  return [...new Set(readOptionLetters(itemBody))];
}

/**
 * The direction a question recommends, or nothing.
 *
 * A recommendation naming a letter no direction uses points at something the human cannot
 * choose, so it is not a recommendation; and a recommendation carrying prose is not the one
 * letter the instruction asks for, so the gate sends it back rather than guessing which
 * direction was meant.
 */
// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
function readRecommendation(itemBody, optionLetters) {
  const value = labelledValue(itemBody, RECOMMENDATION_LABEL);
  if (value === null) return null;
  const written = value.replace(/[:：。、\s]+$/u, '').trim();
  return optionLetters.includes(written) ? written : null;
}

/** What a person wrote under an item's placeholder, or nothing. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function readHumanNote(itemBody) {
  const lines = itemBody.split('\n');
  const anchor = lines.findIndex((line) => isPlaceholderLine(line));
  if (anchor < 0) return null;
  const note = [];
  for (const line of lines.slice(anchor + 1)) {
    if (line.startsWith('### ') || line.startsWith('## ') || line.startsWith('<!--')) break;
    note.push(line);
  }
  return note.join('\n').trim();
}

/**
 * The sections of a document that was written by an earlier run.
 *
 * Exported because the reader that looks into a neighbour's explanation must find the human
 * section exactly as the gate did: two locators would be two answers to "where does a person
 * write", and a document the gate accepted could then be read as one it had not.
 */
// [::TICKET::] PX-222, PX-225 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-222|PX-225) --for-spec --no-implementation-order`.
export function locateSections(documentText) {
  const bodies = {};
  const duplicates = [];
  let current = null;

  for (const line of documentText.split('\n')) {
    const id = sectionIdOf(line);
    if (id !== null) {
      if (bodies[id] !== undefined) {
        duplicates.push(id);
        current = null;
        continue;
      }
      bodies[id] = [];
      current = id;
      continue;
    }
    if (line.startsWith('## ') || line.startsWith(DIGEST_BLOCK_OPEN)) {
      current = null;
      continue;
    }
    if (current !== null) bodies[current].push(line);
  }

  return {
    bodies: Object.fromEntries(Object.entries(bodies).map(([id, lines]) => [id, lines.join('\n').trim()])),
    duplicates,
    missing: FRAME_SECTIONS.filter((section) => bodies[section.id] === undefined).map((section) => section.id),
  };
}

/**
 * The questions the human is being asked, one per item the manifests recorded as open.
 *
 * The script does not decide which of these are engineering and which are experiential:
 * it asks about every recorded open item, and the AI either answers one here or decides it
 * and moves it to the pre-decided section with its ground. What the script guarantees is
 * that none of them can quietly disappear.
 *
 * Each item carries whatever the manifests recorded about it, because a question asked
 * without its material is a question the human cannot answer. A residual question records
 * its topic and why it was left open. A risky boundary records no topic — no real
 * `handoff_summary.unresolved` entry names a boundary — so it carries the contract that
 * governs it, and the clauses stage two already settled, which is the material the human
 * needs in order to judge whether that settlement is the right one.
 *
 * @param {object} projection
 * @returns {Array<{ id: string, kind: string, topic: string|null, whyUnresolved: string|null, contracts: Array<object> }>}
 */
export function collectOpenItems(projection) {
  const answered = settledBoundaryIds(projection);
  const questions = projection.grill.questions.map((entry) => ({
    id: entry.residual_id,
    kind: 'residual',
    topic: entry.topic,
    whyUnresolved: entry.why_unresolved,
    contracts: [],
  }));
  const boundaries = projection.grill.risky_boundaries
    .filter((entry) => !answered.has(entry.id))
    .map((entry) => ({
      id: entry.id,
      kind: 'boundary',
      topic: entry.topic,
      whyUnresolved: null,
      contracts: projection.contracts.filter((contract) => contract.boundary_id === entry.id),
    }));
  return [...questions, ...boundaries];
}

/**
 * The boundaries a neighbour has already answered.
 *
 * Kept out of `collectOpenItems` by id rather than by moving the item afterwards: while a
 * boundary is an open item, `faultsOfPreDecisions` refuses any pre-decision grounded on it and
 * `faultsOfCoverage` refuses it in both sections, so "moved" is not a state this gate has.
 */
// [::TICKET::] PX-225 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-225 --for-spec --no-implementation-order`.
export function settledBoundaryIds(projection) {
  return new Set((projection.settledElsewhere ?? []).map((record) => record.boundary_id));
}

/**
 * The things the facts and conventions already settle, each with the ground it rests on.
 *
 * These are stated as decisions rather than asked as questions because that is what they
 * are: stage two fixed each clause, each forbidden edge and each obligation, and asking
 * the human to re-decide them is the burden this section exists to remove. What the AI
 * adds to each is the condition that would overturn it, so a decision is never presented
 * as beyond question.
 *
 * @param {object} facts
 * @returns {Array<{ reference: string, decision: string, ground: string }>}
 */
export function collectPreDecidedItems(facts) {
  const { projection } = facts;
  const clauses = projection.contracts.flatMap((contract) =>
    contract.clauses.map((clause) => ({
      reference: `${contract.contract_id} の clauses.${clause.name}`,
      decision: clause.text,
      ground: `contract_registry の ${contract.contract_id} の clauses.${clause.name}`,
    })),
  );
  const forbidden = projection.forbidden_edges.map((edge) => ({
    reference: `${edge.from} → ${edge.to}`,
    decision: `${edge.from} から ${edge.to} への依存は禁止${edge.reason === null ? '' : `（${edge.reason}）`}`,
    ground: `dependencies.forbidden_edges の reasonCode ${edge.reason_code ?? '未記載'}`,
  }));
  const obligations = projection.obligations.conformance.map((text, index) => ({
    reference: `conformance.test_obligations[${index}]`,
    decision: text,
    ground: 'conformance.test_obligations',
  }));
  const ports = projection.obligations.ports.map((port) => ({
    reference: port.id,
    decision: `ポート ${port.id} を実装し、${port.provides.join(', ')} を提供する`,
    ground: `adapters.ports の ${port.id}`,
  }));
  return [...collectSettledItems(projection), ...clauses, ...forbidden, ...obligations, ...ports];
}

/**
 * The questions a neighbour has already answered, as things decided rather than things asked.
 *
 * They open the list because the list is capped: a decision a person has already made is not
 * something a clause the facts document already carries may push out of sight.
 *
 * @param {object} projection
 * @returns {Array<{ reference: string, decision: string, ground: string }>}
 */
// [::TICKET::] PX-225 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-225 --for-spec --no-implementation-order`.
export function collectSettledItems(projection) {
  return (projection.settledElsewhere ?? []).map((record) => ({
    reference: `${record.boundary_id}（${record.counterpart_name} が確定）`,
    decision: record.decision,
    ground: `${record.document} の ${record.boundary_id}`,
  }));
}

/** The terms this package's own quotations use, in the order the human meets them. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function collectGlossary(facts) {
  const ranges = facts.projection.owned
    .map((record) => record.quotation)
    .filter((quotation) => quotation !== null && quotation.line_start !== null)
    .map((quotation) => [quotation.line_start, quotation.line_end ?? quotation.line_start]);

  const met = (facts.workspace?.treeManifest?.inventory?.terms ?? []).filter((term) =>
    (term.source_refs ?? []).some((reference) =>
      ranges.some(([start, end]) => reference.line_start <= end && start <= reference.line_end),
    ),
  );

  const named = new Set();
  const distinct = [];
  for (const term of met) {
    if (named.has(term.canonical_name)) continue;
    named.add(term.canonical_name);
    distinct.push(term);
  }
  return distinct.sort(
    (left, right) => (left.line_start ?? 0) - (right.line_start ?? 0) || left.canonical_name.localeCompare(right.canonical_name),
  );
}

/** The position of the package, in one line. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function positionLine(projection) {
  const { position } = projection;
  return [
    position.wave === null ? null : `wave ${position.wave}`,
    position.level === null ? null : `実装レベル ${position.level}`,
    position.serial_index === null ? null : `通し番号 ${position.serial_index}`,
  ]
    .filter((part) => part !== null)
    .join(' / ');
}

/** The line that says which facts moved under a section, when any did. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function renderMovedFacts(movedFacts) {
  if (movedFacts.length === 0) return [];
  const named = movedFacts.map((id) => `INFO ${id.replace('I', '')}「${INFO_SECTION_TITLES[id]}」`).join('、');
  return [`> ※ 前回の説明が依拠していた事実（${named}）が変わったため、この節は書き直しました。`, ''];
}

/**
 * The context the question carries for a person who knows nothing of the implementation or the design.
 *
 * It stands first in the item, above the record, because a reader who starts at the top would
 * otherwise meet the record's own language — contract ids, boundary ids, clause text — before
 * anything addressed to them. What it must close is the question in that reader's own world,
 * glossing every design term the directions and the reason below it will use, so that reading
 * nothing else is enough.
 */
// [::TICKET::] PX-227, PX-232 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-227|PX-232) --for-spec --no-implementation-order`.
function renderContextBlock() {
  return [
    `- ${CONTEXT_LABEL}:`,
    `  ${MUST_FILL_MARKER} ${CONTEXT_LABEL} — 実装も設計も知らない高校生が、選択肢と推奨の理由だけを読んで選べるように書く。誰が・何を・いつ・どうするのかと、そうなると何が起きるかを2〜3文で閉じ、出てくる設計の言葉はすべてその場で日常語に言い換える。指させる名詞だけを使い、指示対象の無い名詞（相手・整合・主体・扱い・立場）と、動詞を名詞にした語（取り方・伝わり方・中身）を使わない。使う前に定義する — 記号・id・名前は、その意味を与える行より先に書かない。上の記録や他の節を読んだ前提で書かない。事実や論点の写しにしない。`,
  ];
}

/**
 * The directions a person may choose between, as instructions to be answered.
 *
 * Each instruction opens its own line, because a marker is only a marker when it is a line's
 * first token: written behind the label it would be a sentence that mentions one, invisible to
 * the counter and left unfilled without the gate noticing.
 */
// [::TICKET::] PX-226, PX-227 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-226|PX-227) --for-spec --no-implementation-order`.
function renderOptionBlock() {
  return [
    `- ${OPTIONS_LABEL}:`,
    `  ${MUST_FILL_MARKER} 案A — その案を選ぶと何が起きるかを、実装も設計も知らない高校生が読める言葉で1〜2文。誰の体験をどう変えるかまで書く。行は「A: 」で始める。記録に無い理由を並べない。`,
    `  ${MUST_FILL_MARKER} 案B — その案を選ぶと何が起きるかを、実装も設計も知らない高校生が読める言葉で1〜2文。誰の体験をどう変えるかまで書く。行は「B: 」で始める。A と同じ内容の言い換えにしない。記録が3つの読みを残すなら「C: 」の行を足す。`,
  ];
}

/**
 * The one direction being recommended, why, and what would overturn it.
 *
 * The recommendation is a single letter rather than a sentence, so what is being recommended
 * is a thing the document offers rather than a paragraph the gate would have to read.
 */
// [::TICKET::] PX-226, PX-227 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-226|PX-227) --for-spec --no-implementation-order`.
function renderRecommendationBlock() {
  return [
    `- ${RECOMMENDATION_LABEL}:`,
    `  ${MUST_FILL_MARKER} ${RECOMMENDATION_LABEL} — 選んだ案の記号を1つだけ書く（A / B、3つあるなら C）。理由をここに書かない。`,
    `- ${RECOMMENDATION_REASON_LABEL}:`,
    `  ${MUST_FILL_MARKER} ${RECOMMENDATION_REASON_LABEL} — なぜそれを推すのか。記録のどこを見れば確かめられるかまで、実装も設計も知らない高校生が読める言葉で書く。好みを根拠にしない。`,
    `- ${RECOMMENDATION_OVERRIDE_LABEL}:`,
    `  ${MUST_FILL_MARKER} ${RECOMMENDATION_OVERRIDE_LABEL} — どんな事実が現れたら推奨が変わるか。絶対に発火しない定型文をそのまま書かない。`,
  ];
}

/**
 * One empty question block, numbered so an answer can name it, with a place to answer.
 *
 * The number is the frame's, not the AI's: a count the AI kept would drift between rounds, and
 * an answer that named Q3 would then name a different question than the one it was given. The
 * points the question settles and the record they come from stand in the AI-only region, below
 * the notice that tells the person they need not read it: a direction is put to a person in
 * their own words, and the record's vocabulary is what the AI settles the points from.
 */
// [::TICKET::] PX-222, PX-226, PX-227, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-222|PX-226|PX-227|PX-229) --for-spec --no-implementation-order`.
export function renderQuestionBlock({ number }) {
  return [
    `${HUMAN_ITEM_HEADING} Q${number}`,
    '',
    ...renderContextBlock(),
    `- ${RECORD_REFERENCE_NOTICE}`,
    `- ${BOUND_POINTS_LABEL}:`,
    `  ${MUST_FILL_MARKER} ${BOUND_POINTS_LABEL} — この質問が1つの答えでまとめて決める記録上の論点の id を、カンマ区切りで2つ以上書く。この行から下は人間には見せない。`,
    `- ${SETTLE_TRACE_LABEL}:`,
    `  ${MUST_FILL_MARKER} ${SETTLE_TRACE_LABEL} — この論点について 決定・根拠・覆す条件 を先に書いてみて、書けなかった理由を書く。どの記録を調べて、なぜそれが決め手にならなかったかを名指しする。3行が書けたなら、この論点は質問ではなく「先に決めておいたこと」に置き、この質問は作らない。人間には見せない。`,
    `- ${SCOPE_LABEL}:`,
    `  ${MUST_FILL_MARKER} ${SCOPE_LABEL} — この答えで AI が何を決められるようになるかを1行で書く。人間には見せない。`,
    `- 記録の写し:`,
    `  ${MUST_FILL_MARKER} 記録の写し — 上の論点の記録（未解決とされた理由・この境界を定めている契約と条項）を原文のまま写す。人間には見せない。`,
    '',
    `${MUST_FILL_MARKER} 何を決めるのか — 実装も設計も知らない高校生が読める言葉で書く。順序は次のとおり。まず何の話かを2〜3文（専門用語はその場で言い換える）。次に AI 自身の結論を言葉で書く（理由も書く。記号はまだ書かない）。次に「これ以外は決まっています」と1文で書き、AI が決めたことを並べない。最後に「残っているのは〜だけです」と1文で書く — 人を代名詞で指さず、狭く書けないなら、この論点は人間のものではないので質問をやめる。1文は1つの出来事だけを、誰が・何を・どうする（+ いつ）を明示して書く。記録する・扱う・位置づけるのような簿記の動詞ではなく、人が思い浮かべられる出来事の動詞を使う。読めるかどうかではなく、結果の重さだけで選べるかどうかで書く。事実に書いてあることをもう一度書かない。上の記録や他の節を読んだ前提で書かない。これは ${SETTLE_TRACE_LABEL} を書いてみて書けなかった後にはじめて書く（先に質問を作らない）。もしこの判断が事実と慣習だけで決まるなら、ここには書かず「${FRAME_SECTIONS[5].title}」へ移し、${DECISION_LABEL}・${GROUND_LABEL}・${OVERRIDE_LABEL}を書く（工学判断を人間に投げ返さない）。`,
    '',
    ...renderOptionBlock(),
    ...renderRecommendationBlock(),
    '',
    `- ${PARTY_LABEL}:`,
    `  ${MUST_FILL_MARKER} ${PARTY_LABEL} — 後続のエンジニア / AI / 利用者のどれの体験が、どう変わるか。「影響があります」で終わらせない。`,
    `- ${HARM_LABEL}:`,
    `  ${MUST_FILL_MARKER} ${HARM_LABEL} — 決めずに実装が進むと現場で具体的に何が起きるか。「問題になります」で終わらせない。`,
    '',
    HUMAN_PLACEHOLDER,
  ].join('\n');
}

/** One thing already decided, with what it rests on and what would overturn it. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function renderPreDecidedItem({ entry, index }) {
  return [
    `${PREDECIDED_ITEM_HEADING} A${index + 1}${REFERENCE_SEPARATOR}${entry.reference}`,
    '',
    `- ${DECISION_LABEL}: ${truncate(entry.decision)}`,
    `- ${GROUND_LABEL}: ${entry.ground}`,
    `- ${OVERRIDE_LABEL}:`,
    `  ${MUST_FILL_MARKER} ${OVERRIDE_LABEL} — この決定をひっくり返すとしたら、どんな事実が現れたときか。絶対に発火しない定型文をそのまま書かない。`,
    '',
  ];
}

/** A list trimmed with an explicit remainder, never silently. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function renderCappedList(items, limit, renderItem, note = '') {
  const shown = items.slice(0, limit).flatMap(renderItem);
  const remainder = items.length - Math.min(items.length, limit);
  if (remainder > 0) shown.push(`${renderRemainder(remainder)}${note}`, '');
  return shown;
}

/** One glossary term, with the specification's own words and a place to gloss it. */
// [::TICKET::] PX-222, PX-227 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-222|PX-227) --for-spec --no-implementation-order`.
function renderGlossaryEntry(term) {
  const at = term.line_start === null || term.line_start === undefined ? '' : `（仕様 ${term.line_start} 行目）`;
  const context = String(term.context ?? '').trim();
  return [
    `- \`${term.canonical_name}\`（${term.classification ?? '分類未記載'}）${at}`,
    ...(context === '' ? [] : [`  > ${truncate(context)}`]),
    `  ${MUST_FILL_MARKER} 用語 — この語を、実装も設計も知らない高校生が読める言葉で1〜2文に。仕様の言い換えではなく、なぜその語が必要なのかを書く。`,
    '',
  ];
}

/** The seven bodies, each as lines. */
const SECTION_BUILDERS = {
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
  E1(material) {
    const { facts, movedFacts } = material;
    return [
      `- このディレクトリ: \`${facts.projection.identity.path}\`（層 ${facts.projection.identity.layer} / 種別 ${facts.projection.identity.kind}）`,
      `- 全体の中での位置: ${positionLine(facts.projection)}`,
      '',
      ...renderMovedFacts(movedFacts),
      `${MUST_FILL_MARKER} このディレクトリが何をするものか — 専門用語をできるだけ使わず2〜3文。仕様の語をそのまま並べない。この段落だけを読んで用が足りるようにする。`,
      `${MUST_FILL_MARKER} 先に押さえるべき点 — 3つ以内。「注意する」のような抽象語で書かない。何が起きるかを書く。`,
      `${MUST_FILL_MARKER} この seed で人間が判断すべき件数を「${COUNT_LABEL}: N 件」の形で1行で書く。N は「${FRAME_SECTIONS[4].title}」の項目数と一致させる。N が大きすぎるなら、工学判断を人間に投げ返していないか見直す。`,
      '',
    ];
  },
// [::TICKET::] PX-222, PX-224 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-222|PX-224) --for-spec --no-implementation-order`.
  E2(material) {
    const { facts, movedFacts } = material;
    const { order } = facts.projection.position;
    // The two axes are printed as two counts rather than as one list of neighbours, because
    // they are not the same claim: one is a declared edge, the other is the level rule.
    return [
      `- 全体は ${facts.projection.totals.packages} パッケージ・${facts.projection.totals.layers} 層・${facts.projection.totals.boundaries} 境界。`,
      `- この位置: レベル ${order.level}（0始まり）・${order.ordinal}番目${order.onCriticalPath ? '・臨界経路上' : ''}`,
      `- 直列で待つ相手（宣言された辺のみ）: ${order.waitsFor.length} 件 / 並列で進めてよい相手（同じ段）: ${order.parallelInLevel.length} 件 / この完了を待つ相手: ${order.usedBy.length} 件`,
      `- 全体は ${order.plan.levels} 段。この鎖は短縮できないので、段の下限は ${order.plan.criticalChainLength}。`,
      '',
      ...renderMovedFacts(movedFacts),
      `${MUST_FILL_MARKER} なぜこの位置なのか — 直列と並列を分けて書く。直列は「待つ相手」＝宣言された辺だけで、辺が無ければ段が違っても直列ではないと明記する。並列は同じ段の相手で、依存が無いことは段の規則から保証されていると根拠を添える。段の差を順番の理由として書かない。level 番号を言い換えただけの文章は答えになっていない。`,
      '',
    ];
  },
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
  E3(material) {
    const { facts, movedFacts } = material;
    return [
      ...facts.projection.identity.responsibilities.map((text) => `- ${truncate(text)}`),
      '',
      ...renderMovedFacts(movedFacts),
      `${MUST_FILL_MARKER} 担う意味論 — 仕様の言葉をそのまま使わない。使うならその場で言い換える。`,
      `${MUST_FILL_MARKER} 担わないこと — 隣のディレクトリが担うことを名指しする。「関与しない」で終わらせない。`,
      '',
    ];
  },
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
  E4(material) {
    const { facts, movedFacts } = material;
    const boundary = (entry) =>
      `- ${entry.id}: ${entry.counterpart} と結合${entry.reason_code === null ? '' : `（理由: ${entry.reason_code}）`}`;
    const contract = (entry) =>
      `- ${entry.contract_id}: ${DIRECTION_NAMES[entry.direction] ?? entry.direction} — 相手 ${entry.counterpart}（${entry.connection_kind ?? '種別未記載'}）`;
    return [
      ...facts.projection.boundaries.provided.map(boundary),
      ...facts.projection.boundaries.consumed.map(boundary),
      ...facts.projection.contracts.map(contract),
      '',
      ...renderMovedFacts(movedFacts),
      `${MUST_FILL_MARKER} 相手ごとに、何を渡し何を受け取るのか — 1〜2文。渡す中身が変わったとき相手の何が壊れるかまで書く。条項名を並べるだけにしない。`,
      '',
    ];
  },
// [::TICKET::] PX-222, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-222|PX-229) --for-spec --no-implementation-order`.
  E5() {
    // The human's section is maintained, never regenerated: `buildFrame` keeps the previous
    // body when it carries this frame's question shape, and `next` appends the questions.
    // This builder is what a frame with nothing to carry writes.
    return [ABSENT_RESIDUALS_STATEMENT, ''];
  },
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
  E6(material) {
    const { preDecided } = material;
    // The line before the first item is for the human and for the AI adding to this
    // section: it says what the section is for and how to challenge it, so a decision
    // that turns on how the result feels does not sit here looking settled.
    const preamble = [
      'この節は、事実と慣習で決まるものを人間の代わりに決めたものです。使い心地の観点で納得できないものがあれば、そのままにせず grill で覆してください。',
      '',
    ];
    if (preDecided.length === 0) {
      return [...preamble, `- ${ABSENT_SECTION_STATEMENT}`, ''];
    }
    return [
      ...preamble,
      ...renderCappedList(
        preDecided,
        MAX_PREDECIDED_ITEMS,
        (entry, index) => renderPreDecidedItem({ entry, index }),
        `（残りは INFO-RFC-SEED.md の「${INFO_SECTION_TITLES.I5}」「${INFO_SECTION_TITLES.I7}」「${INFO_SECTION_TITLES.I8}」に記録があります）`,
      ),
    ];
  },
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
  E7(material) {
    const { facts, movedFacts } = material;
    const glossary = collectGlossary(facts);
    const lines = ['### 踏むと壊れる線', ''];
    if (facts.projection.forbidden_edges.length === 0) {
      lines.push(`- ${ABSENT_SECTION_STATEMENT}`, '');
    } else {
      for (const edge of facts.projection.forbidden_edges) {
        lines.push(`- ${edge.from} → ${edge.to} は禁止${edge.reason === null ? '' : `（${edge.reason}）`}`);
        if (edge.alternative !== null) lines.push(`  - 代わりに取る形: ${truncate(edge.alternative)}`);
      }
      lines.push('');
      lines.push(...renderCappedList(
        facts.projection.forbidden_edges,
        MAX_FORBIDDEN_NOTES,
        (edge) => [`- ${edge.from} → ${edge.to}:`, `  ${MUST_FILL_MARKER} 越えると何が壊れるか — 越えたときに壊れるものを名指しする。「望ましくない」で終わらせない。`, ''],
      ));
    }
    lines.push('### 用語ミニ辞典', '');
    if (glossary.length === 0) {
      lines.push(`- ${ABSENT_SECTION_STATEMENT}`, '');
    } else {
      lines.push(...renderCappedList(glossary, MAX_GLOSSARY_TERMS, (term) => renderGlossaryEntry(term)));
    }
    lines.push(...renderMovedFacts(movedFacts));
    return lines;
  },
};

/** One section of the frame, as a chunk of text. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function renderFrameSection({ section, material }) {
  return `## ${section.title}\n\n${SECTION_BUILDERS[section.id](material).join('\n').trim()}`;
}

/**
 * What a person wrote in an earlier document, keyed by what stood in the heading.
 *
 * The key is the record an item was about when it had one, and the heading itself otherwise:
 * a question written by this frame carries only its number, and a note under it can no longer
 * be re-anchored by the record — which is why the human's section is carried whole rather than
 * rebuilt from notes, and why this reader is now used only to name what a reset could not keep.
 */
// [::TICKET::] PX-222, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-222|PX-229) --for-spec --no-implementation-order`.
function collectHumanNotes({ located, faults }) {
  const notes = {};
  if (located === null) return notes;

  for (const [id, body] of Object.entries(located.bodies)) {
    for (const item of splitItems(body, HUMAN_ITEM_HEADING)) {
      const anchor = item.id ?? item.heading;
      if (countPlaceholdersIn(item.body) !== 1) {
        faults.push({ kind: 'unreadable-section', section: id, id: anchor });
        continue;
      }
      const note = readHumanNote(item.body);
      if (note !== null && note !== '') notes[anchor] = note;
    }
  }
  return notes;
}

/**
 * The parts of a question this frame writes and an earlier frame did not.
 *
 * Exported because the shape the merge test demands and the shape the render produces have to
 * be the same list: a label added to one and not the other either reopens every document on
 * every run, or keeps a body the gate refuses with no way back.
 */
// [::TICKET::] PX-226, PX-227, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-226|PX-227|PX-229) --for-spec --no-implementation-order`.
export const SHAPE_LABELS_THIS_FRAME_WRITES = Object.freeze([
  OPTIONS_LABEL,
  CONTEXT_LABEL,
  BOUND_POINTS_LABEL,
  SETTLE_TRACE_LABEL,
]);

/**
 * Whether a section holds the shape this frame writes.
 *
 * A digest says the facts have not moved; it says nothing about the shape of the document. A
 * question written before this command proposed directions carries none, and one written before
 * it carried its own context carries none either, so the gate refuses both — and a merge that
 * kept such a section would leave the document refused with no way back: `check` would name the
 * fault and every later `info` would keep the same body again. Reopening it costs the prose for
 * that section, which has to be rewritten to add what is missing anyway, and keeps what the
 * person wrote, because notes are collected by the record they were written against.
 *
 * Only the human's section changed shape, so every other section answers yes: this frame writes
 * them the way the frame before it did, and a section it kept keeps the AI's prose, which no
 * frame writes.
 */
// [::TICKET::] PX-226, PX-227, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-226|PX-227|PX-229) --for-spec --no-implementation-order`.
function carriesTheShapeThisFrameWrites(sectionId, body) {
  if (sectionId !== HUMAN_SECTION_ID) return true;
  return splitItems(body, HUMAN_ITEM_HEADING).every(
    (item) =>
      questionNumberOf(item.heading) !== null &&
      SHAPE_LABELS_THIS_FRAME_WRITES.every((label) => labelledLines(item.body, label) !== null),
  );
}

/** The faults an earlier document shows before anything is merged into it. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function faultsOfPrevious(located) {
  if (located === null) return [];
  return [
    ...located.duplicates.map((id) => ({ kind: 'duplicate-section', section: id, id: null })),
    ...located.missing.map((id) => ({ kind: 'missing-section', section: id, id: null })),
  ];
}

/**
 * Build the explanation document for one package, merging an earlier one when it exists.
 *
 * @param {{ facts: object, previous: string|null }} input
 * @returns {{ text: string, sectionDigests: Array<object>, humanDecisionItems: Array<object>,
 *   preDecidedItems: Array<object>, keptSections: string[], reopenedSections: string[], faults: Array<object> }}
 */
export function buildFrame({ facts, previous }) {
  const digests = computeFrameDigests(facts.infoSections);
  const recorded = previous === null ? null : readDigestBlock(previous);
  const located = previous === null ? null : locateSections(previous);
  const moved = movedFactNames({ recorded, computed: digests });
  const preDecided = collectPreDecidedItems(facts);

  const faults = faultsOfPrevious(located);
  const discardedNotes = [];
  const notes = collectHumanNotes({ located, faults: discardedNotes });
  faults.push(...discardedNotes);
  const keptSections = [];
  const reopenedSections = [];

  // The human's section is maintained: it is never regenerated. A previous body that carries
  // this frame's question shape is carried through byte for byte, so no run renumbers, reorders
  // or deletes a question, a round separator or an answer. A body written by an earlier frame
  // cannot be carried — its headings name records rather than questions — so it is reset, and
  // the notes it cannot re-anchor are named so nothing is discarded in silence.
  const previousHumanBody = located?.bodies[HUMAN_SECTION_ID];
  const humanCarriesShape =
    previousHumanBody !== undefined && carriesTheShapeThisFrameWrites(HUMAN_SECTION_ID, previousHumanBody);
  if (previous !== null && !humanCarriesShape) {
    for (const anchor of Object.keys(notes)) {
      faults.push({ kind: 'unreadable-section', section: HUMAN_SECTION_ID, id: anchor });
    }
  }
  const humanBody = humanCarriesShape ? previousHumanBody : ABSENT_RESIDUALS_STATEMENT;

  const chunks = FRAME_SECTIONS.map((section) => {
    const previousBody = located?.bodies[section.id];
    const digestMatches =
      recorded !== null && previousBody !== undefined && recorded[section.id]?.digest === digests[section.id].digest;

    if (section.id === HUMAN_SECTION_ID) {
      if (digestMatches && humanCarriesShape) keptSections.push(section.id);
      else reopenedSections.push(section.id);
      return `## ${section.title}\n\n${humanBody}`;
    }

    if (digestMatches && carriesTheShapeThisFrameWrites(section.id, previousBody)) {
      keptSections.push(section.id);
      return `## ${section.title}\n\n${previousBody}`;
    }
    reopenedSections.push(section.id);
    return renderFrameSection({ section, material: { facts, preDecided, movedFacts: moved[section.id] ?? [] } });
  });

  const humanDecisionItems = splitItems(humanBody, HUMAN_ITEM_HEADING).map((item) => ({
    ...item,
    number: questionNumberOf(item.heading),
  }));

  // The seed path stays absolute for the readers and the subprocess, since neither expands a
  // tilde. Only the copy that leaves the process is converted, so the document depends on the
  // seed alone rather than on the machine that happened to run it.
  const emittedSeedPath = toHomeRelative(facts.seedPath);

  const header = [
    `# RFC-SEED の解説: ${facts.projection.identity.name}（${facts.projection.identity.id}）`,
    '',
    'これから grill を始める人が、この seed が全体のどこで何を担っているかを先に掴むための文書です。',
    '事実そのものは同じディレクトリの `INFO-RFC-SEED.md` にあり、この文書はそれを説明したものです。',
    '`[::MUST-FILL::]` はAIが説明を書く箇所、`<!-- 人間の判断 -->` は人間が判断を書き込む箇所です。',
    '',
    `- 対象の seed: \`${emittedSeedPath}\``,
    '',
  ].join('\n');

  return {
    text: [header, ...chunks, renderDigestBlock(digests)].join('\n\n'),
    sectionDigests: FRAME_SECTIONS.map((section) => ({ id: section.id, digest: digests[section.id].digest })),
    humanDecisionItems,
    preDecidedItems: preDecided,
    keptSections,
    reopenedSections,
    faults,
  };
}

/** How many things the document asks the human to decide. */
export function countHumanDecisionItems(documentText) {
  const located = locateSections(documentText);
  const body = located.bodies[HUMAN_SECTION_ID] ?? '';
  return splitItems(body, HUMAN_ITEM_HEADING).length;
}

/** The line that opens round `n` of questions. */
// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
export function roundSeparator(n) {
  return `${ROUND_SEPARATOR_OPEN}${n}${ROUND_SEPARATOR_CLOSE}`;
}

/**
 * The rounds a document opens, in order, read from the separators between question blocks.
 *
 * The separator is the ledger's only record of a round: a question's number says which question
 * it is, never which round put it, so the count of separators is the count of rounds and the
 * separator a question stands after is the round it belongs to.
 *
 * @param {string} documentText
 * @returns {Array<number>}
 */
// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
export function readRoundNumbers(documentText) {
  const separators = String(documentText).match(/<!-- explain-seed:round (\d+) -->/g) ?? [];
  return separators.map((separator) => Number(separator.match(/(\d+)/)[1]));
}

/** How many rounds of questions a document has opened. */
// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
export function countRounds(documentText) {
  return readRoundNumbers(documentText).length;
}

/** The numbers of the questions a document asks, in the order it asks them. */
// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
export function readQuestionNumbers(documentText) {
  const located = locateSections(documentText);
  const body = located.bodies[HUMAN_SECTION_ID] ?? '';
  return splitItems(body, HUMAN_ITEM_HEADING)
    .map((item) => questionNumberOf(item.heading))
    .filter((number) => number !== null);
}

/** The line range of one section's body, so a change can be spliced in without touching the rest. */
// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
function sectionBodySpan(lines, sectionId) {
  let start = null;
  let end = null;
  for (const [index, line] of lines.entries()) {
    const id = sectionIdOf(line);
    if (id !== null) {
      if (id === sectionId) start = index + 1;
      else if (start !== null && end === null) end = index;
      continue;
    }
    if (start !== null && end === null && (line.startsWith('## ') || line.startsWith(DIGEST_BLOCK_OPEN))) end = index;
  }
  return start === null ? null : { start, end: end ?? lines.length };
}

/**
 * Append `size` empty numbered question blocks to the human's section, opening a round.
 *
 * The numbers continue from the highest number the document already holds, because a number a
 * question was asked under never moves: renumbering would make an earlier answer name a
 * different question. Everything already in the document is carried through unchanged — the
 * separator is written before the blocks it opens, and the absent statement a frame writes is
 * replaced rather than kept, because a document with questions is not one with none.
 *
 * @param {{ documentText: string, size: number }} input
 * @returns {string}
 */
// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
export function appendQuestionRound({ documentText, size }) {
  const lines = documentText.split('\n');
  const span = sectionBodySpan(lines, HUMAN_SECTION_ID);
  if (span === null) {
    throw new ExplainSeedError(`the questions cannot be appended: ${HUMAN_SECTION_ID} is not a section this document holds`, {
      field: EXPLAIN_FILE_NAME,
    });
  }

  const existing = lines.slice(span.start, span.end).join('\n').trim();
  const firstNumber = Math.max(0, ...readQuestionNumbers(documentText)) + 1;
  const blocks = Array.from({ length: size }, (_, offset) => renderQuestionBlock({ number: firstNumber + offset }));
  const addition = [roundSeparator(countRounds(documentText) + 1), '', blocks.join('\n\n')];

  if (existing === '' || existing === ABSENT_RESIDUALS_STATEMENT) {
    return [...lines.slice(0, span.start), '', ...addition, '', ...lines.slice(span.end)].join('\n');
  }
  return [...lines.slice(0, span.start), ...lines.slice(span.start, span.end), '', ...addition, '', ...lines.slice(span.end)].join('\n');
}

/** The declared count, or nothing when the introduction does not state one. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function declaredDecisionCount(documentText) {
  const located = locateSections(documentText);
  const matched = (located.bodies.E1 ?? '').match(new RegExp(`${COUNT_LABEL}:\\s*(\\d+)\\s*件`));
  return matched === null ? null : Number(matched[1]);
}

/** Which section a line number falls in. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function sectionOfLine(documentText, lineNumber) {
  let current = null;
  const lines = documentText.split('\n');
  for (let index = 0; index < lineNumber && index < lines.length; index += 1) {
    const id = sectionIdOf(lines[index]);
    if (id !== null) current = id;
  }
  return current;
}

/**
 * Everything above the options block that the AI wrote for the reader, and nothing else.
 *
 * A letter used here before the 選択肢 block gives it meaning is a forward reference: the reader
 * meets `A` and only later learns what `A` is. What the reader meets is the context the question
 * carries and the prose that closes it, however many paragraphs that prose runs to, so the scan
 * takes the context value and every paragraph standing at the left margin.
 *
 * The other candidate is to take the lines above the options and subtract the AI-only region,
 * and that fails on real documents: a record copy quotes its contract verbatim, continuation
 * paragraphs and all, and `atomicity: "A Forum Root Succession is atomic…"` is a standalone A
 * the AI never wrote. Indentation is what separates the two — every label's value sits under its
 * label, and the prose the human reads starts at the margin.
 *
 * @param {string} itemBody
 * @returns {string} the context value followed by every left-margin paragraph above the options
 */
// [::TICKET::] PX-232 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-232 --for-spec --no-implementation-order`.
function letterScanSpan(itemBody) {
  const lines = String(itemBody).split('\n');
  const context = labelledValue(itemBody, CONTEXT_LABEL) ?? '';
  const optionsIndex = lines.findIndex((line) => line.trimStart().startsWith(`- ${OPTIONS_LABEL}:`));
  if (optionsIndex < 0) return context;

  const prose = lines
    .slice(0, optionsIndex)
    .filter((line) => line.trim() !== '' && line === line.trimStart() && !line.startsWith('- ') && !line.startsWith('#'));

  return [context, ...prose].join('\n');
}

/**
 * Whether a question names one of its own options before the options are written.
 *
 * The letters are the ones the question offers, read from the document, so the rule follows the
 * question's own alphabet rather than one fixed here.
 */
// [::TICKET::] PX-232 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-232 --for-spec --no-implementation-order`.
function faultsOfForwardReference({ itemBody, directions, section, question, faults }) {
  const span = letterScanSpan(itemBody);
  if (!directions.some((letter) => mentionsStandalone(span, letter))) return;
  faults.push({ kind: 'forward-reference', section, id: question });
}

/**
 * The faults in the human-decision section.
 *
 * The four rules about directions are per question and independent of each other: a question
 * that offers none, recommends nothing, or gives no reason and no overturning condition is
 * missing four different things, and reporting one would hide the rest from whoever has to fix
 * the document.
 *
 * The rule about the context is item-level, like the party rule and deliberately not one of
 * those four: those four are about the choice the question offers, and this one is about
 * whether the question can be read at all by the person it is put to.
 */
// [::TICKET::] PX-222, PX-226, PX-227, PX-229, PX-230, PX-232 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-222|PX-226|PX-227|PX-229|PX-230|PX-232) --for-spec --no-implementation-order`.
function faultsOfDecisions({ body, universe, unsettledCount, section }) {
  const faults = [];

  for (const item of splitItems(body, HUMAN_ITEM_HEADING)) {
    const number = questionNumberOf(item.heading);
    const question = number === null ? item.heading : `Q${number}`;

    // The points a question settles, not the record its heading named: a question binds the
    // points it is a direction about — a recorded point or one the document added — and an id
    // that exists in neither set is a point that exists nowhere.
    const bound = boundPointIds(item.body);
    for (const id of bound) {
      if (!universe.has(id)) faults.push({ kind: 'unrecorded-decision', section, id });
    }
    // The exemption is decided by the points no answer has settled yet, not by how many the
    // manifests recorded: a package whose recorded points are mostly settled has one point
    // left to ask about, and refusing that question would demand a bundle the documents
    // cannot supply.
    if (bound.length < MIN_BOUND_POINTS && unsettledCount >= MIN_BOUND_POINTS) {
      faults.push({ kind: 'too-few-bound-points', section, id: question });
    }

    const placeholders = countPlaceholdersIn(item.body);
    if (placeholders === 0) faults.push({ kind: 'missing-placeholder', section, id: question });
    if (placeholders > 1) faults.push({ kind: 'duplicate-placeholder', section, id: question });
    if (labelledValue(item.body, PARTY_LABEL) === null) faults.push({ kind: 'unnamed-party', section, id: question });
    if (labelledValue(item.body, CONTEXT_LABEL) === null) faults.push({ kind: 'missing-context', section, id: question });
    if (labelledValue(item.body, SCOPE_LABEL) === null) faults.push({ kind: 'missing-scope-line', section, id: question });
    // The settle gate's own output, read as a value: a line still carrying its instruction or the
    // human placeholder is not an answer, and labelledValue already refuses both.
    if (labelledValue(item.body, SETTLE_TRACE_LABEL) === null) {
      faults.push({ kind: 'missing-settle-trace', section, id: question });
    }

    const directions = directionsOffered(item.body);
    if (directions.length < MIN_OPTION_COUNT) faults.push({ kind: 'too-few-options', section, id: question });
    // A question that cannot be answered by choosing is not yet a question, so the letters it
    // has not settled on cannot be read as used or unused.
    if (directions.length >= MIN_OPTION_COUNT) {
      faultsOfForwardReference({ itemBody: item.body, directions, section, question, faults });
    }
    if (readRecommendation(item.body, directions) === null) faults.push({ kind: 'missing-recommendation', section, id: question });
    if (labelledValue(item.body, RECOMMENDATION_REASON_LABEL) === null) {
      faults.push({ kind: 'missing-recommendation-reason', section, id: question });
    }
    if (labelledValue(item.body, RECOMMENDATION_OVERRIDE_LABEL) === null) {
      faults.push({ kind: 'missing-recommendation-override', section, id: question });
    }
  }
  return faults;
}

/** A ground that names a question, with or without the letter the answer chose. */
const QUESTION_GROUND = /^Q(\d+)(?:\s*[A-Za-z])?\b/;

/**
 * Whether a ground names a question, recording what is wrong with the reference when it does.
 *
 * A question reference is the third kind of ground the document allows, beside a manifest id
 * and a neighbour's document, and it widens the ground grammar rather than replacing it: only
 * the reference is resolved here, so a ground naming the manifest vocabulary still goes through
 * the other reader. The reference is resolved against the questions actually present, so an
 * answer-grounded decision can never rest on a question this document does not ask or has not
 * had answered.
 *
 * @returns {boolean} whether the ground was a question reference at all
 */
// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
function faultsOfQuestionGround({ ground, questionsByNumber, faults, section, id }) {
  const matched = String(ground).trim().match(QUESTION_GROUND);
  if (matched === null) return false;

  const question = questionsByNumber.get(Number(matched[1]));
  if (question === undefined) {
    faults.push({ kind: 'unknown-question-as-ground', section, id });
  } else if (decisionUnderPlaceholder(question.body) === null) {
    faults.push({ kind: 'unanswered-question-as-ground', section, id });
  }
  return true;
}

/** The faults in the pre-decided section. */
// [::TICKET::] PX-222, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-222|PX-229) --for-spec --no-implementation-order`.
function faultsOfPreDecisions({ body, openIds, questions, section }) {
  const faults = [];
  const questionsByNumber = new Map(
    questions.filter((question) => question.number !== null).map((question) => [question.number, question]),
  );

  for (const item of splitItems(body, PREDECIDED_ITEM_HEADING)) {
    for (const [label, kind] of [
      [DECISION_LABEL, 'missing-decision'],
      [GROUND_LABEL, 'missing-ground'],
      [OVERRIDE_LABEL, 'missing-override'],
    ]) {
      if (labelledValue(item.body, label) === null) faults.push({ kind, section, id: item.id });
    }
    const ground = labelledValue(item.body, GROUND_LABEL);
    if (ground === null) continue;
    if (!faultsOfQuestionGround({ ground, questionsByNumber, faults, section, id: item.id }) && !GROUND_SOURCE.test(ground)) {
      faults.push({ kind: 'unresolvable-ground', section, id: item.id });
    }
    const openId = [...openIds].find((id) => mentionsId(ground, id));
    if (openId !== undefined) faults.push({ kind: 'open-item-as-ground', section, id: openId });
  }
  return faults;
}

/** The faults in the coverage of the recorded open items. */
// [::TICKET::] PX-222, PX-229, PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-222|PX-229|PX-230) --for-spec --no-implementation-order`.
function faultsOfCoverage({ ledger, recordedPoints }) {
  // Coverage is read from the ledger and not from the text: a point that a question binds and
  // an answer later settles is named in both sections, and that is the end state the loop
  // exists to reach, not a fault. What the rule refuses is a point left in no state at all.
  //
  // This rule ranges over the recorded points alone, never the widened universe. A point the
  // document adds is carried by its own block until a question binds it, so reading it here
  // would report it as a vanished point; and reading the widened universe would allow an added
  // point to hide a recorded point the document dropped.
  return recordedPoints
    .filter((item) => ledger.open.has(item.id))
    .map((item) => ({ kind: 'missing-open-item', section: null, id: item.id }));
}

/** The sections whose recorded digest is not the digest of the facts now on disk. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function faultsOfStaleDigests(recorded, digests) {
  return EXPLAIN_SECTION_FACTS.filter((entry) => recorded[entry.id]?.digest !== digests[entry.id].digest).map((entry) => ({
    kind: 'stale-digest',
    section: entry.id,
    id: null,
  }));
}

/**
 * Whether the explanation may be reported: complete, and written against the facts on disk.
 *
 * The two counts are returned alongside the verdict because the ratio between them is the
 * visible symptom of the failure this command exists to prevent. A document that asks the
 * human to decide everything the manifests already settled has handed back work that was
 * never the human's, and no structural rule can see that — but an operator reading "0
 * decided for the human, 11 left to the human" can, in one line, before the grill rather
 * than during it.
 *
 * @param {{ facts: object, explainText: string }} input
 * @returns {{ ok: boolean, faults: Array<object>, askedOfHuman: number, decidedForHuman: number }}
 */
export function verifyExplanation({ facts, explainText }) {
  const digests = computeFrameDigests(facts.infoSections);
  const recorded = readDigestBlock(explainText);
  const located = locateSections(explainText);
  const recordedPoints = collectOpenItems(facts.projection);
  const recordedIds = new Set(recordedPoints.map((item) => item.id));
  // The universe is the recorded open set together with the points the document adds, so a
  // question may bind a point the human raised, and an id in neither set is still refused.
  const universe = new Set([...recordedIds, ...readAddedPoints({ documentText: explainText }).map((point) => point.id)]);

  const faults = [
    ...faultsOfPrevious(located),
    ...(recorded === null ? [{ kind: 'missing-digest-block', section: null, id: null }] : faultsOfStaleDigests(recorded, digests)),
    ...findOpenMarkers(explainText).map((marker) => ({
      kind: 'open-marker',
      section: sectionOfLine(explainText, marker.line),
      id: null,
    })),
  ];

  const decisions = located.bodies[HUMAN_SECTION_ID] ?? '';
  const preDecisions = located.bodies[PREDECIDED_SECTION_ID] ?? '';
  const questions = splitItems(decisions, HUMAN_ITEM_HEADING).map((item) => ({
    ...item,
    number: questionNumberOf(item.heading),
  }));
  const ledger = deriveLedger({ documentText: explainText, projection: facts.projection });
  faults.push(...faultsOfDecisions({ body: decisions, universe, unsettledCount: ledger.unsettled.size, section: HUMAN_SECTION_ID }));
  faults.push(...faultsOfPreDecisions({ body: preDecisions, openIds: recordedIds, questions, section: PREDECIDED_SECTION_ID }));
  faults.push(...faultsOfCoverage({ ledger, recordedPoints }));
  faults.push(...faultsOfAddedPoints({ documentText: explainText, recordedIds }));

  const declared = declaredDecisionCount(explainText);
  if (declared !== countHumanDecisionItems(explainText)) {
    faults.push({ kind: 'count-mismatch', section: 'E1', id: null });
  }

  return {
    ok: faults.length === 0,
    faults,
    askedOfHuman: splitItems(decisions, HUMAN_ITEM_HEADING).length,
    decidedForHuman: splitItems(preDecisions, PREDECIDED_ITEM_HEADING).length,
  };
}
