/**
 * Draw the implementation order as text.
 *
 * The layout is fixed-width on purpose. A package path is the widest thing printed and its
 * width is computed from the workspace, so the path column lines up for any package count,
 * and a provider list that runs to sixteen entries grows downward instead of pushing the
 * plan sideways.
 *
 * Left to right is time. The manifests orient an edge consumer to provider; this view prints
 * the provider first, so an arrow in the critical chain reads "is finished before".
 */
import { displayWidth } from './display-width.mjs';
import {
  EMOJI_COLUMNS,
  FIELD_COLUMNS,
  FIELD_ROWS,
  FIELD_SEQUENCE,
  cellFor,
} from './pipeline-cells.mjs';

export {
  EDU_GLYPH,
  EXPLANATION_GLYPH,
  GRILL_GLYPH,
  SEQUENCE_GLYPH,
  FAILED_SEQUENCE_GLYPH,
  SMOOTH_GLYPH,
  GRAPH_GLYPH,
  BOUNDIFY_GLYPH,
  SPLIT_GLYPH,
  WTR_GLYPH,
  WTR_TEXT,
  WAL_GLYPH,
  WAL_TEXT,
  EXPLANATION_TEXT,
  GRAPH_TEXT,
  BOUNDIFY_TEXT,
  SPLIT_TEXT,
  EDUCATION_TEXT,
  GRILL_TEXT,
  SEQUENCE_TEXT,
  SMOOTH_TEXT,
  UNKNOWN_COUNT,
  FIELD_SEQUENCE,
  FIELD_COLUMNS,
  FIELD_ROWS,
  PIPELINE_LABELS,
  EMOJI_COLUMNS,
  readPipelineCells,
} from './pipeline-cells.mjs';

export const LEVEL_LABEL = 'level';
export const FOCUS_MARKER = '▶';
export const CRITICAL_MARKER = '*';

/** The ticket row's mark and label; the ledger sits to the right of them. */
export const TICKETS_GLYPH = '⚪️';
export const TICKETS_TEXT = 'TICKETS:';


export const CHAIN_ARROW_GLYPH = '→';
export const CHAIN_ARROW = ` ${CHAIN_ARROW_GLYPH} `;
export const RULE_CHARACTER = '─';

/** Widths are named because they are the contract the alignment rests on. */
export const FOOTER_LABEL_WIDTH = 17;
export const RULE_WIDTH = 66;
export const CHAIN_WRAP_WIDTH = 96;

const ITEM_INDENT = '  ';
const LIST_INDENT = '    ';
const ALONE_EXPLANATION = '     → this level is alone, so this step is serial';

/**
 * English ordinals, including the teens that break the last-digit rule.
 *
 * @param {number} value — a one-based position
 */
