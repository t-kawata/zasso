// [::TICKET::] PX-351 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-351 --for-spec --no-implementation-order`.
// PX-351 @verifies C003
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  SPEED_MIN_MS,
  SPEED_MAX_MS,
  DEFAULT_SPEED_MS,
  MIN_FRAMES,
  MAX_FRAMES,
  DEFAULT_FRAMES,
  GIF_DELAY_MIN_CS,
  GIF_DELAY_MAX_CS,
  clampFrames,
  clampSpeedMs,
  delayCentiseconds,
} from '../../.claude/scripts/conver/progress-gif/viewer.js';

test('the speed control defaults to 150 milliseconds inside the 20 to 400 range', () => {
  assert.equal(SPEED_MIN_MS, 20);
  assert.equal(SPEED_MAX_MS, 400);
  assert.equal(DEFAULT_SPEED_MS, 150);
});

test('clampSpeedMs keeps every input inside the slider range', () => {
  assert.equal(clampSpeedMs(20), 20);
  assert.equal(clampSpeedMs(150), 150);
  assert.equal(clampSpeedMs(400), 400);
  assert.equal(clampSpeedMs(-5), 20);
  assert.equal(clampSpeedMs(9999), 400);
  assert.equal(clampSpeedMs(Number.NaN), 150);
  assert.equal(clampSpeedMs(undefined), 150);
  assert.equal(clampSpeedMs(''), 150);
});

test('the frame count is clamped to the browser-safe 20 to 600 range', () => {
  assert.equal(MIN_FRAMES, 20);
  assert.equal(MAX_FRAMES, 600);
  assert.equal(DEFAULT_FRAMES, 200);
  assert.equal(clampFrames(20), 20);
  assert.equal(clampFrames(200), 200);
  assert.equal(clampFrames(600), 600);
  assert.equal(clampFrames(5), 20);
  assert.equal(clampFrames(5000), 600);
  assert.equal(clampFrames(Number.NaN), 200);
  assert.equal(clampFrames(undefined), 200);
  assert.equal(clampFrames(''), 200);
  assert.equal(clampFrames('240'), 240);
});

test('delayCentiseconds converts the frame interval into a GIF delay', () => {
  assert.equal(delayCentiseconds(20), 2);
  assert.equal(delayCentiseconds(150), 15);
  assert.equal(delayCentiseconds(400), 40);
  assert.equal(delayCentiseconds(2000), 100);
  assert.equal(delayCentiseconds(Number.NaN), 15);
  assert.equal(delayCentiseconds(undefined), 15);
});

test('the viewer starts at the 180 ms default instead of deriving speed from fps', () => {
  const source = fs.readFileSync(
    new URL('../../.claude/scripts/conver/progress-gif/viewer.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /let speedMs = clampSpeedMs\(options\.speedMs\)/);
  assert.doesNotMatch(source, /1000 \/ \(Number\(options\.fps\)/);
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
  assert.match(source, /columnsInput\.addEventListener\('change'/);
  assert.match(source, /scale: options\.scale,\s*columns,/);
  assert.match(source, /canvas\.width = layout\.width/);
  assert.match(source, /canvas\.height = layout\.height/);
});

test('the numeric controls commit on change and the frame count rebuilds the animation', () => {
  const source = fs.readFileSync(
    new URL('../../.claude/scripts/conver/progress-gif/viewer.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /framesInput\.addEventListener\('change'/);
  assert.match(source, /speedInput\.addEventListener\('change'/);
  assert.match(source, /columnsInput\.addEventListener\('change'/);
  assert.match(source, /frames = buildFrames\(model, \{ \.\.\.options, frames: frameCount \}\)/);
  assert.match(source, /seekInput\.max = String\(Math\.max\(0, frames\.length - 1\)\)/);
});

test('the GIF delay stays inside the browser-safe centisecond window', () => {
  for (const value of [-100, 0, 5, 20, 100, 400, 1000, 1e9]) {
    const delay = delayCentiseconds(value);
    assert.ok(delay >= GIF_DELAY_MIN_CS, `delay ${delay} below minimum`);
    assert.ok(delay <= GIF_DELAY_MAX_CS, `delay ${delay} above maximum`);
  }
});
