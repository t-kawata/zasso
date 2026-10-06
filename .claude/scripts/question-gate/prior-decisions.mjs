/**
 * The four artifacts a package directory may already hold.
 *
 * A grill that asks what these already answer spends a human round to learn
 * nothing. Before any question is drafted, the directory and the directories of
 * the packages it shares a boundary with are read, and what each artifact decides
 * is put on the table as a ground.
 *
 * The reader and the directory listing are injected, so this module stays pure and
 * is asserted against a fixture rather than a workspace. Two rules follow from
 * that purity and are the module's whole point: presence is never a ground — only
 * a file's content decides anything — and an artifact that cannot be read settles
 * nothing rather than being salvaged into a guess.
 */
import { join } from 'node:path';

// The explanation's own vocabulary, taken from the module that writes it: the heading
// and the rule that recognises it are one definition, so a change to the spelling
// cannot reach the frame without reaching this reader.
import { PREDECIDED_ITEM_HEADING, isItemHeading } from '../explain-seed/lib/items.mjs';

/** The three seed artifacts, and the canonical RFC found beside them. */
export const PRIOR_ARTIFACTS = Object.freeze(['RFC-SEED.md', 'INFO-RFC-SEED.md', 'EXPLAIN-RFC-SEED.md']);

/** The canonical RFC: RFC.md or RFC-<SLUG>.md, which the seed RFC-SEED.md is not. */
const CANONICAL_RFC_PATTERN = /^RFC(-.*)?\.md$/;
const SEED_ARTIFACT = 'RFC-SEED.md';

const DECISION_LABEL = '決定';
const GROUND_LABEL = '根拠';

/** A `- 決定: …` line, which is how a labelled item states one of its parts. */
const LABELLED_LINE = /^-\s*([^:：]+)[:：]\s*(.*)$/;

const EXPLAIN_ARTIFACT = 'EXPLAIN-RFC-SEED.md';
const INFO_ARTIFACT = 'INFO-RFC-SEED.md';

/**
 * The labelled items of one explanation, in order.
 *
 * @param {string} text
 * @returns {Array<{ heading: string, labels: Record<string, string> }>}
 */
// [::TICKET::] PX-233, PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-233|PX-234) --for-spec --no-implementation-order`.
function readLabelledItems(text) {
  const items = [];
  let current = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('### ')) {
      current = { heading: line, labels: {} };
      items.push(current);
      continue;
    }
    if (current === null) continue;
    const match = line.match(LABELLED_LINE);
    if (match !== null) current.labels[match[1].trim()] = match[2].trim();
  }

  return items;
}

/**
 * The decisions an explanation carries: its 先に決めた items, each with its ground.
 *
 * @param {{ artifact: string, source: string, text: string }} input
 * @returns {Array<object>}
 */
// [::TICKET::] PX-233, PX-234, PX-237 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-233|PX-234|PX-237) --for-spec --no-implementation-order`.
function decisionsOfExplanation({ artifact, source, text }) {
  return readLabelledItems(text)
    .filter((item) => isItemHeading(item.heading, PREDECIDED_ITEM_HEADING))
    .filter((item) => (item.labels[GROUND_LABEL] ?? '') !== '')
    .map((item) => ({
      artifact,
      source,
      kind: 'decision',
      decision: item.labels[DECISION_LABEL] ?? '',
      ground: item.labels[GROUND_LABEL],
      statement: item.labels[DECISION_LABEL] ?? '',
    }));
}

/**
 * The grounds an artifact carries without deciding anything: its statements.
 *
 * A seed and the facts read out of it state what is; the AI still decides what
 * follows, so these are grounds rather than decisions.
 *
 * @param {{ artifact: string, source: string, text: string }} input
 * @returns {Array<object>}
 */
// [::TICKET::] PX-233, PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-233|PX-234) --for-spec --no-implementation-order`.
function groundsOfStatements({ artifact, source, text }) {
  const statements = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));

  return statements.map((statement) => ({
    artifact,
    source,
    kind: 'ground',
    decision: null,
    ground: null,
    statement,
  }));
}

/**
 * The decisions the canonical RFC states: each paragraph under its heading.
 *
 * The RFC is the canon, so what it states is a decision, and the ground is the
 * place it states it.
 *
 * @param {{ artifact: string, source: string, text: string }} input
 * @returns {Array<object>}
 */
