// [::TICKET::] PX-351 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-351 --for-spec --no-implementation-order`.
// PX-351 @verifies C001 @verifies C004 @verifies C005
// PX-380 @verifies C001 @verifies C002 @verifies C006
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeLayout,
  clampColumns,
  radiusForArea,
  wrapLabel,
  groupColor,
  stripCommonPrefix,
  formatDate,
  formatPercent,
  STAGE_CAPTIONS,
  stageCaption,
  stageCaptionText,
  fitDescriptionSize,
  ellipsizeDescription,
  MIN_DESCRIPTION_SIZE,
  CAPTION_ELLIPSIS,
  MIN_CELL,
  MAX_CELL,
  MAX_CELL_RADIUS,
  PACKAGE_BAR_HEIGHT,
  PACKAGE_BAR_MARGIN_X,
  PACKAGE_BAR_TOP_OFFSET,
  PACKAGE_LABEL_TOP_OFFSET,
  DEFAULT_COLUMNS,
  MIN_COLUMNS,
  MAX_COLUMNS,
} from '../../.claude/scripts/conver/progress-gif/layout.js';
import { STAGE_ORDER } from '../../.claude/scripts/conver/progress-gif/loop.js';
import { makeModel, packageModel, withPackageCount } from './models.mjs';

const measure = (text) => String(text).length * 6;

const SRGB_LINEAR_THRESHOLD = 0.04045;
const LAB_PIVOT = 0.008856;
const LAB_WHITE_X = 0.95047;
const LAB_WHITE_Z = 1.08883;
const ADJACENT_COLOUR_DISTANCE_MIN = 40;

// [::TICKET::] PX-351 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-351 --for-spec --no-implementation-order`.
// [::TICKET::] PX-401 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-401 --for-spec --no-implementation-order`.
function linearizeChannel(raw) {
  const normalized = raw / 255;
  return normalized <= SRGB_LINEAR_THRESHOLD
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

// [::TICKET::] PX-351 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-351 --for-spec --no-implementation-order`.
function hexToLab(hex) {
  const value = parseInt(hex.slice(1), 16);
  const red = linearizeChannel((value >> 16) & 255);
  const green = linearizeChannel((value >> 8) & 255);
  const blue = linearizeChannel(value & 255);
  const tristimulusX = (0.4124 * red + 0.3576 * green + 0.1805 * blue) / LAB_WHITE_X;
  const tristimulusY = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const tristimulusZ = (0.0193 * red + 0.1192 * green + 0.9505 * blue) / LAB_WHITE_Z;
  const pivot = (component) => (component > LAB_PIVOT
    ? Math.cbrt(component)
    : 7.787 * component + 16 / 116);
  const pivotX = pivot(tristimulusX);
  const pivotY = pivot(tristimulusY);
  const pivotZ = pivot(tristimulusZ);
  return [116 * pivotY - 16, 500 * (pivotX - pivotY), 200 * (pivotY - pivotZ)];
}

// [::TICKET::] PX-351 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-351 --for-spec --no-implementation-order`.
function colourDistance(left, right) {
  const first = hexToLab(left);
  const second = hexToLab(right);
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);
}

test('the base board keeps the sample cell size while showing eight columns', () => {
  const layout = computeLayout(withPackageCount(5), { measureText: measure });
  assert.equal(layout.width, 796);
  assert.equal(layout.height, 384);
  assert.equal(layout.grid.x, 12);
  assert.equal(layout.grid.y, 72);
  assert.equal(layout.grid.width, 576);
  assert.equal(layout.grid.cellWidth, MAX_CELL);
  assert.equal(layout.grid.columns, DEFAULT_COLUMNS);
  assert.equal(layout.ladder.x, 600);
  assert.equal(layout.ladder.y, 72);
  assert.equal(layout.ladder.rows.length, 16);
  assert.deepEqual(layout.ladder.rows.map((row) => row.stage), STAGE_ORDER);
  assert.equal(layout.cells.length, 5);
  assert.ok(layout.cells.every((cell) => cell.dots.length >= 100));
});

test('fourteen packages still fit the one-screen base height', () => {
  const layout = computeLayout(withPackageCount(14), { measureText: measure });
  assert.equal(layout.width, 796);
  assert.equal(layout.height, 384);
  assert.equal(layout.grid.columns, DEFAULT_COLUMNS);
});

