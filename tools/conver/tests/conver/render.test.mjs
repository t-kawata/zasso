// PX-350 @verifies C002 @verifies C003 @verifies C007
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeLayout, groupColor } from '../../.claude/scripts/conver/progress-gif/layout.js';
import { buildFrames, STAGE_ORDER } from '../../.claude/scripts/conver/progress-gif/loop.js';
import { drawFrame, makePalette } from '../../.claude/scripts/conver/progress-gif/engine.js';
import { eventsForEveryStage, makeModel, withPackageCount } from './models.mjs';

/** A Canvas 2D stand-in that records every drawing call the renderer makes. */
// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
function createRecordingContext() {
  const calls = [];
  let composite = 'source-over';
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
    get globalCompositeOperation() {
      return composite;
    },
// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
    set globalCompositeOperation(value) {
      composite = value;
      calls.push(['composite', value]);
    },
// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
    fillRect(...args) { calls.push(['fillRect', ...args]); },
// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
    beginPath() { calls.push(['beginPath']); },
// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
    arc(...args) { calls.push(['arc', ...args]); },
// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
    moveTo(...args) { calls.push(['moveTo', ...args]); },
// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
    closePath() { calls.push(['closePath']); },
// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
    fill() { calls.push(['fill']); },
// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
    stroke() { calls.push(['stroke']); },
// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
    fillText(text, x, y) { calls.push(['fillText', text, x, y]); },
// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
    measureText(text) { return { width: String(text).length * 6 }; },
// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
    setLineDash(values) { calls.push(['dash', ...values]); },
// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
    save() { calls.push(['save']); },
// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
    restore() { calls.push(['restore']); },
// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
    createRadialGradient(...args) {
      calls.push(['gradient', ...args]);
      return { addColorStop(offset, colour) { calls.push(['stop', offset, colour]); } };
    },
  };
  return { ctx, calls };
}

// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
function prepared(overrides = {}) {
  const model = makeModel(overrides);
  model.events = overrides.events || eventsForEveryStage(model.packages);
  const layout = computeLayout(model, { measureText: (text) => String(text).length * 6 });
  const frames = buildFrames(model, { frames: 120, fps: 10 });
  return { model, layout, frame: frames.at(-1), frames };
}

test('the cell is a phyllotaxis dot field, not a pie chart', () => {
  const { ctx, calls } = createRecordingContext();
  const { model, layout, frame } = prepared({ packages: withPackageCount(2).packages });
  drawFrame(ctx, layout, frame, model, { title: 'PROGRESS: demo' });
  const arcCalls = calls.filter((call) => call[0] === 'arc');
  assert.ok(arcCalls.length >= 2 * 100, `arc calls ${arcCalls.length}`);
  assert.equal(calls.filter((call) => call[0] === 'moveTo').length, 0);
});

test('density produces additive glow and the renderer restores source-over', () => {
  const { ctx, calls } = createRecordingContext();
  const { model, layout, frame } = prepared({ packages: withPackageCount(2).packages });
  drawFrame(ctx, layout, frame, model, { title: 'PROGRESS: demo' });
  assert.ok(calls.some((call) => call[0] === 'composite' && call[1] === 'lighter'));
  assert.ok(calls.some((call) => call[0] === 'gradient'));
  assert.equal(ctx.globalCompositeOperation, 'source-over');
});

test('the header carries the title, date, reviewed ratio and split count', () => {
  const { ctx, calls } = createRecordingContext();
  const { model, layout, frame } = prepared({ packages: withPackageCount(2).packages });
  drawFrame(ctx, layout, frame, model, { title: 'PROGRESS: demo' });
  const texts = calls.filter((call) => call[0] === 'fillText').map((call) => call[1]);
  assert.ok(texts.some((text) => text === 'PROGRESS: demo'));
  assert.ok(texts.some((text) => /^REVIEWED \d+\/\d+ - \d+%$/.test(text)));
  assert.ok(texts.some((text) => /^SPLIT \d+\/\d+$/.test(text)));
  assert.ok(texts.some((text) => /\d{2}\/\d{2} \d{2}:\d{2}|--:--/.test(text)));
});

test('the ladder renders every stage name and a progress bar', () => {
  const { ctx, calls } = createRecordingContext();
  const { model, layout, frame } = prepared({ packages: withPackageCount(2).packages });
  drawFrame(ctx, layout, frame, model, { title: 'PROGRESS: demo' });
  const texts = calls.filter((call) => call[0] === 'fillText').map((call) => call[1]);
  for (const stage of STAGE_ORDER) {
    assert.ok(texts.includes(stage), `missing stage label ${stage}`);
  }
  assert.ok(calls.filter((call) => call[0] === 'fillRect').length >= 16);
});

test('the palette holds 256 entries and all seven group hues', () => {
  const palette = makePalette();
  assert.equal(palette.length, 256);
  for (const stage of ['educe', 'grill', 'graphify', 'make', 'consolidate', 'crystalize', 'drill']) {
    const hex = groupColor(stage);
    const rgb = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    assert.ok(palette.some((entry) => entry[0] === rgb[0] && entry[1] === rgb[1] && entry[2] === rgb[2]), `missing ${hex}`);
  }
});

test('a zero-package board still draws its header and ladder', () => {
  const { ctx, calls } = createRecordingContext();
  const model = makeModel({ packages: [] });
  const layout = computeLayout(model, { measureText: (text) => String(text).length * 6 });
  const frame = buildFrames(model, { frames: 20, fps: 10 }).at(-1);
  assert.doesNotThrow(() => drawFrame(ctx, layout, frame, model, { title: 'PROGRESS: empty' }));
  assert.ok(calls.some((call) => call[0] === 'fillText' && call[1] === 'PROGRESS: empty'));
});
