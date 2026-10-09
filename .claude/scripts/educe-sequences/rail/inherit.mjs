// What a run inherits from its previous generations (PX-242, contract C007).
//
// A run directory used to be good for one revision of one specification: an edited
// specification printed "remove the run directory to start again", and the only
// documented recovery destroyed the declaration and the readings the artifact had been
// built from. A new generation therefore has to answer two questions about the assets it
// finds — which of them still cite the text they were read from, and what the whole set
// digests to — and answer them without deleting anything.
//
// An asset survives by citation, and the primitive that decided each invalidation is
// named in the verdict. That is the same rule the checks run under: a deciding rule is
// stated, because a finding whose rule is forgotten cannot be re-derived when the text
// moves again. A claim that cites no line cannot be carried across an edit at all, and
// is invalidated rather than inherited — a reading with no carrier is what the
// programme exists to catch.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { ADHOC_DIRECTORY } from './adhoc.mjs';
import { RAIL_EXIT_FILE } from './harness.mjs';
import { blocksFromHeadings, establishPins, findLineContainingAll, rederiveAll } from './pins.mjs';
import { BRIEF_NAMES } from './reading.mjs';
import { DECLARATION_FILE, PINS_FILE, WORKLIST_FILE, readingsFileName } from './readings.mjs';

/**
 * The primitives that may decide an invalidation.
 *
 * Closed on purpose: an invalidation whose rule is not one of these is a verdict nobody
 * can act on, and a vocabulary that grows silently cannot be checked for growth.
 */
export const INVALIDATION_PRIMITIVES = Object.freeze([
  'blocksFromHeadings',
  'findLineContainingAll',
  'establishPins',
  'rederivePin',
  'readingLineAndQuote',
]);

/** The files a run inherits, in the order the phases produce them. */
// [::TICKET::] PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-244 --for-spec --no-implementation-order`.
export function inheritedFileNames() {
  // The rail-exit store is inherited like anything else a run produced: recording a new
  // ad-hoc check changes what the next generation starts from, so it must change the
  // digest the guard and the verification read.
  return [DECLARATION_FILE, PINS_FILE, WORKLIST_FILE, RAIL_EXIT_FILE, ...BRIEF_NAMES.map(readingsFileName)];
}

/**
 * The inherited files a run directory currently holds, with the scaffolded modules.
 *
 * A missing file is not an error: the digest answers "what is here", and a run that has
 * read nothing yet inherits nothing. The list is sorted so the digest is a function of
 * the set rather than of the directory's iteration order.
 */
// [::TICKET::] PX-242, PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-242|PX-243|PX-244) --for-spec --no-implementation-order`.
function inheritedFilesIn(directory) {
  const present = inheritedFileNames().filter((name) => existsSync(join(directory, name)));
  const adhoc = join(directory, ADHOC_DIRECTORY);
  const modules = existsSync(adhoc)
    ? readdirSync(adhoc)
      .filter((name) => statSync(join(adhoc, name)).isFile())
      .map((name) => `${ADHOC_DIRECTORY}/${name}`)
    : [];
  return [...present, ...modules].sort();
}

/**
 * The digest of everything a run inherits.
 *
 * This is the fact the guard against an unattended loop reads: a new generation may not
 * be opened over an unchanged set of assets when the previous generation halted, because
 * that is the same question being asked a second time.
 */
export function assetDigestOf(directory) {
  const hash = createHash('sha256');
  for (const name of inheritedFilesIn(directory)) hash.update(name).update(readFileSync(join(directory, name)));
  return hash.digest('hex');
}

/** The lines a reading presupposes, wherever it records them. */
// [::TICKET::] PX-242, PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-242|PX-243|PX-244) --for-spec --no-implementation-order`.
function presupposedLines(reading) {
  const lines = [];
  if (Number.isInteger(reading?.presupposition)) lines.push(reading.presupposition);
  for (const group of [reading?.steps, reading?.operations]) {
    for (const item of group ?? []) {
      const line = item?.grounding?.presupposition;
      if (Number.isInteger(line)) lines.push(line);
    }
  }
  return lines;
}

