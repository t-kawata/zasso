/**
 * The explanation's frame: the structure, the questions, and the places a person writes.
 *
 * This is the other half of a split the command exists to make. `render.mjs` states the
 * facts; this module writes a document addressed to a person, in which every point that
 * needs prose is an open `[::MUST-FILL::]` instruction for the AI, every point that needs
 * a human judgement carries a `<!-- 判断内容を人間が書き込む -->` place for them to write,
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
  INFO_SECTION_TITLES,
  MAX_LISTED_CLAUSES,
  truncateExcerpt,
} from './render.mjs';

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

/** The heading that opens one question for the human. */
export const HUMAN_ITEM_HEADING = '### 判断';

/** The heading that opens one thing already decided for them. */
export const PREDECIDED_ITEM_HEADING = '### 先に決めた';

/** The line that declares how many things the human is being asked to decide. */
export const COUNT_LABEL = '人間が決めること';

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

/** Separates an item's ordinal from the record it is about. */
const REFERENCE_SEPARATOR = ' — ';

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
 * Whether a text names this record.
 *
 * A plain substring test would not do: `boundary-001` is a substring of
 * `contract-boundary-001`, so a coverage check built on one would report an open item as
 * carried when only a longer, different id was there — and, worse, would report a decision
 * as resting on an undecided question whenever a contract id happened to end in one.
 *
 * @param {string} text
 * @param {string} id
 * @returns {boolean}
 */
