// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
/**
 * The matrix as something an author can work on, one cell at a time.
 *
 * The semantics is judged against the code, and that judgement is not a script's to make:
 * whether a reading is true of the package it describes is a question about meaning. What
 * a script can do is remove the search. So this module prints, for the cell asked about,
 * the reading that closes it and the source lines its basis rests on — and nothing else.
 * It reads only the published spec and the tree the spec is about, so what it shows is
 * what the document says, not what the author intended.
 *
 * It prints no verdict. There is no line in its output asserting that a statement is true
 * or false of the code, because the moment there were, the author would be reading a
 * judgement instead of the evidence for one. The findings it does carry are the
 * deterministic ones — a cell nobody closed, a basis that no longer resolves — and they
 * are labelled as such.
 *
 * The window is bounded on purpose. It is a pointer made visible, not the evidence: a
 * reading whose subject is larger than the window has to be checked by opening the file,
 * which is what the command file's Steps say and what the printed `file:line` makes
 * possible.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ITEMS_BY_GROUP, SEMANTICS_ITEMS, SEMANTICS_ITEM_COUNT } from './design-semantics-schema.mjs';

/** How many lines of source are printed on each side of an anchor. */
const SOURCE_WINDOW_LINES = 4;

/** The window size, exported so a test can hold the printed window to it. */
export const SOURCE_WINDOW_FOR_TEST = SOURCE_WINDOW_LINES;

/** The section holding the packages, so the matrix rows come from the document itself. */
const PACKAGES_SECTION_KEY = 'packages';

/** A source line as the window prints it, numbered so the reader can find it. */
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
function numbered(lineNumber, text) {
  return `${String(lineNumber).padStart(4, ' ')} | ${text}`;
}

/**
 * A bounded window of a file around one line, or `null` when it cannot be read.
 *
 * A file that has moved is reported rather than thrown: the locator's job is to show the
 * author where to look, and a file that is no longer there is a fact about the tree that
 * the reading has to be judged against.
 */
export function readSourceWindow({ root, file, line, size = SOURCE_WINDOW_LINES }) {
  const path = join(root, file);
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, 'utf8').split('\n');
  const first = Math.max(1, line - size);
  const last = Math.min(lines.length, line + size);
  const window = [];
  for (let number = first; number <= last; number += 1) window.push(numbered(number, lines[number - 1]));
  return window;
}

/** The packages the matrix has rows for, taken from the spec the run published. */
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
function packagesOf(spec) {
  return spec?.sections?.[PACKAGES_SECTION_KEY]?.scopes ?? [];
}

/** The authored claim closing one cell, or `undefined`. */
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
function readingAt(spec, scope, item) {
  return (spec.claims ?? []).find((claim) => claim.semantics_item === item && claim.scope === scope);
}

/**
 * The cells the author declined, as the published spec records them.
 *
 * A decline closes a cell as surely as a reading does — it is how a package with nothing
 * to say under an item says so — so a cell is open only when it is neither. Reading the
 * declines from the spec rather than from the authored file is what keeps this a locator
 * over the document: a spec whose declines were dropped would report every one of them as
 * an omission, which is the opposite of what happened.
 */
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
function declinedAt(spec) {
  const cells = spec?.sections?.design_semantics?.content?.coverage?.declinedCells ?? [];
  return new Map(cells.map((cell) => [`${cell.scope}\u0000${cell.item}`, cell.reason]));
}

/** The measured claims a reading rests on, with the span each names. */
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
function basisOf(spec, reading) {
  const byId = new Map((spec.claims ?? []).map((claim) => [claim.claim_id, claim]));
  return (reading?.basis ?? []).map((id) => ({ id, claim: byId.get(id) }));
}

/** Where the reading's basis points, as lines a reader can open. */
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
function renderAnchors(lines, spec, reading) {
  const anchors = basisOf(spec, reading).flatMap(({ id, claim }) =>
    (claim?.evidence ?? []).map((item) => ({ id, ...item.source_span })));
  if (anchors.length === 0) {
    lines.push('- the basis names no located evidence, so there is nowhere to look', '');
    return [];
  }
  for (const anchor of anchors) lines.push(`- ${anchor.file}:${anchor.line}   <- ${anchor.id}`);
  lines.push('');
  return anchors;
}

