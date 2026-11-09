// [::TICKET::] PX-354 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-354 --for-spec --no-implementation-order`.
// PX-352 @verifies C001 @verifies C002 @verifies C003 @verifies C004 @verifies C005 @verifies C008 @verifies C010
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  aggregateUsage,
  dailySeries,
  DEFAULT_PRICES,
} from '../../.claude/scripts/conver/progress-gif/usage.js';
import {
  buildFrames,
  displayDateKey,
  usageAtDate,
  formatUsageTitle,
  usageTitleSegments,
  contractsAt,
  formatContractsTitle,
  ZERO_USAGE,
} from '../../.claude/scripts/conver/progress-gif/loop.js';
import { formatDate } from '../../.claude/scripts/conver/progress-gif/layout.js';
import { selectTitle, selectTitleParts, fitTitleSize, fitTitleLayout } from '../../.claude/scripts/conver/progress-gif/engine.js';

const utcDateKey = (ms) => new Date(ms).toISOString().slice(0, 10);

// [::TICKET::] PX-352 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-352 --for-spec --no-implementation-order`.
// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function writeUsageFixture({ directory, records, projectKey = directory.replace(/[^a-zA-Z0-9]/g, '-') }) {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conver-usage-config-'));
  const projectDir = path.join(configDir, 'projects', projectKey);
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'session.jsonl'), `${records.join('\n')}\n`);
  return { configDir, directory, projectDir };
}

// [::TICKET::] PX-352 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-352 --for-spec --no-implementation-order`.
function assistantRecord(options) {
  const {
    id,
    block = 'text',
    at,
    cwd = '/tmp/work',
    model = 'deepseek-flash',
    input = 0,
    cacheCreate = 0,
    cacheRead = 0,
    output = 0,
  } = options;
  return JSON.stringify({
    type: 'assistant',
    timestamp: at,
    cwd,
    message: {
      ...(id === undefined ? {} : { id }),
      model,
      usage: {
        input_tokens: input,
        cache_creation_input_tokens: cacheCreate,
        cache_read_input_tokens: cacheRead,
        output_tokens: output,
      },
      content: [{ type: block }],
    },
  });
}

// [::TICKET::] PX-352 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-352 --for-spec --no-implementation-order`.
function usageGroup(date, { miss = 0, hit = 0, out = 0, model = 'deepseek-flash' } = {}) {
  const bucket = {
    records: 1,
    cache_miss_input_tokens: miss,
    cache_hit_input_tokens: hit,
    output_tokens: out,
  };
  return {
    date,
    model,
    offpeak: { ...bucket },
    peak: { records: 0, cache_miss_input_tokens: 0, cache_hit_input_tokens: 0, output_tokens: 0 },
  };
}

// [::TICKET::] PX-352 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-352 --for-spec --no-implementation-order`.
// [::TICKET::] PX-401 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-401 --for-spec --no-implementation-order`.
function minimalModel({ usage, titleName }) {
  const first = Date.parse('2026-10-05T00:00:00.000Z');
  const second = Date.parse('2026-10-09T00:00:00.000Z');
  return {
    schema: 'conver-progress-model-v1',
    workspaceRoot: '/tmp/demo',
    titleName,
    initialT: first,
    packages: [
      {
        id: 'p1',
        name: 'p1',
        path: 'p1',
        obligations: { total: 1, reviewed: 0 },
        tickets: { total: 1 },
      },
    ],
    events: [
      { t: first, prec: 'ms', stage: 'make', packageId: 'p1', inc: 1 },
      { t: second, prec: 'ms', stage: 'review', packageId: 'p1', inc: 1 },
    ],
    growthEvents: [],
    usage,
    warnings: [],
    totals: { packages: 1, splitPackages: 1, obligations: 1, covered: 0, reviewed: 0 },
  };
}

