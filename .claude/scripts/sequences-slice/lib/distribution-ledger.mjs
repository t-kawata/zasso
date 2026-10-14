/**
 * The distribution ledger, read as a record rather than as prose.
 *
 * The ledger is an appendix inside the package RFC, the same way the defect and divergence
 * ledgers are: there is deliberately no side file, so the RFC stays the only source of
 * truth and a reader cannot find two answers. This module reads it and decides whether it
 * is well formed; it decides nothing about whether the design is adequate, which is a
 * reading and not a property.
 *
 * It is written once here rather than in the gate that checks it, because the drill's
 * consistency verifier reads the same record and the drill's Step 1 is self-contained by
 * contract: reaching into another command's directory for the rule would break that.
 */

/** The appendix title, matched as a suffix so a numbered heading still counts. */
export const LEDGER_TITLE_SUFFIX = 'Distribution ledger';

/** The statement that makes this document canonical over the material it was written from. */
export const PRECEDENCE_MARKER = 'canonical';

/** The ledger's columns, in the order that makes a row readable. */
export const LEDGER_COLUMNS = Object.freeze(['Unit', 'Kind', 'Owner', 'RFC location', 'Ground']);

/** The kinds a row may declare. */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
export const UNIT_KINDS = Object.freeze(['operation', 'sequence', 'cross-boundary-sequence', 'contract', 'surface', 'declared-residual']);

/** What a ledger with no rows must say to be told from one nobody read. */
export const COMPOSITION_CHECK_PATTERN = /composition check/i;

/** A markdown table row's cells, or null when the line is not a table row. */
// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
function cellsOf(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  return trimmed
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

/** The ATX heading a line carries, or null. */
// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
function headingOf(line) {
  const match = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
  return match === null ? null : { level: match[1].length, title: match[2].replace(/^#+\s*/, '').trim() };
}

/**
 * The body of the ledger appendix, or null when the document carries none.
 *
 * @param {string} rfcText
 * @returns {{ body: string, lines: string[] }|null}
 */
// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
export function findDistributionLedger(rfcText) {
  const lines = String(rfcText).split('\n');
  const start = lines.findIndex((line) => {
    const heading = headingOf(line);
    return heading !== null && heading.title.endsWith(LEDGER_TITLE_SUFFIX);
  });
  if (start === -1) return null;

  const level = headingOf(lines[start]).level;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const heading = headingOf(lines[index]);
    if (heading !== null && heading.level <= level) {
      end = index;
      break;
    }
  }
  return { body: lines.slice(start + 1, end).join('\n'), lines: lines.slice(start + 1, end) };
}

/**
 * The ledger's rows, or null when the document carries no ledger.
 *
 * A row is returned only when it has the five cells the columns declare, so a caller that
 * reads rows never has to decide what a short row meant.
 *
 * @param {string} rfcText
 * @returns {Array<{ unit: string, kind: string, owner: string, location: string, ground: string, index: number }>|null}
 */
// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
export function readLedgerRows(rfcText) {
  const found = findDistributionLedger(rfcText);
  if (found === null) return null;

  const rows = [];
  let seenHeader = false;
  for (const line of found.lines) {
    const cells = cellsOf(line);
    if (cells === null) continue;
    if (!seenHeader) {
      seenHeader = true;
      continue;
    }
    if (cells.every((cell) => /^-+$/.test(cell))) continue;
    rows.push({
      index: rows.length,
      unit: cells[0],
      kind: cells[1],
      owner: cells[2],
      location: cells[3],
      ground: cells[4],
    });
  }
  return rows;
}

/**
 * Whether a row's location resolves inside its own document.
 *
 * The divergence-ledger rule, kept: a cell that is empty says nothing, and a cell naming a
 * file says which document to open rather than where inside this one to look.
 *
 * @param {string} location
 * @returns {boolean}
 */
// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
export function resolvesInsideRfc(location) {
  const trimmed = String(location).trim();
  return trimmed.length > 0 && !trimmed.endsWith('.md');
}

/**
 * The verdict on one package's ledger.
 *
 * Returns null when the document carries no ledger at all. That is not a refusal: it is the
 * state every package has before the material arrives, and the caller must be able to tell
 * it from a ledger that is present and wrong.
 *
 * The unit set is injected rather than derived, because a row naming a unit the projection
 * never distributed is a row about a different package. Passing an empty set means the
 * caller has no projection to bound against, and the membership rule is skipped rather than
 * failing every row.
 *
 * @param {string} rfcText
 * @param {Set<string>} [unitIds]
 * @returns {{ ok: boolean, reason: string|null, rows: object[] }|null}
 */
// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
export function readDistributionLedger(rfcText, unitIds = null) {
  const found = findDistributionLedger(rfcText);
  if (found === null) return null;

  if (!found.body.includes(PRECEDENCE_MARKER)) {
    return { ok: false, reason: `the ${LEDGER_TITLE_SUFFIX} does not state that this document is ${PRECEDENCE_MARKER}`, rows: [] };
  }

  const headerCells = headerOf(found.lines);
  if (headerCells === null || headerCells.join(' | ') !== LEDGER_COLUMNS.join(' | ')) {
    return {
      ok: false,
      reason: `the ${LEDGER_TITLE_SUFFIX} header must be exactly [${LEDGER_COLUMNS.join(', ')}] in order, and is [${(headerCells ?? []).join(', ')}]`,
      rows: [],
    };
  }

  const rows = readLedgerRows(rfcText) ?? [];
  for (const row of rows) {
    if (unitIds !== null && unitIds.size > 0 && !unitIds.has(row.unit)) {
      return { ok: false, reason: `row ${row.index} names the unit ${row.unit}, which this package's projection does not distribute`, rows };
    }
    if (!UNIT_KINDS.includes(row.kind)) {
      return { ok: false, reason: `row ${row.index} declares the kind ${row.kind}, which is not one of ${UNIT_KINDS.join(', ')}`, rows };
    }
    if (!resolvesInsideRfc(row.location)) {
      return { ok: false, reason: `row ${row.index} cites the location "${row.location}", which does not resolve inside this document`, rows };
    }
    if (row.ground.trim().length === 0) {
      return { ok: false, reason: `row ${row.index} carries no ground`, rows };
    }
  }

  if (rows.length === 0 && !COMPOSITION_CHECK_PATTERN.test(found.body)) {
    return { ok: false, reason: `the ${LEDGER_TITLE_SUFFIX} rows nothing and records no composition check, so it cannot be told from unread`, rows };
  }
  return { ok: true, reason: null, rows };
}

/** The first table row of a ledger body, which is its header. */
// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
function headerOf(lines) {
  for (const line of lines) {
    const cells = cellsOf(line);
    if (cells !== null) return cells;
  }
  return null;
}
