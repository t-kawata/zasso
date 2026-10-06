/**
 * Reading a markdown record by section and by table.
 *
 * The defect and divergence ledgers are appendices inside an RFC, and the RFC is the
 * only source of truth — there is deliberately no side file. These helpers are what
 * let each gate read the document instead of a copy of it.
 */

/** The ATX heading a line carries, or null when the line is not a heading. */
export function matchHeading(line) {
  const match = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
  if (!match) return null;
  return { level: match[1].length, title: match[2] };
}

/**
 * Normalise a heading for comparison: drop its level markers, a leading section
 * sign, and surrounding space, so `## 3.9.4`, `3.9.4` and `§3.9.4` all compare equal.
 *
 * @param {string} title
 * @returns {string}
 */
export function normalizeHeading(title) {
  return title.replace(/^#+\s*/, '').replace(/^§\s*/, '').trim();
}

/**
 * The body of the first section whose title ends with `titleSuffix`.
 *
 * The body runs from just after the heading to the next heading of the same or a
 * shallower level, so a nested subsection stays inside its parent.
 *
 * @param {string} text — the whole document
 * @param {string} titleSuffix — matched against the normalised title, case-sensitive
 * @returns {{ found: boolean, title: string, body: string, startLine: number }}
 */
export function findSectionByTitleSuffix(text, titleSuffix) {
  const lines = text.split('\n');
  const heading = lines
    .map((line, index) => ({ heading: matchHeading(line), index }))
    .find((entry) => entry.heading && normalizeHeading(entry.heading.title).endsWith(titleSuffix));

  if (!heading) return { found: false, title: '', body: '', startLine: -1 };

  const body = lines.slice(heading.index + 1, sectionEnd(lines, heading.index, heading.heading.level)).join('\n');
  return { found: true, title: heading.heading.title, body, startLine: heading.index };
}

/**
 * The body of the first section whose normalised title starts with `key`.
 *
 * @param {string} text
 * @param {string} key — already normalised by the caller
 * @returns {{ found: boolean, title: string, level: number, body: string }}
 */
export function findSectionByTitlePrefix(text, key) {
  const lines = text.split('\n');
  const heading = lines
    .map((line, index) => ({ heading: matchHeading(line), index }))
    .find((entry) => entry.heading && normalizeHeading(entry.heading.title).startsWith(key));

  if (!heading) return { found: false, title: '', level: 0, body: '' };

  const end = sectionEnd(lines, heading.index, heading.heading.level);
  return {
    found: true,
    title: heading.heading.title,
    level: heading.heading.level,
    body: lines.slice(heading.index, end).join('\n'),
  };
}

/** The index of the first line after `start` that closes a heading of `level`. */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
function sectionEnd(lines, start, level) {
  for (let index = start + 1; index < lines.length; index += 1) {
    const heading = matchHeading(lines[index]);
    if (heading && heading.level <= level) return index;
  }
  return lines.length;
}

/**
 * The rows of the first markdown table in `text`, header and separator removed.
 *
 * Cells are trimmed; a row whose cell count differs from the header is returned as
 * well, because a malformed row is what the caller's gate must report.
 *
 * @param {string} text
 * @returns {{ header: string[], rows: string[][] }}
 */
export function readFirstTable(text) {
  const lines = text.split('\n');
  const headerIndex = lines.findIndex(
    (line, index) => isTableRow(line) && isSeparator(lines[index + 1]),
  );

  if (headerIndex === -1) return { header: [], rows: [] };

  const header = splitRow(lines[headerIndex]);
  const rows = [];
  for (let index = headerIndex + 2; index < lines.length && isTableRow(lines[index]); index += 1) {
    rows.push(splitRow(lines[index]));
  }
  return { header, rows };
}

/** Whether a line is a markdown table row. */
export function isTableRow(line) {
  return /^\s*\|.*\|\s*$/.test(line);
}

/** Whether a line is a table's `|---|` separator. */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
function isSeparator(line) {
  return typeof line === 'string' && /^\s*\|[\s:|-]+\|\s*$/.test(line) && line.includes('-');
}

/**
 * A table cell's value is what it holds, not the markup that holds it. The nine
 * migrated packages write artifact names and classes as code spans — `` `RFC-SEED.md` ``
 * rather than `RFC-SEED.md` — and both must read as the same value.
 *
 * @param {string} cell
 * @returns {string}
 */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
function unwrapCodeSpan(cell) {
  const match = /^`(.*)`$/.exec(cell);
  return match ? match[1].trim() : cell;
}

/**
 * The cells of one table row.
 *
 * @param {string} line
 * @returns {string[]}
 */
export function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => unwrapCodeSpan(cell.trim()));
}
