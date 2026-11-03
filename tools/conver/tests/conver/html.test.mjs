// [::TICKET::] PX-351 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-351 --for-spec --no-implementation-order`.
// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
// PX-349 @verifies C001 @verifies C002 @verifies C003 @verifies C004 @verifies C005 @verifies C006
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  renderHtml,
  extractInlineScript,
  serializeForScript,
} from '../../.claude/scripts/conver/progress-gif/html.js';
import {
  collectUsedText,
  selectSubsets,
} from '../../.claude/scripts/conver/progress-gif/fonts.js';
import { STAGE_ORDER } from '../../.claude/scripts/conver/progress-gif/loop.js';

const model = {
  schema: 'conver-progress-model-v1',
  workspaceRoot: '/tmp/one',
  generatedAt: '2026-11-03T00:00:00.000Z',
  packages: [{ id: 'pkg-1', name: 'one', path: 'one' }],
  events: [],
  growthEvents: [],
  totals: { packages: 1, splitPackages: 0, obligations: 0, covered: 0, reviewed: 0 },
  warnings: [],
};

test('serializeForScript escapes a closing script tag', () => {
  const text = serializeForScript({ value: '</script><script>alert(1)</script>' });
  assert.doesNotMatch(text, /<\/script>/i);
  assert.match(text, /\\u003c/);
});

test('renderHtml is self-contained and exposes a download button', () => {
  const html = renderHtml({
    model,
    options: { frames: 120, fps: 10, scale: 1, title: 'PROGRESS: one' },
    engineSource: 'export function makeEngine(){ return { draw(){} }; }',
    layoutSource: 'export function computeLayout(){ return {}; }',
    loopSource: 'export function buildFrames(){ return []; }',
    viewerSource: 'export function startViewer(){}',
    fontCss: "@font-face{font-family:'ConverNoto';src:url(data:font/woff2;base64,AAAA) format('woff2')}",
  });
  assert.match(html, /data:font\/woff2;base64,/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.doesNotMatch(html, /fetch\(/);
  assert.match(html, /id="download"/);
  assert.match(html, /id="tip"/);
  assert.match(html, /PROGRESS: one/);
  const framesTag = /<input[^>]*id="frames"[^>]*>/.exec(html);
  assert.ok(framesTag, 'missing frame control');
  assert.match(framesTag[0], /type="number"/);
  assert.match(framesTag[0], /min="20"/);
  assert.match(framesTag[0], /max="600"/);
  assert.match(framesTag[0], /step="1"/);
  assert.match(framesTag[0], /value="120"/);
  const speedTag = /<input[^>]*id="speed"[^>]*>/.exec(html);
  assert.ok(speedTag, 'missing speed control');
  assert.match(speedTag[0], /type="number"/);
  assert.match(speedTag[0], /min="20"/);
  assert.match(speedTag[0], /max="400"/);
  assert.match(speedTag[0], /step="10"/);
  assert.match(speedTag[0], /value="180"/);
  assert.match(html, /180 ms\/frame/);
  const columnsTag = /<input[^>]*id="columns"[^>]*>/.exec(html);
  assert.ok(columnsTag, 'missing column control');
  assert.match(columnsTag[0], /type="number"/);
  assert.match(columnsTag[0], /min="4"/);
  assert.match(columnsTag[0], /max="10"/);
  assert.match(columnsTag[0], /step="1"/);
  assert.match(columnsTag[0], /value="8"/);
  const seekTag = /<input[^>]*id="seek"[^>]*>/.exec(html);
  assert.ok(seekTag, 'missing seek control');
  assert.match(seekTag[0], /type="range"/);
  assert.ok(html.indexOf('id="frames"') < html.indexOf('id="speed"'));
  assert.ok(html.indexOf('id="speed"') < html.indexOf('id="columns"'));
  assert.ok(html.indexOf('id="columns"') < html.indexOf('id="seek"'));
  const script = extractInlineScript(html);
  assert.ok(script.length > 0);
  assert.doesNotThrow(() => new Function(script));
});

test('collectUsedText includes title, package names, stage names and the percent glyphs', () => {
  const text = collectUsedText(model, { title: 'PROGRESS: one' });
  assert.match(text, /PROGRESS: one/);
  assert.match(text, /one/);
  assert.match(text, /%/);
  assert.doesNotMatch(text, /REVIEWED/);
  assert.doesNotMatch(text, /SPLIT/);
  for (const stage of STAGE_ORDER) assert.match(text, new RegExp(stage));
});

test('selectSubsets picks only the subsets whose ranges cover used code points', () => {
  const manifest = {
    subsets: [
      { file: 'latin.woff2', ranges: [[0x0000, 0x007f]] },
      { file: 'kana.woff2', ranges: [[0x3040, 0x30ff]] },
      { file: 'kanji.woff2', ranges: [[0x4e00, 0x9fff]] },
    ],
  };
  const selected = selectSubsets('PROGRESS: あ', manifest);
  assert.deepEqual(selected.map((entry) => entry.file).sort(), ['kana.woff2', 'latin.woff2']);
});
