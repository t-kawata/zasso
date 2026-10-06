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

export const LEVEL_LABEL = 'level';
export const ALONE_LABEL = 'alone';
export const PARALLEL_LABEL = 'parallel';
export const FOCUS_MARKER = '▶';
export const CRITICAL_MARKER = '*';
/** Written after a path whose package directory already carries its explanation document. */
export const EXPLAINED_LABEL = '🔴 EXPLAINED';
/** Written after the explanation mark, when the directory also carries its grilled design. */
export const GRILLED_LABEL = '🟡 GRILLED';
export const CHAIN_ARROW_GLYPH = '→';
export const CHAIN_ARROW = ` ${CHAIN_ARROW_GLYPH} `;
export const RULE_CHARACTER = '─';

/** Widths are named because they are the contract the alignment rests on. */
export const LEVEL_NUMBER_WIDTH = 2;
export const LEVEL_WORD_WIDTH = 10;
export const FOOTER_LABEL_WIDTH = 17;
export const FOOTER_KIND_WIDTH = 7;
export const RULE_WIDTH = 66;
export const CHAIN_WRAP_WIDTH = 96;
export const MINIMUM_COLUMN_WIDTH = 2;

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
  return Math.max(...text.split('\n').map((line) => line.length));
}

// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
function renderLevelHeader(index, memberCount) {
  const number = String(index).padStart(LEVEL_NUMBER_WIDTH);
  const word = (memberCount === 1 ? ALONE_LABEL : PARALLEL_LABEL).padEnd(LEVEL_WORD_WIDTH);
  const count = memberCount === 1 ? '1 dir' : `${memberCount} dirs`;
  return `${LEVEL_LABEL} ${number}    ${word}${count}`;
}

/**
 * The marks a package carries, in the order the pipeline reaches them.
 *
 * The seed is explained before it is grilled, so a directory that reached both reads left to
 * right as the work happened. Each mark is written from its own document alone: RFC.md can
 * sit in a directory that was never explained, so a package may carry one, both or neither,
 * and printing only the furthest would drop a fact the directory holds.
 */
function renderMarks(model, id) {
  const marks = [];
  if (model.explainedIds.has(id)) marks.push(EXPLAINED_LABEL);
  if (model.grilledIds.has(id)) marks.push(GRILLED_LABEL);
  return marks.map((mark) => ` ${mark}`).join('');
}

// [::TICKET::] PX-223, PX-228 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-223|PX-228) --for-spec --no-implementation-order`.
function renderPackageLine(model, id) {
  const marker = model.criticalChain.includes(id) ? CRITICAL_MARKER : ' ';
  // The path is never padded: a line whose package carries no mark ends there, so padding
  // would only leave trailing blanks. A mark is appended rather than aligned to a column,
  // because it qualifies the path it follows instead of opening a second field.
  return `${ITEM_INDENT}${marker} ${model.pathOf.get(id)}${renderMarks(model, id)}`;
}

// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
function renderWidthRow(model) {
  const counts = model.levels.map((level) => level.length);
  const columnWidth = Math.max(MINIMUM_COLUMN_WIDTH, String(Math.max(...counts)).length);
  const numbers = model.levels.map((_, index) => String(index).padStart(columnWidth)).join(' ');
  const columns = counts.map((count) => String(count).padStart(columnWidth)).join(' ');
  const label = LEVEL_LABEL.padEnd(FOOTER_KIND_WIDTH);
  const blank = ''.padEnd(FOOTER_LABEL_WIDTH);
  return [
    `${'parallel width'.padEnd(FOOTER_LABEL_WIDTH)}${label}${numbers}`,
    `${blank}${'dirs'.padEnd(FOOTER_KIND_WIDTH)}${columns}`,
  ].join('\n');
}

// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
function renderChainRow(model) {
  const names = model.criticalChain.map((id) => model.nameOf.get(id));
  const label = 'critical chain'.padEnd(FOOTER_LABEL_WIDTH);
  const continuation = ''.padEnd(FOOTER_LABEL_WIDTH);
  const lines = [];
  let current = label;
  names.forEach((name, index) => {
    const piece = index === 0 ? name : CHAIN_ARROW + name;
    if (index > 0 && current.length + piece.length > CHAIN_WRAP_WIDTH) {
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

/** The whole picture: every level, then the width row and the chain row. */
export function renderPlan(model) {
  const blocks = [
    `\n# ${model.workspaceName} implementation order — ${model.packages.length} dirs / ${model.levels.length} levels / ${model.edgeCount} dependencies`,
  ];
  model.levels.forEach((level, index) => {
    blocks.push('');
    blocks.push(renderLevelHeader(index, level.length));
    for (const id of level) blocks.push(renderPackageLine(model, id));
  });
  blocks.push('');
  blocks.push(renderWidthRow(model));
  blocks.push('');
  blocks.push(renderChainRow(model));
  blocks.push('');
  return blocks.join('\n');
}

// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
function renderRelated(model, ids) {
  // Earliest level first, so a reader sees when each related directory comes, not the
  // order the manifest happened to assign its ids.
  const ordered = [...ids].sort(
    (left, right) =>
      model.levelOf.get(left) - model.levelOf.get(right) || model.nameOf.get(left).localeCompare(model.nameOf.get(right)),
  );
  return ordered.map((id) => `${LIST_INDENT}${model.pathOf.get(id).padEnd(model.pathWidth)}  level ${model.levelOf.get(id)}`);
}

// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
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
    `${FOCUS_MARKER} ${model.pathOf.get(packageId).padEnd(model.pathWidth)}` +
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
