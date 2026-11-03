// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  radiusFor,
  wrapLabel,
  groupColor,
  computeLayout,
  formatDate,
} from '../../.claude/scripts/conver/progress-gif/layout.js';
import { STAGE_ORDER } from '../../.claude/scripts/conver/progress-gif/loop.js';

const measure = (text) => text.length * 7;

test('radiusFor uses square-root scaling and clamps equal totals', () => {
  const small = radiusFor(1, 1, 100, 10, 50);
  const large = radiusFor(100, 1, 100, 10, 50);
  assert.ok(small >= 10 && small < large);
  assert.equal(large, 50);
  assert.equal(radiusFor(4, 4, 4, 10, 50), 50);
});

test('wrapLabel wraps to two lines and ellipsizes the second line', () => {
  const lines = wrapLabel(measure, 'a-very-long-package-name-that-does-not-fit', 42, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines.every((line) => measure(line) <= 42));
  assert.match(lines[1], /…$/);
});

test('groupColor returns one colour for each of the seven groups', () => {
  const colours = new Set(STAGE_ORDER.map((stage) => groupColor(stage)));
  assert.equal(colours.size, 7);
  assert.equal(groupColor('educe'), groupColor('explain'));
  assert.equal(groupColor('make'), groupColor('resolve'));
});

test('formatDate renders day-only precision without inventing a time', () => {
  assert.equal(formatDate(Date.UTC(2026, 10, 2), 'day'), '11/02 --:--');
  assert.match(formatDate(Date.UTC(2026, 10, 2, 3, 4), 'ms'), /^11\/0[12] \d{2}:\d{2}$/);
});

test('computeLayout grows vertically with package count', () => {
  const one = computeLayout({ packages: Array.from({ length: 1 }, (_, index) => ({ id: `p${index}`, name: `p${index}`, obligations: { total: 1 } })) }, { measureText: measure });
  const many = computeLayout({ packages: Array.from({ length: 30 }, (_, index) => ({ id: `p${index}`, name: `p${index}`, obligations: { total: 1 } })) }, { measureText: measure });
  assert.ok(many.height > one.height);
  assert.ok(many.width >= 640);
  assert.equal(many.cells.length, 30);
  assert.ok(many.cells.every((cell) => cell.radius > 0));
});
