// [::TICKET::] PX-190 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-190 --for-spec --no-implementation-order`.
// PX-190 @verifies C003
/**
 * RFC-SEED.md parsing (corrected ALLOCATE §10.4 replacement).
 *
 * Every rendered seed can be mechanically re-read: the required headings are
 * extracted in order and the Allocation Index table rows are recovered so the
 * parity gate can compare the realized seed to the manifest expectation.
 */
import { WorkSpacifyTreeError } from '../../workspacify-tree/lib/errors.mjs';
import { SEED_REQUIRED_SECTIONS, SEED_TITLE_PREFIX, assertSeedBodyValid } from './seed-model.mjs';

const HEADING_PATTERN = /^## (\d+)\. (.+?)\s*$/;

/**
 * Parse a rendered RFC-SEED.md document.
 *
 * @param {string} seedText - full seed markdown
 * @returns {{ packageName: string, headings: Array<object>, allocationIndexRows: Array<object> }}
 * @throws {WorkSpacifyTreeError} gateId "G3.6" on malformed structure
 */
export function parseSeed(seedText) {
  const lines = seedText.split('\n');
  if (!lines[0].startsWith(SEED_TITLE_PREFIX)) {
    throw new WorkSpacifyTreeError('seed does not start with the RFC Seed title', { gateId: 'G3.6' });
  }
  const packageName = lines[0].slice(SEED_TITLE_PREFIX.length).trim();

  const headings = [];
  let current = null;
  for (const line of lines.slice(1)) {
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

  if (headings.length !== SEED_REQUIRED_SECTIONS.length) {
    throw new WorkSpacifyTreeError(`seed has ${headings.length} headings, expected ${SEED_REQUIRED_SECTIONS.length}`, { gateId: 'G3.6' });
  }
  for (let i = 0; i < headings.length; i += 1) {
    const expected = SEED_REQUIRED_SECTIONS[i];
    const actual = headings[i];
    if (actual.index !== expected.index) {
      throw new WorkSpacifyTreeError(`heading ${i + 1} has index ${actual.index}, expected ${expected.index}`, { gateId: 'G3.6' });
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

  const allocationSection = headings.find((heading) => heading.index === 3);
  return { packageName, headings, allocationIndexRows: parseAllocationIndex(allocationSection.body) };
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
