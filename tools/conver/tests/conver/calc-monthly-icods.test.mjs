// PX-453 @verifies C001 @verifies C002 @verifies C003 @verifies C004 @verifies C005 @verifies C006
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_MONTH_SPAN,
  MILLION,
  buildMonthlyUsageRows,
  enumerateMonths,
  formatDollars,
  formatIcodMetrics,
  formatMillions,
  formatMonthlyIcodTable,
  resolveDefaultMonthRange,
  sumMonthlyUsage,
} from '../../.claude/scripts/conver/progress-gif/icod.js';
import {
  DEFAULT_PRICES,
  aggregateUsage,
  dailySeries,
} from '../../.claude/scripts/conver/progress-gif/usage.js';
import { CACHE_FILE_NAME } from '../../.claude/scripts/conver/progress-gif/usage-cache.js';
import {
  displayDateKey,
  usageTitleSegments,
} from '../../.claude/scripts/conver/progress-gif/loop.js';
import { WorkspaceError } from '../../.claude/scripts/conver/progress-gif/parse.js';
import {
  parseArgs,
  resolveUsageCachePath,
} from '../../.claude/scripts/conver/calc-monthly-icods.js';

const CLI = fileURLToPath(new URL('../../.claude/scripts/conver/calc-monthly-icods.js', import.meta.url));
const TOKYO_TZ = 'Asia/Tokyo';

// [::TICKET::] PX-453 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-453 --for-spec --no-implementation-order`.
function createWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'px453-workspace-'));
}

// [::TICKET::] PX-453 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-453 --for-spec --no-implementation-order`.
function createConfigDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'px453-config-'));
}

// [::TICKET::] PX-453 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-453 --for-spec --no-implementation-order`.
function removeTree(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
}

// [::TICKET::] PX-453 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-453 --for-spec --no-implementation-order`.
function assistantRecord(options) {
  const {
    id,
    at,
    cwd,
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
      content: [{ type: 'text' }],
    },
  });
}

// [::TICKET::] PX-453 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-453 --for-spec --no-implementation-order`.
function writeUsageFixture({ target, records, configDir = createConfigDir() }) {
  const projectDir = path.join(configDir, 'projects', target.replace(/[^a-zA-Z0-9]/g, '-'));
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'session.jsonl'), `${records.join('\n')}\n`);
  return { configDir, projectDir };
}

// [::TICKET::] PX-453 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-453 --for-spec --no-implementation-order`.
function runCli(args, configDir) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir, TZ: TOKYO_TZ },
  });
}

// [::TICKET::] PX-453 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-453 --for-spec --no-implementation-order`.
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

// [::TICKET::] PX-453 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-453 --for-spec --no-implementation-order`.
function parseMonthlyRows(stdout) {
  const rows = new Map();
  for (const line of stdout.split('\n')) {
    if (!line.startsWith('│')) continue;
    const cells = line.split('│').slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 5) continue;
    if (!/^\d{4}-\d{2}$/.test(cells[0])) continue;
    rows.set(cells[0], {
      miss: Number(cells[1]),
      hit: Number(cells[2]),
      output: Number(cells[3]),
      usd: Number(cells[4].replace('$', '')),
    });
  }
  return rows;
}