test('vertical growth changes rows and height only, never width or columns', () => {
  const short = computeLayout(withPackageCount(5), { measureText: measure });
  const tall = computeLayout(withPackageCount(40), { measureText: measure });
  assert.equal(short.width, 796);
  assert.equal(tall.width, 796);
  assert.equal(short.grid.columns, DEFAULT_COLUMNS);
  assert.equal(tall.grid.columns, DEFAULT_COLUMNS);
  assert.equal(tall.grid.rows, 5);
  assert.equal(tall.height, 600);
  assert.ok(tall.height > short.height);
  assert.ok(tall.cells.every((cell) => cell.cellWidth >= MIN_CELL));
  assert.ok(tall.cells.every((cell) => cell.cellWidth <= MAX_CELL));
});

test('a 29-package workspace uses four rows at 796x496', () => {
  const layout = computeLayout(withPackageCount(29), { measureText: measure });
  assert.equal(layout.grid.rows, 4);
  assert.equal(layout.height, 496);
  assert.equal(layout.width, 796);
});

test('the column count controls rows and can widen the board', () => {
  const wide = computeLayout(withPackageCount(29), { measureText: measure, columns: 10 });
  assert.equal(wide.grid.columns, 10);
  assert.equal(wide.grid.rows, 3);
  assert.equal(wide.width, 940);
  assert.equal(wide.height, 392);
  const narrow = computeLayout(withPackageCount(29), { measureText: measure, columns: 5 });
  assert.equal(narrow.grid.columns, 5);
  assert.equal(narrow.grid.rows, 6);
  assert.equal(narrow.width, 724);
  assert.equal(narrow.height, 704);
  const tighter = computeLayout(withPackageCount(29), { measureText: measure, columns: 4 });
  assert.equal(tighter.grid.rows, 8);
  assert.equal(tighter.width, 724);
  assert.equal(tighter.height, 912);
});

test('clampColumns keeps the control inside its range with a default of eight', () => {
  assert.equal(DEFAULT_COLUMNS, 8);
  assert.equal(MIN_COLUMNS, 4);
  assert.equal(MAX_COLUMNS, 10);
  assert.equal(clampColumns(4), 4);
  assert.equal(clampColumns(10), 10);
  assert.equal(clampColumns(3), 4);
  assert.equal(clampColumns(11), 10);
  assert.equal(clampColumns(Number.NaN), 8);
  assert.equal(clampColumns(undefined), 8);
  assert.equal(clampColumns(''), 8);
  assert.equal(clampColumns(7.4), 7);
  assert.equal(clampColumns('9'), 9);
});

test('every package count keeps the board width and column count', () => {
  for (const count of [0, 1, 5, 7, 8, 14, 29, 40]) {
    const layout = computeLayout(withPackageCount(count), { measureText: measure });
    assert.equal(layout.width, 796, `count ${count}`);
    assert.equal(layout.grid.columns, 8, `count ${count}`);
    assert.equal(layout.grid.rows, Math.max(1, Math.ceil(count / 8)), `count ${count}`);
  }
});

test('radiusForArea uses square-root area, clamps and never divides by zero', () => {
  const small = radiusForArea(10, 10, 100, 20, 40);
  const large = radiusForArea(100, 10, 100, 20, 40);
  assert.ok(large > small);
  assert.equal(large, 40);
  assert.equal(radiusForArea(0, 0, 100, 20, 40), 20);
  assert.equal(radiusForArea(0, 0, 0, 20, 40), 20);
  assert.equal(radiusForArea(4, 4, 4, 20, 40), 40);
  assert.ok(small >= 20 && small <= 40);
});

test('a package with no extracted contract uses the minimum radius', () => {
  const model = withPackageCount(2, { total: 0 });
  const layout = computeLayout(model, { measureText: measure });
  assert.ok(layout.cells.every((cell) => cell.radius === layout.grid.minRadius));
  assert.equal(layout.grid.minTotal, 0);
  assert.equal(layout.grid.maxTotal, 0);
});

