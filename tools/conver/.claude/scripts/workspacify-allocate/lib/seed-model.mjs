// [::TICKET::] PX-193 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-193 --for-spec --no-implementation-order`.
// [::TICKET::] PX-190 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-190 --for-spec --no-implementation-order`.
// PX-193 @verifies C002 C006
/**
 * RFC-SEED.md model.
 *
 * Coupling and dependency come first: section 1 states where the directory sits
 * in the whole system (the three reference paths, the verified implementation
 * order, the contract ids it owes and the segments it carries) and section 2 is
 * the coupling contract itself. Both are machine-injected, so the AI can neither
 * omit nor rewrite them. The remaining sections are the AI's authoring surface.
 *
 * Old grammar (PX-190) -> new grammar mapping:
 *   1 identity + 2 ownership + 3 allocation + 7 integration  ->  1 (machine)
 *   7 integration context                                     ->  2 (machine, JSON)
 *   3 allocated specification material                        ->  3 (machine index)
 *   4,5,6,8,9,10,11,12,13,15                                  ->  4..13 (AI prose)
 *   14 source traceability index                              ->  14 (machine table)
 *
 * A seed's format is data, not an assumption: `SEED_FORMATS` declares the
 * formats this conver can read, and the parser resolves a row rather than
 * branching on a version. The table's current row is built from
 * `SEED_REQUIRED_SECTIONS`, which is why that constant keeps its name: it is the
 * current format's section list, not "the" list.
 */
import { WorkSpacifyTreeError } from '../../workspacify-tree/lib/errors.mjs';

/** Fixed required section titles in document order (1-14). */
export const SEED_REQUIRED_SECTIONS = Object.freeze([
  { index: 1, title: 'Identity and Position in the Whole System' },
  { index: 2, title: 'Coupling Contracts (I/O Boundary)' },
  { index: 3, title: 'Source Coverage and Allocation Index' },
  { index: 4, title: 'In-Scope Objects, Claims, Predicates, State and Invariants' },
  { index: 5, title: 'Incoming Dependencies and Consumer Obligations' },
  { index: 6, title: 'Outgoing Provider Obligations' },
  { index: 7, title: 'State Ownership and State-Transition Material' },
  { index: 8, title: 'Side-Effect and External-I/O Boundaries' },
  { index: 9, title: 'Canonicalization, Signatures and Proof Responsibilities' },
  { index: 10, title: 'Failure, Rejection, Recovery and Finality Material' },
  { index: 11, title: 'Required Unit, Integration, Exception and Malfeasance Test Material' },
  { index: 12, title: 'Grill Questions and Explicitly Unresolved Design Choices' },
  { index: 13, title: 'Forbidden Dependencies, Non-Interference Boundaries and Non-Goals' },
  { index: 14, title: 'Source Traceability Index' },
]);

/** Section written from the machine reference block. */
export const SEED_MACHINE_SECTION_INDEX = 1;

/**
 * Where the coupling-contract section sits, as an ordinal within any format's list.
 *
 * The section a machine reads is addressed by position, because a format may
 * number the same material differently. Its *index* in the current format is a
 * consequence of that format numbering its sections in order, so the index is
 * derived from the position rather than restated beside it.
 */
export const SEED_CONTRACT_SECTION_POSITION = 2;

/** Section written from the machine contract edges, in the current format. */
export const SEED_CONTRACT_SECTION_INDEX = SEED_REQUIRED_SECTIONS[SEED_CONTRACT_SECTION_POSITION - 1].index;

/** Sections only the AI authors. */
export const SEED_AUTHORING_SECTION_INDEXES = Object.freeze([4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);

/** Columns of the machine-extractable Allocation Index table. */
export const ALLOCATION_INDEX_HEADERS = Object.freeze(['Category', 'Inventory ID', 'Canonical Name']);

/** File name placed inside every package directory. */
export const SEED_FILE_NAME = 'RFC-SEED.md';

/** Title prefix of a seed document. */
export const SEED_TITLE_PREFIX = '# RFC Seed: ';

/** Canonical published name of the stage-2 machine authority. */
export const ALLOCATE_MANIFEST_FILE_NAME = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';

/**
 * Where the allocation index sits, as an ordinal within any format's section list.
 *
 * The sections a machine reads are addressed by position, not by literal index,
 * because an older format may number the same material differently. The current
 * format's position and index coincide; that is a property of this format, not a
 * rule the parser may assume of every one.
 */
// [::TICKET::] P23-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-10 --for-spec --no-implementation-order`.
export const SEED_ALLOCATION_SECTION_POSITION = 3;

/** Where the segment-addressed traceability table sits, as an ordinal within any format's list. */
export const SEED_TRACEABILITY_SECTION_POSITION = 14;

/** The optional field a writer sets in section 1's machine block to declare the format it wrote. */
export const SEED_FORMAT_MARKER = 'seed_format';

/** Published name of the seed-compatibility finding the reverse rotation reports. */
export const SEED_COMPATIBILITY_FILE_NAME = 'SEED-COMPATIBILITY.md';

const NOT_APPLICABLE = /^not_applicable\b/i;

/**
 * Validate and freeze a table of declared seed formats.
 *
 * A parser with no format to resolve against can report nothing but
 * "unrecognised", so an empty table is refused rather than accepted as a table
 * with nothing in it. Each row is frozen, and so is its section list, because a
 * caller that mutated a row after construction would change what a later parse
 * means while leaving the version string that identified it alone.
 *
 * @param {Array<{ version: string, sections: Array<{ index: number, title: string }>, machineSectionIndex: number }>} rows
 * @returns {ReadonlyArray<object>} the frozen table
 * @throws {WorkSpacifyTreeError} on an empty table or a row missing its version, its sections or its machine index
 */
export function defineSeedFormats(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new WorkSpacifyTreeError('a seed-format table must declare at least one format', { gateId: 'G3.6' });
  }
  for (const row of rows) {
    if (typeof row?.version !== 'string' || row.version.trim() === '') {
      throw new WorkSpacifyTreeError('every declared seed format must carry a non-empty version string', { gateId: 'G3.6' });
    }
    if (!Array.isArray(row.sections) || row.sections.length === 0) {
      throw new WorkSpacifyTreeError(`seed format ${row.version} must declare at least one section`, { gateId: 'G3.6' });
    }
    if (!Number.isInteger(row.machineSectionIndex)) {
      throw new WorkSpacifyTreeError(`seed format ${row.version} must declare the index of its machine section`, { gateId: 'G3.6' });
    }
    if (row.machineSectionIndex !== row.sections[0].index) {
      throw new WorkSpacifyTreeError(
        `seed format ${row.version} declares its machine section as ${row.machineSectionIndex}, but its first section is ${row.sections[0].index}; a format is resolved from its first section, so the two must agree`,
        { gateId: 'G3.6' },
      );
    }
  }
  return Object.freeze(rows.map((row) => Object.freeze({
    version: row.version,
    sections: Object.freeze([...row.sections]),
    machineSectionIndex: row.machineSectionIndex,
  })));
}