/** One cell: what closes it, where that comes from, and the source around it. */
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
function renderCell(cell, lines) {
  const { spec, scope, item, root, declines } = cell;
  const reading = readingAt(spec, scope, item);
  const declinedReason = declines.get(`${scope}\u0000${item}`);
  lines.push(`### ${scope} — ${item}`, '');
  lines.push(`- state: ${reading !== undefined ? '[entry]' : (declinedReason !== undefined ? 'declined' : 'unwritten')}`, '');

  if (declinedReason !== undefined) {
    lines.push(`- reason: ${declinedReason}`, '');
    return;
  }
  if (reading === undefined) {
    lines.push('No reading closes this cell. What has to be written is:', '');
    lines.push(`- ${SEMANTICS_ITEMS.find((entry) => entry.key === item)?.requires ?? ''}`, '');
    return;
  }

  lines.push(`- statement: ${reading.statement}`);
  lines.push(`- falsification: ${reading.falsification}`);
  lines.push(`- basis: ${(reading.basis ?? []).join(', ')}`, '');
  lines.push('#### Where to look', '');

  for (const anchor of renderAnchors(lines, spec, reading)) {
    const window = readSourceWindow({ root, file: anchor.file, line: anchor.line });
    lines.push(`#### ${anchor.file}:${anchor.line} (±${SOURCE_WINDOW_LINES})`, '');
    if (window === null) lines.push('- the file this reading points at is not in the tree', '');
    else lines.push(...window, '');
  }
}

/** How the matrix stands, per package, which is the first thing an author needs. */
export function renderCoverageTable(spec) {
  const packages = packagesOf(spec);
  const lines = [
    '| package | written | unwritten |',
    '|---|---|---|',
  ];
  for (const scope of packages) {
    const written = SEMANTICS_ITEMS.filter((entry) => readingAt(spec, scope, entry.key) !== undefined).length;
    lines.push(`| ${scope} | ${written} | ${SEMANTICS_ITEM_COUNT - written} |`);
  }
  lines.push('');
  return lines;
}

/** The deterministic findings: cells nobody closed, and bases that no longer resolve. */
export function findUnclosedCells(spec) {
  const packages = packagesOf(spec);
  const declines = declinedAt(spec);
  const findings = [];
  for (const scope of packages) {
    for (const entry of SEMANTICS_ITEMS) {
      const closed = readingAt(spec, scope, entry.key) !== undefined || declines.has(`${scope}\u0000${entry.key}`);
      if (!closed) findings.push(`${scope} — ${entry.key}: neither a reading nor a decline closes this cell`);
    }
  }
  const byId = new Set((spec.claims ?? []).map((claim) => claim.claim_id));
  for (const claim of spec.claims ?? []) {
    for (const id of claim.basis ?? []) {
      if (claim.semantics_item !== null && claim.semantics_item !== undefined && !byId.has(id)) {
        findings.push(`${claim.scope} — ${claim.semantics_item}: its basis names ${id}, which no claim carries`);
      }
    }
  }
  return findings;
}

/**
 * The locator's whole output for the cells asked about.
 *
 * @param {{spec: object, scope?: string|null, item?: string|null, root: string}} params
 * @returns {{markdown: string, findings: string[]}}
 */
export function renderReadingsView({ spec, scope = null, item = null, root }) {
  const packages = packagesOf(spec);
  const lines = ['# Design semantics — the matrix', ''];

  if (packages.length === 0) {
    lines.push('The spec holds no package, so the matrix has no rows. Run `analyze` first.', '');
    return { markdown: `${lines.join('\n')}\n`, findings: [] };
  }

  const requested = packages.filter((name) => scope === null || name === scope);
  const declines = declinedAt(spec);
  lines.push(...renderCoverageTable(spec));

  if (scope !== null && requested.length === 0) {
    lines.push(`The scope ${scope} is not a package the spec holds, so no cell was selected.`, '');
    return { markdown: `${lines.join('\n')}\n`, findings: [] };
  }

  const asked = item === null ? SEMANTICS_ITEMS : SEMANTICS_ITEMS.filter((entry) => entry.key === item);
  if (item !== null && asked.length === 0) {
    lines.push(`The item ${item} is not one of the ${SEMANTICS_ITEM_COUNT}, so no cell was selected.`, '');
    return { markdown: `${lines.join('\n')}\n`, findings: [] };
  }

  for (const name of requested) {
    for (const entry of asked) renderCell({ spec, scope: name, item: entry.key, root, declines }, lines);
  }

  const findings = findUnclosedCells(spec);
  lines.push('## Findings (deterministic)', '');
  if (findings.length === 0) lines.push('Every cell is closed — by a reading or by a decline — and every basis resolves.', '');
  else for (const finding of findings) lines.push(`- ${finding}`);
  lines.push('');

  return { markdown: `${lines.join('\n')}\n`, findings };
}

/** The groups, so a reader can see the shape of what is owed without reading all 21. */
export function renderItemGroups() {
  const lines = [];
  for (const group of ITEMS_BY_GROUP) {
    lines.push(`### ${group.label} — ${group.heading}`, '');
    for (const entry of group.items) lines.push(`- \`${entry.key}\` — ${entry.requires}`);
    lines.push('');
  }
  return lines;
}
