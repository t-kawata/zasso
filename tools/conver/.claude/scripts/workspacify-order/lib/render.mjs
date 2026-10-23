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
import {
  SEQUENCE_VERDICT_COMPLETE,
  SEQUENCE_VERDICT_FAILED,
} from '../../sequences-slice/lib/package-verdict.mjs';
import { displayWidth } from './levels.mjs';

export const LEVEL_LABEL = 'level';
export const ALONE_LABEL = 'alone';
export const PARALLEL_LABEL = 'parallel';
export const FOCUS_MARKER = '▶';
export const CRITICAL_MARKER = '*';

/** The full-width glyphs the pipeline fields carry, in pipeline order. */
export const EDU_GLYPH = '🟤';
export const EXPLANATION_GLYPH = '🔴';
export const GRILL_GLYPH = '🟠';
export const SEQUENCE_GLYPH = '🟡';
export const FAILED_SEQUENCE_GLYPH = '❌';
export const SMOOTH_GLYPH = '🟢';
export const GRAPH_GLYPH = '🔵';
export const BOUNDIFY_GLYPH = '🟣';
export const SPLIT_GLYPH = '⚫️';

/** The word the explanation field carries: a document mark, not a count. */
export const EXPLANATION_TEXT = 'EXP';

/** The three downstream fields are document marks: the artifact each command wrote. */
export const GRAPH_TEXT = 'GRA';
export const BOUNDIFY_TEXT = 'BOU';
export const SPLIT_TEXT = 'SPL';
/**
 * The value a numeric field prints when no record exists.
 *
 * A question mark keeps the `KEY:VALUE` shape on every line and, unlike 0 or 1, does not
 * assert a number the workspace never recorded.
 */
export const UNKNOWN_COUNT = '?';

/** The field order is the pipeline order, so a line reads left to right as the work happened. */
export const FIELD_SEQUENCE = Object.freeze(['edu', 'exp', 'gri', 'seq', 'smo', 'gra', 'bou', 'spl']);
/** Emoji presentation occupies two terminal columns. */
export const EMOJI_COLUMNS = 2;

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
  return Math.max(...text.split('\n').map(displayWidth));
}

/** Pad a string with spaces to a terminal column, never truncating it. */
// [::TICKET::] PX-282 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-282 --for-spec --no-implementation-order`.
function padToDisplayWidth(text, width) {
  const padding = width - displayWidth(text);
  return padding > 0 ? `${text}${' '.repeat(padding)}` : text;
}

// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
function renderLevelHeader(index, memberCount) {
  const number = String(index).padStart(LEVEL_NUMBER_WIDTH);
  const word = (memberCount === 1 ? ALONE_LABEL : PARALLEL_LABEL).padEnd(LEVEL_WORD_WIDTH);
  const count = memberCount === 1 ? '1 dir' : `${memberCount} dirs`;
  return `${LEVEL_LABEL} ${number}    ${word}${count}`;
}

/**
 * One field of a package line, or null when the directory carries no answer for it.
 *
 * The field order follows the pipeline: the root generations bracket the work, the
 * explanation precedes the grill, and the grill precedes the distribution. The first two
 * per-directory fields are documents; the third is a verdict with two spellings. A counter
 * is used when the producer recorded one; when it did not, the field prints `?` so the line
 * keeps one shape and never invents a number.
 */
// [::TICKET::] PX-282, PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-282|PX-309) --for-spec --no-implementation-order`.
function generationCell(generation, glyph, label) {
  return generation === null || generation === undefined
    ? null
    : { glyph, text: `${label}:${generation}` };
}

// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
function artifactCell(present, glyph, text) {
  return present ? { glyph, text } : null;
}

// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
function educationCell(model) {
  return generationCell(model.rootCounters.edu, EDU_GLYPH, 'EDU');
}

// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
function explanationCell(model, id) {
  return model.explainedIds.has(id) ? { glyph: EXPLANATION_GLYPH, text: EXPLANATION_TEXT } : null;
}

// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
function grillCell(model, id) {
  const generation = generationCell(model.grillGenerations.get(id), GRILL_GLYPH, 'GRI');
  if (generation !== null) return generation;
  return model.grilledIds.has(id) ? { glyph: GRILL_GLYPH, text: `GRI:${UNKNOWN_COUNT}` } : null;
}

// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
function sequenceCell(model, id) {
  const verdict = model.sequenceVerdicts.get(id);
  const judged = verdict?.state === SEQUENCE_VERDICT_COMPLETE || verdict?.state === SEQUENCE_VERDICT_FAILED;
  const generation = model.distributionGenerations.get(id) ?? null;
  if (generation === null && !judged) return null;
  const value = generation === null ? UNKNOWN_COUNT : String(generation);
  const glyph = verdict?.state === SEQUENCE_VERDICT_FAILED ? FAILED_SEQUENCE_GLYPH : SEQUENCE_GLYPH;
  return { glyph, text: `SEQ:${value}` };
}

// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
function smoothCell(model) {
  return generationCell(model.rootCounters.smo, SMOOTH_GLYPH, 'SMO');
}

// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
function cellFor(model, id, key) {
  switch (key) {
    case 'edu': return educationCell(model);
    case 'exp': return explanationCell(model, id);
    case 'gri': return grillCell(model, id);
    case 'seq': return sequenceCell(model, id);
    case 'smo': return smoothCell(model);
    case 'gra': return artifactCell(model.graphifiedIds.has(id), GRAPH_GLYPH, GRAPH_TEXT);
    case 'bou': return artifactCell(model.boundifiedIds.has(id), BOUNDIFY_GLYPH, BOUNDIFY_TEXT);
    case 'spl': return artifactCell(model.splitIds.has(id), SPLIT_GLYPH, SPLIT_TEXT);
    default: return null;
  }
}

/**
 * The width of every field that any package line carries.
 *
 * A field present on at least one line reserves that width on every line that has a later
 * present field, so an absent middle field keeps the later columns aligned. A field absent
 * everywhere is omitted rather than reserving three blank columns for a glyph no line owns.
 */
// [::TICKET::] PX-282 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-282 --for-spec --no-implementation-order`.
export function buildFieldLayout(model) {
  const widths = new Map();
  for (const id of model.levels.flat()) {
    for (const key of FIELD_SEQUENCE) {
      const cell = cellFor(model, id, key);
      if (cell === null) continue;
      widths.set(key, Math.max(widths.get(key) ?? 0, displayWidth(cell.text)));
    }
  }
  return { widths };
}

/**
 * The fields of one package line, or an empty string when the line carries none.
 *
 * Leading and trailing absent fields are trimmed so the first visible mark starts at the
 * common column; an absent field between two present ones is written as a blank cell of
 * its own width. The final `trimEnd` in renderPackageLine removes the last cell's padding,
 * preserving the no-trailing-whitespace contract.
 */
// [::TICKET::] PX-282 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-282 --for-spec --no-implementation-order`.
function renderFields(model, id, layout) {
  const active = FIELD_SEQUENCE.filter((key) => layout.widths.has(key));
  const cells = active.map((key) => ({ key, cell: cellFor(model, id, key), width: layout.widths.get(key) }));
  const first = cells.findIndex((entry) => entry.cell !== null);
  if (first === -1) return '';
  const last = cells.length - 1 - [...cells].reverse().findIndex((entry) => entry.cell !== null);
  const parts = [];
  for (let index = first; index <= last; index += 1) {
    const { cell, width } = cells[index];
    parts.push(
      cell === null
        ? ' '.repeat(EMOJI_COLUMNS + 1 + width)
        : `${cell.glyph} ${cell.text.padEnd(width)}`,
    );
  }
  return parts.join(' ');
}

/**
 * One package line: the prefix, the path, the padding to the common column, then the fields.
 *
 * A line with no fields ends at its path and carries no padding, which keeps a workspace
 * with no counters byte-identical to the output before this field existed.
 */
// [::TICKET::] PX-223, PX-228, PX-282 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-223|PX-228|PX-282) --for-spec --no-implementation-order`.
function renderPackageLine(model, id, layout) {
  const marker = model.criticalChain.includes(id) ? CRITICAL_MARKER : ' ';
  const prefix = `${ITEM_INDENT}${marker} `;
  const fields = renderFields(model, id, layout);
  const linePrefix = `${prefix}${model.pathOf.get(id)}`;
  if (fields.length === 0) return linePrefix;
  const padding = ' '.repeat(model.markColumn - displayWidth(linePrefix));
  return `${linePrefix}${padding}${fields}`.trimEnd();
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

/** The whole picture: every level, then the width row and the chain row. */
export function renderPlan(model) {
  const layout = buildFieldLayout(model);
  const blocks = [
    `\n# ${model.workspaceName} implementation order — ${model.packages.length} dirs / ${model.levels.length} levels / ${model.edgeCount} dependencies`,
  ];
  model.levels.forEach((level, index) => {
    blocks.push('');
    blocks.push(renderLevelHeader(index, level.length));
    for (const id of level) blocks.push(renderPackageLine(model, id, layout));
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
  return ordered.map(
    (id) => `${LIST_INDENT}${padToDisplayWidth(model.pathOf.get(id), model.pathWidth)}  level ${model.levelOf.get(id)}`,
  );
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
