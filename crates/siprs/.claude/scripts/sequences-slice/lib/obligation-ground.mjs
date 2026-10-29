/**
 * Whether a ground names evidence the workspace holds.
 *
 * A ground is what makes a recorded judgment reviewable, so a ground that names nothing is an
 * assertion wearing the shape of a citation. This module answers the one question that can be
 * decided about it: does every reference it carries point at something the artifact holds.
 *
 * It deliberately cannot answer the question one step further on — whether the line a ground
 * cites says what the ground says it says. That would be a reading of the specification, and a
 * resolver that read as if it had checked the claim would be worse than no resolver, because a
 * reviewer would stop looking. The caller prints the limit rather than leaving it to be inferred.
 *
 * Nothing here knows a project. The identifiers a ground may cite are the ones the artifact it
 * is resolved against carries, and the families that make a wrong citation visible are derived
 * from those identifiers rather than declared: an artifact whose sections are named s1 and s2
 * recognises s99 as a citation that does not resolve, and one whose sections are named
 * h-000002 recognises h-000099, with no list in this file naming either.
 */

/** The forms a reference takes, kept beside the reader so a reviewer sees the vocabulary once. */
export const REFERENCE_FORMS = Object.freeze(['line', 'line-range', 'artifact-id', 'unit-id', 'section']);

/**
 * The shape of a section number: at least one dotted level.
 *
 * A bare integer is deliberately not this shape. A number standing alone is as likely to be a
 * count, a version or a year, and reading it as a section would make every prose sentence carrying
 * a figure a citation that must resolve — which would refuse grounds nobody wrote as citations.
 */
const SECTION_NUMBER = /^\d+(?:\.\d+)+$/;

/** The numeric prefix a heading carries, which is the label a section citation spells. */
const HEADING_NUMBER = /^(\d+(?:\.\d+)*)\b/;

/** An ATX heading, with the text that follows its hashes. */
const HEADING = /^#{1,6}\s+(.*\S)\s*$/;

/** A line or a line range, which is the form the corpus writes: `line 412`, `lines 255-260`. */
const LINE_REFERENCE = /\blines?\s+(\d+)(\s*-\s*(\d+))?/gi;

/** A token that may be a reference: an identifier, a dotted name, or a unit id. */
const TOKEN = /[A-Za-z0-9_.:@-]+/g;

/** The prefixes a unit id carries, and the artifact identifier each one is resolved against. */
const UNIT_KIND_BY_PREFIX = Object.freeze({
  'op-': 'operations',
  'seq-': 'sequences',
  'xdir-': 'sequences',
  'ctr-': null,
  'obl-': null,
});

/** The digit suffix that turns a set of identifiers into a family a wrong citation can be seen in. */
const TRAILING_DIGITS = /^(.*?)(\d+)$/;

/**
 * The identifiers one artifact holds, as the sets a reference is resolved against.
 *
 * A set per kind rather than one set, because a unit id names a kind by its prefix: `seq-G-1`
 * resolves against the sequences and not against whatever else happens to be called `G-1`.
 *
 * @param {{ sections?: object[], operations?: object[], sequences?: object[] }} artifact
 * @returns {{ sections: Set<string>, operations: Set<string>, sequences: Set<string> }}
 */
// [::TICKET::] PX-261, PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-261|PX-263) --for-spec --no-implementation-order`.
function identifiersOf(artifact) {
  const idsOf = (field) => new Set((artifact?.[field] ?? []).map((entry) => String(entry?.id ?? '')).filter((id) => id.length > 0));
  return { sections: idsOf('sections'), operations: idsOf('operations'), sequences: idsOf('sequences') };
}

/**
 * The prefixes an artifact's own identifiers imply.
 *
 * A wrong citation is only visible against a family, and the family is a property of the
 * artifact: identifiers that end in digits share the prefix before them. An artifact naming
 * its sections h-000002 makes h-000099 visibly a citation of the same family that the artifact
 * does not hold, while `s99` stays prose — which is the honest answer for a document that has
 * never used that spelling.
 *
 * @param {{ sections: Set<string>, operations: Set<string>, sequences: Set<string> }} identifiers
 * @returns {string[]}
 */
