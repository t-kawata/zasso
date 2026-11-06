/**
 * Read the supplied census a sourceEnumerations pin names.
 *
 * The pin records the file, the digest and the shape that reads it. The shape vocabulary
 * is the one the educe rail uses: fenced JSON rows, a table column, marked lines and
 * specification spans. A refusal is named, never silent: a missing file, an empty census
 * and an unreadable shape would otherwise look the same to the caller.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SUPPLIED_DIRECTORY = 'educe-sequences';
const SUPPLIED_SUBDIRECTORY = 'supplied';
const SPAN_PATTERN = /^(\d+)(?:-(\d+))?$/;

/** The shapes this reader and the educe rail both support. */
// [::TICKET::] PX-383 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-383 --for-spec --no-implementation-order`.
export const SUPPORTED_SHAPES = Object.freeze(['jsonFieldRows', 'tableColumn', 'markedLines', 'specSpans']);

/** A named refusal the caller can report without guessing. */
// [::TICKET::] PX-303 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-303 --for-spec --no-implementation-order`.
function makeRefusal(code, problem) {
  return { ok: false, code, problem };
}

/** The bodies of every fenced block in a document, as arrays of lines. */
// [::TICKET::] PX-383 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-383 --for-spec --no-implementation-order`.
function fencedBodies(lines) {
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

/** The span a member states, or null when it states none. */
// [::TICKET::] PX-383 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-383 --for-spec --no-implementation-order`.
function parseSpanMember(member) {
  const match = SPAN_PATTERN.exec(String(member).trim());
  if (match === null) return null;
  const first = Number(match[1]);
  const last = match[2] === undefined ? first : Number(match[2]);
  return first >= 1 && last >= first ? { first, last } : null;
}

/** The members a fenced JSON block carries at one field. */
// [::TICKET::] PX-383 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-383 --for-spec --no-implementation-order`.
function extractJsonFieldRows(lines, parameter) {
  const members = [];
  const rows = [];
  for (const body of fencedBodies(lines)) {
    const bodyRows = body.filter((line) => line.trim() !== '');
    // A block of prose or code is not this shape's business; only a block whose first
    // row is an object is a row block, exactly as the educe rail reads it.
    if (bodyRows.length === 0 || !bodyRows[0].trim().startsWith('{')) continue;
    for (const row of bodyRows) {
      let parsed;
      try {
        parsed = JSON.parse(row);
      } catch {
        return { refused: `the row "${row.slice(0, 60)}" is not readable as JSON` };
      }
      if (parsed === null || typeof parsed !== 'object' || !(parameter in parsed)) {
        return { refused: `the row "${row.slice(0, 60)}" does not carry ${parameter}` };
      }
      members.push(String(parsed[parameter]));
      rows.push(parsed);
    }
  }
  return { members, rows };
}

/** Whether a line is a table's separator row. */
// [::TICKET::] PX-383 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-383 --for-spec --no-implementation-order`.
function isSeparatorRow(line) {
  return /^\s*\|[\s:|-]+\|\s*$/.test(line);
}

/** The cells of a table row, or null when the line is not one. */
// [::TICKET::] PX-383 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-383 --for-spec --no-implementation-order`.
function tableCellsOf(line) {
  if (!/^\s*\|/.test(line)) return null;
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

/** The members a table column carries beneath each header that names it. */
// [::TICKET::] PX-383 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-383 --for-spec --no-implementation-order`.
function extractTableColumn(lines, parameter) {
  const members = [];
  const rows = [];
  let column = null;
  for (const [index, line] of lines.entries()) {
    const cells = tableCellsOf(line);
    if (cells === null) continue;
    if (isSeparatorRow(line)) continue;
    if (isSeparatorRow(lines[index + 1] ?? '')) {
      column = cells.indexOf(parameter);
      if (column === -1) return { refused: `the table has no ${parameter} column` };
      continue;
    }
    if (column === null) continue;
    if (cells.length <= column || cells[column] === '') {
      return { refused: `the row "${line.slice(0, 60)}" carries no ${parameter} column` };
    }
    members.push(cells[column]);
    rows.push({ key: cells[column], value: cells[column] });
  }
  return { members, rows };
}

/** The members marked lines carry after their prefix, outside fenced blocks. */
// [::TICKET::] PX-383 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-383 --for-spec --no-implementation-order`.
function extractMarkedLines(lines, parameter) {
  const members = [];
  const rows = [];
  let insideFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence || line.trim() === '') continue;
    if (!line.startsWith(parameter)) return { refused: `the line "${line.slice(0, 60)}" does not begin with ${parameter}` };
    const value = line.slice(parameter.length).trim();
    if (value === '') return { refused: `a line carries no member after ${parameter}` };
    members.push(value);
    rows.push({ key: value, value });
  }
  return { members, rows };
}

