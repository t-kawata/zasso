// pin establishment and re-derivation (PX-240, contract C012).
//
// A pin is a finding, and this file exists because a finding that lives only inside
// the artifact that consumes it proves nothing: the artifact would be supplying its
// own premises and then agreeing with them. Every pin therefore carries the rule it
// was read by, and `rederiveAll` re-runs that rule against the specification text in
// the same run that consumes it. An artifact whose predicate line was edited to a
// line that does not contain its limbs fails its own verification.
//
// A form detector is the one pin kind that is deliberately weaker than the others:
// it proposes candidates and is refused if it claims to decide any of them.
//
// The borrowed census is the second thing this file reads that the specification does not
// state: a set of names a run must account for, read out of supplied material. It is a pin
// like any other — the rule that found it is recorded and re-run — and it carries the
// supplied file's digest, because a census read from a file that has since moved is a
// census about a document nobody has. The extraction shapes are the rail's own and name no
// project; the file, the field, the column and the prefix are the declaration's.
import { digestOfBytes, splitLines } from './load.mjs';

/** The rule each pin kind is re-derived by. */
export const PIN_RULES = Object.freeze({
  PREDICATE_LINE: 'predicate-line-contains-limbs',
  ROW_SCHEMA_LINE: 'row-schema-line-contains-fields',
  ENUMERATION_RANGE: 'enumeration-member-inside-range',
  BLOCK_PARTITION: 'block-partition-covers-once',
  FORM_PROPOSES: 'form-proposes-only',
  SOURCE_ENUMERATION: 'source-enumeration-members-match-source',
});

/**
 * The shapes a borrowed census may be read with.
 *
 * Three shapes rather than one, each taking its parameter from the declaration: a project
 * that keeps its census in a table or in marked lines runs the same code as one that keeps
 * it in fenced JSON. Naming a project's own format here would make the rail that project's
 * instrument; naming the shape and leaving the parameter to the caller does not.
 */
export const SOURCE_SHAPES = Object.freeze(['jsonFieldRows', 'tableColumn', 'markedLines']);

/**
 * What a borrowed census may answer for.
 *
 * The role is how a check finds the census it is about — the operations an interface must
 * implement, the entries a reading must adjudicate — and it is a closed vocabulary for the
 * reason the rest of them are: a misspelled role would leave every check that selects by
 * role silent while the census still looked borrowed, which is a way to disarm the very
 * check that exists to make an omission loud. A census with no role answers for nothing and
 * is permitted; a census with a role outside this list is refused.
 */
export const SOURCE_ROLES = Object.freeze(['operations', 'entries']);

/** The bodies of every fenced block in a document, as arrays of lines. */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
function fencedBlockBodies(lines) {
  const bodies = [];
  let open = null;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (open === null) open = [];
      else {
        bodies.push(open);
        open = null;
      }
      continue;
    }
    if (open !== null) open.push(line);
  }
  return bodies;
}

/** Whether a line opens a table's data, which is a row beneath a separator row. */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
function isSeparatorRow(line) {
  return /^\s*\|[\s:|-]+\|\s*$/.test(line);
}

