// [::TICKET::] PX-193 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-193 --for-spec --no-implementation-order`.
// [::TICKET::] PX-190 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-190 --for-spec --no-implementation-order`.
// PX-193 @verifies C002
/**
 * RFC-SEED.md parsing.
 *
 * Every rendered seed can be mechanically re-read: the required headings in order,
 * the machine reference block (section 1), the coupling contracts (section 2), the
 * Allocation Index rows (section 3) and the segment-addressed trace rows (section 14).
 * A missing or malformed machine block is a parse failure, never an empty value.
 *
 * A seed written by an older conver is read against the format it declares, not
 * against the one this conver writes. The declaration is the only evidence used:
 * inferring the format from the heading count would make the exact-count check
 * unfalsifiable, because the count is the very property the format defines. A
 * seed declaring no format, or one the table does not declare, is reported as
 * such and parsed against the format this run requires — so a defect inside a
 * format still fails, and a version difference is reported rather than thrown.
 */
import { WorkSpacifyTreeError } from '../../workspacify-tree/lib/errors.mjs';
import {
  SEED_FORMAT_MARKER,
  SEED_MACHINE_SECTION_INDEX,
  SEED_REQUIRED_SECTIONS,
  SEED_TITLE_PREFIX,
  SEED_ALLOCATION_SECTION_POSITION,
  SEED_CONTRACT_SECTION_POSITION,
  SEED_TRACEABILITY_SECTION_POSITION,
  SEED_FORMATS,
  assertSeedBodyValid,
  currentSeedFormat,
  resolveSeedFormat,
  seedFormatSectionAt,
} from './seed-model.mjs';

const HEADING_PATTERN = /^## (\d+)\. (.+?)\s*$/;
const JSON_BLOCK_PATTERN = /```json\n([\s\S]*?)```/;

/**
 * Scan a seed's section headings, without judging whether they are the right ones.
 *
 * The reverse rotation has to count the headings of a seed it is about to reject —
 * a fifteenth section is the exact defect the heading contract exists to catch —
 * so the count cannot come from a parser that throws on the count being wrong.
 * Splitting the scan out keeps one definition of what a heading is: `parseSeed`
 * and every counter read the same list.
 *
 * @param {string} seedText - full seed markdown
 * @returns {Array<{ index: number, title: string, body: string[] }>} headings in document order
 */
