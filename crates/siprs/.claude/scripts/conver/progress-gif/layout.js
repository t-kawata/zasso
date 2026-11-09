import { STAGE_ORDER, STAGE_GROUP, STAGE_WEIGHT } from './loop.js';

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
  discovery: '#22D3EE',
  dialogue: '#3B82F6',
  structure: '#7C3AED',
  implementation: '#EA580C',
  convergence: '#FDE047',
  shipping: '#22C55E',
  evolution: '#EC4899',
});

/**
 * The one-line description shown after the header stage name. The key set must
 * stay identical to STAGE_ORDER; a missing entry removes the caption instead of
 * inventing text. English entries are deliberately short because the header
 * reserves only the space between the date and the percent block.
 */
// [::TICKET::] PX-380 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-380 --for-spec --no-implementation-order`.
export const STAGE_CAPTIONS = Object.freeze({
  ja: Object.freeze({
    educe: '設計書から要実装操作を抽出し各部へ配布',
    explain: '各部の役割定義と大まかな設計判断',
    grill: '各部の詳細設計判断とRFC作成',
    smooth: '部間の設計齟齬・欠落・リスクの修復',
    graphify: '各部RFCの機械検証可能な空間への変換',
    boundify: '各部への設計参照の付与とファイル生成',
    split: '各部を作業チケットへ細分化',
    make: 'チケット単位の実装・契約・テストをSPEC化',
    plan: 'SPECをコード含む実装計画へ具体化',
    start: 'チケット単位の完全実装とテスト',
    review: 'チケット単位の実装・契約・テストの点検',
    resolve: '複数チケットを横断した重大問題の解決',
    consolidate: '不完全な実装記録の集約と完工準備',
    find: '実装の欠陥・矛盾の検知とチケット化',
    crystalize: '各部単位での完全なREADME化',
    drill: '各部RFCの改訂による品質向上',
  }),
  en: Object.freeze({
    educe: 'List design operations for builders',
    explain: 'Role brief plus rough design choices',
    grill: 'Refine design decisions; write each RFC',
    smooth: 'Fix cross-team design gaps and conflicts',
    graphify: 'Turn RFCs into checkable design spaces',
    boundify: 'Generate files anchored to each design',
    split: 'Split teams into ticket-sized units',
    make: 'Write complete contract and test SPECs',
    plan: 'Make each SPEC a concrete code plan',
    start: 'Implement and test each ticket fully',
    review: 'Audit code, contracts, and tests',
    resolve: 'Fix all critical issues across tickets',
    consolidate: 'Prepare incomplete work for completion',
    find: 'Find gaps and conflicts; create tickets',
    crystalize: 'Write a complete README per team',
    drill: "Evolve each team's RFC to raise quality",
  }),
});

export const DEFAULT_CAPTION_LANGUAGE = 'ja';
export const MIN_DESCRIPTION_SIZE = 12;
export const CAPTION_ELLIPSIS = '…';