/** The cells of a table row, or null when the line is not one. */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
function tableCellsOf(line) {
  if (!/^\s*\|/.test(line)) return null;
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

/**
 * The members a document holds in the shape and at the parameter the declaration names.
 *
 * Every shape is total over the elements it claims: an element it cannot read is refused by
 * name rather than skipped, because a skipped element is a member that leaves the census
 * without anything failing — which is the one way a denominator can shrink in silence.
 *
 * @returns {{members: string[]} | {refused: string}}
 */
export function extractMembers({ lines, shape, parameter }) {
  if (!SOURCE_SHAPES.includes(shape)) {
    return { refused: `shape "${shape}" is not one of ${SOURCE_SHAPES.join(', ')}` };
  }
  if (typeof parameter !== 'string' || parameter === '') {
    return { refused: `the ${shape} shape needs a parameter naming what to read` };
  }
  if (shape === 'jsonFieldRows') return extractJsonFieldRows(lines, parameter);
  if (shape === 'tableColumn') return extractTableColumn(lines, parameter);
  return extractMarkedLines(lines, parameter);
}

/** A field of every JSON row in every fenced block that holds rows. */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
function extractJsonFieldRows(lines, field) {
  const members = [];
  for (const body of fencedBlockBodies(lines)) {
    const rows = body.filter((line) => line.trim() !== '');
    // Only a block whose first row is an object is a row block; a block of prose or code is
    // not this shape's business and is left to whichever shape claims it.
    if (rows.length === 0 || !rows[0].trim().startsWith('{')) continue;
    for (const row of rows) {
      let parsed;
      try {
        parsed = JSON.parse(row);
      } catch {
        return { refused: `the row "${row.slice(0, 60)}" is not readable as JSON` };
      }
      if (parsed === null || typeof parsed !== 'object' || !(field in parsed)) {
        return { refused: `the row "${row.slice(0, 60)}" does not carry ${field}` };
      }
      members.push(String(parsed[field]));
    }
  }
  return { members };
}

/** A column of every row beneath the header that names it. */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
function extractTableColumn(lines, header) {
  const members = [];
  let column = null;
  for (const [index, line] of lines.entries()) {
    const cells = tableCellsOf(line);
    if (cells === null) continue;
    if (isSeparatorRow(line)) continue;
    if (isSeparatorRow(lines[index + 1] ?? '')) {
      column = cells.indexOf(header);
      continue;
    }
    if (column === null) continue;
    if (cells.length <= column) return { refused: `the row "${line.slice(0, 60)}" carries no ${header} column` };
    members.push(cells[column]);
  }
  return { members };
}

/** The remainder of every line of a document that is a list and nothing else. */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
function extractMarkedLines(lines, prefix) {
  const members = [];
  let insideFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence || line.trim() === '') continue;
    if (!line.startsWith(prefix)) return { refused: `the line "${line.slice(0, 60)}" does not begin with ${prefix}` };
    members.push(line.slice(prefix.length).trim());
  }
  return { members };
}

/**
 * The heading level a partition is taken at when the declaration states none.
 *
 * Three, because that is the level a specification states its procedures at: a chapter
 * names a subject and a subsection names a procedure. The level is declared rather than
 * inferred, because inferring it would be a guess about the document of exactly the kind
 * a reading is supposed to replace — and it is not a constant of the apparatus, because
 * the golden fixture is a document that states its sections with two hashes.
 */
export const DEFAULT_SECTION_LEVEL = 3;

/**
 * The levels a partition may be taken at.
 *
 * The heading depths markdown has, because a document states its sections at whatever depth
 * it uses and the apparatus reads documents. A narrower vocabulary would not make a
 * declaration more precise; it would make a specification written with four hashes
 * unrunnable, which is the apparatus refusing a shape instead of reading it. A level the
 * format does not have is still not a level, and the default still stands behind it.
 */
export const SECTION_LEVELS = Object.freeze([1, 2, 3, 4, 5, 6]);

/**
 * The level a declaration partitions at, or the default.
 *
 * A level the apparatus cannot partition at is not a partition, so it is answered with the
 * default rather than with an empty partition that would read as a document with no
 * sections. The declaration's own shape gate names the field for the reader who wants to
 * be told instead.
 */
export function sectionLevelOf(declaration) {
  const level = declaration?.sectionLevel;
  return SECTION_LEVELS.includes(level) ? level : DEFAULT_SECTION_LEVEL;
}

/**
 * The predicate as a reader meets it: the line it is on, its text, and its limbs.
 *
 * The line is found here by the same rule the pin is established and re-derived by, rather
 * than read off the declaration: a declaration states the limbs, and the line is what the
 * rule finds for them. Reading a line off the declaration would have a brief print "line
 * undefined" — and would let the reader name the line instead of finding it.
 */
export function predicateFor(limbs, specLines) {
  const declared = [...(limbs ?? [])];
  const line = findLineContainingAll(specLines, declared);
  return {
    line,
    text: Number.isInteger(line) ? (specLines[line - 1] ?? '') : '',
    limbs: declared,
  };
}

/**
 * The first 1-based line containing every token, or null.
 *
 * `null` rather than 0 so a caller cannot mistake "the first line" for "not found";
 * the predicate pin of a specification is never line zero.
 */
export function findLineContainingAll(specLines, tokens) {
  for (const [index, line] of specLines.entries()) {
    if (tokens.every((token) => line.includes(token))) return index + 1;
  }
  return null;
}