export function mentionsId(text, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`).test(text);
}

/** The record an item's heading is about. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function referenceOf(heading) {
  const parts = heading.split(REFERENCE_SEPARATOR);
  return parts.length < 2 ? null : parts[parts.length - 1].trim();
}

/** One item's body, split from its heading. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function splitItems(sectionBodyText, heading) {
  const items = [];
  let current = null;
  for (const line of sectionBodyText.split('\n')) {
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
 * The value of a labelled line inside an item, or nothing when it is absent or unfilled.
 *
 * The answer sits on the line below its label rather than beside it. A label and an
 * instruction cannot share a line: the marker is only a marker when it is a line's first
 * token, so an instruction behind a label would read as a sentence that mentions one, and
 * the gate would neither see it nor be able to trust what it saw.
 */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function labelledValue(itemBody, label) {
  const lines = itemBody.split('\n');
  const prefix = `- ${label}:`;
  const index = lines.findIndex((line) => line.trimStart().startsWith(prefix));
  if (index < 0) return null;

  const inline = lines[index].slice(lines[index].indexOf(prefix) + prefix.length).trim();
  const collected = inline === '' ? [] : [inline];
  for (const line of lines.slice(index + 1)) {
    if (line.trim() === '' || line.startsWith('- ') || line.startsWith('#') || isPlaceholderLine(line)) break;
    if (markerOffsetOf(line) >= 0) break;
    collected.push(line.trim());
  }

  const value = collected.join(' ').trim();
  if (value === '' || value.includes(MUST_FILL_MARKER) || value.includes(HUMAN_PLACEHOLDER)) return null;
  return value;
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

/** The sections of a document that was written by an earlier run. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function locateSections(documentText) {
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
  const questions = projection.grill.questions.map((entry) => ({
    id: entry.residual_id,
    kind: 'residual',
    topic: entry.topic,
    whyUnresolved: entry.why_unresolved,
    contracts: [],
  }));
  const boundaries = projection.grill.risky_boundaries.map((entry) => ({
    id: entry.id,
    kind: 'boundary',
    topic: entry.topic,
    whyUnresolved: null,
    contracts: projection.contracts.filter((contract) => contract.boundary_id === entry.id),
  }));
  return [...questions, ...boundaries];
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
  return [...clauses, ...forbidden, ...obligations, ...ports];
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

/** The line that says which facts moved under one human decision, above its placeholder. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function renderMovedFactsForItem(movedFacts) {
  const named = movedFacts.map((id) => `INFO ${id.replace('I', '')}「${INFO_SECTION_TITLES[id]}」`).join('、');
  return `> ※ この判断の説明が依拠していた事実（${named}）が変わったため、説明は書き直しました。人間が書いたメモはそのまま残しています。`;
}

/** The contract that governs a risky boundary, with the clauses stage two already settled. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function renderRecordedContracts(item) {
  if (item.contracts.length === 0) {
    return [`- この境界を定めている契約: ${ABSENT_SECTION_STATEMENT}`];
  }

  const lines = [];
  for (const contract of item.contracts) {
    const direction = DIRECTION_NAMES[contract.direction] ?? contract.direction;
    lines.push(
      `- この境界を定めている契約: ${contract.contract_id}（${direction} / ${contract.connection_kind ?? '種別未記載'}）— 相手 ${contract.counterpart}`,
    );
    const clauses = contract.clauses.slice(0, MAX_LISTED_CLAUSES);
    for (const clause of clauses) {
      lines.push(`  - すでに決まっていること（clauses.${clause.name}）: ${truncate(clause.text)}`);
    }
    const clausesLeft = contract.clauses.length - clauses.length;
    if (clausesLeft > 0) lines.push(`  ${renderRemainder(clausesLeft)}`);
  }
  return lines;
}

/** One question for the human, with the recorded material behind it and a place to answer. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function renderHumanItem({ item, index, note, movedFacts }) {
  const lines = [`${HUMAN_ITEM_HEADING} H${index + 1}${REFERENCE_SEPARATOR}${item.id}`, ''];
  if (item.topic !== null) lines.push(`- 記録された論点: ${truncate(item.topic)}`);
  if (item.whyUnresolved !== null) lines.push(`- 未解決とされた理由: ${truncate(item.whyUnresolved)}`);
  lines.push(...renderRecordedContracts(item));
  lines.push(
    `${MUST_FILL_MARKER} 何を決めるのか — 専門用語をできるだけ使わず2〜3文。事実に書いてあることをもう一度書かない。もしこの判断が事実と慣習だけで決まるなら、ここには書かず「${FRAME_SECTIONS[5].title}」へ移し、${DECISION_LABEL}・${GROUND_LABEL}・${OVERRIDE_LABEL}を書く（工学判断を人間に投げ返さない）。`,
    '',
    `- ${PARTY_LABEL}:`,
    `  ${MUST_FILL_MARKER} ${PARTY_LABEL} — 後続のエンジニア / AI / 利用者のどれの体験が、どう変わるか。「影響があります」で終わらせない。`,
    `- ${HARM_LABEL}:`,
    `  ${MUST_FILL_MARKER} ${HARM_LABEL} — 決めずに実装が進むと現場で具体的に何が起きるか。「問題になります」で終わらせない。`,
    '',
  );
  if (movedFacts.length > 0) lines.push(renderMovedFactsForItem(movedFacts));
  lines.push(HUMAN_PLACEHOLDER);
  if (note !== null && note !== '') lines.push(note);
  lines.push('');
  return lines;
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
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function renderGlossaryEntry(term) {
  const at = term.line_start === null || term.line_start === undefined ? '' : `（仕様 ${term.line_start} 行目）`;
  const context = String(term.context ?? '').trim();
  return [
    `- \`${term.canonical_name}\`（${term.classification ?? '分類未記載'}）${at}`,
    ...(context === '' ? [] : [`  > ${truncate(context)}`]),
    `  ${MUST_FILL_MARKER} 用語 — この語を、この設計を知らない人に1〜2文で。仕様の言い換えではなく、なぜその語が必要なのかを書く。`,
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
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
  E2(material) {
    const { facts, movedFacts } = material;
    return [
      `- 全体は ${facts.projection.totals.packages} パッケージ・${facts.projection.totals.layers} 層・${facts.projection.totals.boundaries} 境界。`,
      '',
      ...renderMovedFacts(movedFacts),
      `${MUST_FILL_MARKER} なぜこの位置なのか — 何の前に来る必要があり、何がこの後に来るのかを、順番が決まっている理由として書く。並行可否を並べるだけにしない。`,
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
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
  E5(material) {
    const { humanDecisionItems } = material;
    if (humanDecisionItems.length === 0) return [ABSENT_RESIDUALS_STATEMENT, ''];
    return humanDecisionItems.flatMap((item) => [...item.text.split('\n')]);
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

/** What a person wrote in an earlier document, keyed by the record the item was about. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function collectHumanNotes({ located, faults }) {
  const notes = {};
  if (located === null) return notes;

  for (const [id, body] of Object.entries(located.bodies)) {
    for (const item of splitItems(body, HUMAN_ITEM_HEADING)) {
      if (item.id === null) continue;
      if (countPlaceholdersIn(item.body) !== 1) {
        faults.push({ kind: 'unreadable-section', section: id, id: item.id });
        continue;
      }
      const note = readHumanNote(item.body);
      if (note !== null && note !== '') notes[item.id] = note;
    }
  }
  return notes;
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
  const openItems = collectOpenItems(facts.projection);
  const preDecided = collectPreDecidedItems(facts);

  const faults = faultsOfPrevious(located);
  const notes = collectHumanNotes({ located, faults });
  const keptSections = [];
  const reopenedSections = [];
  const humanDecisionItems = openItems.map((item, index) => ({
    id: item.id,
    text: renderHumanItem({ item, index, note: notes[item.id] ?? null, movedFacts: moved.E5 ?? [] }).join('\n'),
  }));

  const chunks = FRAME_SECTIONS.map((section) => {
    const previousBody = located?.bodies[section.id];
    const kept = recorded !== null && previousBody !== undefined && recorded[section.id]?.digest === digests[section.id].digest;
    if (kept) {
      keptSections.push(section.id);
      return `## ${section.title}\n\n${previousBody}`;
    }
    reopenedSections.push(section.id);
    return renderFrameSection({
      section,
      material: { facts, openItems, preDecided, notes, movedFacts: moved[section.id] ?? [], humanDecisionItems },
    });
  });

  const header = [
    `# RFC-SEED の解説: ${facts.projection.identity.name}（${facts.projection.identity.id}）`,
    '',
    'これから grill を始める人が、この seed が全体のどこで何を担っているかを先に掴むための文書です。',
    '事実そのものは同じディレクトリの `INFO-RFC-SEED.md` にあり、この文書はそれを説明したものです。',
    '`[::MUST-FILL::]` はAIが説明を書く箇所、`<!-- 判断内容を人間が書き込む -->` は人間が判断を書き込む箇所です。',
    '',
    `- 対象の seed: \`${facts.seedPath}\``,
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
  const body = located.bodies.E5 ?? '';
  return splitItems(body, HUMAN_ITEM_HEADING).length;
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

/** The faults in the human-decision section. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function faultsOfDecisions({ body, openItems, section }) {
  const faults = [];
  const openIds = new Set(openItems.map((item) => item.id));

  for (const item of splitItems(body, HUMAN_ITEM_HEADING)) {
    if (item.id === null || !openIds.has(item.id)) {
      faults.push({ kind: 'unrecorded-decision', section, id: item.id });
    }
    const placeholders = countPlaceholdersIn(item.body);
    if (placeholders === 0) faults.push({ kind: 'missing-placeholder', section, id: item.id });
    if (placeholders > 1) faults.push({ kind: 'duplicate-placeholder', section, id: item.id });
    if (labelledValue(item.body, PARTY_LABEL) === null) faults.push({ kind: 'unnamed-party', section, id: item.id });
  }
  return faults;
}

/** The faults in the pre-decided section. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function faultsOfPreDecisions({ body, openIds, section }) {
  const faults = [];
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
    if (!GROUND_SOURCE.test(ground)) faults.push({ kind: 'unresolvable-ground', section, id: item.id });
    const openId = [...openIds].find((id) => mentionsId(ground, id));
    if (openId !== undefined) faults.push({ kind: 'open-item-as-ground', section, id: openId });
  }
  return faults;
}

/** The faults in the coverage of the recorded open items. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function faultsOfCoverage({ decisions, preDecisions, openItems }) {
  const faults = [];
  for (const item of openItems) {
    const asked = mentionsId(decisions, item.id);
    const decided = mentionsId(preDecisions, item.id);
    if (!asked && !decided) faults.push({ kind: 'missing-open-item', section: null, id: item.id });
    if (asked && decided) faults.push({ kind: 'open-item-in-both-sections', section: null, id: item.id });
  }
  return faults;
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
 * never theirs, and no structural rule can see that — but an operator reading "0 decided,
 * 11 left to them" can, in one line, before the grill rather than during it.
 *
 * @param {{ facts: object, explainText: string }} input
 * @returns {{ ok: boolean, faults: Array<object>, askedOfHuman: number, decidedForHuman: number }}
 */
export function verifyExplanation({ facts, explainText }) {
  const digests = computeFrameDigests(facts.infoSections);
  const recorded = readDigestBlock(explainText);
  const located = locateSections(explainText);
  const openItems = collectOpenItems(facts.projection);
  const openIds = new Set(openItems.map((item) => item.id));

  const faults = [
    ...faultsOfPrevious(located),
    ...(recorded === null ? [{ kind: 'missing-digest-block', section: null, id: null }] : faultsOfStaleDigests(recorded, digests)),
    ...findOpenMarkers(explainText).map((marker) => ({
      kind: 'open-marker',
      section: sectionOfLine(explainText, marker.line),
      id: null,
    })),
  ];

  const decisions = located.bodies.E5 ?? '';
  const preDecisions = located.bodies.E6 ?? '';
  faults.push(...faultsOfDecisions({ body: decisions, openItems, section: 'E5' }));
  faults.push(...faultsOfPreDecisions({ body: preDecisions, openIds, section: 'E6' }));
  faults.push(...faultsOfCoverage({ decisions, preDecisions, openItems }));

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
