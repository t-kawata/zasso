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

/** The rule each pin kind is re-derived by. */
export const PIN_RULES = Object.freeze({
  PREDICATE_LINE: 'predicate-line-contains-limbs',
  ROW_SCHEMA_LINE: 'row-schema-line-contains-fields',
  ENUMERATION_RANGE: 'enumeration-member-inside-range',
  BLOCK_PARTITION: 'block-partition-covers-once',
  FORM_PROPOSES: 'form-proposes-only',
});

/** The heading a section block is delimited by. */
export const SECTION_HEADING = /^## /;

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
export function blocksFromHeadings(specLines) {
  const headings = specLines
    .map((line, index) => (SECTION_HEADING.test(line) ? index + 1 : null))
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
export function establishPins(specLines, declaration) {
  return {
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
    blocks: blocksFromHeadings(specLines),
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
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function rederiveBlocks(blocks, specLines) {
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

  const headingLines = blocksFromHeadings(specLines).map((block) => block.firstLine);
  const starts = new Set(ordered.map((block) => block.firstLine));
  for (const heading of headingLines) {
    if (!starts.has(heading)) {
      return verdict('blocks', rule, `the heading on line ${heading} starts no block`, heading);
    }
  }
  return { ok: true, pin: 'blocks', rule, line: ordered.length };
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
export function rederivePin(pin, specLines) {
  switch (pin.kind) {
    case 'predicate':
      return rederivePredicate(pin.value, specLines);
    case 'rowSchema':
      return rederiveRowSchema(pin.value, specLines);
    case 'enumeration':
      return rederiveEnumeration(pin.value, specLines);
    case 'form':
      return rederiveForm(pin.value);
    case 'blocks':
      return rederiveBlocks(pin.value, specLines);
    default:
      return verdict(pin.kind, 'unknown-pin-kind', `no rule is declared for pin kind "${pin.kind}"`);
  }
}

/** Every pin in an artifact, flattened into one list a caller can iterate. */
export function flattenPins(pins) {
  return [
    { kind: 'predicate', value: pins.predicate },
    { kind: 'rowSchema', value: pins.rowSchema },
    ...pins.enumerations.map((value) => ({ kind: 'enumeration', value })),
    ...pins.forms.map((value) => ({ kind: 'form', value })),
    { kind: 'blocks', value: pins.blocks },
  ];
}

/**
 * Re-derive every pin, collecting the failures rather than stopping at the first.
 *
 * Collecting matters: a run that reported one wrong pin at a time would let an
 * artifact with four wrong pins take four runs to reject, and the reader would
 * learn the shape of the problem only by iterating.
 */
export function rederiveAll(pins, specLines) {
  const failures = flattenPins(pins)
    .map((pin) => rederivePin(pin, specLines))
    .filter((result) => !result.ok);
  return { ok: failures.length === 0, failures };
}