/** Every 1-based line containing the token. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function linesContaining(specLines, token) {
  const found = [];
  for (const [index, line] of specLines.entries()) {
    if (line.includes(token)) found.push(index + 1);
  }
  return found;
}

/** Compress line numbers into contiguous 1-based ranges. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function compressRanges(lineNumbers) {
  const sorted = [...new Set(lineNumbers)].sort((left, right) => left - right);
  const ranges = [];
  for (const line of sorted) {
    const last = ranges.at(-1);
    if (last !== undefined && line === last[1] + 1) last[1] = line;
    else ranges.push([line, line]);
  }
  return ranges;
}

/** The section blocks a specification's headings delimit, ending at its last line. */
// [::TICKET::] PX-246 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-246 --for-spec --no-implementation-order`.
export function blocksFromHeadings(specLines, level = DEFAULT_SECTION_LEVEL) {
  const heading = new RegExp(`^#{${level}} `);
  const headings = specLines
    .map((line, index) => (heading.test(line) ? index + 1 : null))
    .filter((line) => line !== null);
  return headings.map((firstLine, position) => ({
    id: `s${position + 1}`,
    firstLine,
    lastLine: position + 1 < headings.length ? headings[position + 1] - 1 : specLines.length,
  }));
}

/**
 * The neighbour the engine selects for an entry: the one that cites a line inside
 * the entry's own span.
 *
 * A neighbour that merely covers the span is not a candidate — that is the shape of
 * the fabrication this rule exists to catch — so an ambiguous selection returns null
 * rather than a first match. Null is then a real answer: it says the worklist could
 * not be built for this entry by citation.
 */
export function selectNeighbourFor(artifact, entry) {
  const citing = artifact.sequences.filter(
    (other) => other.kind === 'neighbour' && other.cites >= entry.firstLine && other.cites <= entry.lastLine,
  );
  return citing.length === 1 ? citing[0].id : null;
}

/**
 * Establish the pins of one specification from a declaration of what to look for.
 *
 * The declaration names the limbs, fields, members and headings; this function finds
 * the lines they occur on. What it records is therefore a reading of the text, and
 * re-derivation is the same reading run a second time.
 *
 * @param {string[]} specLines
 * @param {{predicate: {limbs: string[]}, rowSchema: {fields: string[]},
 *          enumerations: Array<{name: string, members: string[], closedness: string}>,
 *          forms: Array<{name: string, proposes: boolean}>}} declaration
 */
export function establishPins(specLines, declaration, supplied = {}) {
  const sectionLevel = sectionLevelOf(declaration);
  return {
    // The borrowed census: a set of names read out of supplied material rather than out of
    // the specification, so the artifact can be held to something it does not hold itself.
    // What is recorded is the file, its digest, the shape and parameter that were used, and
    // the members the extraction found — or the refusal, when the file could not be read.
    sourceEnumerations: (declaration.sourceEnumerations ?? []).map((entry) => {
      const document = supplied?.[entry.source];
      const readable = typeof document === 'string';
      const extracted = readable
        ? extractMembers({ lines: splitLines(document), shape: entry.selector?.shape, parameter: entry.selector?.parameter })
        : { refused: `the supplied file ${entry.source} is not beside this run` };
      return {
        name: entry.name,
        role: entry.role ?? null,
        source: { file: entry.source, sha256: readable ? digestOfBytes(Buffer.from(document, 'utf8')) : null },
        selector: { shape: entry.selector?.shape ?? null, parameter: entry.selector?.parameter ?? null },
        members: extracted.members ?? [],
        refusal: extracted.refused ?? null,
      };
    }),
    // The columns the caller wants an operation record to carry, which of them must be
    // measured, and which fields the consumer of the artifact reads. All three are the
    // caller's: which columns an interface needs is a property of the project, and a rail
    // that named them would be that project's rail.
    columns: (declaration.columns ?? []).map((column) => ({ ...column })),
    requiredMeasuredColumns: [...(declaration.requiredMeasuredColumns ?? [])],
    consumerFields: [...(declaration.consumerFields ?? [])],
    predicate: {
      line: findLineContainingAll(specLines, declaration.predicate.limbs),
      limbs: [...declaration.predicate.limbs],
    },
    rowSchema: {
      line: findLineContainingAll(specLines, declaration.rowSchema.fields),
      fields: [...declaration.rowSchema.fields],
    },
    enumerations: declaration.enumerations.map((enumeration) => ({
      name: enumeration.name,
      members: [...enumeration.members],
      ranges: compressRanges(enumeration.members.flatMap((member) => linesContaining(specLines, member))),
      closedness: enumeration.closedness,
    })),
    forms: declaration.forms.map((form) => ({ name: form.name, proposes: form.proposes })),
    sectionLevel,
    blocks: blocksFromHeadings(specLines, sectionLevel),
  };
}

