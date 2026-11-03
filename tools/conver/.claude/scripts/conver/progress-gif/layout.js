// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
import { STAGE_ORDER, LOOP_GROUPS, STAGE_GROUP } from './loop.js';

const COLOUR_GROUP_BY_STAGE = Object.freeze({
  educe: 'discovery', explain: 'discovery',
  grill: 'dialogue', smooth: 'dialogue',
  graphify: 'structure', boundify: 'structure', split: 'structure',
  make: 'implementation', plan: 'implementation', start: 'implementation',
  review: 'implementation', resolve: 'implementation',
  consolidate: 'convergence', find: 'convergence',
  crystalize: 'shipping',
  drill: 'evolution',
});

const GROUP_COLOURS = Object.freeze({
  discovery: '#5BC8C0',
  dialogue: '#5B8DEF',
  structure: '#A78BFA',
  implementation: '#F59E0B',
  convergence: '#EAB308',
  shipping: '#34D399',
  evolution: '#F472B6',
});

export const HEADER_HEIGHT = 92;
export const CELL_WIDTH = 180;
export const CELL_HEIGHT = 200;
export const RING_WIDTH = 280;
export const MIN_RADIUS = 18;
export const MAX_RADIUS = 54;
const MIN_CANVAS_WIDTH = 640;
const MIN_CANVAS_HEIGHT = 420;
const RING_ROW_HEIGHT = 54;
const LAYOUT_MARGIN = 24;
const MIN_RING_RADIUS = 70;
const MAX_RING_RADIUS = 110;
const RING_PADDING = 20;

export function groupColor(stage) {
  return GROUP_COLOURS[COLOUR_GROUP_BY_STAGE[stage]] || GROUP_COLOURS.discovery;
}

export function radiusFor(total, minTotal, maxTotal, minRadius, maxRadius) {
  if (maxTotal <= minTotal) return maxRadius;
  const normalized = Math.sqrt(Math.max(0, Math.min(1, (total - minTotal) / (maxTotal - minTotal))));
  return minRadius + normalized * (maxRadius - minRadius);
}

/**
 * Wrap a label into at most maxLines lines, appending an ellipsis to the last line when
 * the text still does not fit. The measure function is injected so the same layout can be
 * tested in Node and used with Canvas measureText in the browser.
 */
export function wrapLabel(measureText, text, maxWidth, maxLines = 2) {
  const characters = [...String(text || '')];
  if (characters.length === 0) return [''];
  const lines = [];
  let current = '';
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    if (measureText(current + character) <= maxWidth) {
      current += character;
      continue;
    }
    if (lines.length === maxLines - 1) {
      let cut = current;
      while (cut.length > 0 && measureText(`${cut}…`) > maxWidth) cut = cut.slice(0, -1);
      lines.push(`${cut}…`);
      return lines;
    }
    lines.push(current);
    current = character;
  }
  if (current !== '') lines.push(current);
  return lines.slice(0, maxLines);
}

/** Compute the vertical package grid, circle radii, labels and the right-side loop ring. */
export function computeLayout(model, options = {}) {
  const scale = Math.max(0.5, Math.min(3, Number(options.scale) || 1));
  const measureText = options.measureText || ((text) => String(text).length * 7);
  const packages = model.packages || [];
  const count = packages.length;
  const cols = Math.max(1, Math.min(6, Math.ceil(Math.sqrt(Math.max(1, count)))));
  const rows = Math.max(1, Math.ceil(Math.max(1, count) / cols));
  const cellWidth = CELL_WIDTH * scale;
  const cellHeight = CELL_HEIGHT * scale;
  const gridWidth = cols * cellWidth;
  const width = Math.max(MIN_CANVAS_WIDTH, gridWidth + RING_WIDTH * scale + LAYOUT_MARGIN * scale);
  const gridHeight = rows * cellHeight;
  const ringHeight = (LOOP_GROUPS.length * RING_ROW_HEIGHT + LAYOUT_MARGIN) * scale;
  const height = Math.max(MIN_CANVAS_HEIGHT, HEADER_HEIGHT * scale + Math.max(gridHeight, ringHeight) + LAYOUT_MARGIN * scale);
  const totals = packages.map((pkg) => pkg.obligations.total);
  const minTotal = totals.length > 0 ? Math.min(...totals) : 0;
  const maxTotal = totals.length > 0 ? Math.max(...totals) : 0;
  const cells = packages.map((pkg, index) => {
    const column = index % cols;
    const row = Math.floor(index / cols);
    const centerX = (LAYOUT_MARGIN / 2) * scale + column * cellWidth + cellWidth / 2;
    const centerY = HEADER_HEIGHT * scale + row * cellHeight + cellHeight / 2 - 16 * scale;
    return {
      id: pkg.id,
      name: pkg.name,
      path: pkg.path,
      centerX,
      centerY,
      radius: radiusFor(pkg.obligations.total, minTotal, maxTotal, MIN_RADIUS * scale, MAX_RADIUS * scale),
      labelLines: wrapLabel(measureText, pkg.name || pkg.id, cellWidth - 16 * scale, 2),
    };
  });
  const ringCenterX = gridWidth + (RING_WIDTH * scale) / 2 + (LAYOUT_MARGIN / 2) * scale;
  const ringCenterY = HEADER_HEIGHT * scale + Math.min(gridHeight, ringHeight) / 2;
  const ringRadius = Math.min(MAX_RING_RADIUS * scale, Math.max(MIN_RING_RADIUS * scale, ringHeight / 2 - RING_PADDING * scale));
  return {
    width,
    height,
    headerHeight: HEADER_HEIGHT * scale,
    cols,
    rows,
    cells,
    ring: {
      centerX: ringCenterX,
      centerY: ringCenterY,
      radius: ringRadius,
      segments: STAGE_ORDER.map((stage, index) => ({
        stage,
        group: STAGE_GROUP[stage],
        color: groupColor(stage),
        start: (index / STAGE_ORDER.length) * Math.PI * 2 - Math.PI / 2,
        end: ((index + 1) / STAGE_ORDER.length) * Math.PI * 2 - Math.PI / 2,
      })),
    },
    colours: GROUP_COLOURS,
  };
}

export function formatDate(t, prec) {
  const date = new Date(t || 0);
  const pad = (value) => String(value).padStart(2, '0');
  const month = pad((prec === 'day' ? date.getUTCMonth() : date.getMonth()) + 1);
  const day = pad(prec === 'day' ? date.getUTCDate() : date.getDate());
  const time = prec === 'day' ? '--:--' : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return `${month}/${day} ${time}`;
}

export function formatRatio(covered, reviewed) {
  const percent = covered > 0 ? Math.round((reviewed / covered) * 100) : 0;
  return `REVIEWED ${reviewed}/${covered} · ${percent}%`;
}

export function formatSplit(splitPackages, packages) {
  return `SPLIT ${splitPackages}/${packages}`;
}