/**
 * Why a reading cannot be carried across the edit, or null when it can.
 *
 * A reading with no presupposed line has no carrier, so nothing says it was taken from
 * the text as it now stands; it is invalidated rather than inherited. A reading whose
 * cited line moved out of the document, or whose cited line no longer carries the name
 * it was read from, is invalidated for the same reason a pin is: the citation has to
 * still resolve to what it claimed.
 */
// [::TICKET::] PX-242, PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-242|PX-243|PX-244) --for-spec --no-implementation-order`.
function whyReadingDoesNotCarry(reading, specLines) {
  const lines = presupposedLines(reading);
  if (lines.length === 0) return 'the reading cites no line, so nothing carries it across the edit';
  for (const line of lines) {
    if (line < 1 || line > specLines.length) return `the reading cites line ${line} and the specification has ${specLines.length} lines`;
    if (typeof reading.spec_name === 'string' && !specLines[line - 1].includes(reading.spec_name)) {
      return `line ${line} no longer names ${reading.spec_name}`;
    }
  }
  return null;
}

/** One invalidation, in the one shape every entry is reported in. */
// [::TICKET::] PX-242, PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-242|PX-243|PX-244) --for-spec --no-implementation-order`.
function invalidated(asset, name, primitive, why) {
  return { asset, name, primitive, why };
}

/**
 * Classify a run's inherited assets against the text they cite.
 *
 * Nothing is removed: `kept` says what survives and `invalidated` says what the reader
 * must produce again, and the re-opened `[read]` phases are what actually ask for it.
 * A refusal that deleted the evidence would make the artifact's provenance unrecoverable,
 * which is the failure this ticket exists to remove.
 *
 * @returns {{kept: {declaration: object, readings: object}, invalidated: Array<{asset: string, name: string, primitive: string, why: string}>}}
 */
export function survivingAssets({ declaration, readings = {}, specLines }) {
  const invalidations = [];
  const blocks = blocksFromHeadings(specLines);
  const spans = new Set(blocks.map((block) => `${block.firstLine}-${block.lastLine}`));

  const sections = (declaration.sections ?? []).filter((section) => {
    if (spans.has(`${section.firstLine}-${section.lastLine}`)) return true;
    invalidations.push(invalidated('declaration.sections', section.id, 'blocksFromHeadings', `no section of the edited text spans ${section.firstLine}-${section.lastLine}`));
    return false;
  });

  const predicateSurvives = findLineContainingAll(specLines, declaration.predicate?.limbs ?? []) !== null;
  if (!predicateSurvives) {
    invalidations.push(invalidated('declaration.predicate', 'predicate', 'findLineContainingAll', 'no line carries every limb'));
  }

  const rowSchemaSurvives = findLineContainingAll(specLines, declaration.rowSchema?.fields ?? []) !== null;
  if (!rowSchemaSurvives) {
    invalidations.push(invalidated('declaration.rowSchema', 'rowSchema', 'findLineContainingAll', 'no line carries every field'));
  }

  const derived = establishPins(specLines, declaration).enumerations;
  const enumerations = derived.filter((enumeration) => {
    if (enumeration.ranges.length > 0) return true;
    invalidations.push(invalidated('declaration.enumerations', enumeration.name, 'establishPins', 'no member occurs anywhere in the edited text'));
    return false;
  });

  const keptReadings = {};
  for (const [briefName, entries] of Object.entries(readings)) {
    const survivors = (entries ?? []).filter((reading) => {
      const why = whyReadingDoesNotCarry(reading, specLines);
      if (why === null) return true;
      invalidations.push(invalidated(`readings.${briefName}`, reading.subject ?? '(unnamed)', 'readingLineAndQuote', why));
      return false;
    });
    keptReadings[briefName] = survivors;
  }

  // The recorded pins are re-derived against the edited text rather than trusted, because
  // a pin's line number is a citation: renumber the document and the citation resolves to
  // a line that says something else, which is the drift the pin rules exist to catch.
  const pins = establishPins(specLines, declaration);
  for (const failure of rederiveAll(pins, specLines).failures) {
    invalidations.push(invalidated('pins', failure.pin, 'rederivePin', failure.reason));
  }

  return {
    kept: {
      declaration: { ...declaration, sections, enumerations },
      readings: keptReadings,
    },
    invalidated: invalidations,
  };
}