test('aggregateUsage dedupes content-block records by message.id', async () => {
  const fixture = writeUsageFixture({
    directory: '/tmp/work',
    records: [
      assistantRecord({ id: 'msg-1', block: 'thinking', at: '2026-10-05T12:00:00.000Z', input: 10, cacheRead: 100, output: 0 }),
      assistantRecord({ id: 'msg-1', block: 'tool_use', at: '2026-10-05T12:00:01.000Z', input: 10, cacheRead: 100, output: 443 }),
    ],
  });

  const result = await aggregateUsage({
    directory: '/tmp/work',
    configDir: fixture.configDir,
    dateKey: utcDateKey,
  });

  assert.equal(result.groups.length, 1);
  const group = result.groups[0];
  assert.equal(group.offpeak.cache_miss_input_tokens, 10);
  assert.equal(group.offpeak.cache_hit_input_tokens, 100);
  assert.equal(group.offpeak.output_tokens, 443);

  const series = dailySeries(result.groups, DEFAULT_PRICES);
  assert.equal(series.at(-1).cumulative.outputTokens, 443);
  assert.equal(series.at(-1).cumulative.cacheHitInputTokens, 100);
});

test('usageAtDate treats missing dates as zero and never decreases', () => {
  const series = dailySeries([
    usageGroup('2026-10-05', { miss: 10, hit: 100, out: 5 }),
    usageGroup('2026-10-08', { miss: 20, hit: 200, out: 10 }),
  ], DEFAULT_PRICES);

  assert.deepEqual(usageAtDate(series, '2026-10-04'), ZERO_USAGE);
  assert.equal(usageAtDate(series, '2026-10-06').cacheHitInputTokens, 100);
  assert.equal(
    usageAtDate(series, '2026-10-07').costUsd,
    usageAtDate(series, '2026-10-05').costUsd
  );
  assert.equal(usageAtDate(series, '2026-10-08').cacheHitInputTokens, 300);
  assert.equal(usageAtDate(series, '2026-12-31').cacheHitInputTokens, 300);
  assert.ok(series.every((entry, index) => (
    index === 0 || entry.cumulative.costUsd >= series[index - 1].cumulative.costUsd
  )));
});

test('daily cost applies peak and offpeak rates per record', async () => {
  const fixture = writeUsageFixture({
    directory: '/tmp/work',
    records: [
      assistantRecord({ id: 'peak', at: '2026-10-05T02:00:00.000Z', input: 1000000, cacheRead: 1000000, output: 1000000 }),
      assistantRecord({ id: 'offpeak', at: '2026-10-05T12:00:00.000Z', input: 1000000, cacheRead: 1000000, output: 1000000 }),
    ],
  });

  const result = await aggregateUsage({
    directory: '/tmp/work',
    configDir: fixture.configDir,
    dateKey: utcDateKey,
  });
  const group = result.groups[0];
  assert.equal(group.peak.records, 1);
  assert.equal(group.offpeak.records, 1);

  const series = dailySeries(result.groups, DEFAULT_PRICES);
  assert.ok(Math.abs(series[0].dailyCostUsd - 2.259) < 1e-9);
});

test('usageTitleSegments rounds up and returns the left name and the four-value right block', () => {
  const cumulative = {
    cacheMissInputTokens: 100000,
    cacheHitInputTokens: 1000001,
    outputTokens: 0,
    costUsd: 0.2,
  };
  assert.deepEqual(usageTitleSegments('demo', cumulative), {
    left: 'PROGRESS: demo',
    right: 'I/C/O/D = 1M / 2M / 0M / $1',
    text: 'PROGRESS: demo | I/C/O/D = 1M / 2M / 0M / $1',
  });
  assert.equal(usageTitleSegments('demo', ZERO_USAGE).right, 'I/C/O/D = 0M / 0M / 0M / $0');
  assert.equal(usageTitleSegments('demo', cumulative).right.split(' / ').length, 4);
  assert.doesNotMatch(usageTitleSegments('demo', cumulative).right, /NaN|-1/);
  assert.equal(formatUsageTitle('demo', cumulative), usageTitleSegments('demo', cumulative).text);
});

test('CONTRACTS counts unique made and reviewed ticket contracts per package', () => {
  const model = minimalModel({ usage: [], titleName: 'demo' });
  model.packages[0].contractLog = [
    { madeAt: Date.parse('2026-11-01T00:00:00Z'), reviewedAt: null, contractIds: ['C1', 'C2'] },
    { madeAt: Date.parse('2026-11-02T00:00:00Z'), reviewedAt: Date.parse('2026-11-03T00:00:00Z'), contractIds: ['C2', 'C3'] },
  ];

  assert.equal(formatContractsTitle(contractsAt(model, Date.parse('2026-10-31T00:00:00Z'))), 'CONTRACTS: 0/?');
  assert.equal(formatContractsTitle(contractsAt(model, Date.parse('2026-11-01T12:00:00Z'))), 'CONTRACTS: 0/2');
  assert.equal(formatContractsTitle(contractsAt(model, Date.parse('2026-11-03T12:00:00Z'))), 'CONTRACTS: 2/3');
  assert.equal(usageTitleSegments('demo', ZERO_USAGE, 'CONTRACTS: 2/3').right, 'CONTRACTS: 2/3 , I/C/O/D = 0M / 0M / 0M / $0');
});

