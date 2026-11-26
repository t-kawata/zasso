// Monthly ICOD rows and display rules shared by draw-progress-gif and the
// monthly ICOD CLI. Display rounding must stay identical to the GIF title bar,
// so the ceiling helpers live here instead of being duplicated per caller.

export const MILLION = 1e6;
export const DEFAULT_MONTH_SPAN = 6;

const MONTH_KEY_LENGTH = 7;
const MONTHS_PER_YEAR = 12;
const CELL_HORIZONTAL_PADDING = 2;
const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const TABLE_HEADERS = Object.freeze(['MONTH', 'MISS (M)', 'HIT (M)', 'OUTPUT (M)', 'USD']);
const COLUMN_ALIGNMENTS = Object.freeze(['left', 'right', 'right', 'right', 'right']);
const TOTAL_LABEL = 'TOTAL';
const CURRENT_MONTH_NOTE = '  (current month is month-to-date)';

// Box-drawing characters are single-width in every terminal the project targets;
// keeping them together makes the table width calculation auditable.
const BOX = Object.freeze({
  topLeft: '┌',
  topJoin: '┬',
  topRight: '┐',
  horizontal: '─',
  vertical: '│',
  middleLeft: '├',
  middleJoin: '┼',
  middleRight: '┤',
  bottomLeft: '└',
  bottomJoin: '┴',
  bottomRight: '┘',
});

/** Display rounding for the GIF title: whole millions, rounded up. */
export function formatMillions(value) {
  return Math.ceil((Number(value) || 0) / MILLION);
}

/** Display rounding for the GIF title: whole dollars, rounded up. */
export function formatDollars(value) {
  return Math.ceil(Number(value) || 0);
}

/** The four-part ICOD block used by the draw-progress-gif title bar. */
export function formatIcodMetrics(cumulative = {}) {
  const miss = formatMillions(cumulative?.cacheMissInputTokens);
  const hit = formatMillions(cumulative?.cacheHitInputTokens);
  const output = formatMillions(cumulative?.outputTokens);
  const cost = formatDollars(cumulative?.costUsd);
  return `${miss}M / ${hit}M / ${output}M / $${cost}`;
}

// [::TICKET::] PX-453 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-453 --for-spec --no-implementation-order`.
function toMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// [::TICKET::] PX-453 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-453 --for-spec --no-implementation-order`.
function parseMonthKey(monthKey) {
  const match = MONTH_PATTERN.exec(String(monthKey));
  if (match === null) {
    throw new RangeError(`Invalid month key (expected YYYY-MM): ${monthKey}`);
  }
  return { year: Number(match[1]), month: Number(match[2]) };
}

/** Latest six local months ending at the current month, inclusive. */
export function resolveDefaultMonthRange(now = new Date(), span = DEFAULT_MONTH_SPAN) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError('now must be a valid Date');
  }
  if (!Number.isInteger(span) || span < 1) {
    throw new RangeError('span must be a positive integer');
  }
  // Anchor on the first day so subtracting months never overflows a short month.
  const current = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = new Date(current.getFullYear(), current.getMonth() - (span - 1), 1);
  return { from: toMonthKey(start), to: toMonthKey(current) };
}

