/**
 * The RFC formula ledger and its machine-readable sidecar.
 *
 * The ledger is read by a person and checked by a gate; the sidecar is read by the
 * stages after the grill. They carry the same identity on purpose: a row that exists
 * in one and not the other is an omission with two places to hide, and both are read.
 */
import { digestFormula } from './digest.mjs';
import { normalizeFormula } from './normalize.mjs';
import { sha256Hex } from '../workspacify-tree/lib/hash.mjs';

/** The appendix heading a package with formulas must carry. */
export const FORMULA_LEDGER_TITLE = 'Formula ledger';

/** The four realization classes a row may declare. */
export const FORMULA_CLASSES = Object.freeze(['computational', 'structural', 'constraint', 'notation']);

/** The sidecar filename beside the RFC. */
export const FORMULA_SIDECAR_FILENAME = 'RFC-FORMULAS.json';

const LEDGER_HEADING = /^(#{1,6})\s+Formula ledger\s*$/m;
const ALL_LEDGER_HEADINGS = /^#{1,6}\s+Formula ledger\s*$/gm;
const METADATA_LINE = /^-\s+([A-Za-z]+):\s+`([0-9a-f]{64})`\s*$/gm;
const LOCATION = /^(.*?):L(\d+)(?:-L(\d+))?$/;

/**
 * Split a Markdown table line into trimmed cells.
 *
 * A cell escapes a literal pipe as `\|`; splitting on every pipe would turn a formula
 * such as `|X^4|=4^4=256` into extra columns and shift every field after it. Split on
 * unescaped pipes only, then restore the escaped pipe in the cell text.
 */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, '|').trim());
}

/** The text between a heading and the next heading of the same or higher level. */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function sectionText(text, headingOffset, level) {
  const after = text.slice(headingOffset);
  const headingLineEnd = after.indexOf('\n');
  const bodyStart = headingLineEnd === -1 ? after.length : headingLineEnd + 1;
  const remainder = after.slice(bodyStart);
  const nextHeading = new RegExp(`^#{1,${level}}\\s+`, 'm').exec(remainder);
  const body = nextHeading === null ? remainder : remainder.slice(0, nextHeading.index);
  return body;
}

/** Parse `path:Lstart-Lend` into a location record. */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function parseLocation(cell) {
  const match = cell.match(LOCATION);
  if (match === null) return null;
  return {
    path: match[1].replace(/^§/, '').trim(),
    lineStart: Number(match[2]),
    lineEnd: Number(match[3] ?? match[2]),
  };
}

/** Parse the theory cell into symbols and normative lines. */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function parseTheory(cell) {
  const match = /symbols:\s*(.*?);\s*normative:\s*(.*)$/is.exec(cell);
  if (match === null) return { symbols: [], normative: [] };

  const symbols = match[1].split(';').map((entry) => {
    const definition = entry.split('=');
    return {
      symbol: definition[0]?.trim() ?? '',
      definition: definition.slice(1).join('=').trim(),
    };
  }).filter((entry) => entry.symbol.length > 0 && entry.definition.length > 0);

  const normative = match[2].split(';').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  return { symbols, normative };
}

/** The formula id and body a Formula cell carries. */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function parseFormulaCell(cell) {
  const id = /fx-[0-9a-f]{12}/.exec(cell)?.[0] ?? null;
  const open = cell.indexOf('(');
  const close = cell.lastIndexOf(')');
  const body = open === -1 || close <= open ? '' : cell.slice(open + 1, close).trim();
  return { id, body };
}

/** The path#symbol anchors an Implemented by cell carries. */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function parseSymbols(cell) {
  return cell.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

/** A stable, order-insensitive representation for ledger/sidecar field parity. */
// [::TICKET::] PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-365 --for-spec --no-implementation-order`.
function normalizeSymbols(entries) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => `${String(entry?.symbol ?? '').trim()}=${String(entry?.definition ?? '').trim()}`)
    .filter((entry) => entry !== '=')
    .sort();
}

/** @param {unknown} entries */
// [::TICKET::] PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-365 --for-spec --no-implementation-order`.
function normalizeStrings(entries) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => String(entry).trim())
    .filter((entry) => entry.length > 0)
    .sort();
}

/** One table row as the structured record every consumer reads. */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function parseRow(cells, columns) {
  const value = (name) => cells[columns.get(name)] ?? '';
  const formula = parseFormulaCell(value('formula'));
  const implementation = {
    class: value('class'),
    location: value('implemented by'),
    symbols: parseSymbols(value('implemented by')),
    design: value('implementation design'),
    verification: value('verification'),
  };

  return {
    id: formula.id,
    body: formula.body,
    digest: formula.body.length > 0 ? digestFormula(normalizeFormula(formula.body)) : null,
    specLocation: parseLocation(value('spec location')),
    rfcLocation: parseLocation(value('rfc location')),
    theory: parseTheory(value('theory')),
    implementation,
    tests: value('verification').split(';').map((entry) => entry.trim()).filter((entry) => entry.length > 0),
  };
}

