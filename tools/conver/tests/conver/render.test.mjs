// PX-350 @verifies C002 @verifies C003 @verifies C007
// PX-354 @verifies C009 @verifies C010
// PX-380 @verifies C001 @verifies C002 @verifies C003 @verifies C004 @verifies C005
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeLayout, formatDate, formatPercent, groupColor, STAGE_CAPTIONS, stageCaption, MIN_DESCRIPTION_SIZE } from '../../.claude/scripts/conver/progress-gif/layout.js';
import { buildFrames, STAGE_ORDER } from '../../.claude/scripts/conver/progress-gif/loop.js';
import { drawFrame, makePalette, LADDER_LABEL_SIZE, HEADER_STAGE_SIZE, HEADER_DATE_COLOUR } from '../../.claude/scripts/conver/progress-gif/engine.js';
import { eventsForEveryStage, makeModel, withPackageCount } from './models.mjs';

/** A Canvas 2D stand-in that records every drawing call the renderer makes. */
// [::TICKET::] PX-350, PX-380 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-350|PX-380) --for-spec --no-implementation-order`.
function createRecordingContext(measure = (text) => String(text).length * 6) {
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
// [::TICKET::] PX-350, PX-354, PX-380 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-350|PX-354|PX-380) --for-spec --no-implementation-order`.
    fillText(text, x, y) { calls.push(['fillText', text, x, y, ctx.font, ctx.textAlign, ctx.fillStyle]); },
// [::TICKET::] PX-350, PX-380 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-350|PX-380) --for-spec --no-implementation-order`.
    measureText(text) { return { width: measure(text, ctx.font) }; },
// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
    setLineDash(values) { calls.push(['dash', ...values]); },
// [::TICKET::] PX-350, PX-380 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-350|PX-380) --for-spec --no-implementation-order`.
    save() { calls.push(['save']); },
// [::TICKET::] PX-350, PX-351, PX-354, PX-380 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-350|PX-351|PX-354|PX-380) --for-spec --no-implementation-order`.
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

test('the header carries the title, date, stage and a full-width progress bar', () => {
  const { ctx, calls } = createRecordingContext();
  const { model, layout, frame } = prepared({ packages: withPackageCount(2).packages });
  drawFrame(ctx, layout, frame, model, { title: 'PROGRESS: demo' });
  const texts = calls.filter((call) => call[0] === 'fillText').map((call) => call[1]);
  assert.ok(texts.some((text) => text === 'PROGRESS: demo'));
  assert.ok(texts.some((text) => /\d{2}\/\d{2} \d{2}:\d{2}|--:--/.test(text)));
  assert.ok(texts.includes(formatPercent(frame.overallProgress)));
  assert.equal(formatPercent(frame.overallProgress), '100%');
  assert.ok(!texts.some((text) => /^REVIEWED /.test(text)));
  assert.ok(!texts.some((text) => /^SPLIT /.test(text)));
  const bars = calls.filter((call) => call[0] === 'fillRect' && call[1] === 12 && call[2] === 34);
  assert.ok(bars.length >= 1, 'missing progress bar');
  assert.equal(bars[0][3], layout.header.barWidth);
  assert.equal(bars[0][4], 6);
  assert.equal(layout.header.barWidth, layout.width - 24);
  assert.ok(layout.header.barY - layout.header.titleY >= 14);
  assert.ok(layout.header.dateY - (layout.header.barY + layout.header.barHeight) >= 14);
  assert.ok(layout.header.barY + layout.header.barHeight <= layout.grid.y);
  assert.ok(layout.header.barY + layout.header.barHeight <= layout.ladder.y);
});

test('the ladder renders every uppercase stage name and a progress bar', () => {
  const { ctx, calls } = createRecordingContext();
  const { model, layout, frame } = prepared({ packages: withPackageCount(2).packages });
  drawFrame(ctx, layout, frame, model, { title: 'PROGRESS: demo' });
  const texts = calls.filter((call) => call[0] === 'fillText').map((call) => call[1]);
  for (const stage of STAGE_ORDER) {
    assert.ok(texts.includes(stage.toUpperCase()), `missing stage label ${stage.toUpperCase()}`);
  }
  assert.ok(calls.filter((call) => call[0] === 'fillRect').length >= 16);
});

test('ladder labels are large enough to read when the GIF is scaled down', () => {
  const { ctx, calls } = createRecordingContext();
  const { model, layout, frame } = prepared({ packages: withPackageCount(2).packages });
  drawFrame(ctx, layout, frame, model, { title: 'PROGRESS: demo' });
  assert.ok(LADDER_LABEL_SIZE >= 13);
  for (const row of layout.ladder.rows) {
    const drawn = calls.find((call) => call[0] === 'fillText'
      && call[1] === row.stage.toUpperCase()
      && call[2] === row.labelX
      && call[3] === row.centerY);
    assert.ok(drawn, `missing label ${row.stage}`);
    assert.match(drawn[4], new RegExp(`${LADDER_LABEL_SIZE}px`));
  }
});

test('every ladder label is vertically centered on its row', () => {
  const { ctx, calls } = createRecordingContext();
  const { model, layout, frame } = prepared({ packages: withPackageCount(2).packages });
  drawFrame(ctx, layout, frame, model, { title: 'PROGRESS: demo' });
  const labels = calls.filter((call) => call[0] === 'fillText');
  layout.ladder.rows.forEach((row) => {
    const drawn = labels.find((call) => call[1] === row.stage.toUpperCase()
      && call[2] === row.labelX);
    assert.ok(drawn, `missing label ${row.stage}`);
    assert.equal(drawn[3], row.centerY);
    assert.ok(row.centerY > row.y - 3 * layout.scale);
    assert.ok(row.centerY < row.y + 15 * layout.scale);
    assert.equal(row.centerY, row.barY + row.barHeight / 2);
  });
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

// [::TICKET::] PX-354 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-354 --for-spec --no-implementation-order`.
test('a usage title draws the name left and the I/C/O/D block right-aligned', () => {
  const { ctx, calls } = createRecordingContext();
  const { model, layout, frame } = prepared({ packages: withPackageCount(2).packages });
  const parts = { left: 'PROGRESS: demo', right: 'I/C/O/D = 1M / 2M / 0M / $1' };
  drawFrame(
    ctx,
    layout,
    { ...frame, title: `${parts.left} | ${parts.right}`, titleParts: parts },
    model,
    { title: 'PROGRESS: demo' }
  );

  const left = calls.find((call) => call[0] === 'fillText' && call[1] === parts.left);
  const right = calls.find((call) => call[0] === 'fillText' && call[1] === parts.right);
  assert.equal(left[5], 'left');
  assert.equal(left[2], 12);
  assert.equal(right[5], 'right');
  assert.equal(right[2], layout.width - 12);
  assert.equal(left[3], right[3]);
});

// [::TICKET::] PX-354 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-354 --for-spec --no-implementation-order`.
test('a legacy title stays single and emits no right-aligned block', () => {
  const { ctx, calls } = createRecordingContext();
  const { model, layout, frame } = prepared({ packages: withPackageCount(2).packages });
  drawFrame(ctx, layout, frame, model, { title: 'PROGRESS: demo' });

  assert.equal(calls.filter((call) => call[0] === 'fillText' && call[1].includes('I/C/O/D')).length, 0);
  const legacy = calls.find((call) => call[0] === 'fillText' && call[1] === 'PROGRESS: demo');
  assert.equal(legacy[5], 'left');
  assert.equal(legacy[2], 12);
});

const CJK_CODE_POINT_START = 0x2e80;
const ASCII_ADVANCE_RATIO = 0.55;

// [::TICKET::] PX-380 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-380 --for-spec --no-implementation-order`.
function fontSizeOf(font) {
  const match = /(\d+(?:\.\d+)?)px/.exec(String(font));
  return match ? Number(match[1]) : 12;
}

/** Measure with the same size-aware rule the header uses, based on the recorded font. */
// [::TICKET::] PX-380 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-380 --for-spec --no-implementation-order`.
function measureFont(text, font) {
  const size = fontSizeOf(font);
  let width = 0;
  for (const character of String(text)) {
    width += character.codePointAt(0) >= CJK_CODE_POINT_START ? size : size * ASCII_ADVANCE_RATIO;
  }
  return width;
}

// [::TICKET::] PX-380 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-380 --for-spec --no-implementation-order`.
function drawHeaderFor(stage, language, columns = 8) {
  const model = makeModel({ packages: withPackageCount(2).packages });
  model.events = eventsForEveryStage(model.packages);
  const layout = computeLayout(model, { measureText: measureFont, columns });
  const baseFrame = buildFrames(model, { frames: 120, fps: 10 }).at(-1);
  const { ctx, calls } = createRecordingContext(measureFont);
  drawFrame(ctx, layout, { ...baseFrame, stage }, model, { title: 'PROGRESS: demo', language });
  return { ctx, calls, layout, model, frame: { ...baseFrame, stage } };
}

test('the header draws the date, one space, the stage name and its description', () => {
  const { calls, layout, frame } = drawHeaderFor('smooth', 'ja');
  const dateText = formatDate(frame.t, frame.prec);
  const dateRun = calls.find((call) => call[0] === 'fillText' && call[1] === dateText);
  assert.ok(dateRun, 'missing date run');
  assert.equal(dateRun[2], layout.header.dateX);
  assert.equal(dateRun[6], HEADER_DATE_COLOUR);

  const dateWidth = measureFont(dateRun[1], dateRun[4]);
  const spaceWidth = measureFont(' ', dateRun[4]);
  const nameRun = calls.find((call) => call[0] === 'fillText' && call[1] === 'SMOOTH: ');
  assert.ok(nameRun, 'missing stage name run');
  assert.equal(nameRun[2], layout.header.dateX + dateWidth + spaceWidth);
  assert.match(nameRun[4], new RegExp(`600 ${HEADER_STAGE_SIZE}px`));

  const descriptionRun = calls.find((call) => call[0] === 'fillText' && call[1] === STAGE_CAPTIONS.ja.smooth);
  assert.ok(descriptionRun, 'missing description run');
  assert.equal(descriptionRun[2], nameRun[2] + measureFont('SMOOTH: ', nameRun[4]));
  const descriptionSize = fontSizeOf(descriptionRun[4]);
  assert.ok(descriptionSize <= HEADER_STAGE_SIZE);
  assert.ok(descriptionSize >= MIN_DESCRIPTION_SIZE);
  assert.equal(descriptionRun[6], groupColor('smooth'));
  assert.equal(nameRun[6], groupColor('smooth'));
});

test('the language option selects the English caption', () => {
  const { calls } = drawHeaderFor('smooth', 'en');
  assert.ok(calls.some((call) => call[0] === 'fillText' && call[1] === STAGE_CAPTIONS.en.smooth));
  assert.equal(calls.some((call) => call[0] === 'fillText' && call[1] === STAGE_CAPTIONS.ja.smooth), false);
});

test('an absent or unknown stage draws no caption run', () => {
  const namePrefixes = STAGE_ORDER.map((stage) => `${stage.toUpperCase()}: `);
  for (const stage of [null, '', 'unknown']) {
    const { calls } = drawHeaderFor(stage, 'ja');
    assert.equal(
      calls.filter((call) => call[0] === 'fillText' && namePrefixes.includes(String(call[1]))).length,
      0,
      `caption drawn for ${JSON.stringify(stage)}`,
    );
    assert.ok(calls.some((call) => call[0] === 'fillText' && /\d{2}\/\d{2}/.test(call[1])));
  }
});

test('the command name keeps its size while the description shrinks when the room is tight', () => {
  const { layout, model, frame } = drawHeaderFor('smooth', 'ja', 4);
  assert.equal(layout.width, 724);
  // Force a tight room so the shrink branch stays exercised after the captions
  // were shortened; the real 724 px board fits every caption at 18 px.
  const tightLayout = { ...layout, header: { ...layout.header, percentX: layout.header.dateX + 420 } };
  const { ctx, calls } = createRecordingContext(measureFont);
  drawFrame(ctx, tightLayout, frame, model, { title: 'PROGRESS: demo', language: 'ja' });

  const nameRun = calls.find((call) => call[0] === 'fillText' && call[1] === 'SMOOTH: ');
  const descriptionRun = calls.find((call) => call[0] === 'fillText'
    && call[3] === nameRun[3]
    && call[2] > nameRun[2]
    && call[2] < tightLayout.header.percentX);
  assert.ok(nameRun && descriptionRun);
  assert.equal(fontSizeOf(nameRun[4]), HEADER_STAGE_SIZE);
  assert.ok(fontSizeOf(descriptionRun[4]) < HEADER_STAGE_SIZE);
  assert.ok(descriptionRun[1].endsWith('…'));
});

test('no caption crosses the percent block for any stage on the narrow board', () => {
  for (const language of ['ja', 'en']) {
    for (const stage of STAGE_ORDER) {
      const { calls, layout, frame } = drawHeaderFor(stage, language, 4);
      const percentText = formatPercent(frame.overallProgress);
      const percentRun = calls.find((call) => call[0] === 'fillText' && call[1] === percentText);
      assert.ok(percentRun, 'missing percent run');
      const percentLeft = percentRun[2] - measureFont(percentText, percentRun[4]);
      const descriptionText = stageCaption(stage, language);
      const descriptionRun = calls.find((call) => call[0] === 'fillText' && call[1] === descriptionText);
      assert.ok(descriptionRun, `missing description for ${language} ${stage}`);
      const descriptionRight = descriptionRun[2] + measureFont(descriptionText, descriptionRun[4]);
      assert.ok(
        descriptionRight <= percentLeft,
        `${language} ${stage} caption right ${descriptionRight} crosses ${percentLeft}`,
      );
      assert.ok(descriptionRight <= layout.width - 12);
    }
  }
});
