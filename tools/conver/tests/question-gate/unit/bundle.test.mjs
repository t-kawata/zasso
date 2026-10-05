// PX-233 @verifies C003
// [::TICKET::] PX-233 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-233 --for-spec --no-implementation-order`.
/**
 * Bundling: the fewest axes one answer each settles every bound point.
 *
 * A question that binds one point is a point-question wearing a question's clothes,
 * so the floor is two. The cap is three axes a round, and what does not fit stays
 * open for a later round rather than being merged into an axis it would weaken —
 * dropping it would lose a point, and folding it in would make the axis bind one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_AXES_PER_ROUND, MAX_POINTS_PER_AXIS_FLOOR, bundleAxes } from '../../../.claude/scripts/question-gate/bundle.mjs';

const axis = (boundIds, direction = 'whose experience comes first') => ({ boundIds, direction });

test('C003 postcondition: an axis binds at least two points', () => {
  const { axes } = bundleAxes({ candidates: [axis(['N0001', 'N0002'])], openCount: 2 });

  assert.equal(axes.length, 1);
  assert.deepEqual(axes[0].boundIds, ['N0001', 'N0002']);
  assert.equal(axes[0].direction, 'whose experience comes first');
});

test('C003 invariant: the floor and the cap are named constants', () => {
  assert.equal(MAX_POINTS_PER_AXIS_FLOOR, 2);
  assert.equal(MAX_AXES_PER_ROUND, 3);
});

test('C003 postcondition: a candidate binding one point is not opened as an axis; its point stays open', () => {
  const { axes, overflow } = bundleAxes({ candidates: [axis(['N0001'])], openCount: 5 });

  assert.deepEqual(axes, []);
  assert.deepEqual(overflow, ['N0001']);
});

test('C003 boundary: when fewer than two points are open, a single-point axis is permitted', () => {
  const { axes } = bundleAxes({ candidates: [axis(['N0001'])], openCount: 1 });

  assert.equal(axes.length, 1, 'the floor is a rule about the normal case, not one that strands a lone point');
  assert.deepEqual(axes[0].boundIds, ['N0001']);
});

test('C003 postcondition: at most three axes are opened and the rest of the points stay open', () => {
  const candidates = [1, 2, 3, 4].map((n) => axis([`N000${n}a`, `N000${n}b`], `axis ${n}`));

  const { axes, overflow } = bundleAxes({ candidates, openCount: 8 });

  assert.equal(axes.length, MAX_AXES_PER_ROUND);
  assert.deepEqual(overflow.sort(), ['N0004a', 'N0004b'], 'the overflow stays open rather than being dropped');
});

test('C003 boundary: no candidates yields no axes and no overflow', () => {
  assert.deepEqual(bundleAxes({ candidates: [], openCount: 0 }), { axes: [], overflow: [] });
});

test('C003 invariant: no point appears in two axes', () => {
  const { axes } = bundleAxes({
    candidates: [axis(['N0001', 'N0002']), axis(['N0002', 'N0003'])],
    openCount: 3,
  });

  const seen = axes.flatMap((entry) => entry.boundIds);
  assert.equal(new Set(seen).size, seen.length, 'an axis that shares a point with another leaves it ambiguous which answer settles it');
});
