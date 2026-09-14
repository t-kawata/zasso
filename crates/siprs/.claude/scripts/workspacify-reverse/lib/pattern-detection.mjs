// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
/**
 * Which of the four declared patterns a subject is, read from the disk.
 *
 * Design 1.1 distinguishes the four patterns "by what conver scaffolding
 * already exists on disk, and by nothing else", and 5.4's Step 0 states the two
 * prohibitions this module is built around: the pattern is read from the
 * filesystem and never asked for, and it is **not a gate**. Both are properties
 * of the shape rather than of a promise — the detection takes an artefact list
 * and returns a value, touching no disk of its own, and nothing downstream may
 * branch on the value it returns.
 *
 * The declarations live here as data: the marker tables and the rule table are
 * frozen, so adding a marker is adding a string to a list rather than a fifth
 * `if` block that the fifth marker would have to be remembered in.
 *
 * The input is `listArtefacts`'s own output — the records with `path`, `kind`,
 * `size`, `readStatus` and `exclusion` — rather than a second walk. That is what
 * keeps the detection and the boundary from disagreeing about what is on disk.
 */
import { compareText } from './holdout-ledger.mjs';
import { languageOfPath } from './analysis-tech.mjs';

/** The name the detection is published under, so the writer and the reader agree. */
export const PATTERN_FILE_NAME = 'PATTERN.json';

/**
 * The four patterns, in design 1.1 order.
 *
 * `name` is what a report states. It is deliberately short: the label a human
 * reads belongs in the design document, and a copy of it here would be a second
 * place to keep in step.
 */
export const PATTERNS = Object.freeze([
  Object.freeze({ id: 'pattern-1', name: 'Pattern 1' }),
  Object.freeze({ id: 'pattern-2', name: 'Pattern 2' }),
  Object.freeze({ id: 'pattern-3', name: 'Pattern 3' }),
  Object.freeze({ id: 'pattern-4', name: 'Pattern 4' }),
]);

/**
 * The three ways a reading can end.
 *
 * `pattern` carries one of the four identifiers. The other two are different
 * statements and are kept different: `NO_PATTERN` is "the instrument looked and
 * found none of the four", `UNREADABLE_ROOT` is "the instrument could not look".
 * Collapsing them would make an unclassifiable project read as pattern 1, which
 * is the most permissive answer and therefore the most dangerous one.
 */
export const PATTERN_STATES = Object.freeze({
  NO_PATTERN: 'undetermined',
  UNREADABLE_ROOT: 'unreadable_root',
});

/** A specification is long from this many bytes up. Pinned by a boundary test. */
export const LONG_SPECIFICATION_MIN_BYTES = 2048;

/** Extensions a specification may be written in. A file that is not one is not a specification. */
export const DOCUMENT_EXTENSIONS = Object.freeze(['.md', '.markdown', '.txt', '.rst', '.adoc']);

/** The marker that says the subject carries implementation. */
const PROJECT_SOURCE_MARKER = 'project-source';

/** The marker that says the subject carries a long specification. */
const LONG_SPECIFICATION_MARKER = 'long-specification';

/** The basename of a path, which is what the artefact-name markers are written against. */
// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
function basenameOf(relativePath) {
  const segments = relativePath.split('/');
  return segments[segments.length - 1];
}

/** True when the path names a file at the top level of the subject. */
// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
function isAtRoot(relativePath) {
  return !relativePath.includes('/');
}

/**
 * Whether an artefact belongs to the population a pattern may be read from.
 *
 * An excluded tree and an unreadable entry are both recorded by the walk and
 * neither is evidence: a vendored `src/lib.rs` says nothing about what the
 * subject is, and an entry the walk could not read is a file that is there but
 * was not measured. Dropping them is what keeps "out of scope" from being read
 * as "part of the project".
 */
// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
function isMeasured(artefact) {
  return artefact.exclusion !== true && artefact.readStatus === 'readable';
}

// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
function defineMarker(id, searched, matches) {
  return Object.freeze({ id, searched, matches });
}

/**
 * The conver scaffolding design 1.1 names, declared once.
 *
 * Each marker is searched over the whole subject; the root-only reading is a
 * condition's business rather than a marker's, because the same artefact name is
 * asked two questions — "does the root hold this?" for pattern 2, and "does this
 * exist at all?" for pattern 3.
 */
