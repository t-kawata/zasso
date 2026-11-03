// [::TICKET::] PX-351 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-351 --for-spec --no-implementation-order`.
// PX-351 @verifies C003
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  SPEED_MIN_MS,
  SPEED_MAX_MS,
  DEFAULT_SPEED_MS,
  GIF_DELAY_MIN_CS,
  GIF_DELAY_MAX_CS,
  clampSpeedMs,
  delayCentiseconds,
} from '../../.claude/scripts/conver/progress-gif/viewer.js';

test('the speed control bounds are the documented 20 to 400 milliseconds', () => {
  assert.equal(SPEED_MIN_MS, 20);
  assert.equal(SPEED_MAX_MS, 400);
  assert.equal(DEFAULT_SPEED_MS, 100);
});

test('clampSpeedMs keeps every input inside the slider range', () => {
  assert.equal(clampSpeedMs(20), 20);
  assert.equal(clampSpeedMs(100), 100);
  assert.equal(clampSpeedMs(400), 400);
  assert.equal(clampSpeedMs(-5), 20);
  assert.equal(clampSpeedMs(9999), 400);
  assert.equal(clampSpeedMs(Number.NaN), 100);
  assert.equal(clampSpeedMs(undefined), 100);
});

test('delayCentiseconds converts the frame interval into a GIF delay', () => {
  assert.equal(delayCentiseconds(20), 2);
  assert.equal(delayCentiseconds(100), 10);
  assert.equal(delayCentiseconds(400), 40);
  assert.equal(delayCentiseconds(2000), 100);
  assert.equal(delayCentiseconds(Number.NaN), 10);
  assert.equal(delayCentiseconds(undefined), 10);
});

test('the viewer drives playback and the GIF delay from the same speed value', () => {
  const source = fs.readFileSync(
    new URL('../../.claude/scripts/conver/progress-gif/viewer.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /time - last >= speedMs/);
  assert.match(source, /delayCs: delayCentiseconds\(speedMs\)/);
});

test('the viewer recomputes the layout and canvas size when the column count changes', () => {
  const source = fs.readFileSync(
    new URL('../../.claude/scripts/conver/progress-gif/viewer.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /columnsInput\.addEventListener\('input'/);
  assert.match(source, /scale: options\.scale,\s*columns,/);
  assert.match(source, /canvas\.width = layout\.width/);
  assert.match(source, /canvas\.height = layout\.height/);
});

test('the GIF delay stays inside the browser-safe centisecond window', () => {
  for (const value of [-100, 0, 5, 20, 100, 400, 1000, 1e9]) {
    const delay = delayCentiseconds(value);
    assert.ok(delay >= GIF_DELAY_MIN_CS, `delay ${delay} below minimum`);
    assert.ok(delay <= GIF_DELAY_MAX_CS, `delay ${delay} above maximum`);
  }
});