/** A verdict object, so every refusal reaches the reader in one shape. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function verdict(pin, rule, reason, line = null) {
  return { ok: false, pin, rule, line, reason };
}

/** Re-derive the predicate pin: its line must contain every limb it declares. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function rederivePredicate(pin, specLines) {
  const rule = PIN_RULES.PREDICATE_LINE;
  if (!Number.isInteger(pin.line)) return verdict('predicate', rule, 'the pin carries no integer line');
  const found = findLineContainingAll(specLines, pin.limbs);
  if (found !== pin.line) {
    return verdict('predicate', rule, `line ${pin.line} does not carry every limb; the limbs first appear on line ${found}`, pin.line);
  }
  return { ok: true, pin: 'predicate', rule, line: pin.line };
}

/** Re-derive the row-schema pin by the same rule, over the fields. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function rederiveRowSchema(pin, specLines) {
  const rule = PIN_RULES.ROW_SCHEMA_LINE;
  if (!Number.isInteger(pin.line)) return verdict('rowSchema', rule, 'the pin carries no integer line');
  const found = findLineContainingAll(specLines, pin.fields);
  if (found !== pin.line) {
    return verdict('rowSchema', rule, `line ${pin.line} does not carry every field; the fields first appear on line ${found}`, pin.line);
  }
  return { ok: true, pin: 'rowSchema', rule, line: pin.line };
}

/** Re-derive an enumeration pin: every member must occur inside one declared range. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function rederiveEnumeration(pin, specLines) {
  const rule = PIN_RULES.ENUMERATION_RANGE;
  for (const member of pin.members) {
    const occurrence = linesContaining(specLines, member).find((line) =>
      pin.ranges.some(([from, to]) => line >= from && line <= to),
    );
    if (occurrence === undefined) {
      return verdict(`enumerations.${pin.name}`, rule, `member "${member}" occurs nowhere inside ${JSON.stringify(pin.ranges)}`);
    }
  }
  return { ok: true, pin: `enumerations.${pin.name}`, rule, line: pin.ranges[0]?.[0] ?? null };
}

/** Re-derive the block partition: contiguous, gapless to the last line, one block per heading. */
// [::TICKET::] PX-240, PX-241, PX-246 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241|PX-246) --for-spec --no-implementation-order`.
function rederiveBlocks(blocks, specLines, sectionLevel) {
  const rule = PIN_RULES.BLOCK_PARTITION;
  if (blocks.length === 0) return verdict('blocks', rule, 'the partition is empty, so no line is covered');

  const ordered = [...blocks].sort((left, right) => left.firstLine - right.firstLine);
  for (const [index, block] of ordered.entries()) {
    const next = ordered[index + 1];
    if (next !== undefined && block.lastLine + 1 !== next.firstLine) {
      return verdict('blocks', rule, `block ${block.id} ends on line ${block.lastLine} and block ${next.id} starts on ${next.firstLine}`, block.lastLine);
    }
  }
  const last = ordered.at(-1);
  if (last.lastLine !== specLines.length) {
    return verdict('blocks', rule, `the partition ends on line ${last.lastLine} and the specification has ${specLines.length} lines`, last.lastLine);
  }

  const headingLines = blocksFromHeadings(specLines, sectionLevel).map((block) => block.firstLine);
  const starts = new Set(ordered.map((block) => block.firstLine));
  for (const heading of headingLines) {
    if (!starts.has(heading)) {
      return verdict('blocks', rule, `the heading on line ${heading} starts no block`, heading);
    }
  }
  return { ok: true, pin: 'blocks', rule, line: ordered.length };
}

/**
 * Re-derive a borrowed census: the supplied file is the one it was read from, and the
 * members are what that file holds now.
 *
 * The file is re-read and re-extracted rather than the members being compared with
 * themselves, and the digest is checked first, because a file that moved makes every later
 * comparison a comparison against a document nobody has.
 */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