/** The description for one stage, or null when the stage or language is unknown. */
// [::TICKET::] PX-380 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-380 --for-spec --no-implementation-order`.
export function stageCaption(stage, language = DEFAULT_CAPTION_LANGUAGE) {
  if (language !== 'ja' && language !== 'en') return null;
  const key = String(stage || '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(STAGE_CAPTIONS[language], key) ? STAGE_CAPTIONS[language][key] : null;
}

/** The drawn run: the uppercase stage name, an ASCII colon, one space, the description. */
// [::TICKET::] PX-380 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-380 --for-spec --no-implementation-order`.
export function stageCaptionText(stage, language = DEFAULT_CAPTION_LANGUAGE) {
  const description = stageCaption(stage, language);
  return description === null ? null : `${String(stage).toUpperCase()}: ${description}`;
}

/**
 * The largest integer font size at which the description fits the available width.
 * The caller supplies a measure function bound to the real font so this stays pure
 * and testable without a Canvas; sizes below the minimum are never returned.
 */
// [::TICKET::] PX-380 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-380 --for-spec --no-implementation-order`.
export function fitDescriptionSize(measureAt, text, availableWidth, maxSize, minSize = MIN_DESCRIPTION_SIZE) {
  const maximum = Math.max(1, Math.floor(maxSize));
  const minimum = Math.max(1, Math.min(maximum, Math.floor(minSize)));
  const width = Number(availableWidth);
  if (!Number.isFinite(width) || width <= 0) return minimum;
  for (let size = maximum; size > minimum; size -= 1) {
    if (measureAt(text, size) <= width) return size;
  }
  return minimum;
}

/** Trim the description to one line ending in the ellipsis when it still overflows. */
// [::TICKET::] PX-380 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-380 --for-spec --no-implementation-order`.
export function ellipsizeDescription(measureAt, text, availableWidth, size) {
  const source = String(text || '');
  if (measureAt(source, size) <= availableWidth) return source;
  let candidate = source;
  while (candidate.length > 0 && measureAt(`${candidate}${CAPTION_ELLIPSIS}`, size) > availableWidth) {
    candidate = candidate.slice(0, -1);
  }
  return `${candidate}${CAPTION_ELLIPSIS}`;
}

export const BOARD_WIDTH = 724;
export const BASE_HEIGHT = 384;
export const BOARD_GUTTER = 12;
export const GRID_X = BOARD_GUTTER;
export const GRID_Y = 72;
export const GRID_WIDTH = 504;
// Cell size is calibrated against the seven-column sample. The slider default is
// independent so raising it widens the board instead of shrinking every circle.
export const GRID_COLUMNS = 7;
export const DEFAULT_COLUMNS = 8;
export const MIN_COLUMNS = 4;
export const MAX_COLUMNS = 10;
export const MIN_CELL = 64;
export const MAX_CELL = 72;
export const LABEL_HEIGHT = 34;
export const PACKAGE_BAR_HEIGHT = 6;
export const PACKAGE_BAR_MARGIN_X = 4;
export const PACKAGE_BAR_TOP_OFFSET = 1;
export const PACKAGE_LABEL_TOP_OFFSET = 16;
export const LADDER_X = 528;
export const LADDER_Y = 72;
export const LADDER_ROW_HEIGHT = 18;
export const LADDER_GROUP_GAP = 3;
export const LADDER_LABEL_CENTER_OFFSET = 6;
export const LADDER_BAR_X = 670;
export const LADDER_BAR_WIDTH = 42;
export const LADDER_BAR_HEIGHT = 6;
export const LADDER_BLOCK_WIDTH = BOARD_WIDTH - LADDER_X;
export const LADDER_BAR_OFFSET = LADDER_BAR_X - LADDER_X;
export const HEADER_BAR_X = BOARD_GUTTER;
export const HEADER_BAR_Y = 34;
export const HEADER_BAR_HEIGHT = 6;
export const HEADER_DATE_Y = 56;
export const DOT_TARGET = 110;
export const MIN_RADIUS_RATIO = 0.26;
export const MAX_RADIUS_RATIO = 0.40;
export const MAX_CELL_RADIUS = MAX_CELL * MAX_RADIUS_RATIO;

const WEIGHT_SUM = STAGE_WEIGHT.reduce((sum, weight) => sum + weight, 0);

export function groupColor(stage) {
  return GROUP_COLOURS[COLOUR_GROUP_BY_STAGE[stage]] || GROUP_COLOURS.discovery;
}

/** Keep the user-selected column count inside the numeric input range. */
export function clampColumns(value) {
  const raw = String(value ?? '').trim();
  if (raw === '') return DEFAULT_COLUMNS;
  const numeric = Math.round(Number(raw));
  if (!Number.isFinite(numeric)) return DEFAULT_COLUMNS;
  return Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, numeric));
}

/** Area is proportional to obligations, so the diameter follows the square root. */
export function radiusForArea(total, minTotal, maxTotal, minRadius, maxRadius) {
  // An unknown scope must not look as large as a fully measured package.
  if (total <= 0) return minRadius;
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
  const source = String(text || '');
  if (source.length === 0) return [''];
  if (measureText(source) <= maxWidth) return [source];
  const tokens = source.match(/[^-_ ]+[-_ ]?/g) || [source];
  const lines = [];
  let current = '';
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (measureText(current + token) <= maxWidth) {
      current += token;
      continue;
    }
    if (current !== '') lines.push(current);
    current = token;
    while (measureText(current) > maxWidth) {
      let cut = current;
      while (cut.length > 0 && measureText(`${cut}…`) > maxWidth) cut = cut.slice(0, -1);
      if (lines.length === maxLines - 1) {
        lines.push(`${cut}…`);
        return lines;
      }
      lines.push(cut);
      current = cut === '' ? '' : current.slice(cut.length);
      if (current === '') break;
    }
    if (lines.length === maxLines - 1) {
      const remaining = tokens.slice(index + 1);
      if (remaining.length === 0 && measureText(current) <= maxWidth) break;
      const remainder = current + remaining.join('');
      let cut = remainder;
      while (cut.length > 0 && measureText(`${cut}…`) > maxWidth) cut = cut.slice(0, -1);
      lines.push(`${cut}…`);
      return lines;
    }
  }
  if (current !== '') lines.push(current);
  return lines.slice(0, maxLines);
}

const PREFIX_SEPARATORS = Object.freeze(['-', '_', '.', '/']);