// [::TICKET::] PX-453 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-453 --for-spec --no-implementation-order`.
function tokyoDateKey(ms) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TOKYO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms));
  const value = (type) => parts.find((part) => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

// [::TICKET::] PX-453 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-453 --for-spec --no-implementation-order`.
function tokyoMonthKey(now = new Date()) {
  return tokyoDateKey(now.getTime()).slice(0, 7);
}

// [::TICKET::] PX-453 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-453 --for-spec --no-implementation-order`.
function shiftMonth(monthKey, delta) {
  const [year, month] = monthKey.split('-').map(Number);
  const shifted = new Date(year, month - 1 + delta, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
}

// [::TICKET::] PX-453 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-453 --for-spec --no-implementation-order`.
async function expectedMonthlySums(workspace, configDir, months) {
  const aggregation = await aggregateUsage({
    directory: workspace,
    configDir,
    dateKey: tokyoDateKey,
    cachePath: null,
  });
  const series = dailySeries(aggregation.groups, DEFAULT_PRICES);
  const sums = new Map(months.map((month) => [month, { miss: 0, hit: 0, out: 0, cost: 0 }]));
  for (const entry of series) {
    const month = entry.date.slice(0, 7);
    const sum = sums.get(month);
    if (sum === undefined) continue;
    sum.miss += entry.cacheMissInputTokens;
    sum.hit += entry.cacheHitInputTokens;
    sum.out += entry.outputTokens;
    sum.cost += entry.dailyCostUsd;
  }
  return sums;
}

test('C001: GIF ceiling rounding is shared', () => {
  assert.equal(MILLION, 1e6);
  assert.equal(formatMillions(0), 0);
  assert.equal(formatMillions(1), 1);
  assert.equal(formatMillions(MILLION), 1);
  assert.equal(formatMillions(MILLION + 1), 2);
  assert.equal(formatMillions(NaN), 0);
  assert.equal(formatDollars(0), 0);
  assert.equal(formatDollars(0.1), 1);
  assert.equal(formatDollars(1), 1);
  assert.equal(formatDollars(1.0001), 2);
  assert.equal(formatDollars(NaN), 0);
});

test('C001: formatIcodMetrics matches the GIF title ICOD block', () => {
  const zero = { cacheMissInputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, costUsd: 0 };
  const sample = {
    cacheMissInputTokens: 1_000_000,
    cacheHitInputTokens: 2_000_000,
    outputTokens: 0,
    costUsd: 1,
  };
  assert.equal(formatIcodMetrics(zero), '0M / 0M / 0M / $0');
  assert.equal(formatIcodMetrics(sample), '1M / 2M / 0M / $1');
  assert.equal(formatIcodMetrics(undefined), '0M / 0M / 0M / $0');
  const right = usageTitleSegments('demo', sample).right;
  assert.ok(right.includes(`ICOD [${formatIcodMetrics(sample)}]`), right);
});

test('C002: monthly rows sum daily increments and fill zero months', () => {
  const series = [
    { date: '2026-09-01', cacheMissInputTokens: 10, cacheHitInputTokens: 1, outputTokens: 2, dailyCostUsd: 0.1 },
    { date: '2026-09-02', cacheMissInputTokens: 20, cacheHitInputTokens: 2, outputTokens: 4, dailyCostUsd: 0.2 },
    { date: '2026-10-01', cacheMissInputTokens: 5, cacheHitInputTokens: 0, outputTokens: 1, dailyCostUsd: 0.05 },
  ];
  const snapshot = JSON.stringify(series);
  const rows = buildMonthlyUsageRows(series, { from: '2026-08', to: '2026-10' });
  assert.deepEqual(rows.map((row) => row.month), ['2026-08', '2026-09', '2026-10']);
  assert.deepEqual(rows[0], {
    month: '2026-08',
    cacheMissInputTokens: 0,
    cacheHitInputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
  });
  assert.equal(rows[1].cacheMissInputTokens, 30);
  assert.equal(rows[1].cacheHitInputTokens, 3);
  assert.equal(rows[1].outputTokens, 6);
  assert.ok(Math.abs(rows[1].costUsd - 0.3) < 1e-9);
  assert.equal(rows[2].cacheMissInputTokens, 5);
  assert.equal(JSON.stringify(series), snapshot);
});

// @verifies C002/invariant
test('C002: monthly rows partition the full daily series', () => {
  const groups = [
    usageGroup('2026-09-01', { miss: 10, hit: 1, out: 2 }),
    usageGroup('2026-09-02', { miss: 20, hit: 2, out: 4 }),
    usageGroup('2026-10-01', { miss: 5, hit: 0, out: 1 }),
  ];
  const series = dailySeries(groups, DEFAULT_PRICES);
  const rows = buildMonthlyUsageRows(series, { from: '2026-09', to: '2026-10' });
  const total = sumMonthlyUsage(rows);
  const final = series.at(-1).cumulative;
  assert.equal(total.cacheMissInputTokens, final.cacheMissInputTokens);
  assert.equal(total.cacheHitInputTokens, final.cacheHitInputTokens);
  assert.equal(total.outputTokens, final.outputTokens);
  assert.ok(Math.abs(total.costUsd - final.costUsd) < 1e-9);
});

// @verifies C003/precondition
test('C003: default range is six local months ending at now', () => {
  assert.equal(DEFAULT_MONTH_SPAN, 6);
  assert.deepEqual(resolveDefaultMonthRange(new Date(2026, 10, 26)), { from: '2026-06', to: '2026-11' });
  assert.deepEqual(resolveDefaultMonthRange(new Date(2026, 0, 15)), { from: '2025-08', to: '2026-01' });
  assert.deepEqual(resolveDefaultMonthRange(new Date(2026, 11, 31)), { from: '2026-07', to: '2026-12' });
  const { from, to } = resolveDefaultMonthRange(new Date(2026, 11, 31));
  assert.equal(enumerateMonths(from, to).length, 6);
});

test('C003: enumerateMonths is inclusive and validates input', () => {
  assert.deepEqual(enumerateMonths('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02']);
  assert.throws(() => enumerateMonths('2026-13', '2026-14'), /YYYY-MM/);
  assert.throws(() => enumerateMonths('2026-5', '2026-06'), /YYYY-MM/);
  assert.throws(() => enumerateMonths('2026-05', '2026-04'), /from/);
});

// @verifies C004/postcondition
test('C004: parseArgs returns a resolved range and rejects invalid argv', () => {
  const now = new Date(2026, 10, 26);
  const options = parseArgs(['-t', '/tmp/work', '--from', '2026-01', '--to', '2026-03'], now);
  assert.equal(options.target, '/tmp/work');
  assert.deepEqual(options.range, { from: '2026-01', to: '2026-03' });
  assert.equal(options.help, false);
  const onlyFrom = parseArgs(['-t', '/tmp/work', '--from', '2026-01'], now);
  assert.deepEqual(onlyFrom.range, { from: '2026-01', to: '2026-11' });
  assert.throws(
    () => parseArgs(['--from', '2026-01'], now),
    (error) => error instanceof WorkspaceError && error.exitCode === 2,
  );
  assert.throws(
    () => parseArgs(['-t', '/tmp/work', '--from', '2026-13'], now),
    (error) => error instanceof WorkspaceError && error.exitCode === 2,
  );
  assert.throws(
    () => parseArgs(['-t', '/tmp/work', '--from', '2026-05', '--to', '2026-04'], now),
    (error) => error instanceof WorkspaceError && error.exitCode === 2,
  );
  assert.throws(
    () => parseArgs(['--nope'], now),
    (error) => error instanceof WorkspaceError && error.exitCode === 2,
  );
  assert.equal(parseArgs(['-h'], now).help, true);
});

test('C004: help exits 0 without reading logs', () => {
  const result = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /--from/);
  assert.equal(result.stderr, '');
});

// @verifies C005/precondition
// @verifies C005/invariant
test('C005: cache path matches draw-progress-gif', () => {
  const expected = path.join('/tmp/work', 'progress-gif', 'snapshots', CACHE_FILE_NAME);
  assert.equal(resolveUsageCachePath('/tmp/work'), expected);
});

test('C005: first run writes the cache and the second run is byte-identical', () => {
  const workspace = createWorkspace();
  const { configDir } = writeUsageFixture({
    target: workspace,
    records: [
      assistantRecord({
        id: 'cache-1',
        at: '2026-10-05T12:00:00+09:00',
        cwd: workspace,
        input: 10,
        output: 2,
      }),
    ],
  });
  try {
    const args = ['-t', workspace, '--from', '2026-10', '--to', '2026-10'];
    const first = runCli(args, configDir);
    const second = runCli(args, configDir);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(second.stdout, first.stdout);
    const cachePath = path.join(workspace, 'progress-gif', 'snapshots', CACHE_FILE_NAME);
    assert.ok(fs.existsSync(cachePath));
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(cachePath, 'utf8')));
  } finally {
    removeTree(workspace);
    removeTree(configDir);
  }
});