/** The span members a fenced JSON block carries at one field. */
// [::TICKET::] PX-383 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-383 --for-spec --no-implementation-order`.
function extractSpecSpans(lines, parameter) {
  const extracted = extractJsonFieldRows(lines, parameter);
  if (extracted.refused !== undefined) return extracted;
  for (const member of extracted.members) {
    if (parseSpanMember(member) === null) {
      return { refused: `the member "${member}" is not a span of the specification` };
    }
  }
  return extracted;
}

/**
 * The members a document holds in the shape and at the parameter the declaration names.
 *
 * Every shape is total over the elements it claims: an element it cannot read is a named
 * refusal rather than a member that leaves the census without anything failing.
 *
 * @param {{ lines: string[], shape: string, parameter: string }} input
 * @returns {{ members: string[], rows: object[] } | { refused: string }}
 */
// [::TICKET::] PX-383 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-383 --for-spec --no-implementation-order`.
export function extractCensusMembers({ lines, shape, parameter }) {
  if (!SUPPORTED_SHAPES.includes(shape)) {
    return { refused: `shape "${shape}" is not one of ${SUPPORTED_SHAPES.join(', ')}` };
  }
  if (typeof parameter !== 'string' || parameter === '') {
    return { refused: `the ${shape} shape needs a parameter naming what to read` };
  }
  if (shape === 'jsonFieldRows') return extractJsonFieldRows(lines, parameter);
  if (shape === 'tableColumn') return extractTableColumn(lines, parameter);
  if (shape === 'specSpans') return extractSpecSpans(lines, parameter);
  return extractMarkedLines(lines, parameter);
}

/**
 * Resolve a pinned census to its rows.
 *
 * @param {string} root — the workspace root
 * @param {object} pin — the sourceEnumerations entry
 * @returns {{ ok: true, rows: Array<object>, byKey: Map<string, object>, path: string }
 *   | { ok: false, code: string, problem: string }}
 */
export function readPinnedCensus(root, pin) {
  const file = pin?.source?.file;
  if (typeof file !== 'string' || file === '') {
    return makeRefusal('CENSUS_SOURCE_UNSTATED', 'the pin names no source file');
  }
  const shape = pin?.selector?.shape;
  if (!SUPPORTED_SHAPES.includes(shape)) {
    return makeRefusal('CENSUS_SHAPE_UNSUPPORTED', `the selector shape ${shape} is not one of ${SUPPORTED_SHAPES.join(', ')}`);
  }
  const parameter = pin?.selector?.parameter;
  if (typeof parameter !== 'string' || parameter === '') {
    return makeRefusal('CENSUS_KEY_UNSTATED', 'the selector names no key parameter');
  }

  const path = join(root, SUPPLIED_DIRECTORY, SUPPLIED_SUBDIRECTORY, file);
  if (!existsSync(path)) return makeRefusal('CENSUS_FILE_MISSING', `${path} does not exist`);

  const text = readFileSync(path, 'utf8');
  const digest = createHash('sha256').update(text).digest('hex');
  if (typeof pin.source.sha256 === 'string' && pin.source.sha256 !== '' && digest !== pin.source.sha256) {
    return makeRefusal('CENSUS_DIGEST_MISMATCH', `${file} digests to ${digest}; the pin records ${pin.source.sha256}`);
  }

  const extracted = extractCensusMembers({ lines: text.split('\n'), shape, parameter });
  if (extracted.refused !== undefined) {
    const code = extracted.refused.includes('no fenced block')
      ? 'CENSUS_BLOCK_MISSING'
      : extracted.refused.includes('does not carry')
        ? 'CENSUS_ROW_MISSING_KEY'
        : 'CENSUS_ROW_INVALID';
    return makeRefusal(code, `${file}: ${extracted.refused}`);
  }
  if (extracted.members.length === 0) return makeRefusal('CENSUS_BLOCK_MISSING', `${file} carries no members`);

  const rows = [];
  const byKey = new Map();
  for (const row of extracted.rows) {
    const key = shape === 'jsonFieldRows' || shape === 'specSpans' ? row[parameter] : row.key;
    if (typeof key !== 'string' || key === '') {
      return makeRefusal('CENSUS_ROW_MISSING_KEY', `${file} carries a row without ${parameter}`);
    }
    if (byKey.has(key)) {
      return makeRefusal('CENSUS_DUPLICATE_KEY', `${file} names ${key} twice`);
    }
    byKey.set(key, row);
    rows.push(row);
  }

  return { ok: true, rows, byKey, path };
}