// [::TICKET::] PX-401 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-401 --for-spec --no-implementation-order`.
function findLongestCommonPrefix(names) {
  let commonPrefix = names[0];
  for (const name of names.slice(1)) {
    let matchingLength = 0;
    while (
      matchingLength < commonPrefix.length
      && matchingLength < name.length
      && commonPrefix[matchingLength] === name[matchingLength]
    ) matchingLength += 1;
    commonPrefix = commonPrefix.slice(0, matchingLength);
  }
  return commonPrefix;
}

/**
 * A package named exactly like the shared prefix (the workspace root) must not
 * cancel stripping for its siblings: the root keeps its name, and the siblings
 * lose the prefix together with the separator that follows it.
 */
function findSeparatorAlignedPrefix(commonPrefix, source) {
  const separatorIndex = PREFIX_SEPARATORS.reduce(
    (best, separator) => Math.max(best, commonPrefix.lastIndexOf(separator)),
    -1,
  );
  if (separatorIndex >= 0) return commonPrefix.slice(0, separatorIndex + 1);
  const siblings = source.filter((name) => name !== commonPrefix);
  if (siblings.length === 0) return '';
  const separator = PREFIX_SEPARATORS.find((candidate) => (
    siblings.every((name) => name.startsWith(`${commonPrefix}${candidate}`))
  ));
  return separator === undefined ? '' : `${commonPrefix}${separator}`;
}

/**
 * Remove the longest common prefix of a package-name set when it ends at a separator
 * and every remainder is non-empty. A package named exactly like the prefix keeps its
 * name so the workspace root cannot block stripping for the others.
 */
export function stripCommonPrefix(names) {
  const source = (names || []).map((name) => String(name === undefined || name === null ? '' : name));
  if (source.length === 0) return { prefix: '', names: [] };
  const commonPrefix = findLongestCommonPrefix(source);
  const prefix = findSeparatorAlignedPrefix(commonPrefix, source);
  if (prefix === '') return { prefix: '', names: source };
  const stripped = source.map((name) => (name === commonPrefix ? name : name.slice(prefix.length)));
  if (stripped.every((name) => name.length > 0)) return { prefix, names: stripped };
  return { prefix: '', names: source };
}

/** The shared Fermat-spiral dot field, ordered by stage weight. */
export function buildDotField() {
  const counts = STAGE_WEIGHT.map((weight) => Math.max(2, Math.round((weight / WEIGHT_SUM) * DOT_TARGET)));
  const totalDots = counts.reduce((sum, count) => sum + count, 0);
  const dots = [];
  let index = 0;
  counts.forEach((count, stage) => {
    for (let inStage = 0; inStage < count; inStage += 1) {
      dots.push({
        stage,
        indexInStage: inStage,
        angle: index * 2.39996323,
        radial: Math.sqrt((index + 0.5) / totalDots),
      });
      index += 1;
    }
  });
  return { counts, dots, totalDots };
}

// [::TICKET::] PX-350, PX-351 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-350|PX-351) --for-spec --no-implementation-order`.
function buildLadderRows(scale, ladderX) {
  const rows = [];
  let groupSeen = null;
  let gap = 0;
  STAGE_ORDER.forEach((stage, index) => {
    const group = STAGE_GROUP[stage];
    if (groupSeen !== null && group !== groupSeen) gap += LADDER_GROUP_GAP;
    groupSeen = group;
    const rowY = LADDER_Y + index * LADDER_ROW_HEIGHT + gap;
    rows.push({
      stage,
      group,
      colour: groupColor(stage),
      x: ladderX * scale,
      y: rowY * scale,
      centerY: (rowY + LADDER_LABEL_CENTER_OFFSET) * scale,
      labelX: (ladderX + 4) * scale,
      barX: (ladderX + LADDER_BAR_OFFSET) * scale,
      barY: (rowY + 3) * scale,
      barWidth: LADDER_BAR_WIDTH * scale,
      barHeight: LADDER_BAR_HEIGHT * scale,
    });
  });
  return rows;
}