/**
 * Read the Formula ledger appendix.
 *
 * @param {string} rfcText
 * @returns {{specDigest: string|null, rfcDigest: string|null, rows: Array<object>}|null}
 */
export function readFormulaLedger(rfcText) {
  const heading = LEDGER_HEADING.exec(rfcText);
  if (heading === null) return null;
  const duplicateHeadings = [...rfcText.matchAll(ALL_LEDGER_HEADINGS)].length - 1;

  const section = sectionText(rfcText, heading.index, heading[1].length);
  const metadata = { specDigest: null, rfcDigest: null };
  METADATA_LINE.lastIndex = 0;
  let metadataMatch;
  while ((metadataMatch = METADATA_LINE.exec(section)) !== null) {
    if (metadataMatch[1] === 'specDigest') metadata.specDigest = metadataMatch[2];
    if (metadataMatch[1] === 'rfcDigest') metadata.rfcDigest = metadataMatch[2];
  }

  const lines = section.split('\n');
  const headerIndex = lines.findIndex((line) => line.trim().startsWith('|') && /Formula/.test(line) && /Spec location/.test(line));
  if (headerIndex === -1) return { ...metadata, duplicateHeadings, rows: [] };

  const header = splitRow(lines[headerIndex]).map((name) => name.toLowerCase());
  const columns = new Map(header.map((name, index) => [name, index]));
  const rows = [];
  for (let index = headerIndex + 2; index < lines.length; index += 1) {
    if (!lines[index].trim().startsWith('|')) break;
    const cells = splitRow(lines[index]);
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
    rows.push(parseRow(cells, columns));
  }

  return { ...metadata, duplicateHeadings, rows };
}

/**
 * Findings that make a ledger row unusable.
 *
 * @param {ReturnType<typeof readFormulaLedger>} ledger
 * @returns {Array<{code: string, field?: string, formulaId?: string, message: string}>}
 */
export function validateFormulaLedger(ledger) {
  if (ledger === null) {
    return [{ code: 'LEDGER_MISSING', field: 'formulaLedger', message: `the RFC carries no ${FORMULA_LEDGER_TITLE} appendix` }];
  }

  const findings = [];
  if (ledger.specDigest === null) {
    findings.push({ code: 'SPEC_DIGEST_MISSING', field: 'specDigest', message: 'the ledger records no specDigest' });
  }
  if (ledger.rfcDigest === null) {
    findings.push({ code: 'RFC_DIGEST_MISSING', field: 'rfcDigest', message: 'the ledger records no rfcDigest' });
  }
  if ((ledger.duplicateHeadings ?? 0) > 0) {
    findings.push({ code: 'DUPLICATE_LEDGER_HEADING', field: 'formulaLedger', message: `the RFC carries ${(ledger.duplicateHeadings ?? 0) + 1} Formula ledger headings` });
  }

  const seen = new Set();
  for (const row of ledger.rows) {
    const formulaId = row.id ?? '(no id)';
    if (row.id === null) {
      findings.push({ code: 'ROW_ID_MISSING', field: 'formula', formulaId, message: 'a ledger row carries no formula id' });
    } else if (seen.has(row.id)) {
      findings.push({ code: 'DUPLICATE_LEDGER_ROW', field: 'formula', formulaId, message: `the ledger carries ${row.id} more than once` });
    }
    seen.add(row.id);

    if (row.theory.symbols.length === 0 || row.theory.normative.length === 0) {
      findings.push({ code: 'MISSING_THEORY', field: 'theory', formulaId, message: `${formulaId} records no symbol definition or normative line` });
    }
    if (!FORMULA_CLASSES.includes(row.implementation.class)) {
      findings.push({ code: 'INVALID_IMPLEMENTATION_CLASS', field: 'implementation.class', formulaId, message: `${formulaId} declares class "${row.implementation.class}"` });
    }
    if (row.implementation.symbols.length === 0) {
      findings.push({ code: 'MISSING_IMPLEMENTATION_SYMBOLS', field: 'implementation.symbols', formulaId, message: `${formulaId} names no implementation site` });
    }
    if (row.implementation.design.length === 0) {
      findings.push({ code: 'MISSING_IMPLEMENTATION_DESIGN', field: 'implementation.design', formulaId, message: `${formulaId} records no implementation design` });
    }
    if (row.tests.length === 0) {
      findings.push({ code: 'MISSING_TESTS', field: 'tests', formulaId, message: `${formulaId} records no verification test` });
    }
    if (row.specLocation === null) {
      findings.push({ code: 'MISSING_SPEC_LOCATION', field: 'specLocation', formulaId, message: `${formulaId} records no specification location` });
    }
    if (row.rfcLocation === null) {
      findings.push({ code: 'MISSING_RFC_LOCATION', field: 'rfcLocation', formulaId, message: `${formulaId} records no RFC location` });
    }
  }

  return findings;
}