test('aggregateUsage returns an empty series and a warning when logs are unavailable', async () => {
  const result = await aggregateUsage({
    directory: '/nonexistent/work',
    configDir: '/nonexistent/claude',
  });

  assert.deepEqual(result.groups, []);
  assert.equal(result.warnings.length, 1);

  const model = minimalModel({
    usage: dailySeries(result.groups, DEFAULT_PRICES),
    titleName: 'demo',
  });
  const frames = buildFrames(model, { frames: 20 });
  assert.equal(frames[0].title, undefined);
  assert.equal(frames[0].titleParts, undefined);
  assert.equal(
    selectTitle(frames[0], { title: 'PROGRESS: demo' }, { title: 'PROGRESS: demo' }),
    'PROGRESS: demo'
  );
});

test('buildFrames shows zero usage when logs are available but empty and hides it when unavailable', () => {
  const available = minimalModel({ usage: [], titleName: 'demo' });
  available.usageAvailable = true;
  const availableFrames = buildFrames(available, { frames: 20 });
  assert.deepEqual(availableFrames[0].titleParts, {
    left: 'PROGRESS: demo',
    right: 'CONTRACTS: 0/? , I/C/O/D = 0M / 0M / 0M / $0',
  });
  assert.equal(availableFrames[0].title, 'PROGRESS: demo | CONTRACTS: 0/? , I/C/O/D = 0M / 0M / 0M / $0');
  assert.equal(availableFrames.at(-1).titleParts.right, 'CONTRACTS: 0/? , I/C/O/D = 0M / 0M / 0M / $0');

  const unavailable = minimalModel({ usage: [], titleName: 'demo' });
  unavailable.usageAvailable = false;
  const unavailableFrames = buildFrames(unavailable, { frames: 20 });
  assert.equal(unavailableFrames[0].title, undefined);
  assert.equal(unavailableFrames[0].titleParts, undefined);
});

test('aggregateUsage skips malformed lines and counts them', async () => {
  const fixture = writeUsageFixture({
    directory: '/tmp/work',
    records: [
      '{not json',
      assistantRecord({ id: 'm1', at: '2026-10-05T12:00:00.000Z', output: 5 }),
    ],
  });

  const result = await aggregateUsage({
    directory: '/tmp/work',
    configDir: fixture.configDir,
    dateKey: utcDateKey,
  });

  assert.equal(result.invalidJson, 1);
  assert.equal(result.groups.length, 1);
});

test('aggregateUsage counts records without an id individually', async () => {
  const fixture = writeUsageFixture({
    directory: '/tmp/work',
    records: [
      assistantRecord({ id: undefined, at: '2026-10-05T12:00:00.000Z', output: 5 }),
      assistantRecord({ id: undefined, at: '2026-10-05T12:00:01.000Z', output: 7 }),
    ],
  });

  const result = await aggregateUsage({
    directory: '/tmp/work',
    configDir: fixture.configDir,
    dateKey: utcDateKey,
  });

  assert.equal(result.groups[0].offpeak.output_tokens, 12);
});

test('buildFrames changes the cumulative title only at date boundaries', () => {
  const series = dailySeries([
    usageGroup('2026-10-05', { miss: 100000, hit: 400000, out: 100000 }),
    usageGroup('2026-10-09', { miss: 100000, hit: 1600000, out: 100000 }),
  ], DEFAULT_PRICES);
  const model = minimalModel({ usage: series, titleName: 'demo' });
  const frames = buildFrames(model, { frames: 200 });

  assert.equal(frames[0].title, formatUsageTitle('demo', series[0].cumulative, 'CONTRACTS: 0/?'));
  assert.equal(frames.at(-1).title, formatUsageTitle('demo', series.at(-1).cumulative, 'CONTRACTS: 0/?'));
  assert.deepEqual(frames[0].titleParts, {
    left: 'PROGRESS: demo',
    right: usageTitleSegments('demo', series[0].cumulative, 'CONTRACTS: 0/?').right,
  });
  const changes = frames.filter((frame, index) => (
    index > 0 && frame.title !== frames[index - 1].title
  ));
  assert.equal(changes.length, 1);
});