export const CONVER_MARKERS = Object.freeze([
  defineMarker('root-rfc', 'RFC-*.md', (artefact) => /^RFC-.*\.md$/.test(basenameOf(artefact.path))),
  defineMarker('root-graph', '*-GRAPH.json', (artefact) => /-GRAPH\.json$/.test(basenameOf(artefact.path))),
  defineMarker('root-dirs-tree', '*-Dirs-Tree.json', (artefact) => /-Dirs-Tree\.json$/.test(basenameOf(artefact.path))),
  defineMarker('root-tickets', 'Tickets.json', (artefact) => basenameOf(artefact.path) === 'Tickets.json'),
  defineMarker('root-designtree', 'DesignTree.json', (artefact) => basenameOf(artefact.path) === 'DesignTree.json'),
  defineMarker('seed', 'RFC-SEED.md', (artefact) => basenameOf(artefact.path) === 'RFC-SEED.md'),
  defineMarker('manifest', 'WORKSPACIFY-*MANIFEST*', (artefact) => /^WORKSPACIFY-.*MANIFEST/.test(basenameOf(artefact.path))),
]);

/**
 * The two shapes that separate a pattern from a subject carrying no pattern.
 *
 * Design 1.1's entries for patterns 1 and 4 are not written as artefact names —
 * they are "independently implemented" and "empty, plus a long specification
 * document" — so the difference between them is what the project *is* rather
 * than which conver file it holds.
 *
 * "Implemented" is read as source in one of the six declared languages, which is
 * the same declaration R0 already classifies a tree by. A build manifest is
 * deliberately not evidence: a repository holding a `Cargo.toml` and no source
 * has not been implemented, and counting the manifest would make the emptiest
 * subject look like the most permissive pattern.
 */
export const SHAPE_MARKERS = Object.freeze([
  defineMarker(
    PROJECT_SOURCE_MARKER,
    'a source file in one of the six declared languages',
    (artefact) => languageOfPath(artefact.path) !== 'unknown',
  ),
  defineMarker(
    LONG_SPECIFICATION_MARKER,
    `a document of at least ${LONG_SPECIFICATION_MIN_BYTES} bytes`,
    (artefact) => DOCUMENT_EXTENSIONS.includes(extensionOf(artefact.path))
      && typeof artefact.size === 'number'
      && artefact.size >= LONG_SPECIFICATION_MIN_BYTES,
  ),
]);

/** The extension a path ends in, or the empty string when it names none. */
// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
function extensionOf(relativePath) {
  const name = basenameOf(relativePath);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot);
}

/** The five root artefacts whose presence together is pattern 2's criterion. */
export const ROOT_LAYER_SET = Object.freeze([
  'root-rfc', 'root-graph', 'root-dirs-tree', 'root-tickets', 'root-designtree',
]);

const CONVER_MARKER_IDS = Object.freeze(CONVER_MARKERS.map((entry) => entry.id));

/** Every marker the declaration names, in declaration order and without repeats. */
export const SEARCHED_MARKERS = Object.freeze([...CONVER_MARKERS, ...SHAPE_MARKERS]);

/** The same markers by identifier, which is what a detection's record carries. */
const SEARCHED_MARKER_IDS = Object.freeze(SEARCHED_MARKERS.map((entry) => entry.id));

/**
 * A condition over the hits a reading produced.
 *
 * `at` selects which hit a marker is asked about: `'root'` is the top level of
 * the subject, `'anywhere'` is the whole measured tree. Each condition renders
 * both the verdict it decides and the material it decided on, so the presence
 * and absence lists are derived from the declaration rather than assembled
 * beside it.
 */
// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
function defineCondition(kind, markerIds, { at = 'anywhere', expected = 'present', quantifier = 'every' } = {}) {
  const satisfied = (hits, id) => (hitFor(hits, id, at) !== null) === (expected === 'present');
  const decide = quantifier === 'some' ? markerIds.some.bind(markerIds) : markerIds.every.bind(markerIds);
  return Object.freeze({
    kind,
    markerIds: Object.freeze([...markerIds]),
    at,
    expected,
    quantifier,
    /**
     * True when the hits satisfy this condition.
     *
     * The quantifier is stated rather than inferred from the kind, because
     * "some conver artefact exists" and "every conver artefact exists" are the
     * two claims that separate pattern 3 from pattern 2, and a reader should not
     * have to know which word a kind name implies.
     */
    holds: (hits) => decide((id) => satisfied(hits, id)),
    /**
     * The material this condition contributes.
     *
     * Which list a marker lands in is decided by what was found, never by what
     * the condition expected: a marker named by a `noneOf` condition is absent
     * for the same reason a marker named by `anyOf` is present — because the
     * walk did or did not reach it. The expectation decides only whether the row
     * matches, which is why an unmet condition can never produce a present entry.
     */
    material: (hits, markerById) => markerIds.map((id) => {
      const hit = hitFor(hits, id, at);
      return hit === null
        ? { list: 'absent', entry: { marker: id, searched: markerById.get(id).searched } }
        : { list: 'present', entry: { marker: id, path: hit.path, scope: hit.scope } };
    }),
  });
}

