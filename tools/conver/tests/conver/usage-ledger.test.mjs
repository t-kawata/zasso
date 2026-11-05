// PX-376 @verifies C001 @verifies C002 @verifies C003 @verifies C004 @verifies C005 @verifies C006 @verifies C007
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  CACHE_FILE_NAME,
  CACHE_SCHEMA,
  LEGACY_CACHE_SCHEMA,
  machineIdFor,
} from '../../.claude/scripts/conver/progress-gif/usage-cache.js';
import { aggregateUsage, dailySeries } from '../../.claude/scripts/conver/progress-gif/usage.js';

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function projectKeyOf(root) {
  return root.replace(/[^a-zA-Z0-9]/g, '-');
}

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conver-ledger-root-'));
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conver-ledger-config-'));
  const projectKey = projectKeyOf(root);
  const projectDir = path.join(configDir, 'projects', projectKey);
  fs.mkdirSync(projectDir, { recursive: true });
  return {
    root,
    configDir,
    projectKey,
    projectDir,
    cachePath: path.join(root, 'progress-gif', 'snapshots', CACHE_FILE_NAME),
    snapshotDir: path.join(root, 'progress-gif', 'snapshots'),
  };
}

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function writeLog(fixture, name, lines) {
  const file = path.join(fixture.projectDir, name);
  fs.writeFileSync(file, lines.map((line) => `${line}\n`).join(''));
  return file;
}

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function assistantRecord(options = {}) {
  const {
    id,
    at = '2026-10-05T12:00:00.000Z',
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

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function aggregate(fixture, extra = {}) {
  return aggregateUsage({ directory: fixture.root, configDir: fixture.configDir, ...extra });
}

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function cumulative(result) {
  const series = dailySeries(result.groups);
  return series.length === 0 ? { outputTokens: 0, cacheHitInputTokens: 0, cacheMissInputTokens: 0 } : series.at(-1).cumulative;
}

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function recordCount(result) {
  return result.groups.reduce(
    (sum, group) => sum + group.offpeak.records + group.peak.records,
    0,
  );
}

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function carryCache(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function legacyPayload({ configDir, records, at = Date.parse('2026-10-05T12:00:00Z') }) {
  const file = path.join(configDir, 'projects', '-legacy-project', 'session.jsonl');
  return {
    schema: LEGACY_CACHE_SCHEMA,
    configDir,
    projectKey: '-legacy-project',
    updatedAt: '2026-10-05T00:00:00.000Z',
    models: ['deepseek-flash'],
    files: {
      [file]: {
        path: file,
        size: 100,
        mtimeMs: 100,
        ino: null,
        records: records.map(([key, output]) => [key, at, 0, 0, 0, output]),
      },
    },
  };
}

test('C001 a cache written on another machine contributes to the total', async () => {
  const machineA = createFixture();
  writeLog(machineA, 'a.jsonl', [assistantRecord({ id: 'a-1', cwd: machineA.root, output: 100 })]);
  await aggregate(machineA, { cachePath: machineA.cachePath });

  const machineB = createFixture();
  writeLog(machineB, 'b.jsonl', [assistantRecord({ id: 'b-1', cwd: machineB.root, output: 200 })]);
  carryCache(machineA.cachePath, machineB.cachePath);

  const result = await aggregate(machineB, { cachePath: machineB.cachePath });

  assert.equal(cumulative(result).outputTokens, 300);
  assert.equal(recordCount(result), 2);

  const raw = JSON.parse(fs.readFileSync(machineB.cachePath, 'utf8'));
  assert.equal(raw.schema, CACHE_SCHEMA);
  assert.equal(Object.keys(raw.machines).length, 2);
  assert.equal('updatedAt' in raw, false);
});

test('C002 the same message id on two machines is counted once with the maximum fields', async () => {
  const machineA = createFixture();
  writeLog(machineA, 'a.jsonl', [
    assistantRecord({ id: 'dup', cwd: machineA.root, output: 100, cacheRead: 10 }),
  ]);
  await aggregate(machineA, { cachePath: machineA.cachePath });

  const machineB = createFixture();
  writeLog(machineB, 'b.jsonl', [
    assistantRecord({ id: 'dup', cwd: machineB.root, output: 250, cacheRead: 40 }),
  ]);
  carryCache(machineA.cachePath, machineB.cachePath);

  const result = await aggregate(machineB, { cachePath: machineB.cachePath });

  assert.equal(recordCount(result), 1);
  assert.equal(cumulative(result).outputTokens, 250);
  assert.equal(cumulative(result).cacheHitInputTokens, 40);

  const first = fs.readFileSync(machineB.cachePath, 'utf8');
  await aggregate(machineB, { cachePath: machineB.cachePath });
  assert.equal(fs.readFileSync(machineB.cachePath, 'utf8'), first);
});

test('C003 a foreign file survives locally while a deleted local file is dropped', async () => {
  const machineA = createFixture();
  writeLog(machineA, 'a.jsonl', [assistantRecord({ id: 'a-1', cwd: machineA.root, output: 100 })]);
  await aggregate(machineA, { cachePath: machineA.cachePath });

  const machineB = createFixture();
  const localFile = writeLog(machineB, 'b.jsonl', [
    assistantRecord({ id: 'b-1', cwd: machineB.root, output: 200 }),
  ]);
  carryCache(machineA.cachePath, machineB.cachePath);
  await aggregate(machineB, { cachePath: machineB.cachePath });

  fs.unlinkSync(localFile);
  const second = await aggregate(machineB, { cachePath: machineB.cachePath });

  assert.equal(second.cacheStats.filesDropped, 1);
  assert.equal(cumulative(second).outputTokens, 100);

  const raw = JSON.parse(fs.readFileSync(machineB.cachePath, 'utf8'));
  const fileCounts = Object.values(raw.machines).map((section) => Object.keys(section.files).length).sort();
  assert.deepEqual(fileCounts, [0, 1]);
});

test('C004 an unchanged rerun writes byte-identical, merge-friendly JSON', async () => {
  const fixture = createFixture();
  writeLog(fixture, 'session.jsonl', [
    assistantRecord({ id: 'msg-1', cwd: fixture.root, output: 9 }),
  ]);

  await aggregate(fixture, { cachePath: fixture.cachePath });
  const first = fs.readFileSync(fixture.cachePath, 'utf8');
  await aggregate(fixture, { cachePath: fixture.cachePath });
  const second = fs.readFileSync(fixture.cachePath, 'utf8');

  assert.equal(second, first);
  assert.match(first, /\n {2}"machines": \{/);
  assert.equal(first.includes('updatedAt'), false);
});

test('C005 a v2 cache is migrated and its usage is preserved', async () => {
  const legacyConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conver-ledger-legacy-'));
  const payload = legacyPayload({ configDir: legacyConfigDir, records: [['legacy-1', 30]] });

  const machine = createFixture();
  writeLog(machine, 'b.jsonl', [assistantRecord({ id: 'b-1', cwd: machine.root, output: 5 })]);
  fs.mkdirSync(machine.snapshotDir, { recursive: true });
  fs.writeFileSync(machine.cachePath, JSON.stringify(payload));

  const result = await aggregate(machine, { cachePath: machine.cachePath });

  assert.equal(cumulative(result).outputTokens, 35);
  const raw = JSON.parse(fs.readFileSync(machine.cachePath, 'utf8'));
  assert.equal(raw.schema, CACHE_SCHEMA);
  assert.ok(raw.machines[legacyConfigDir], 'the migrated machine keeps its own section');
  assert.equal(Object.keys(raw.machines).length, 2);
});

test('C006 identical anonymous records in two files count once', async () => {
  const fixture = createFixture();
  const line = assistantRecord({ id: undefined, cwd: fixture.root, output: 70 });
  writeLog(fixture, 'one.jsonl', [line]);
  writeLog(fixture, 'two.jsonl', [line]);

  const result = await aggregate(fixture);

  assert.equal(recordCount(result), 1);
  assert.equal(cumulative(result).outputTokens, 70);
});

test('C007 the daily I/C/O/D view is derived from exact tokens', () => {
  const prices = {
    offpeak: { cache_miss_input: 0.15, cache_hit_input: 0.003, output: 0.6 },
    peak: { cache_miss_input: 0.3, cache_hit_input: 0.006, output: 1.2 },
  };
  const series = dailySeries([{
    date: '2026-11-05',
    model: 'deepseek-flash',
    offpeak: { records: 1, cache_miss_input_tokens: 2108466, cache_hit_input_tokens: 335340928, output_tokens: 890114 },
    peak: { records: 0, cache_miss_input_tokens: 0, cache_hit_input_tokens: 0, output_tokens: 0 },
  }], prices);

  assert.equal(series[0].cumulative.cacheMissInputTokens, 2108466);
  assert.equal(series[0].cumulative.cacheHitInputTokens, 335340928);
  assert.equal(series[0].cumulative.outputTokens, 890114);
  assert.ok(Math.abs(series[0].cumulative.costUsd - 1.856361084) < 1e-7);
  assert.equal(Math.ceil(series[0].cumulative.costUsd * 100) / 100, 1.86);
});

test('C009 a warm local run still reuses its own unchanged files', async () => {
  const fixture = createFixture();
  writeLog(fixture, 'session.jsonl', [
    assistantRecord({ id: 'msg-1', cwd: fixture.root, output: 9 }),
  ]);

  await aggregate(fixture, { cachePath: fixture.cachePath });
  const warm = await aggregate(fixture, { cachePath: fixture.cachePath });

  assert.equal(warm.cacheStats.filesReused, 1);
  assert.equal(warm.cacheStats.filesParsed, 0);
});

test('C005 a recovered v2 section is adopted by its machine on the next run', async () => {
  const fixture = createFixture();
  const at = Date.parse('2026-10-05T12:00:00Z');
  const file = writeLog(fixture, 'session.jsonl', [
    assistantRecord({ id: 'old-1', cwd: fixture.root, output: 20 }),
    assistantRecord({ id: 'new-1', cwd: fixture.root, output: 10 }),
  ]);
  const recovered = {
    schema: CACHE_SCHEMA,
    machines: {
      [fixture.configDir]: {
        configDir: fixture.configDir,
        recovered: true,
        models: ['deepseek-flash'],
        files: {
          [file]: { size: 1, mtimeMs: 1, ino: null, records: [['old-1', at, 0, 0, 0, 20]] },
        },
      },
    },
  };
  fs.mkdirSync(fixture.snapshotDir, { recursive: true });
  fs.writeFileSync(fixture.cachePath, JSON.stringify(recovered));

  const result = await aggregate(fixture, { cachePath: fixture.cachePath });

  assert.equal(recordCount(result), 2);
  assert.equal(cumulative(result).outputTokens, 30);
  const raw = JSON.parse(fs.readFileSync(fixture.cachePath, 'utf8'));
  assert.equal(Object.keys(raw.machines).length, 1);
  assert.ok(raw.machines[machineIdFor(fixture.configDir)]);
});
