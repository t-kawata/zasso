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
  const contractBlock = parseJsonBlock(headings.find((heading) => heading.index === 2).body, 'section 2');
  const traceSection = headings.find((heading) => heading.index === 14);
  return {
    packageName,
    headings,
    referenceBlock: parseJsonBlock(headings.find((heading) => heading.index === 1).body, 'section 1'),
    contractBlock,
    contractEdges: contractBlock.contract_edges ?? [],
    allocationIndexRows: parseAllocationIndex(allocationSection.body),
    traceabilityRows: parseTraceabilityIndex(traceSection.body),
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
function parseJsonBlock(body, label) {
  const match = /```json\n([\s\S]*?)```/.exec(body);
  if (!match) {
    throw new WorkSpacifyTreeError(`${label} must carry a json code block`, { gateId: 'G3.6' });
  }
  try {
    return JSON.parse(match[1]);
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