// [::TICKET::] PX-261, PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-261|PX-263) --for-spec --no-implementation-order`.
function familiesOf(identifiers) {
  const families = new Set();
  for (const ids of Object.values(identifiers)) {
    for (const id of ids) {
      const match = TRAILING_DIGITS.exec(id);
      if (match !== null && match[1].length > 0) families.add(match[1]);
    }
  }
  return [...families].filter((prefix) => prefix.length > 0);
}

/** Every line reference a ground carries, with the line it names and the way it writes it. */
// [::TICKET::] PX-261, PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-261|PX-263) --for-spec --no-implementation-order`.
function lineReferencesIn(ground) {
  const references = [];
  for (const match of String(ground).matchAll(LINE_REFERENCE)) {
    const first = Number(match[1]);
    const last = match[3] === undefined ? first : Number(match[3]);
    references.push({
      index: match.index,
      span: match[0].length,
      text: match[2] === undefined ? `line ${first}` : `line ${first}-${last}`,
      first,
      last,
    });
  }
  return references;
}

/** Whether an index falls inside one of the line references already found. */
// [::TICKET::] PX-261, PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-261|PX-263) --for-spec --no-implementation-order`.
function insideALineReference(index, lineReferences) {
  return lineReferences.some((reference) => index >= reference.index && index < reference.index + reference.span);
}

/** Whether a line reference names a line the artifact has. */
// [::TICKET::] PX-261, PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-261|PX-263) --for-spec --no-implementation-order`.
function resolvesLine(reference, lineCount) {
  if (!Number.isInteger(lineCount)) return false;
  return reference.first >= 1 && reference.last >= reference.first && reference.last <= lineCount;
}

/**
 * What a token is to an artifact: something the artifact holds, a citation it contradicts, or a word.
 *
 * A unit id names its kind by its prefix, so `seq-G-1` is looked up among the sequences rather
 * than among whatever else is called `G-1`. The two prefixes whose ids live outside the artifact
 * — a boundary and a declared surface are named by the stage-2 manifest and by the package views
 * — answer as citations this resolver cannot confirm, which is the fail-closed answer: the author
 * adds the line the specification states it on, or the judgment is not evidence yet.
 *
 * @param {string} token
 * @param {{ sections: Set<string>, operations: Set<string>, sequences: Set<string> }} identifiers
 * @param {string[]} families
 * @returns {'held'|'dangling'|'prose'}
 */
// [::TICKET::] PX-261, PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-261|PX-263) --for-spec --no-implementation-order`.
function classifyToken(token, identifiers, families, sections = null) {
  if (identifiers.sections.has(token) || identifiers.operations.has(token) || identifiers.sequences.has(token)) return 'held';

  // A section citation is answered by the labels the citing document carries, and only when the
  // caller supplied them. With no labels the token falls through to the families and ends as prose,
  // which is the answer this resolver gave before it knew the form — so a caller that does not care
  // about sections reads exactly what it read before.
  if (sections !== null && SECTION_NUMBER.test(token)) return sections.has(token) ? 'held' : 'dangling';

  const prefix = Object.keys(UNIT_KIND_BY_PREFIX).find((candidate) => token.startsWith(candidate));
  if (prefix !== undefined) {
    const kind = UNIT_KIND_BY_PREFIX[prefix];
    if (kind === null) return 'dangling';
    return identifiers[kind].has(token.slice(prefix.length)) ? 'held' : 'dangling';
  }

  return families.some((family) => new RegExp(`^${family}\\d+$`).test(token)) ? 'dangling' : 'prose';
}

/**
 * Every reference a ground carries, in the order it writes them, with what the artifact says of it.
 *
 * A token the artifact neither holds nor recognises as a member of one of its families is prose:
 * a sentence is made of words, and reading every word as a citation would refuse every ground
 * ever written. What survives that filter is a citation, and it is either one the artifact
 * confirms or one it contradicts.
 *
 * @param {string} ground
 * @param {object} artifact
 * @returns {Array<{ text: string, verdict: 'held'|'dangling' }>}
 */