// [::TICKET::] P22-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-12 --for-spec --no-implementation-order`.
export function scanSeedHeadings(seedText) {
  const headings = [];
  let current = null;
  for (const line of String(seedText ?? '').split('\n')) {
    const match = HEADING_PATTERN.exec(line);
    if (match) {
      if (current) {
        headings.push(current);
      }
      current = { index: Number.parseInt(match[1], 10), title: match[2], body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) {
    headings.push(current);
  }
  return headings;
}

/**
 * The raw text of a section's single JSON code block.
 *
 * @param {string} body - section body
 * @param {string} label - section label used in the error message
 * @returns {string} the block's contents, unparsed
 * @throws {WorkSpacifyTreeError} gateId "G3.6" when the block is absent
 */
// [::TICKET::] P23-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-10 --for-spec --no-implementation-order`.
function extractJsonBlockText(body, label) {
  const match = JSON_BLOCK_PATTERN.exec(body);
  if (!match) {
    throw new WorkSpacifyTreeError(`${label} must carry a json code block`, { gateId: 'G3.6' });
  }
  return match[1];
}

/**
 * How many times a key is declared at the top level of a JSON object's text.
 *
 * `JSON.parse` keeps the last of two identical keys without saying so, which
 * would let one block that declares two versions resolve to whichever came
 * second. Counting at depth one is what makes "declared twice" observable at all.
 *
 * @param {string} jsonText - the block's contents
 * @param {string} key - the field name to count
 * @returns {number} the number of top-level declarations
 */
// [::TICKET::] P23-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-10 --for-spec --no-implementation-order`.
function countTopLevelKey(jsonText, key) {
  const wanted = JSON.stringify(key);
  let depth = 0;
  let count = 0;
  let inString = false;
  let escaped = false;
  for (let position = 0; position < jsonText.length; position += 1) {
    const character = jsonText[position];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      if (depth === 1 && jsonText.startsWith(wanted, position)) {
        const after = jsonText.slice(position + wanted.length).match(/^\s*:/);
        if (after) {
          count += 1;
        }
      }
      inString = true;
      continue;
    }
    if (character === '{' || character === '[') {
      depth += 1;
      continue;
    }
    if (character === '}' || character === ']') {
      depth -= 1;
    }
  }
  return count;
}

/**
 * Determine a seed's format from its own declaration.
 *
 * The declaration lives in the seed's first section — section 1, whatever index
 * that section carries in its format — and it is the whole of the evidence. A
 * seed that declares nothing is `unversioned`: the honest reading of a document
 * written before the marker existed, and never an invitation to assume the
 * current format. A seed that declares a version the table does not hold is
 * `unrecognised`, and says which string it declared.
 *
 * @param {string} seedText - full seed markdown
 * @returns {{ version: string|null, marker: string|null, evidence: string }} the determination
 * @throws {WorkSpacifyTreeError} gateId "G3.6" on a non-seed, a missing machine block, an unparseable block or a repeated declaration
 */
export function determineSeedFormat(seedText) {
  if (typeof seedText !== 'string' || seedText.trim() === '') {
    throw new WorkSpacifyTreeError('determineSeedFormat needs the seed text as a non-empty string', { gateId: 'G3.6' });
  }
  const [machineHeading] = scanSeedHeadings(seedText);
  if (!machineHeading) {
    return {
      version: null,
      marker: null,
      evidence: `the seed carries no section ${SEED_MACHINE_SECTION_INDEX}, so no ${SEED_FORMAT_MARKER} field was present`,
    };
  }
  const blockText = extractJsonBlockText(machineHeading.body.join('\n'), `section ${SEED_MACHINE_SECTION_INDEX}`);
  const declarations = countTopLevelKey(blockText, SEED_FORMAT_MARKER);
  if (declarations > 1) {
    throw new WorkSpacifyTreeError(
      `section ${SEED_MACHINE_SECTION_INDEX}'s machine block declares ${SEED_FORMAT_MARKER} more than once`,
      { gateId: 'G3.6' },
    );
  }
  if (declarations === 0) {
    return {
      version: null,
      marker: null,
      evidence: `section ${SEED_MACHINE_SECTION_INDEX}'s machine block carries no ${SEED_FORMAT_MARKER} field`,
    };
  }
  let block;
  try {
    block = JSON.parse(blockText);
  } catch {
    throw new WorkSpacifyTreeError(
      `section ${SEED_MACHINE_SECTION_INDEX} json code block is not valid JSON`,
      { gateId: 'G3.6' },
    );
  }
  const version = block[SEED_FORMAT_MARKER];
  return {
    version,
    marker: SEED_FORMAT_MARKER,
    evidence: `section ${SEED_MACHINE_SECTION_INDEX}'s machine block declares ${SEED_FORMAT_MARKER}: ${version}`,
  };
}

/**
 * The package name a seed's title line declares, or null when it declares none.
 *
 * A finding has to say which seed it is about, and at the point a gate judges a
 * seed the only identification it has is the text itself. The title line is the
 * seed's own answer to "whose seed is this", so it is read from there rather
 * than passed in from a caller that may not have a path.
 *
 * @param {string} seedText - full seed markdown
 * @returns {string|null} the declared package name
 */
export function seedPackageName(seedText) {
  if (typeof seedText !== 'string') {
    return null;
  }
  const [titleLine = ''] = seedText.split('\n');
  return titleLine.startsWith(SEED_TITLE_PREFIX) ? titleLine.slice(SEED_TITLE_PREFIX.length).trim() || null : null;
}

/**
 * How far the declared format is from the one the run reads.
 *
 * The comparison is stated only when it is knowable. An unrecognised version and
 * an absent declaration both leave the declared section list unknown, and
 * reporting that as "0 sections" would read as "no difference" — the opposite of
 * what the finding exists to say.
 */
// [::TICKET::] P23-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-10 --for-spec --no-implementation-order`.
function describeSectionDifference(determined, requiredSections) {
  const declaredRow = resolveSeedFormat(determined);
  if (declaredRow !== null) {
    return `${declaredRow.sections.length} section(s) are addressed by the declared format against ${requiredSections} the run reads`;
  }
  if (determined.version === null) {
    return `no format is declared, so its section count cannot be compared with the ${requiredSections} the run reads`;
  }
  return `the declared format ${determined.version} is not declared here, so its section count is unknown against the ${requiredSections} the run reads`;
}

/**
 * The prose finding a compatibility gap is published as.
 *
 * Four things, and nothing else: the seed, the format determined, the format the
 * run needs, and the concrete change that would reconcile them. The section
 * difference is stated because it is what an operator compares first, and the
 * reconciling sentence is written out because the finding's whole purpose is to
 * be actionable without a second measurement.
 *
 * @param {{ determined: object, required: object, seed?: string|null }} input
 * @returns {string} a Markdown finding
 */
export function reportSeedCompatibility({ determined, required, seed = null }) {
  const declared = determined.version === null
    ? `unversioned — ${determined.evidence}`
    : `${determined.version} — ${determined.evidence}`;
  const requiredSections = required.sections.length;
  return [
    `### ${seed ?? 'the seed'}`,
    '',
    `- Determined: ${declared}`,
    `- Required by this run: ${required.version}, which carries ${requiredSections} sections`,
    `- Difference: ${describeSectionDifference(determined, requiredSections)}`,
    `- To reconcile: set ${SEED_FORMAT_MARKER} to ${required.version} in section ${SEED_MACHINE_SECTION_INDEX}'s machine block and re-render, or add a declared format row for ${determined.version ?? 'the absent declaration'}`,
    '',
  ].join('\n');
}

/**
 * Check one heading against the section the format expects at its position.
 *
 * Each message is raised beside the check that produces it, so the report and
 * the defect cannot drift apart.
 *
 * @param {{ index: number, title: string, body: string[] }} actual - the heading found
 * @param {{ index: number, title: string }} expected - the section expected
 * @param {number} position - 1-based ordinal, used when the index itself is wrong
 * @throws {WorkSpacifyTreeError} gateId "G3.6" naming the specific defect
 */
// [::TICKET::] P23-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-10 --for-spec --no-implementation-order`.
function assertHeadingMatches(actual, expected, position) {
  if (actual.index !== expected.index) {
    throw new WorkSpacifyTreeError(`heading ${position} has index ${actual.index}, expected ${expected.index}`, { gateId: 'G3.6' });
  }
  if (actual.title !== expected.title) {
    throw new WorkSpacifyTreeError(`heading ${expected.index} has title "${actual.title}", expected "${expected.title}"`, { gateId: 'G3.6' });
  }
  const body = actual.body.join('\n');
  const reason = assertSeedBodyValid(body);
  if (reason !== null) {
    throw new WorkSpacifyTreeError(`heading ${expected.index} body is invalid: ${reason}`, { gateId: 'G3.6' });
  }
  actual.body = body;
}

/** The body of the heading carrying one index, or null when the format does not carry it. */
// [::TICKET::] P23-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-10 --for-spec --no-implementation-order`.
function sectionBodyAt(headings, index) {
  return headings.find((heading) => heading.index === index)?.body ?? null;
}

/**
 * Parse a rendered RFC-SEED.md document under the format it declares.
 *
 * The format is resolved first, so the headings are checked against the list the
 * seed was written under and the machine sections are read at that format's
 * indices. A seed whose declaration names nothing the table holds is checked
 * against the format this run requires, which is what keeps a defect — a
 * fifteenth heading, a transposed title — failing exactly as it did before.
 *
 * @param {string} seedText - full seed markdown
 * @param {{ formats?: ReadonlyArray<object> }} [options] - the declared formats to resolve against
 * @returns {{ packageName: string, headings: Array<object>, allocationIndexRows: Array<object> }}
 * @throws {WorkSpacifyTreeError} gateId "G3.6" on malformed structure
 */
export function parseSeed(seedText, { formats = SEED_FORMATS } = {}) {
  const lines = seedText.split('\n');
  if (!lines[0].startsWith(SEED_TITLE_PREFIX)) {
    throw new WorkSpacifyTreeError('seed does not start with the RFC Seed title', { gateId: 'G3.6' });
  }
  const packageName = lines[0].slice(SEED_TITLE_PREFIX.length).trim();

  const headings = scanSeedHeadings(seedText);
  const determinedFormat = resolveSeedFormat(determineSeedFormat(seedText, { formats }), { formats }) ?? currentSeedFormat({ formats });
  const sectionsExpected = determinedFormat.sections;

  if (headings.length !== sectionsExpected.length) {
    throw new WorkSpacifyTreeError(`seed has ${headings.length} headings, expected ${sectionsExpected.length}`, { gateId: 'G3.6' });
  }
  for (let position = 0; position < headings.length; position += 1) {
    assertHeadingMatches(headings[position], sectionsExpected[position], position + 1);
  }

  const allocationSection = seedFormatSectionAt(determinedFormat, SEED_ALLOCATION_SECTION_POSITION);
  const traceSection = seedFormatSectionAt(determinedFormat, SEED_TRACEABILITY_SECTION_POSITION);
  const contractSection = seedFormatSectionAt(determinedFormat, SEED_CONTRACT_SECTION_POSITION);
  const machineBody = sectionBodyAt(headings, determinedFormat.machineSectionIndex);
  const contractBody = contractSection === null ? null : sectionBodyAt(headings, contractSection.index);
  const contractBlock = contractBody === null ? null : parseJsonBlock(contractBody, `section ${contractSection.index}`);
  return {
    packageName,
    headings,
    referenceBlock: machineBody === null ? null : parseJsonBlock(machineBody, `section ${determinedFormat.machineSectionIndex}`),
    contractBlock,
    contractEdges: contractBlock?.contract_edges ?? [],
    allocationIndexRows: allocationSection === null ? [] : parseAllocationIndex(sectionBodyAt(headings, allocationSection.index)),
    traceabilityRows: traceSection === null ? [] : parseTraceabilityIndex(sectionBodyAt(headings, traceSection.index)),
  };
}

/**
 * Extract the single JSON code block of a machine section.
 *
 * @param {string} body - section body
 * @param {string} label - section label used in the error message
 * @returns {object} parsed JSON block
 * @throws {WorkSpacifyTreeError} gateId "G3.6" when the block is missing or unparseable
 */
// [::TICKET::] P23-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-10 --for-spec --no-implementation-order`.
function parseJsonBlock(body, label) {
  const blockText = extractJsonBlockText(body, label);
  try {
    return JSON.parse(blockText);
  } catch {
    throw new WorkSpacifyTreeError(`${label} json code block is not valid JSON`, { gateId: 'G3.6' });
  }
}

/**
 * Recover the segment-addressed trace rows from the section-14 body.
 *
 * @param {string} body - section 14 body
 * @returns {Array<{ inventoryId: string, segmentId: string }>} trace rows
 */
function parseTraceabilityIndex(body) {
  const rows = [];
  for (const line of body.split('\n')) {
    const match = /^- ([a-z_]+):(\S+) \(.*?\) — segments (.+?) \(/.exec(line.trim());
    if (!match) {
      continue;
    }
    for (const segmentId of match[3].split(',').map((entry) => entry.trim())) {
      if (/^s-\d{6}$/.test(segmentId)) {
        rows.push({ inventoryId: `${match[1]}:${match[2]}`, segmentId });
      }
    }
  }
  return rows;
}

/**
 * Recover the Allocation Index rows from the section-3 body.
 *
 * @param {string} body - section 3 body text
 * @returns {Array<object>} allocation rows
 */
function parseAllocationIndex(body) {
  const rows = [];
  const lines = body.split('\n');
  let inTable = false;
  for (const line of lines) {
    if (!line.trim().startsWith('|')) {
      continue;
    }
    const cells = splitRow(line);
    if (cells[0] === 'Category') {
      inTable = true;
      continue;
    }
    if (!inTable) {
      continue;
    }
    if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) {
      continue; // separator row
    }
    if (cells.length !== 3) {
      throw new WorkSpacifyTreeError(`Allocation Index row must have 3 cells: ${line}`, { gateId: 'G3.6' });
    }
    rows.push({ category: cells[0], inventory_ref: cells[1], canonical_name: cells[2] });
  }
  return rows;
}

/**
 * Split a markdown table row into trimmed cells, dropping the leading and
 * trailing empty cells produced by the surrounding pipes.
 *
 * @param {string} line - raw table line
 * @returns {string[]} trimmed cells
 */
function splitRow(line) {
  const raw = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return raw.split('|').map((cell) => cell.trim());
}