test('C006: table renders deterministic Unicode borders and exact-sum TOTAL', () => {
  const rows = [
    { month: '2026-09', cacheMissInputTokens: 1_000_000, cacheHitInputTokens: 0, outputTokens: 0, costUsd: 0.4 },
    { month: '2026-10', cacheMissInputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, costUsd: 0.4 },
    { month: '2026-11', cacheMissInputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, costUsd: 0.4 },
  ];
  const table = formatMonthlyIcodTable(rows, {
    target: '/tmp/work',
    range: { from: '2026-09', to: '2026-11' },
    currentMonth: '2026-10',
  });
  assert.match(table, /^ICOD .* monthly totals \(ceil\)/);
  assert.match(table, /^target: \/tmp\/work$/m);
  assert.match(table, /^range: 2026-09 \.\. 2026-11  \(current month is month-to-date\)$/m);
  assert.match(table, /│ 2026-09 │/);
  assert.match(table, /│ 2026-10 │/);
  assert.match(table, /│ 2026-11 │/);
  const framed = table.split('\n').filter((line) => /^[│┌├└]/.test(line));
  assert.ok(framed.length >= 8);
  assert.equal(new Set(framed.map((line) => [...line].length)).size, 1);
  assert.doesNotMatch(table, /\u001b\[/);
  const totalRow = table.split('\n').find((line) => line.includes('TOTAL'));
  assert.match(totalRow, /│ TOTAL/);
  assert.match(totalRow, /\$2/);
  const september = table.split('\n').find((line) => line.startsWith('│') && line.includes('2026-09'));
  assert.match(september, /│\s+1\s+│\s+0\s+│\s+0\s+│\s+\$1\s+│/);
});

test('C006: zero and sub-million values use the shared ceiling', () => {
  const rows = [
    { month: '2026-09', cacheMissInputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, costUsd: 0 },
    { month: '2026-10', cacheMissInputTokens: 1, cacheHitInputTokens: 0, outputTokens: 0, costUsd: 0.1 },
  ];
  const table = formatMonthlyIcodTable(rows, {
    target: '/tmp/work',
    range: { from: '2026-09', to: '2026-10' },
    currentMonth: '2026-11',
  });
  assert.doesNotMatch(table, /current month is month-to-date/);
  const zeroRow = table.split('\n').find((line) => line.startsWith('│') && line.includes('2026-09'));
  assert.match(zeroRow, /│\s+0\s+│\s+0\s+│\s+0\s+│\s+\$0\s+│/);
  const oneRow = table.split('\n').find((line) => line.startsWith('│') && line.includes('2026-10'));
  assert.match(oneRow, /│\s+1\s+│\s+0\s+│\s+0\s+│\s+\$1\s+│/);
});

test('IT C004/C002: CLI rows equal independent aggregate sums', async () => {
  const workspace = createWorkspace();
  const months = ['2026-09', '2026-10', '2026-11'];
  const { configDir } = writeUsageFixture({
    target: workspace,
    records: [
      assistantRecord({
        id: 'two-models-a',
        at: '2026-09-01T02:00:00+09:00',
        cwd: workspace,
        model: 'model-a',
        input: 1_200_000,
        cacheRead: 300_000,
        output: 400_000,
      }),
      assistantRecord({
        id: 'two-models-b',
        at: '2026-09-20T12:00:00+09:00',
        cwd: workspace,
        model: 'model-b',
        input: 900_000,
        cacheCreate: 100_000,
        output: 200_000,
      }),
      assistantRecord({
        id: 'two-models-c',
        at: '2026-10-05T12:00:00+09:00',
        cwd: workspace,
        input: 500_000,
        output: 100_000,
      }),
    ],
  });
  try {
    const result = runCli(['-t', workspace, '--from', months[0], '--to', months[2]], configDir);
    assert.equal(result.status, 0, result.stderr);
    const parsed = parseMonthlyRows(result.stdout);
    assert.deepEqual([...parsed.keys()], months);
    const expected = await expectedMonthlySums(workspace, configDir, months);
    for (const month of months) {
      const row = parsed.get(month);
      const sum = expected.get(month);
      assert.equal(row.miss, formatMillions(sum.miss), month);
      assert.equal(row.hit, formatMillions(sum.hit), month);
      assert.equal(row.output, formatMillions(sum.out), month);
      assert.equal(row.usd, formatDollars(sum.cost), month);
    }
    const framed = result.stdout.split('\n').filter((line) => /^[│┌├└]/.test(line));
    assert.equal(new Set(framed.map((line) => [...line].length)).size, 1);
    assert.doesNotMatch(result.stdout, /\u001b\[/);
  } finally {
    removeTree(workspace);
    removeTree(configDir);
  }
});

test('IT C004: --from and --to override the default range', () => {
  const workspace = createWorkspace();
  const { configDir } = writeUsageFixture({
    target: workspace,
    records: [
      assistantRecord({
        id: 'range-1',
        at: '2026-01-15T12:00:00+09:00',
        cwd: workspace,
        input: 1_000_000,
        output: 0,
      }),
    ],
  });
  try {
    const result = runCli(['-t', workspace, '--from', '2026-01', '--to', '2026-03'], configDir);
    assert.equal(result.status, 0, result.stderr);
    const parsed = parseMonthlyRows(result.stdout);
    assert.deepEqual([...parsed.keys()], ['2026-01', '2026-02', '2026-03']);
    assert.equal(parsed.get('2026-01').miss, 1);
    assert.equal(parsed.get('2026-02').miss, 0);
    assert.equal(parsed.get('2026-03').miss, 0);
    const totalRow = result.stdout.split('\n').find((line) => line.includes('TOTAL'));
    assert.match(totalRow, /│\s+1\s+│\s+0\s+│\s+0\s+│\s+\$1\s+│/);
  } finally {
    removeTree(workspace);
    removeTree(configDir);
  }
});

test('IT C004: validation failures exit 2 with stderr and empty stdout', () => {
  const workspace = createWorkspace();
  const { configDir } = writeUsageFixture({
    target: workspace,
    records: [
      assistantRecord({
        id: 'error-1',
        at: '2026-10-05T12:00:00+09:00',
        cwd: workspace,
        input: 1,
      }),
    ],
  });
  const emptyConfig = createConfigDir();
  const noMatchConfig = createConfigDir();
  fs.mkdirSync(path.join(noMatchConfig, 'projects'), { recursive: true });
  try {
    const cases = [
      { args: [], configDir },
      { args: ['-t', workspace, '--from', '2026-13'], configDir },
      { args: ['-t', workspace, '--from', '2026-05', '--to', '2026-04'], configDir },
      { args: ['-t', workspace, '--nope'], configDir },
      { args: ['-t', path.join(workspace, 'missing')], configDir },
      { args: ['-t', workspace], configDir: emptyConfig },
      { args: ['-t', workspace], configDir: noMatchConfig },
    ];
    for (const entry of cases) {
      const result = runCli(entry.args, entry.configDir);
      assert.equal(result.status, 2, `${entry.args.join(' ')}: ${result.stderr}`);
      assert.match(result.stderr, /\[ERROR\]/, entry.args.join(' '));
      assert.equal(result.stdout.trim(), '', entry.args.join(' '));
    }
  } finally {
    removeTree(workspace);
    removeTree(configDir);
    removeTree(emptyConfig);
    removeTree(noMatchConfig);
  }
});

test('IT C004: local-date bucketing matches draw-progress-gif at a month boundary', () => {
  const workspace = createWorkspace();
  const { configDir } = writeUsageFixture({
    target: workspace,
    records: [
      assistantRecord({
        id: 'tz-1',
        at: '2026-08-31T15:30:00Z',
        cwd: workspace,
        input: 1,
        output: 0,
      }),
    ],
  });
  try {
    const august = runCli(['-t', workspace, '--from', '2026-08', '--to', '2026-08'], configDir);
    const september = runCli(['-t', workspace, '--from', '2026-09', '--to', '2026-09'], configDir);
    assert.equal(august.status, 0, august.stderr);
    assert.equal(september.status, 0, september.stderr);
    assert.equal(parseMonthlyRows(august.stdout).get('2026-08').miss, 0);
    assert.equal(parseMonthlyRows(september.stdout).get('2026-09').miss, 1);
  } finally {
    removeTree(workspace);
    removeTree(configDir);
  }
});

test('IT C004: default range prints six months ending at the current local month', () => {
  const workspace = createWorkspace();
  const currentMonth = tokyoMonthKey();
  const months = [];
  for (let delta = -5; delta <= 0; delta += 1) months.push(shiftMonth(currentMonth, delta));
  const { configDir } = writeUsageFixture({
    target: workspace,
    records: [
      assistantRecord({
        id: 'default-1',
        at: `${currentMonth}-15T12:00:00+09:00`,
        cwd: workspace,
        input: 1,
      }),
    ],
  });
  try {
    const result = runCli(['-t', workspace], configDir);
    assert.equal(result.status, 0, result.stderr);
    const parsed = parseMonthlyRows(result.stdout);
    assert.deepEqual([...parsed.keys()], months);
    assert.match(result.stdout, /current month is month-to-date/);
  } finally {
    removeTree(workspace);
    removeTree(configDir);
  }
});

test('IT C002/C001: dailySeries month boundaries match the displayed monthly totals', async () => {
  const workspace = createWorkspace();
  const months = ['2026-09', '2026-10'];
  const { configDir } = writeUsageFixture({
    target: workspace,
    records: [
      assistantRecord({
        id: 'boundary-1',
        at: '2026-09-30T23:30:00+09:00',
        cwd: workspace,
        input: 2_000_000,
        output: 1_000_000,
      }),
      assistantRecord({
        id: 'boundary-2',
        at: '2026-10-01T00:30:00+09:00',
        cwd: workspace,
        input: 3_000_000,
        output: 500_000,
      }),
    ],
  });
  try {
    const result = runCli(['-t', workspace, '--from', months[0], '--to', months[1]], configDir);
    assert.equal(result.status, 0, result.stderr);
    const parsed = parseMonthlyRows(result.stdout);
    const aggregation = await aggregateUsage({
      directory: workspace,
      configDir,
      dateKey: tokyoDateKey,
      cachePath: null,
    });
    const series = dailySeries(aggregation.groups, DEFAULT_PRICES);
    const septemberFinal = series.find((entry) => entry.date.slice(0, 7) === '2026-09');
    const octoberFinal = series.find((entry) => entry.date.slice(0, 7) === '2026-10');
    assert.ok(septemberFinal);
    assert.ok(octoberFinal);
    assert.equal(
      parsed.get('2026-09').miss + parsed.get('2026-10').miss,
      formatMillions(octoberFinal.cumulative.cacheMissInputTokens),
    );
    assert.equal(
      parsed.get('2026-09').output + parsed.get('2026-10').output,
      formatMillions(octoberFinal.cumulative.outputTokens),
    );
    assert.equal(
      formatMillions(octoberFinal.cumulative.cacheMissInputTokens - septemberFinal.cumulative.cacheMissInputTokens),
      formatMillions(octoberFinal.cacheMissInputTokens),
    );
    assert.deepEqual(
      parsed.get('2026-10'),
      {
        miss: formatMillions(octoberFinal.cacheMissInputTokens),
        hit: formatMillions(octoberFinal.cacheHitInputTokens),
        output: formatMillions(octoberFinal.outputTokens),
        usd: formatDollars(octoberFinal.dailyCostUsd),
      },
    );
  } finally {
    removeTree(workspace);
    removeTree(configDir);
  }
});