/** The hit a marker produced at the scope a condition asks about, or null. */
// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
function hitFor(hits, markerId, at) {
  const hit = hits.get(markerId);
  if (hit === undefined) return null;
  return at === 'root' ? (hit.root ?? null) : hit.any;
}

/**
 * The rule table. The first row whose conditions all hold wins, so the order is
 * the precedence and it is written here rather than implied by nesting.
 *
 * Pattern 3 sits above pattern 1 because "some conver artefacts" is more
 * specific than "none, but it is a project"; patterns 1 and 4 name `noneOf` of
 * the conver markers as well, so each row can be read on its own without
 * consulting the rows above it.
 */
export const PATTERN_RULES = Object.freeze([
  defineRule('pattern-2', [defineCondition('rootSet', ROOT_LAYER_SET, { at: 'root' })]),
  defineRule('pattern-3', [defineCondition('anyOf', CONVER_MARKER_IDS, { quantifier: 'some' })]),
  defineRule('pattern-1', [
    defineCondition('isPresent', [PROJECT_SOURCE_MARKER]),
    defineCondition('noneOf', CONVER_MARKER_IDS, { expected: 'absent' }),
  ]),
  defineRule('pattern-4', [
    defineCondition('isPresent', [LONG_SPECIFICATION_MARKER]),
    defineCondition('isAbsent', [PROJECT_SOURCE_MARKER], { expected: 'absent' }),
    defineCondition('noneOf', CONVER_MARKER_IDS, { expected: 'absent' }),
  ]),
]);

/** One row of the declaration, with the markers it names gathered once. */
// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
function defineRule(id, conditions) {
  return Object.freeze({
    id,
    conditions: Object.freeze(conditions),
    markerIds: Object.freeze([...new Set(conditions.flatMap((entry) => entry.markerIds))]),
  });
}

/** The markers each rule names. The declaration a pattern is answered against. */
export const PATTERN_MARKERS = Object.freeze(Object.fromEntries(
  PATTERN_RULES.map((rule) => [rule.id, rule.markerIds]),
));

/**
 * The markers a state is answered against.
 *
 * A rule hands back the markers it names. A subject that matched none is
 * answered against the whole searched set, because that is what its `absent`
 * list carries; a subject that could not be read is answered against nothing,
 * because nothing was searched. A caller can therefore pair this with a
 * detection's `present` and `absent` lists and always read one declaration.
 */
export function listPatternMarkers(patternId) {
  const declared = PATTERN_MARKERS[patternId];
  if (declared !== undefined) return declared;
  return patternId === PATTERN_STATES.NO_PATTERN ? SEARCHED_MARKER_IDS : [];
}

const MARKER_BY_ID = new Map(SEARCHED_MARKERS.map((entry) => [entry.id, entry]));

/**
 * Every marker's hits over a measured artefact list.
 *
 * The hit kept for a marker is the lexicographically smallest matching path,
 * not the first one the walk happened to reach. The walk's order is deterministic
 * today, but a function whose answer depends on it would change its `PATTERN.json`
 * the first time the walk changed, and "the same list yields the same answer" is
 * a property this module claims outright.
 */
// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
function collectHits(artefacts) {
  const hits = new Map();
  for (const artefact of artefacts) {
    if (!isMeasured(artefact)) continue;
    for (const entry of SEARCHED_MARKERS) {
      if (!entry.matches(artefact)) continue;
      const scope = isAtRoot(artefact.path) ? 'root' : 'nested';
      const hit = { path: artefact.path, scope };
      const recorded = hits.get(entry.id) ?? { root: null, any: null };
      hits.set(entry.id, {
        root: scope === 'root' && isEarlier(hit, recorded.root) ? hit : recorded.root,
        any: isEarlier(hit, recorded.any) ? hit : recorded.any,
      });
    }
  }
  return hits;
}

/** Whether a candidate path precedes the one already recorded, or there is none. */
// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
function isEarlier(candidate, recorded) {
  return recorded === null || compareText(candidate.path, recorded.path) < 0;
}

/** The detection's evidence list: one entry per declared marker, found or not. */
// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
function buildEvidence(hits) {
  return SEARCHED_MARKERS.map((entry) => {
    const hit = hits.get(entry.id)?.any ?? null;
    return {
      marker: entry.id,
      searched: entry.searched,
      path: hit === null ? null : hit.path,
      scope: hit === null ? null : hit.scope,
      found: hit !== null,
    };
  });
}