test('selectTitle prefers frame titles and fitTitleSize shrinks only over-width text', () => {
  const ctx = { font: '', measureText: (text) => ({ width: text.length * 7 }) };

  assert.equal(selectTitle({ title: 'frame' }, { title: 'options' }, { title: 'header' }), 'frame');
  assert.equal(selectTitle({}, { title: 'options' }, { title: 'header' }), 'options');
  assert.equal(selectTitle({}, {}, { title: 'header' }), 'header');
  assert.equal(fitTitleSize(ctx, 'short', 400, 14), 14);
  assert.ok(fitTitleSize(ctx, 'x'.repeat(200), 100, 14) < 14);
});

test('selectTitleParts returns segments and fitTitleLayout truncates only the name', () => {
  const ctx = { font: '', measureText: (text) => ({ width: text.length * 7 }) };
  const parts = { left: 'PROGRESS: demo', right: 'I/C/O/D = 1M / 2M / 0M / $1' };

  assert.deepEqual(selectTitleParts({ titleParts: parts }), parts);
  assert.equal(selectTitleParts({ title: 'legacy' }), null);
  assert.equal(fitTitleLayout(ctx, parts, { availableWidth: 772, baseSize: 14, minSize: 10, gap: 12 }).size, 14);

  const narrow = fitTitleLayout(ctx, { left: 'x'.repeat(200), right: parts.right }, {
    availableWidth: 400, baseSize: 14, minSize: 10, gap: 12,
  });
  assert.ok(narrow.left.endsWith('…'));
  assert.equal(narrow.right, parts.right);
  assert.ok(ctx.measureText(narrow.left).width + 12 + ctx.measureText(narrow.right).width <= 400);
});

test('displayDateKey uses the same date components as formatDate', () => {
  const timestamps = [
    Date.parse('2026-10-05T00:00:00.000Z'),
    Date.parse('2026-10-05T23:30:00.000Z'),
  ];
  for (const timestamp of timestamps) {
    for (const precision of ['ms', 'day']) {
      const displayed = formatDate(timestamp, precision).slice(0, 5).replace('/', '-');
      assert.equal(displayDateKey(timestamp, precision).slice(5), displayed);
    }
  }
});

test('aggregateUsage finds logs whose project directory uses a different encoding', async () => {
  const directory = '/tmp/work.space';
  // A slash-only encoder (the older CLI's rule) leaves the dot in the directory name,
  // so the name-first lookup finds nothing and discovery has to fall back to the cwd.
  const slashEncodedKey = directory.replace(/[\\/]/g, '-');
  const fixture = writeUsageFixture({
    directory,
    projectKey: slashEncodedKey,
    records: [
      assistantRecord({ id: 'legacy-key', at: '2026-10-05T12:00:00.000Z', cwd: directory, output: 9 }),
    ],
  });

  const result = await aggregateUsage({
    directory,
    configDir: fixture.configDir,
    dateKey: utcDateKey,
  });

  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].offpeak.output_tokens, 9);
});

test('the three script copies are identical', () => {
// [::TICKET::] PX-353 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-353 --for-spec --no-implementation-order`.
  const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
  const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
  const local = path.join(packageRoot, '.claude/scripts/conver');
  const root = path.join(repoRoot, '.claude/scripts/conver');
  const siprs = path.join(repoRoot, 'crates/siprs/.claude/scripts/conver');
  const files = [
    'claude-usage.js',
    'draw-progress-gif.js',
    'progress-gif/usage-cache.js',
    'progress-gif/usage-recovery.js',
    'progress-gif/usage.js',
    'recover-usage-cache.js',
    'progress-gif/loop.js',
    'progress-gif/engine.js',
    'progress-gif/layout.js',
  ];

  for (const file of files) {
    const expected = fs.readFileSync(path.join(local, file));
    assert.deepEqual(fs.readFileSync(path.join(root, file)), expected, `root copy: ${file}`);
    assert.deepEqual(fs.readFileSync(path.join(siprs, file)), expected, `siprs copy: ${file}`);
  }
});