test('radius follows contract obligations while the dot field stays present', () => {
  const model = withPackageCount(2);
  model.packages[0].obligations.total = 10;
  model.packages[0].obligations.graph = 10;
  model.packages[1].obligations.total = 100;
  model.packages[1].obligations.graph = 100;
  const layout = computeLayout(model, { measureText: measure });
  assert.ok(layout.cells[1].radius > layout.cells[0].radius);
  assert.ok(layout.cells.every((cell) => cell.radius <= MAX_CELL_RADIUS));
  assert.ok(layout.cells.every((cell) => cell.dots.length >= 100));
});

test('wrapLabel keeps two lines and ellipsizes overflow', () => {
  const lines = wrapLabel(measure, 'a-very-long-package-name-that-does-not-fit', 42, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines.every((line) => measure(line) <= 42));
  assert.match(lines[1], /…$/);
});

test('groupColor returns the seven agreed groups with adjacent colours far apart', () => {
  const colours = new Set(STAGE_ORDER.map((stage) => groupColor(stage)));
  assert.equal(colours.size, 7);
  assert.equal(groupColor('educe'), groupColor('explain'));
  assert.equal(groupColor('make'), groupColor('resolve'));
  assert.notEqual(groupColor('educe'), groupColor('drill'));
  const samples = [];
  for (const stage of STAGE_ORDER) {
    const colour = groupColor(stage);
    if (samples.at(-1) !== colour) samples.push(colour);
  }
  assert.equal(samples.length, 7);
  for (let index = 0; index < samples.length - 1; index += 1) {
    const distance = colourDistance(samples[index], samples[index + 1]);
    assert.ok(distance >= ADJACENT_COLOUR_DISTANCE_MIN, `${samples[index]} -> ${samples[index + 1]} distance ${distance.toFixed(1)}`);
  }
});

test('stripCommonPrefix removes only a separator-aligned prefix with non-empty remainders', () => {
  assert.deepEqual(stripCommonPrefix(['gaia-api', 'gaia-web']), { prefix: 'gaia-', names: ['api', 'web'] });
  assert.deepEqual(stripCommonPrefix(['pkg.one', 'pkg.two']), { prefix: 'pkg.', names: ['one', 'two'] });
  assert.deepEqual(stripCommonPrefix(['a', 'ab']), { prefix: '', names: ['a', 'ab'] });
  assert.deepEqual(stripCommonPrefix(['gaia', 'gaia-api']), { prefix: 'gaia-', names: ['gaia', 'api'] });
  assert.deepEqual(stripCommonPrefix([]), { prefix: '', names: [] });
});

test('stripCommonPrefix keeps a bare root name while stripping its siblings', () => {
  assert.deepEqual(
    stripCommonPrefix(['crystal', 'crystal-core', 'crystal-rest']),
    { prefix: 'crystal-', names: ['crystal', 'core', 'rest'] },
  );
  assert.deepEqual(
    stripCommonPrefix(['pkg', 'pkg.one', 'pkg.two']),
    { prefix: 'pkg.', names: ['pkg', 'one', 'two'] },
  );
  assert.deepEqual(stripCommonPrefix(['gaia', 'gaia']), { prefix: '', names: ['gaia', 'gaia'] });
  assert.deepEqual(
    stripCommonPrefix(['pkg', 'pkg.one', 'pkg-two']),
    { prefix: '', names: ['pkg', 'pkg.one', 'pkg-two'] },
  );
  assert.deepEqual(
    stripCommonPrefix(['gaia', 'gaia-', 'gaia-api']),
    { prefix: '', names: ['gaia', 'gaia-', 'gaia-api'] },
  );
  assert.deepEqual(
    stripCommonPrefix(['gaia', 'gaia-api', 'other']),
    { prefix: '', names: ['gaia', 'gaia-api', 'other'] },
  );
});

test('package labels use the stripped display name while the full name and path stay intact', () => {
  const model = makeModel({
    packages: [
      packageModel({ id: 'p1', name: 'gaia-api', path: 'crates/gaia-api' }),
      packageModel({ id: 'p2', name: 'gaia-web', path: 'crates/gaia-web' }),
    ],
  });
  const layout = computeLayout(model, { measureText: measure });
  assert.deepEqual(layout.cells.map((cell) => cell.displayName), ['api', 'web']);
  assert.deepEqual(layout.cells.map((cell) => cell.name), ['gaia-api', 'gaia-web']);
  assert.deepEqual(layout.cells.map((cell) => cell.path), ['crates/gaia-api', 'crates/gaia-web']);
  assert.deepEqual(layout.cells[0].labelLines, ['api']);
  assert.ok(layout.cells.every((cell) => cell.displayName.length > 0));
});

