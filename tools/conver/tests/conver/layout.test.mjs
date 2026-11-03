// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
// PX-350 @verifies C002 @verifies C003 @verifies C007
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeLayout,
  radiusForArea,
  wrapLabel,
  groupColor,
  formatDate,
  formatRatio,
  formatSplit,
  MIN_CELL,
  MAX_CELL_RADIUS,
} from '../../.claude/scripts/conver/progress-gif/layout.js';
import { STAGE_ORDER } from '../../.claude/scripts/conver/progress-gif/loop.js';
import { withPackageCount } from './models.mjs';

const measure = (text) => String(text).length * 6;

test('the base board keeps the sample composition and the vertical ladder', () => {
  const layout = computeLayout(withPackageCount(5), { measureText: measure });
  assert.equal(layout.width, 640);
  assert.equal(layout.height, 368);
  assert.equal(layout.grid.x, 12);
  assert.equal(layout.grid.width, 420);
  assert.equal(layout.grid.columns, 5);
  assert.equal(layout.ladder.x, 444);
  assert.equal(layout.ladder.y, 56);
  assert.equal(layout.ladder.rows.length, 16);
  assert.deepEqual(layout.ladder.rows.map((row) => row.stage), STAGE_ORDER);
  assert.equal(layout.cells.length, 5);
  assert.ok(layout.cells.every((cell) => cell.dots.length >= 100));
});

test('fourteen packages still fit the one-screen base height', () => {
  const layout = computeLayout(withPackageCount(14), { measureText: measure });
  assert.equal(layout.width, 640);
  assert.equal(layout.height, 368);
  assert.equal(layout.grid.columns, 5);
});

test('vertical growth changes rows only, never width or columns', () => {
  const short = computeLayout(withPackageCount(5), { measureText: measure });
  const tall = computeLayout(withPackageCount(40), { measureText: measure });
  assert.equal(short.width, 640);
  assert.equal(tall.width, 640);
  assert.equal(short.grid.columns, 5);
  assert.equal(tall.grid.columns, 5);
  assert.ok(tall.height > short.height);
  assert.ok(tall.cells.every((cell) => cell.cellWidth >= MIN_CELL));
  assert.ok(tall.cells.every((cell) => cell.cellWidth <= 84));
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

test('groupColor returns the seven agreed groups', () => {
  const colours = new Set(STAGE_ORDER.map((stage) => groupColor(stage)));
  assert.equal(colours.size, 7);
  assert.equal(groupColor('educe'), groupColor('explain'));
  assert.equal(groupColor('make'), groupColor('resolve'));
  assert.notEqual(groupColor('educe'), groupColor('drill'));
});

test('formatters keep the denominator and never invent a time', () => {
  assert.equal(formatDate(Date.UTC(2026, 10, 2), 'day'), '11/02 --:--');
  assert.match(formatDate(Date.UTC(2026, 10, 2, 3, 4), 'ms'), /^11\/0[12] \d{2}:\d{2}$/);
  assert.equal(formatRatio(42, 100), 'REVIEWED 42/100 - 42%');
  assert.equal(formatRatio(0, 0), 'REVIEWED 0/0 - 0%');
  assert.equal(formatSplit(5, 29), 'SPLIT 5/29');
});