/** The presence and absence lists a matched rule decided, in declaration order. */
// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
function buildMaterial(rule, hits) {
  const present = [];
  const absent = [];
  for (const entry of rule.conditions) {
    for (const contribution of entry.material(hits, MARKER_BY_ID)) {
      (contribution.list === 'present' ? present : absent).push(contribution.entry);
    }
  }
  return { present, absent };
}

/** What the reader gets when the instrument could not look at all. */
// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
function unreadableResult({ root, reason }) {
  return Object.freeze({
    root,
    state: PATTERN_STATES.UNREADABLE_ROOT,
    pattern: null,
    name: PATTERN_STATES.UNREADABLE_ROOT,
    present: [],
    absent: [],
    evidence: [],
    markersSearched: SEARCHED_MARKER_IDS,
    unreadablePath: root,
    reason,
  });
}

/** What the reader gets when the instrument looked over a readable subject and found none of the four. */
// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
function noPatternResult({ root, hits }) {
  return Object.freeze({
    root,
    state: PATTERN_STATES.NO_PATTERN,
    pattern: null,
    name: PATTERN_STATES.NO_PATTERN,
    present: [],
    absent: SEARCHED_MARKERS.map((entry) => ({ marker: entry.id, searched: entry.searched })),
    evidence: buildEvidence(hits),
    markersSearched: SEARCHED_MARKER_IDS,
    unreadablePath: null,
    reason: null,
  });
}

/**
 * Which of the four declared patterns the subject is.
 *
 * @param {{root: string, artefacts: Array<object>}} input — the root being
 *   identified, for the record, and the artefact list the walk returned. No
 *   other input exists: the function reads no disk, no clock, no environment
 *   variable and no random source.
 * @returns {object} the detection, as `PATTERN.json` carries it
 */
export function detectPattern({ root, artefacts } = {}) {
  const artefactList = Array.isArray(artefacts) ? artefacts : [];
  const rootEntry = artefactList.find((entry) => entry.path === root && entry.readStatus !== 'readable');
  if (rootEntry !== undefined) {
    return unreadableResult({ root, reason: rootEntry.reason ?? null });
  }

  const hits = collectHits(artefactList);
  const rule = PATTERN_RULES.find((candidate) => candidate.conditions.every((entry) => entry.holds(hits)));
  if (rule === undefined) {
    return noPatternResult({ root, hits });
  }

  const { present, absent } = buildMaterial(rule, hits);
  return Object.freeze({
    root,
    state: rule.id,
    pattern: rule.id,
    name: PATTERNS.find((entry) => entry.id === rule.id).name,
    present,
    absent,
    evidence: buildEvidence(hits),
    markersSearched: SEARCHED_MARKER_IDS,
    unreadablePath: null,
    reason: null,
  });
}

/** One line per marker that was searched and not found. */
// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
function renderAbsence(absent) {
  return absent.map((entry) => `- \`${entry.searched}\` — searched, not found`);
}

/** One line per marker that was found, naming the path that evidenced it. */
// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
function renderPresence(present) {
  return present.map((entry) => `- \`${entry.marker}\`: \`${entry.path}\` (${entry.scope})`);
}

/**
 * The detection as Markdown, for the report a human reads.
 *
 * The absence list is rendered in full rather than counted: the reader has to be
 * able to re-derive the answer from what the run published, and "three markers
 * were absent" cannot be re-derived from.
 */
export function renderPatternDetection(detection) {
  if (detection.state === PATTERN_STATES.UNREADABLE_ROOT) {
    return [
      '## The pattern this subject is',
      '',
      `The subject could not be read, so no pattern was identified. Path: \`${detection.unreadablePath}\`.`,
      detection.reason === null ? '' : `Reason recorded by the walk: ${detection.reason}`,
      '',
    ].join('\n');
  }

  const lines = [
    '## The pattern this subject is',
    '',
    detection.state === PATTERN_STATES.NO_PATTERN
      ? 'Undetermined — none of the four declared patterns matched this subject. Every marker that was'
        + ' searched is named below, so the answer can be re-derived rather than taken on trust.'
      : `\`${detection.pattern}\` — ${detection.name}. Read from the filesystem; it is not a gate, and no`
        + ' stage below branches on it (design 1.1 and 1.2).',
    '',
  ];

  if (detection.present.length > 0) {
    lines.push('What was found:', '', ...renderPresence(detection.present), '');
  }
  if (detection.absent.length > 0) {
    lines.push('What was searched for and not found:', '', ...renderAbsence(detection.absent), '');
  }
  return lines.join('\n');
}