test('a workspace root named like the prefix does not cancel sibling stripping', () => {
  const model = makeModel({
    packages: [
      packageModel({ id: 'root', name: 'crystal', path: '.' }),
      packageModel({ id: 'core', name: 'crystal-core', path: 'crates/crystal-core' }),
      packageModel({ id: 'rest', name: 'crystal-rest', path: 'crates/transports/crystal-rest' }),
    ],
  });
  const layout = computeLayout(model, { measureText: measure });
  assert.deepEqual(layout.cells.map((cell) => cell.displayName), ['crystal', 'core', 'rest']);
  assert.deepEqual(layout.cells.map((cell) => cell.path), ['.', 'crates/crystal-core', 'crates/transports/crystal-rest']);
});

test('the header exposes a full-width bar below the title with breathing room', () => {
  const layout = computeLayout(withPackageCount(5), { measureText: measure });
  assert.equal(layout.header.barX, 12);
  assert.equal(layout.header.barY, 34);
  assert.equal(layout.header.barWidth, layout.width - 24);
  assert.equal(layout.header.barHeight, 6);
  assert.equal(layout.header.dateY, 56);
  assert.ok(layout.header.barY - layout.header.titleY >= 14);
  assert.ok(layout.header.dateY - (layout.header.barY + layout.header.barHeight) >= 14);
  assert.ok(layout.header.barY + layout.header.barHeight <= layout.grid.y);
  assert.ok(layout.header.barY + layout.header.barHeight <= layout.ladder.y);
});

test('every package cell carries one shared bar between the circle and the label', () => {
  const layout = computeLayout(withPackageCount(3), { measureText: measure });
  const widths = new Set(layout.cells.map((cell) => cell.barWidth));
  assert.equal(widths.size, 1);
  assert.equal(layout.cells[0].barHeight, PACKAGE_BAR_HEIGHT);
  for (const cell of layout.cells) {
    assert.equal(cell.barX, cell.left + PACKAGE_BAR_MARGIN_X);
    assert.equal(cell.barY, cell.top + cell.cellWidth + PACKAGE_BAR_TOP_OFFSET);
    assert.equal(cell.barWidth, cell.cellWidth - PACKAGE_BAR_MARGIN_X * 2);
    assert.equal(cell.labelY, cell.top + cell.cellWidth + PACKAGE_LABEL_TOP_OFFSET);
    assert.ok(cell.barY > cell.centerY + MAX_CELL_RADIUS * 1.16);
    // The label's glyphs start above the baseline, so a 14px baseline gap keeps
    // the package name clear of the bar instead of touching its bottom edge.
    assert.ok(cell.labelY - (cell.barY + cell.barHeight) >= 14);
    assert.ok(cell.barX + cell.barWidth <= cell.left + cell.cellWidth);
  }
});

test('formatters keep the denominator and render a clamped percentage', () => {
  assert.equal(formatDate(Date.UTC(2026, 10, 2), 'day'), '11/02 --:--');
  assert.match(formatDate(Date.UTC(2026, 10, 2, 3, 4), 'ms'), /^11\/0[12] \d{2}:\d{2}$/);
  assert.equal(formatPercent(0.3047), '30%');
  assert.equal(formatPercent(0), '0%');
  assert.equal(formatPercent(1), '100%');
  assert.equal(formatPercent(1.5), '100%');
  assert.equal(formatPercent(-1), '0%');
  assert.equal(formatPercent(Number.NaN), '0%');
  assert.equal(formatPercent(undefined), '0%');
});

const CJK_CODE_POINT_START = 0x2e80;
const ASCII_ADVANCE_RATIO = 0.55;

/** A deterministic stand-in for the bundled font: full-width for CJK, 0.55em for ASCII. */
// [::TICKET::] PX-380 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-380 --for-spec --no-implementation-order`.
function measureGlyphRun(text, size) {
  let width = 0;
  for (const character of String(text)) {
    width += character.codePointAt(0) >= CJK_CODE_POINT_START ? size : size * ASCII_ADVANCE_RATIO;
  }
  return width;
}