/** Every YYYY-MM between from and to, inclusive and ascending. */
export function enumerateMonths(from, to) {
  const start = parseMonthKey(from);
  const end = parseMonthKey(to);
  if (start.year > end.year || (start.year === end.year && start.month > end.month)) {
    throw new RangeError(`month range from ${from} is after to ${to}`);
  }
  const months = [];
  let year = start.year;
  let month = start.month;
  while (year < end.year || (year === end.year && month <= end.month)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > MONTHS_PER_YEAR) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

// [::TICKET::] PX-453 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-453 --for-spec --no-implementation-order`.
function toFiniteNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

/**
 * Sum the dailySeries increments into one row per month in the inclusive range.
 * Months without records stay in the result as zeros so the caller can render a
 * fixed-width window; the input series is never mutated.
 */
export function buildMonthlyUsageRows(series, { from, to } = {}) {
  const months = enumerateMonths(from, to);
  const rowsByMonth = new Map(months.map((month) => [month, {
    month,
    cacheMissInputTokens: 0,
    cacheHitInputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
  }]));
  for (const entry of series || []) {
    const month = String(entry?.date ?? '').slice(0, MONTH_KEY_LENGTH);
    const row = rowsByMonth.get(month);
    if (row === undefined) continue;
    row.cacheMissInputTokens += toFiniteNumber(entry.cacheMissInputTokens);
    row.cacheHitInputTokens += toFiniteNumber(entry.cacheHitInputTokens);
    row.outputTokens += toFiniteNumber(entry.outputTokens);
    row.costUsd += toFiniteNumber(entry.dailyCostUsd);
  }
  return months.map((month) => rowsByMonth.get(month));
}

/** Exact totals over the displayed rows; rounding happens only at render time. */
export function sumMonthlyUsage(rows) {
  const total = {
    cacheMissInputTokens: 0,
    cacheHitInputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
  };
  for (const row of rows || []) {
    total.cacheMissInputTokens += toFiniteNumber(row.cacheMissInputTokens);
    total.cacheHitInputTokens += toFiniteNumber(row.cacheHitInputTokens);
    total.outputTokens += toFiniteNumber(row.outputTokens);
    total.costUsd += toFiniteNumber(row.costUsd);
  }
  return total;
}

// [::TICKET::] PX-453 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-453 --for-spec --no-implementation-order`.
function renderCell(cell, index, widths) {
  const contentWidth = widths[index] - CELL_HORIZONTAL_PADDING;
  const padded = COLUMN_ALIGNMENTS[index] === 'left'
    ? cell.padEnd(contentWidth)
    : cell.padStart(contentWidth);
  return ` ${padded} `;
}

// [::TICKET::] PX-453 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-453 --for-spec --no-implementation-order`.
function renderRow(cells, widths) {
  return BOX.vertical
    + cells.map((cell, index) => renderCell(cell, index, widths)).join(BOX.vertical)
    + BOX.vertical;
}

// [::TICKET::] PX-453 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-453 --for-spec --no-implementation-order`.
function renderBorder(widths, left, join, right) {
  return left + widths.map((width) => BOX.horizontal.repeat(width)).join(join) + right;
}

/**
 * Render the terminal table. Column widths come from the widest header or cell,
 * so the output is deterministic for a given set of rows and range.
 */
export function formatMonthlyIcodTable(rows, { target = '', range = { from: '', to: '' }, currentMonth = '' } = {}) {
  const body = (rows || []).map((row) => [
    row.month,
    String(formatMillions(row.cacheMissInputTokens)),
    String(formatMillions(row.cacheHitInputTokens)),
    String(formatMillions(row.outputTokens)),
    `$${formatDollars(row.costUsd)}`,
  ]);
  const total = sumMonthlyUsage(rows);
  const totalCells = [
    TOTAL_LABEL,
    String(formatMillions(total.cacheMissInputTokens)),
    String(formatMillions(total.cacheHitInputTokens)),
    String(formatMillions(total.outputTokens)),
    `$${formatDollars(total.costUsd)}`,
  ];
  const widths = TABLE_HEADERS.map((header, index) => Math.max(
    header.length,
    totalCells[index].length,
    ...body.map((cells) => cells[index].length),
  ) + CELL_HORIZONTAL_PADDING);
  const note = currentMonth !== ''
    && range.from <= currentMonth
    && currentMonth <= range.to
    ? CURRENT_MONTH_NOTE
    : '';
  const lines = [
    'ICOD — monthly totals (ceil)',
    `target: ${target}`,
    `range: ${range.from} .. ${range.to}${note}`,
    '',
    renderBorder(widths, BOX.topLeft, BOX.topJoin, BOX.topRight),
    renderRow(TABLE_HEADERS, widths),
    renderBorder(widths, BOX.middleLeft, BOX.middleJoin, BOX.middleRight),
    ...body.map((cells) => renderRow(cells, widths)),
    renderBorder(widths, BOX.middleLeft, BOX.middleJoin, BOX.middleRight),
    renderRow(totalCells, widths),
    renderBorder(widths, BOX.bottomLeft, BOX.bottomJoin, BOX.bottomRight),
  ];
  return lines.join('\n');
}