/**
 * Every seed format this conver can read, oldest first.
 *
 * The table has exactly one row: the current format, built from
 * `SEED_REQUIRED_SECTIONS` rather than restating it, so the list the parser
 * checks against and the list the renderer writes cannot drift. A second row is
 * added when a second format is measured, never guessed.
 */
export const SEED_FORMATS = defineSeedFormats([
  { version: '1.0.0', sections: SEED_REQUIRED_SECTIONS, machineSectionIndex: SEED_MACHINE_SECTION_INDEX },
]);

/** The version a writer of this conver targets: the newest declared row. */
export const CURRENT_SEED_FORMAT_VERSION = SEED_FORMATS[SEED_FORMATS.length - 1].version;

/**
 * The format a run reads: the newest declared one.
 *
 * A run reads the section list it is about to write, so the format it needs is
 * the one its own renderer targets.
 *
 * @param {{ formats?: ReadonlyArray<object> }} [options]
 * @returns {object} the required format row
 */
export function currentSeedFormat({ formats = SEED_FORMATS } = {}) {
  return formats[formats.length - 1];
}

/**
 * The declared format a determination names, or null when none declares it.
 *
 * @param {{ version: string|null }|null} determined - a determination from `determineSeedFormat`
 * @param {{ formats?: ReadonlyArray<object> }} [options]
 * @returns {object|null} the matching row, or null for unversioned and unrecognised alike
 */
export function resolveSeedFormat(determined, { formats = SEED_FORMATS } = {}) {
  if (determined?.version === null || determined?.version === undefined) {
    return null;
  }
  return formats.find((row) => row.version === determined.version) ?? null;
}

/**
 * The section a format carries at one ordinal position, or null past its end.
 *
 * An older format may carry fewer sections than the current one, and the
 * material the current format puts in its fourteenth section is then simply
 * absent — a fact about the format, not a defect in the seed.
 *
 * @param {object} format - a row of SEED_FORMATS
 * @param {number} position - 1-based ordinal within the format's section list
 * @returns {{ index: number, title: string }|null} the section, or null
 */
export function seedFormatSectionAt(format, position) {
  return format.sections[position - 1] ?? null;
}

/**
 * Validate a seed body: non-empty, and a not_applicable marker must carry a reason.
 *
 * @param {string} body - section body text
 * @returns {string|null} null when valid, otherwise the reason
 */
export function assertSeedBodyValid(body) {
  if (typeof body !== 'string') {
    return 'body is not a string';
  }
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return 'section body is empty';
  }
  if (NOT_APPLICABLE.test(trimmed) && trimmed.replace(NOT_APPLICABLE, '').trim().length === 0) {
    return 'not_applicable marker requires a reason';
  }
  return null;
}

/** Whether a body is an explicit not_applicable statement without a reason. */
export function isReasonlessNotApplicable(body) {
  return assertSeedBodyValid(body) === 'not_applicable marker requires a reason';
}

/**
 * Check the AI authoring surface of a decisions payload.
 *
 * The shared schema validator understands enum/pattern/required but not
 * propertyNames, so the authoring range is enforced here as well as declared in
 * the schema: a payload that carries a machine section or an unknown key, or that
 * omits an authoring section, is rejected before anything is rendered.
 *
 * @param {object} decisions - decisions payload
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateDecisionsAuthoringSurface(decisions) {
  const errors = [];
  const seeds = Array.isArray(decisions?.seeds) ? decisions.seeds : [];
  if (seeds.length === 0) {
    errors.push('the decisions payload must declare at least one seed');
  }
  for (const seed of seeds) {
    const aiSections = seed?.aiSections;
    if (aiSections === null || typeof aiSections !== 'object' || Array.isArray(aiSections)) {
      errors.push(`seed ${seed?.packageId ?? '?'} must carry an aiSections object`);
      continue;
    }
    for (const key of Object.keys(aiSections)) {
      if (!SEED_AUTHORING_SECTION_INDEXES.includes(Number(key))) {
        errors.push(`seed ${seed.packageId} must not author section "${key}": sections 1 and 2 are machine-injected`);
      }
    }
    for (const index of SEED_AUTHORING_SECTION_INDEXES) {
      if (!Object.prototype.hasOwnProperty.call(aiSections, String(index))) {
        errors.push(`seed ${seed.packageId} is missing the authoring section "${index}"`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