test('every stage carries a Japanese and an English caption', () => {
  assert.equal(STAGE_ORDER.length, 16);
  for (const stage of STAGE_ORDER) {
    const japanese = stageCaption(stage, 'ja');
    const english = stageCaption(stage, 'en');
    assert.equal(typeof japanese, 'string', `${stage} ja type`);
    assert.ok(japanese.length > 0, `${stage} ja empty`);
    assert.equal(typeof english, 'string', `${stage} en type`);
    assert.ok(english.length > 0, `${stage} en empty`);
  }
  assert.equal(stageCaption('educe', 'ja'), '設計書から要実装操作を抽出し各部へ配布');
  assert.equal(stageCaption('educe', 'en'), 'List design operations for builders');
});

test('stageCaption returns null for an unknown, empty or unsupported input', () => {
  assert.equal(stageCaption(null, 'ja'), null);
  assert.equal(stageCaption('', 'ja'), null);
  assert.equal(stageCaption('unknown', 'ja'), null);
  assert.equal(stageCaption('educe', 'fr'), null);
  assert.equal(stageCaption('EDUCE', 'ja'), STAGE_CAPTIONS.ja.educe);
});

test('stageCaptionText uppercases the name and joins it with one ASCII space', () => {
  assert.equal(stageCaptionText('smooth', 'ja'), `SMOOTH: ${STAGE_CAPTIONS.ja.smooth}`);
  assert.equal(stageCaptionText('make', 'en'), `MAKE: ${STAGE_CAPTIONS.en.make}`);
  assert.equal(stageCaptionText('unknown', 'ja'), null);
});

test('fitDescriptionSize picks the largest size that fits inside the bounds', () => {
  assert.equal(fitDescriptionSize(measureGlyphRun, 'short', 600, 18, MIN_DESCRIPTION_SIZE), 18);
  const longJapanese = '設計書'.repeat(7);
  const fitted = fitDescriptionSize(measureGlyphRun, longJapanese, 300, 18, MIN_DESCRIPTION_SIZE);
  assert.ok(fitted >= MIN_DESCRIPTION_SIZE && fitted <= 18);
  assert.ok(measureGlyphRun(longJapanese, fitted) <= 300);
  assert.ok(measureGlyphRun(longJapanese, fitted + 1) > 300);
});

test('fitDescriptionSize never leaves its bounds', () => {
  const text = '設計書'.repeat(100);
  for (const width of [0, -1, Number.NaN, 1, 100, 475.6, 556.4, 628.4, Number.POSITIVE_INFINITY]) {
    const size = fitDescriptionSize(measureGlyphRun, text, width, 18, MIN_DESCRIPTION_SIZE);
    assert.ok(size >= MIN_DESCRIPTION_SIZE && size <= 18, `width ${width} size ${size}`);
  }
  assert.equal(fitDescriptionSize(measureGlyphRun, text, 0, 18, MIN_DESCRIPTION_SIZE), MIN_DESCRIPTION_SIZE);
});

test('every caption fits the description room of the narrowest board', () => {
  // Measured with the bundled Noto Sans JP on the 724 px board: the date, one
  // space, the widest name prefix and the percent block leave 475.6 px.
  const descriptionRoom = 475.6;
  for (const language of ['ja', 'en']) {
    for (const stage of STAGE_ORDER) {
      const description = stageCaption(stage, language);
      const size = fitDescriptionSize(measureGlyphRun, description, descriptionRoom, 18, MIN_DESCRIPTION_SIZE);
      assert.ok(
        measureGlyphRun(description, size) <= descriptionRoom,
        `${language} ${stage} overflows at ${size}px`,
      );
    }
  }
});

test('ellipsizeDescription cuts only when the text does not fit', () => {
  assert.equal(ellipsizeDescription(measureGlyphRun, 'short', 600, 18), 'short');
  const text = '設計書'.repeat(20);
  const clipped = ellipsizeDescription(measureGlyphRun, text, 200, MIN_DESCRIPTION_SIZE);
  assert.ok(clipped.endsWith(CAPTION_ELLIPSIS));
  assert.ok(measureGlyphRun(clipped, MIN_DESCRIPTION_SIZE) <= 200);
});