// [::TICKET::] PX-261, PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-261|PX-263) --for-spec --no-implementation-order`.
function scanReferences(ground, artifact, sources = null) {
  const identifiers = identifiersOf(artifact);
  const sections = sources?.sections instanceof Set ? sources.sections : null;
  const families = familiesOf(identifiers);
  const lineCount = artifact?.spec?.lines;
  const lines = lineReferencesIn(ground);

  const lineCitations = lines.map((reference) => ({
    index: reference.index,
    text: reference.text,
    verdict: resolvesLine(reference, lineCount) ? 'held' : 'dangling',
  }));
  // The token scan sees the words a line reference is written with, so every token inside one is
  // skipped rather than reported twice under two spellings of the same citation.
  const tokenCitations = [...String(ground).matchAll(TOKEN)]
    .filter((match) => !insideALineReference(match.index, lines))
    .map((match) => ({ index: match.index, text: match[0], verdict: classifyToken(match[0], identifiers, families, sections) }))
    .filter((citation) => citation.verdict !== 'prose');

  return [...lineCitations, ...tokenCitations].sort((left, right) => left.index - right.index);
}

/**
 * The references a ground carries, in the order it writes them.
 *
 * @param {string} ground
 * @param {object} artifact
 * @returns {string[]}
 */
// [::TICKET::] PX-261 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-261 --for-spec --no-implementation-order`.
export function findReferences(ground, artifact, sources = null) {
  return scanReferences(ground, artifact, sources).map((reference) => reference.text);
}

/**
 * The section labels a document carries, read from its own headings.
 *
 * A section citation names a label the citing document defines, and the only place that label
 * exists is that document's heading tree. This is why a section citation could not be resolved
 * against the artifact: the artifact's sections are the rail's identifiers for the regions it read,
 * which is a different namespace from the numbering a package RFC gives its own headings. A ledger
 * row citing the second was therefore prose rather than a citation, and the row passed a check that
 * accepted any non-empty cell.
 *
 * Ancestors count as labels: a document whose headings are 3 and 3.4.3 carries both, because a
 * citation of either names a place the reader can open.
 *
 * @param {string} documentText
 * @returns {Set<string>}
 */
// [::TICKET::] PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-263 --for-spec --no-implementation-order`.
export function sectionIdentifiersOf(documentText) {
  const labels = new Set();
  for (const line of String(documentText ?? '').split('\n')) {
    const heading = HEADING.exec(line);
    if (heading === null) continue;
    const number = HEADING_NUMBER.exec(heading[1]);
    if (number === null) continue;
    for (const label of ancestorLabelsOf(number[1])) labels.add(label);
  }
  return labels;
}

/** A section number and every prefix of it, so a citation of an ancestor resolves. */
// [::TICKET::] PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-263 --for-spec --no-implementation-order`.
function ancestorLabelsOf(sectionNumber) {
  const levels = sectionNumber.split('.');
  return levels.map((unused, index) => levels.slice(0, index + 1).join('.'));
}

/**
 * Whether a ground resolves, and which of its references do not.
 *
 * A ground resolves only when it carries at least one reference and every reference it carries
 * resolves. The first half is what stops an assertion from counting as evidence; the second is
 * what stops a citation from being decoration around a claim. A ground naming a unit of a kind
 * the artifact does not hold \u2014 a boundary or a declared surface, whose ids live in the stage-2
 * manifest and in the package views \u2014 is unresolved rather than prose, because this resolver
 * cannot confirm it and a citation nobody can confirm is not evidence.
 *
 * @param {string} ground
 * @param {{ spec?: { lines?: number }, sections?: object[], operations?: object[], sequences?: object[] }} artifact
 * @returns {{ resolved: boolean, unresolved: string[] }}
 */
// [::TICKET::] PX-261 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-261 --for-spec --no-implementation-order`.
export function resolveGround(ground, artifact, sources = null) {
  const references = scanReferences(ground, artifact, sources);
  const unresolved = references.filter((reference) => reference.verdict !== 'held').map((reference) => reference.text);
  return { resolved: references.length > 0 && unresolved.length === 0, unresolved };
}