/** Compute the fixed 724-wide board; only the row count grows the height. */
// [::TICKET::] PX-380 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-380 --for-spec --no-implementation-order`.
export function computeLayout(model, options = {}) {
  const scale = Math.max(0.5, Math.min(3, Number(options.scale) || 1));
  const measureText = options.measureText || ((text) => String(text).length * 6);
  const packages = model.packages || [];
  const names = packages.map((pkg) => pkg.name || pkg.id);
  const stripped = stripCommonPrefix(names);
  const count = packages.length;
  const columns = clampColumns(options.columns);
  const rows = Math.max(1, Math.ceil(Math.max(1, count) / columns));
  const cellFromWidth = GRID_WIDTH / GRID_COLUMNS;
  const cellFromBaseHeight = (BASE_HEIGHT - GRID_Y - 8) / rows - LABEL_HEIGHT;
  const cell = Math.max(MIN_CELL, Math.min(MAX_CELL, Math.min(cellFromWidth, cellFromBaseHeight)));
  const cellHeight = cell + LABEL_HEIGHT;
  const contentWidth = GRID_X + columns * MAX_CELL + BOARD_GUTTER + LADDER_BLOCK_WIDTH;
  const baseWidth = Math.max(BOARD_WIDTH, contentWidth);
  const ladderX = baseWidth - LADDER_BLOCK_WIDTH;
  const baseHeight = Math.max(BASE_HEIGHT, GRID_Y + rows * cellHeight + 8);
  const widths = packages.map((pkg) => Number(pkg.obligations && pkg.obligations.total) || 0);
  const minTotal = widths.length > 0 ? Math.min(...widths) : 0;
  const maxTotal = widths.length > 0 ? Math.max(...widths) : 0;
  const minRadius = cell * MIN_RADIUS_RATIO;
  const maxRadius = cell * MAX_RADIUS_RATIO;
  const dotField = buildDotField();
  const cells = packages.map((pkg, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = GRID_X + column * cell;
    const top = GRID_Y + row * cellHeight;
    const centerX = left + cell / 2;
    const centerY = top + cell / 2;
    return {
      id: pkg.id,
      name: pkg.name || pkg.id,
      path: pkg.path || pkg.name || pkg.id,
      displayName: stripped.names[index],
      packageIndex: index,
      cellWidth: cell * scale,
      cellHeight: cellHeight * scale,
      centerX: centerX * scale,
      centerY: centerY * scale,
      left: left * scale,
      top: top * scale,
      radius: radiusForArea(widths[index], minTotal, maxTotal, minRadius, maxRadius) * scale,
      labelLines: wrapLabel(measureText, stripped.names[index], cell - 4, 2),
      labelX: centerX * scale,
      labelY: (top + cell + PACKAGE_LABEL_TOP_OFFSET) * scale,
      barX: (left + PACKAGE_BAR_MARGIN_X) * scale,
      barY: (top + cell + PACKAGE_BAR_TOP_OFFSET) * scale,
      barWidth: (cell - PACKAGE_BAR_MARGIN_X * 2) * scale,
      barHeight: PACKAGE_BAR_HEIGHT * scale,
      dots: dotField.dots,
    };
  });
  return {
    width: baseWidth * scale,
    height: baseHeight * scale,
    scale,
    header: {
      height: GRID_Y * scale,
      title: options.title || 'PROGRESS',
      titleX: 12 * scale,
      titleY: 18 * scale,
      barX: HEADER_BAR_X * scale,
      barY: HEADER_BAR_Y * scale,
      barWidth: (baseWidth - HEADER_BAR_X * 2) * scale,
      barHeight: HEADER_BAR_HEIGHT * scale,
      dateX: 12 * scale,
      dateY: HEADER_DATE_Y * scale,
      percentX: (baseWidth - HEADER_BAR_X) * scale,
      percentY: HEADER_DATE_Y * scale,
    },
    grid: {
      x: GRID_X * scale,
      y: GRID_Y * scale,
      width: (columns * cell) * scale,
      columns,
      rows,
      cellWidth: cell * scale,
      cellHeight: cellHeight * scale,
      labelHeight: LABEL_HEIGHT * scale,
      minTotal,
      maxTotal,
      minRadius: minRadius * scale,
      maxRadius: maxRadius * scale,
    },
    cells,
    dotCounts: dotField.counts,
    ladder: {
      x: ladderX * scale,
      y: LADDER_Y * scale,
      rowHeight: LADDER_ROW_HEIGHT * scale,
      groupGap: LADDER_GROUP_GAP * scale,
      barWidth: LADDER_BAR_WIDTH * scale,
      barHeight: LADDER_BAR_HEIGHT * scale,
      rows: buildLadderRows(scale, ladderX),
    },
    colours: GROUP_COLOURS,
  };
}

export function formatDate(timestamp, precision) {
  const date = new Date(timestamp || 0);
  const pad = (value) => String(value).padStart(2, '0');
  const month = pad((precision === 'day' ? date.getUTCMonth() : date.getMonth()) + 1);
  const day = pad(precision === 'day' ? date.getUTCDate() : date.getDate());
  const time = precision === 'day' ? '--:--' : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return `${month}/${day} ${time}`;
}

/** Format the stage-weighted ladder completion as a rounded 0-100 percent. */
export function formatPercent(progress) {
  const clamped = Math.max(0, Math.min(1, Number(progress) || 0));
  return `${Math.round(clamped * 100)}%`;
}