export function formatOrdinal(value) {
  const withinHundred = value % 100;
  if (withinHundred >= 11 && withinHundred <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

/** The widest line in a rendered block, used to prove nothing wraps. */
export function maxLineWidth(text) {
  return Math.max(...text.split('\n').map(displayWidth));
}

/** Pad a string with spaces to a terminal column, never truncating it. */
// [::TICKET::] PX-282 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-282 --for-spec --no-implementation-order`.
function padToDisplayWidth(text, width) {
  const padding = width - displayWidth(text);
  return padding > 0 ? `${text}${' '.repeat(padding)}` : text;
}

// [::TICKET::] PX-223 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-223 --for-spec --no-implementation-order`.
// [::TICKET::] PX-393 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-393 --for-spec --no-implementation-order`.
function renderLevelHeader(index) {
  return `<${LEVEL_LABEL} ${index}>`;
}


/**
 * The width of every field that any package line carries.
 *
 * A field present on at least one line reserves that width on every line that has a later
 * present field, so an absent middle field keeps the later columns aligned. A field absent
 * everywhere is omitted rather than reserving three blank columns for a glyph no line owns.
 */
// [::TICKET::] PX-282 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-282 --for-spec --no-implementation-order`.
// [::TICKET::] PX-393 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-393 --for-spec --no-implementation-order`.
export function buildPlanLayout(model) {
  const packages = model.levels.flat();
  const columns = [];
  for (let column = 0; column < FIELD_COLUMNS; column += 1) {
    const keys = Array.from(
      { length: FIELD_ROWS },
      (_, row) => FIELD_SEQUENCE[row * FIELD_COLUMNS + column],
    );
    let width = 0;
    for (const id of packages) {
      for (const key of keys) {
        const cell = cellFor(model, id, key);
        if (cell !== null) width = Math.max(width, displayWidth(cell.text));
      }
    }
    if (width > 0) columns.push({ keys, width });
  }
  const ticketBracketWidth = Math.max(
    0,
    ...[...model.ticketLedgers.values()].map((ledger) => displayWidth(renderTicketBracket(ledger.tokens))),
  );
  return { columns, ticketBracketWidth };
}

/** One package's bracketed ticket strip, with one token per ticket. */
// [::TICKET::] PX-393 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-393 --for-spec --no-implementation-order`.
export function renderTicketBracket(tokens) {
  return tokens.length === 0 ? '[ ]' : `[ ${tokens.join(' ')} ]`;
}

/**
 * The fields of one grid row, or null when this package has no cell in that row.
 *
 * A column's width is shared by its two rows, so a count that grows in one row keeps the
 * other row's glyph in the same display column. An absent cell is drawn as a blank of the
 * column's width; the final trim removes padding that belongs to no later cell.
 */
// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
// [::TICKET::] PX-393 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-393 --for-spec --no-implementation-order`.
function renderFieldRow(model, id, layout, rowIndex) {
  const cells = layout.columns.map((column) => cellFor(model, id, column.keys[rowIndex]));
  if (cells.every((cell) => cell === null)) return null;
  return layout.columns
    .map((column, index) => {
      const cell = cells[index];
      return cell === null
        ? ' '.repeat(EMOJI_COLUMNS + 1 + column.width)
        : `${cell.glyph} ${cell.text.padEnd(column.width)}`;
    })
    .join(' ')
    .trimEnd();
}

/** The TICKETS row, or null when the directory carries no readable ledger. */
// [::TICKET::] PX-393 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-393 --for-spec --no-implementation-order`.
function renderTicketRow(model, id, layout) {
  const ledger = model.ticketLedgers.get(id);
  if (ledger === undefined) return null;
  const bracket = renderTicketBracket(ledger.tokens);
  const padding = ' '.repeat(layout.ticketBracketWidth - displayWidth(bracket) + 1);
  return `${TICKETS_GLYPH} ${TICKETS_TEXT} ${bracket}${padding}${ledger.reviewed}/${ledger.total}`;
}

/**
 * One package line: the prefix, the path, the padding to the common column, then the fields.
 *
 * A line with no fields ends at its path and carries no padding, which keeps a workspace
 * with no counters byte-identical to the output before this field existed.
 */
// [::TICKET::] PX-223, PX-228, PX-282 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-223|PX-228|PX-282) --for-spec --no-implementation-order`.
/**
 * One package block: the path line carries row 1, then row 2 and the ticket row start at
 * the common field column. A package with no fields and no ledger is the path line alone.
 */
// [::TICKET::] PX-393 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-393 --for-spec --no-implementation-order`.
function renderPackageBlock(model, id, layout) {
  const marker = model.criticalChain.includes(id) ? CRITICAL_MARKER : ' ';
  const linePrefix = `${ITEM_INDENT}${marker} ${model.pathOf.get(id)}`;
  const row1 = renderFieldRow(model, id, layout, 0);
  const row2 = renderFieldRow(model, id, layout, 1);
  const ticketRow = renderTicketRow(model, id, layout);
  const lines = [
    row1 === null
      ? linePrefix
      : `${linePrefix}${' '.repeat(model.markColumn - displayWidth(linePrefix))}${row1}`.trimEnd(),
  ];
  const indent = ' '.repeat(model.markColumn);
  if (row2 !== null) lines.push(`${indent}${row2}`.trimEnd());
  if (ticketRow !== null) lines.push(`${indent}${ticketRow}`.trimEnd());
  return lines;
}

// [::TICKET::] PX-223 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-223 --for-spec --no-implementation-order`.
function renderChainRow(model) {
  const names = model.criticalChain.map((id) => model.nameOf.get(id));
  const label = 'critical chain'.padEnd(FOOTER_LABEL_WIDTH);
  const continuation = ''.padEnd(FOOTER_LABEL_WIDTH);
  const lines = [];
  let current = label;
  names.forEach((name, index) => {
    const piece = index === 0 ? name : CHAIN_ARROW + name;
    if (index > 0 && displayWidth(current) + displayWidth(piece) > CHAIN_WRAP_WIDTH) {
      lines.push(current);
      // The arrow opens the continuation line, so a wrapped chain still reads as one chain.
      current = continuation + CHAIN_ARROW_GLYPH + ' ' + name;
      return;
    }
    current += piece;
  });
  lines.push(current);
  return lines.join('\n');
}

/** The whole picture: every level, then the chain row. */
// [::TICKET::] PX-393 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-393 --for-spec --no-implementation-order`.
export function renderPlan(model) {
  const layout = buildPlanLayout(model);
  const label = model.orderSource === 'implementation' ? 'implementation order' : 'build order';
  const lines = [
    '',
    `# ${model.workspaceName} ${label} — ${model.packages.length} dirs / ${model.levels.length} levels / ${model.edgeCount} dependencies`,
  ];
  model.levels.forEach((level, index) => {
    lines.push('');
    lines.push(renderLevelHeader(index));
    level.forEach((id, position) => {
      if (position > 0) lines.push('');
      lines.push(...renderPackageBlock(model, id, layout));
    });
  });
  lines.push('');
  lines.push(renderChainRow(model));
  lines.push('');
  return lines.join('\n');
}

// [::TICKET::] PX-223 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-223 --for-spec --no-implementation-order`.
function renderRelated(model, ids) {
  // Earliest level first, so a reader sees when each related directory comes, not the
  // order the manifest happened to assign its ids.
  const ordered = [...ids].sort(
    (left, right) =>
      model.levelOf.get(left) - model.levelOf.get(right) || model.nameOf.get(left).localeCompare(model.nameOf.get(right)),
  );
  return ordered.map(
    (id) => `${LIST_INDENT}${padToDisplayWidth(model.pathOf.get(id), model.pathWidth)}  level ${model.levelOf.get(id)}`,
  );
}

// [::TICKET::] PX-223 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-223 --for-spec --no-implementation-order`.
function renderRelatedSection(model, title, ids, explanation = '') {
  return [`${ITEM_INDENT}${title} (${ids.length})${explanation}`, ...renderRelated(model, ids)];
}

/** One package's place in the whole: what it waits for, what runs beside it, what follows. */
export function renderFocus({ model, packageId }) {
  const level = model.levelOf.get(packageId);
  const position = model.serialIndex.get(packageId) + 1;
  const onChain = model.criticalChain.includes(packageId);
  const peers = model.levels[level].filter((id) => id !== packageId);

  const heading =
    `${FOCUS_MARKER} ${padToDisplayWidth(model.pathOf.get(packageId), model.pathWidth)}` +
    `  level ${level} · ${formatOrdinal(position)}` +
    (onChain ? ' · on the critical path' : '');

  return [
    RULE_CHARACTER.repeat(RULE_WIDTH),
    heading,
    '',
    ...renderRelatedSection(model, 'waits for', model.providersOf.get(packageId)),
    '',
    ...renderRelatedSection(model, 'parallel in this level', peers, peers.length === 0 ? ALONE_EXPLANATION : ''),
    '',
    ...renderRelatedSection(model, 'used by', model.consumersOf.get(packageId)),
    '',
  ].join('\n');
}

/** The plan, with one package's block appended when a seed named it. */
export function render(model, focusPackageId = null) {
  const plan = renderPlan(model);
  return focusPackageId === null ? plan : plan + renderFocus({ model, packageId: focusPackageId });
}