function rederiveSourceEnumeration(pin, supplied) {
  const rule = PIN_RULES.SOURCE_ENUMERATION;
  const subject = `sourceEnumerations.${pin.name}`;
  // Read from the pin rather than decided when it was established: the artifact is data
  // under verification, so a role edited after the fact is exactly the case this refuses.
  if (pin.role !== null && pin.role !== undefined && !SOURCE_ROLES.includes(pin.role)) {
    return verdict(subject, rule, `role "${pin.role}" is not one of ${SOURCE_ROLES.join(', ')}, so no check can find this census`);
  }
  const document = supplied?.[pin.source?.file];
  if (typeof document !== 'string') {
    return verdict(subject, rule, `the supplied file ${pin.source?.file} is not beside this run`);
  }
  const digest = digestOfBytes(Buffer.from(document, 'utf8'));
  if (digest !== pin.source?.sha256) {
    return verdict(subject, rule, `${pin.source.file} digests to ${digest}; the pin records ${pin.source.sha256}`);
  }
  const extracted = extractMembers({ lines: splitLines(document), shape: pin.selector?.shape, parameter: pin.selector?.parameter });
  if (extracted.refused !== undefined) return verdict(subject, rule, extracted.refused);

  const found = new Set(extracted.members);
  const declared = new Set(pin.members);
  const absent = [...declared].filter((member) => !found.has(member));
  if (absent.length > 0) return verdict(subject, rule, `member "${absent[0]}" occurs in no row of ${pin.source.file}`);
  const extra = [...found].filter((member) => !declared.has(member));
  if (extra.length > 0) return verdict(subject, rule, `${pin.source.file} carries "${extra[0]}", which the pin does not list`);
  return { ok: true, pin: subject, rule, line: null };
}

/** Re-derive a form entry: a detector proposes candidates and decides none of them. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function rederiveForm(pin) {
  const rule = PIN_RULES.FORM_PROPOSES;
  if (pin.proposes !== true) {
    return verdict(`forms.${pin.name}`, rule, `form "${pin.name}" decides rather than proposes`);
  }
  return { ok: true, pin: `forms.${pin.name}`, rule, line: null };
}

/**
 * Re-derive one pin by the rule its kind declares.
 *
 * @returns {{ok: true, pin: string, rule: string, line: number|null}
 *          | {ok: false, pin: string, rule: string, line: number|null, reason: string}}
 */
export function rederivePin(pin, specLines, supplied = {}) {
  switch (pin.kind) {
    case 'sourceEnumeration':
      return rederiveSourceEnumeration(pin.value, supplied);
    case 'predicate':
      return rederivePredicate(pin.value, specLines);
    case 'rowSchema':
      return rederiveRowSchema(pin.value, specLines);
    case 'enumeration':
      return rederiveEnumeration(pin.value, specLines);
    case 'form':
      return rederiveForm(pin.value);
    case 'blocks':
      return rederiveBlocks(pin.value, specLines, pin.sectionLevel);
    default:
      return verdict(pin.kind, 'unknown-pin-kind', `no rule is declared for pin kind "${pin.kind}"`);
  }
}

/**
 * Every pin in an artifact, flattened into one list a caller can iterate.
 *
 * The section level travels with the block partition rather than as a pin kind of its own:
 * it is not a finding, it is the rule the partition was taken by, and `rederivePin`
 * receives one pin at a time — so a level kept anywhere else could not reach the rule that
 * needs it.
 */
export function flattenPins(pins) {
  return [
    { kind: 'predicate', value: pins.predicate },
    { kind: 'rowSchema', value: pins.rowSchema },
    ...pins.enumerations.map((value) => ({ kind: 'enumeration', value })),
    ...pins.forms.map((value) => ({ kind: 'form', value })),
    ...(pins.sourceEnumerations ?? []).map((value) => ({ kind: 'sourceEnumeration', value })),
    { kind: 'blocks', value: pins.blocks, sectionLevel: pins.sectionLevel },
  ];
}

/**
 * Re-derive every pin, collecting the failures rather than stopping at the first.
 *
 * Collecting matters: a run that reported one wrong pin at a time would let an
 * artifact with four wrong pins take four runs to reject, and the reader would
 * learn the shape of the problem only by iterating.
 */
export function rederiveAll(pins, specLines, supplied = {}) {
  const failures = flattenPins(pins)
    .map((pin) => rederivePin(pin, specLines, supplied))
    .filter((result) => !result.ok);
  return { ok: failures.length === 0, failures };
}