// [::TICKET::] PX-233, PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-233|PX-234) --for-spec --no-implementation-order`.
function decisionsOfCanonicalRfc({ artifact, source, text }) {
  const entries = [];
  let heading = null;
  let paragraph = [];

  const flush = () => {
    const statement = paragraph.join(' ').trim();
    paragraph = [];
    if (statement === '' || heading === null) return;
    entries.push({
      artifact,
      source,
      kind: 'decision',
      decision: statement,
      ground: `${source}#${heading}`,
      statement,
    });
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('#')) {
      flush();
      heading = line.replace(/^#+\s*/, '');
      continue;
    }
    if (line === '') {
      flush();
      continue;
    }
    paragraph.push(line);
  }
  flush();

  return entries;
}

/**
 * The decisions one artifact carries, chosen by which artifact it is.
 *
 * @param {{ artifact: string, source: string, text: string }} input
 * @returns {Array<object>}
 */
// [::TICKET::] PX-233, PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-233|PX-234) --for-spec --no-implementation-order`.
function entriesOfArtifact({ artifact, source, text }) {
  if (artifact === EXPLAIN_ARTIFACT) return decisionsOfExplanation({ artifact, source, text });
  if (artifact === INFO_ARTIFACT || artifact === SEED_ARTIFACT) {
    return groundsOfStatements({ artifact, source, text });
  }
  return decisionsOfCanonicalRfc({ artifact, source, text });
}

/**
 * Every artifact a directory holds that this run must read before it may ask.
 *
 * @param {{ directory: string, listDirectory: (directory: string) => string[] }} input
 * @returns {string[]} filenames, in the order the three seeds are declared followed by the RFC
 */
// [::TICKET::] PX-233, PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-233|PX-234) --for-spec --no-implementation-order`.
function artifactNamesOf({ directory, listDirectory }) {
  const names = new Set(PRIOR_ARTIFACTS);
  for (const name of listDirectory(directory)) {
    if (CANONICAL_RFC_PATTERN.test(name) && name !== SEED_ARTIFACT) names.add(name);
  }
  return [...names];
}

/**
 * Read one directory's artifacts and return what they decide and which were read.
 *
 * The two facts are returned together because they are not the same fact: an artifact
 * that is read and decides nothing contributes no entry, and a caller that learned
 * only from the entries would report it as if it were absent — which is how an honest
 * settle trace naming it came to be refused.
 *
 * @param {{ directory: string, readFile: (path: string) => string|null, listDirectory: (directory: string) => string[] }} input
 * @returns {{ entries: Array<object>, artifactsRead: string[] }}
 */
// [::TICKET::] PX-233, PX-234, PX-237 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-233|PX-234|PX-237) --for-spec --no-implementation-order`.
function entriesOfDirectory({ directory, readFile, listDirectory }) {
  const entries = [];
  const artifactsRead = [];
  for (const artifact of artifactNamesOf({ directory, listDirectory })) {
    const source = join(directory, artifact);
    const text = readFile(source);
    // An artifact that cannot be read settles nothing. It is not salvaged into a
    // guess, because a guess here becomes a decision the human was never asked.
    if (typeof text !== 'string') continue;
    artifactsRead.push(artifact);
    entries.push(...entriesOfArtifact({ artifact, source, text }));
  }
  return { entries, artifactsRead };
}

/**
 * The decisions and grounds the package directory and its neighbours already hold,
 * together with the artifacts that were read to find them.
 *
 * A neighbour's explanation is read and never written: what the neighbour settled
 * is a ground for this package, and this package has no authority over it.
 *
 * @param {{
 *   directory: string,
 *   neighbours?: string[],
 *   readFile: (path: string) => string|null,
 *   listDirectory?: (directory: string) => string[],
 * }} input
 * @returns {{
 *   entries: Array<{ artifact: string, source: string, kind: 'decision'|'ground', decision: string|null, ground: string|null, statement: string }>,
 *   artifactsRead: string[],
 * }}
 */
export function priorScan({ directory, neighbours = [], readFile, listDirectory = () => [] }) {
  const scanned = entriesOfDirectory({ directory, readFile, listDirectory });
  const entries = [...scanned.entries];
  const artifactsRead = new Set(scanned.artifactsRead);
  for (const neighbour of neighbours) {
    const neighbourScan = entriesOfDirectory({ directory: neighbour, readFile, listDirectory });
    entries.push(...neighbourScan.entries);
    for (const artifact of neighbourScan.artifactsRead) artifactsRead.add(artifact);
  }
  return { entries, artifactsRead: [...artifactsRead] };
}

/**
 * The decisions and grounds the package directory and its neighbours already hold.
 *
 * @param {{
 *   directory: string,
 *   neighbours?: string[],
 *   readFile: (path: string) => string|null,
 *   listDirectory?: (directory: string) => string[],
 * }} input
 * @returns {Array<{ artifact: string, source: string, kind: 'decision'|'ground', decision: string|null, ground: string|null, statement: string }>}
 */
export function priorDecisions(input) {
  return priorScan(input).entries;
}