/**
 * The RFC body digest, taken without the appendix that records it.
 *
 * The appendix cannot be inside its own digest. The body is what the reader approves;
 * the appendix is the index into it and is checked against the specification separately.
 *
 * @param {string} rfcText
 * @returns {string}
 */
export function computeRfcDigest(rfcText) {
  const heading = LEDGER_HEADING.exec(rfcText);
  const body = heading === null ? rfcText : rfcText.slice(0, heading.index);
  return sha256Hex(Buffer.from(body.trimEnd(), 'utf8'));
}

/**
 * Compare the sidecar with the ledger it mirrors.
 *
 * @param {object} sidecar
 * @param {ReturnType<typeof readFormulaLedger>} ledger
 * @returns {Array<{code: string, field?: string, formulaId?: string, message: string}>}
 */
export function validateFormulaSidecar(sidecar, ledger) {
  if (sidecar === null || typeof sidecar !== 'object' || !Array.isArray(sidecar.formulas)) {
    return [{ code: 'MISSING_SIDECAR_FORMULAS', field: 'formulas', message: `${FORMULA_SIDECAR_FILENAME} carries no formula list` }];
  }
  if (ledger === null) {
    return [{ code: 'LEDGER_MISSING', field: 'formulaLedger', message: `the RFC carries no ${FORMULA_LEDGER_TITLE} appendix` }];
  }

  const findings = [];
  if (sidecar.specDigest !== ledger.specDigest) {
    findings.push({ code: 'SPEC_DIGEST_MISMATCH', field: 'specDigest', message: `the sidecar records ${sidecar.specDigest} and the ledger ${ledger.specDigest}` });
  }
  if (sidecar.rfcDigest !== ledger.rfcDigest) {
    findings.push({ code: 'RFC_DIGEST_MISMATCH', field: 'rfcDigest', message: `the sidecar records ${sidecar.rfcDigest} and the ledger ${ledger.rfcDigest}` });
  }

  const ledgerRows = new Map(ledger.rows.map((row) => [row.id, row]));
  const sidecarRows = new Map(sidecar.formulas.map((row) => [row.id, row]));

  for (const [id, row] of ledgerRows) {
    const mirrored = sidecarRows.get(id);
    if (mirrored === undefined) {
      findings.push({ code: 'SIDECAR_ROW_MISSING', field: 'formulas', formulaId: id, message: `${id} is in the ledger and not in the sidecar` });
      continue;
    }
    if (mirrored.digest !== row.digest) {
      findings.push({ code: 'SIDECAR_DIGEST_MISMATCH', field: 'digest', formulaId: id, message: `${id} carries two digests` });
    }
    const fieldPairs = [
      ['theory', { symbols: normalizeSymbols(row.theory.symbols), normative: normalizeStrings(row.theory.normative) }, { symbols: normalizeSymbols(mirrored.theory?.symbols), normative: normalizeStrings(mirrored.theory?.normative) }],
      ['implementation.class', row.implementation.class, mirrored.implementation?.class ?? ''],
      ['implementation.symbols', normalizeStrings(row.implementation.symbols), normalizeStrings(mirrored.implementation?.symbols)],
      ['implementation.design', row.implementation.design, mirrored.implementation?.design ?? ''],
      ['tests', normalizeStrings(row.tests), normalizeStrings(mirrored.tests)],
    ];
    for (const [field, ledgerValue, sidecarValue] of fieldPairs) {
      if (JSON.stringify(ledgerValue) !== JSON.stringify(sidecarValue)) {
        findings.push({
          code: 'LEDGER_SIDECAR_MISMATCH',
          field,
          formulaId: id,
          message: `${id} carries a different ${field} in the ledger and the sidecar`,
        });
      }
    }
    if (!Array.isArray(mirrored.tests) || mirrored.tests.length === 0) {
      findings.push({ code: 'MISSING_TESTS', field: 'tests', formulaId: id, message: `${id} records no test in the sidecar` });
    }
    if (!mirrored.theory || mirrored.theory.normative?.length === 0 || mirrored.theory.symbols?.length === 0) {
      findings.push({ code: 'MISSING_THEORY', field: 'theory', formulaId: id, message: `${id} records no theory in the sidecar` });
    }
    if (mirrored.implementation?.design?.length === 0 || mirrored.implementation?.symbols?.length === 0) {
      findings.push({ code: 'MISSING_IMPLEMENTATION_DESIGN', field: 'implementation.design', formulaId: id, message: `${id} records no implementation design in the sidecar` });
    }
  }

  for (const id of sidecarRows.keys()) {
    if (!ledgerRows.has(id)) {
      findings.push({ code: 'SIDECAR_ROW_EXTRA', field: 'formulas', formulaId: id, message: `${id} is in the sidecar and not in the ledger` });
    }
  }

  return findings;
}
