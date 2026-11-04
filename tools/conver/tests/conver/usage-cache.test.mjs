// PX-353 @verifies C001 @verifies C002 @verifies C003 @verifies C004 @verifies C005 @verifies C006
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  CACHE_FILE_NAME,
  CACHE_SCHEMA,
  fingerprintFile,
  isSameFingerprint,
  readUsageCache,
  validateUsageCache,
  writeUsageCache,
} from '../../.claude/scripts/conver/progress-gif/usage-cache.js';
import {
  aggregateUsage,
  dailySeries,
  DEFAULT_PRICES,
} from '../../.claude/scripts/conver/progress-gif/usage.js';
import { listSnapshots, snapshotFromModel } from '../../.claude/scripts/conver/progress-gif/snapshot.js';

const CLAUDE_USAGE = path.resolve(new URL('../../.claude/scripts/conver/claude-usage.js', import.meta.url).pathname);
const DOUBLED_PRICES = {
  offpeak: { cache_miss_input: 0.3, cache_hit_input: 0.006, output: 1.2 },
  peak: { cache_miss_input: 0.6, cache_hit_input: 0.012, output: 2.4 },
};

// [::TICKET::] PX-353 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-353 --for-spec --no-implementation-order`.
function projectKeyOf(root) {
  return root.replace(/[^a-zA-Z0-9]/g, '-');
}

// [::TICKET::] PX-353 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-353 --for-spec --no-implementation-order`.
function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conver-cache-root-'));
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conver-cache-config-'));
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

// [::TICKET::] PX-353 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-353 --for-spec --no-implementation-order`.
function writeLog(fixture, name, records) {
  const file = path.join(fixture.projectDir, name);
  fs.writeFileSync(file, records.map((line) => `${line}\n`).join(''));
  return file;
}

// [::TICKET::] PX-353 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-353 --for-spec --no-implementation-order`.
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

// [::TICKET::] PX-353 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-353 --for-spec --no-implementation-order`.
function aggregate(fixture, extra = {}) {
  return aggregateUsage({ directory: fixture.root, configDir: fixture.configDir, ...extra });
}

// [::TICKET::] PX-353 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-353 --for-spec --no-implementation-order`.
function cumulative(series) {
  return series.length === 0 ? null : series.at(-1).cumulative;
}

test('fingerprints compare path, size, mtime and inode', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'conver-fingerprint-'));
  const file = path.join(directory, 'session.jsonl');
  fs.writeFileSync(file, 'line\n');
  const fingerprint = await fingerprintFile(file);

  assert.equal(fingerprint.path, file);
  assert.equal(fingerprint.size, 5);
  assert.equal(typeof fingerprint.mtimeMs, 'number');
  assert.equal(isSameFingerprint(fingerprint, { ...fingerprint }), true);
  assert.equal(isSameFingerprint(fingerprint, { ...fingerprint, size: 4 }), false);
  assert.equal(isSameFingerprint(fingerprint, { ...fingerprint, mtimeMs: fingerprint.mtimeMs + 1 }), false);
  assert.equal(isSameFingerprint(fingerprint, { ...fingerprint, path: `${file}.other` }), false);
  assert.equal(isSameFingerprint(fingerprint, { ...fingerprint, ino: 12345 }), false);
  assert.equal(isSameFingerprint({ ...fingerprint, ino: null }, { ...fingerprint, ino: 12345 }), true);
  assert.equal(await fingerprintFile(path.join(directory, 'missing.jsonl')), null);
});

test('cache validation rejects foreign schema, config dir, project key and malformed records', () => {
  const fixture = createFixture();
  const identity = { configDir: fixture.configDir, projectKey: fixture.projectKey };
  const record = { key: 'msg-1', ms: 1, model: 'deepseek-flash', miss: 1, hit: 2, out: 3 };
  const entry = { path: '/logs/a.jsonl', size: 10, mtimeMs: 20, ino: 30, records: [record] };
  const payload = { schema: CACHE_SCHEMA, ...identity, files: { '/logs/a.jsonl': entry } };

  const valid = validateUsageCache(payload, identity);
  assert.equal(valid.files.get('/logs/a.jsonl').records[0].key, 'msg-1');
  assert.equal(validateUsageCache({ ...payload, schema: 'other-v1' }, identity), null);
  assert.equal(validateUsageCache({ ...payload, configDir: '/elsewhere' }, identity), null);
  assert.equal(validateUsageCache({ ...payload, projectKey: 'other' }, identity), null);
  assert.equal(validateUsageCache({ ...payload, files: [] }, identity), null);
  assert.equal(
    validateUsageCache({ ...payload, files: { '/logs/a.jsonl': { ...entry, records: [{ ...record, miss: -1 }] } } }, identity),
    null
  );
  assert.equal(
    validateUsageCache({ ...payload, files: { '/logs/a.jsonl': { ...entry, path: '/logs/other.jsonl' } } }, identity),
    null
  );
});

test('a written cache reads back with the same records and no temporary file', async () => {
  const fixture = createFixture();
  const record = { key: 'msg-1', ms: 10, model: 'deepseek-flash', miss: 1, hit: 2, out: 3 };
  const files = new Map([['/logs/a.jsonl', {
    path: '/logs/a.jsonl', size: 10, mtimeMs: 20, ino: 30, records: [record],
  }]]);

  assert.equal(await writeUsageCache({
    cachePath: fixture.cachePath,
    configDir: fixture.configDir,
    projectKey: fixture.projectKey,
    files,
  }), true);

  const readBack = await readUsageCache({
    cachePath: fixture.cachePath,
    configDir: fixture.configDir,
    projectKey: fixture.projectKey,
  });
  assert.deepEqual(readBack.files.get('/logs/a.jsonl').records, [record]);
  assert.deepEqual(
    fs.readdirSync(fixture.snapshotDir).filter((name) => name.includes('.tmp')),
    []
  );
});

test('two writers with distinct temporary files both rename and leave complete JSON', async () => {
  const fixture = createFixture();
  const record = { key: 'msg-1', ms: 10, model: 'deepseek-flash', miss: 1, hit: 2, out: 3 };
  const files = new Map([['/logs/a.jsonl', {
    path: '/logs/a.jsonl', size: 10, mtimeMs: 20, ino: 30, records: [record],
  }]]);
  const write = () => writeUsageCache({
    cachePath: fixture.cachePath,
    configDir: fixture.configDir,
    projectKey: fixture.projectKey,
    files,
  });

  const results = await Promise.all([write(), write()]);

  assert.deepEqual(results, [true, true]);
  const payload = JSON.parse(fs.readFileSync(fixture.cachePath, 'utf8'));
  assert.equal(payload.schema, CACHE_SCHEMA);
  assert.deepEqual(fs.readdirSync(fixture.snapshotDir).filter((name) => name.includes('.tmp')), []);
});

test('the first run creates the cache and the second run reuses every file', async () => {
  const fixture = createFixture();
  writeLog(fixture, 'session.jsonl', [
    assistantRecord({ id: 'msg-1', cwd: fixture.root, output: 240 }),
  ]);

  const first = await aggregate(fixture, { cachePath: fixture.cachePath });
  assert.equal(first.cacheStats.filesParsed, 1);
  assert.equal(first.cacheStats.filesReused, 0);
  assert.equal(fs.existsSync(fixture.cachePath), true);

  const reparsed = [];
  const second = await aggregate(fixture, {
    cachePath: fixture.cachePath,
    onFileParsed: (file) => reparsed.push(file),
  });
  assert.equal(second.cacheStats.filesReused, 1);
  assert.equal(second.cacheStats.filesParsed, 0);
  assert.deepEqual(reparsed, []);
  assert.deepEqual(dailySeries(second.groups), dailySeries(first.groups));
});

test('an appended record reparses the file and replaces the cached entry', async () => {
  const fixture = createFixture();
  const file = writeLog(fixture, 'session.jsonl', [
    assistantRecord({ id: 'msg-1', cwd: fixture.root, output: 5 }),
  ]);
  const first = await aggregate(fixture, { cachePath: fixture.cachePath });
  assert.equal(cumulative(dailySeries(first.groups)).outputTokens, 5);

  fs.appendFileSync(file, `${assistantRecord({ id: 'msg-2', cwd: fixture.root, output: 7 })}
`);

  const second = await aggregate(fixture, { cachePath: fixture.cachePath });
  assert.equal(second.cacheStats.filesParsed, 1);
  assert.equal(second.cacheStats.filesReused, 0);
  assert.equal(cumulative(dailySeries(second.groups)).outputTokens, 12);
});

test('a deleted log file is dropped from the cache and contributes nothing', async () => {
  const fixture = createFixture();
  const file = writeLog(fixture, 'session.jsonl', [
    assistantRecord({ id: 'msg-1', cwd: fixture.root, output: 5 }),
  ]);
  await aggregate(fixture, { cachePath: fixture.cachePath });
  fs.unlinkSync(file);

  const second = await aggregate(fixture, { cachePath: fixture.cachePath });
  assert.equal(second.cacheStats.filesDropped, 1);
  assert.deepEqual(second.groups, []);

  const cached = await readUsageCache({
    cachePath: fixture.cachePath,
    configDir: fixture.configDir,
    projectKey: fixture.projectKey,
  });
  assert.deepEqual([...cached.files.keys()], []);
});

test('the same message id in two files is merged once with the maximum of each field', async () => {
  const fixture = createFixture();
  writeLog(fixture, 'a.jsonl', [
    assistantRecord({ id: 'dup', cwd: fixture.root, output: 100, cacheRead: 10, at: '2026-10-05T01:00:00.000Z' }),
  ]);
  writeLog(fixture, 'b.jsonl', [
    assistantRecord({ id: 'dup', cwd: fixture.root, output: 250, cacheRead: 40, at: '2026-10-05T02:00:00.000Z' }),
  ]);

  const cold = await aggregate(fixture);
  assert.equal(cold.groups[0].offpeak.records + cold.groups[0].peak.records, 1);

  const warm = await aggregate(fixture, { cachePath: fixture.cachePath });
  assert.deepEqual(dailySeries(warm.groups), dailySeries(cold.groups));
  assert.equal(cumulative(dailySeries(warm.groups)).outputTokens, 250);
  assert.equal(cumulative(dailySeries(warm.groups)).cacheHitInputTokens, 40);
});

test('a warm cache equals a cold scan and still recomputes prices and holidays', async () => {
  const fixture = createFixture();
  writeLog(fixture, 'session.jsonl', [
    assistantRecord({ id: 'peak', cwd: fixture.root, at: '2026-10-05T02:00:00.000Z', input: 1000000, output: 1000000 }),
    assistantRecord({ id: 'offpeak', cwd: fixture.root, at: '2026-10-05T12:00:00.000Z', cacheRead: 1000000 }),
  ]);

  const cold = await aggregate(fixture);
  await aggregate(fixture, { cachePath: fixture.cachePath });
  const warm = await aggregate(fixture, { cachePath: fixture.cachePath });

  assert.ok(warm.cacheStats.filesReused > 0);
  assert.deepEqual(dailySeries(warm.groups, DEFAULT_PRICES), dailySeries(cold.groups, DEFAULT_PRICES));

  const repriced = dailySeries(warm.groups, DOUBLED_PRICES);
  const coldPriced = dailySeries(cold.groups, DEFAULT_PRICES);
  assert.ok(Math.abs(repriced[0].dailyCostUsd - coldPriced[0].dailyCostUsd * 2) < 1e-9);
  assert.deepEqual(
    repriced.map((entry) => entry.cumulative),
    dailySeries(cold.groups, DOUBLED_PRICES).map((entry) => entry.cumulative)
  );

  const holiday = await aggregate(fixture, {
    cachePath: fixture.cachePath,
    holidays: new Set(['2026-10-05']),
  });
  const holidaySeries = dailySeries(holiday.groups, DEFAULT_PRICES);
  const offpeakPriced = dailySeries(cold.groups, { ...DEFAULT_PRICES, peak: DEFAULT_PRICES.offpeak });
  assert.equal(holidaySeries[0].dailyCostUsd, offpeakPriced[0].dailyCostUsd);

  const shifted = await aggregate(fixture, {
    cachePath: fixture.cachePath,
    dateKey: () => '2026-01-01',
  });
  assert.deepEqual(dailySeries(shifted.groups).map((entry) => entry.date), ['2026-01-01']);
  assert.equal(cumulative(dailySeries(shifted.groups)).outputTokens, cumulative(coldPriced).outputTokens);
});

test('corrupt, foreign and mismatched caches bypass to the cache-free series', async () => {
  const fixture = createFixture();
  writeLog(fixture, 'session.jsonl', [
    assistantRecord({ id: 'msg-1', cwd: fixture.root, output: 9 }),
  ]);
  const cold = await aggregate(fixture);
  const payloads = [
    '{not json',
    JSON.stringify({ schema: 'other-v1', files: {} }),
    JSON.stringify({ schema: CACHE_SCHEMA, configDir: '/elsewhere', projectKey: fixture.projectKey, files: {} }),
    JSON.stringify({ schema: CACHE_SCHEMA, configDir: fixture.configDir, projectKey: 'other', files: {} }),
  ];

  for (const payload of payloads) {
    fs.mkdirSync(fixture.snapshotDir, { recursive: true });
    fs.writeFileSync(fixture.cachePath, payload);
    const result = await aggregate(fixture, { cachePath: fixture.cachePath });
    assert.equal(result.cacheStats.bypassed, true);
    assert.deepEqual(dailySeries(result.groups), dailySeries(cold.groups));
  }
});

test('an unwritable cache parent falls back to a full scan and leaves no temporary file', async () => {
  const fixture = createFixture();
  writeLog(fixture, 'session.jsonl', [
    assistantRecord({ id: 'msg-1', cwd: fixture.root, output: 9 }),
  ]);
  const cold = await aggregate(fixture);
  const blocker = path.join(fixture.root, 'blocked-parent');
  fs.writeFileSync(blocker, 'not a directory');
  const unwritable = path.join(blocker, CACHE_FILE_NAME);

  const result = await aggregate(fixture, { cachePath: unwritable });

  assert.deepEqual(dailySeries(result.groups), dailySeries(cold.groups));
  assert.equal(fs.existsSync(unwritable), false);
  assert.deepEqual(fs.readdirSync(path.dirname(blocker)).filter((name) => name.includes('.tmp')), []);
});

test('empty and unused caches equal a cold scan', async () => {
  const fixture = createFixture();
  writeLog(fixture, 'session.jsonl', [
    assistantRecord({ id: 'msg-1', cwd: fixture.root, output: 9 }),
  ]);
  const cold = await aggregate(fixture);
  const emptyPayloads = [
    '',
    JSON.stringify({ schema: CACHE_SCHEMA, configDir: fixture.configDir, projectKey: fixture.projectKey, files: {} }),
  ];

  for (const payload of emptyPayloads) {
    fs.mkdirSync(fixture.snapshotDir, { recursive: true });
    fs.writeFileSync(fixture.cachePath, payload);
    const result = await aggregate(fixture, { cachePath: fixture.cachePath });
    assert.deepEqual(dailySeries(result.groups), dailySeries(cold.groups));
  }

  await aggregate(fixture, { cachePath: fixture.cachePath });
  const single = await aggregate(fixture, { cachePath: fixture.cachePath });
  assert.equal(single.cacheStats.filesParsed, 0);
  assert.deepEqual(dailySeries(single.groups), dailySeries(cold.groups));
});

test('anonymous records keep a stable file-plus-line identity across a warm hit', async () => {
  const fixture = createFixture();
  writeLog(fixture, 'anonymous.jsonl', [
    assistantRecord({ id: undefined, cwd: fixture.root, output: 5 }),
    assistantRecord({ id: undefined, cwd: fixture.root, output: 7 }),
  ]);

  const first = await aggregate(fixture, { cachePath: fixture.cachePath });
  const second = await aggregate(fixture, { cachePath: fixture.cachePath });

  assert.equal(cumulative(dailySeries(first.groups)).outputTokens, 12);
  assert.equal(cumulative(dailySeries(second.groups)).outputTokens, 12);
  assert.equal(second.cacheStats.filesReused, 1);
  assert.equal(second.cacheStats.filesParsed, 0);
});

test('the cache file is not a model snapshot and snapshotFromModel gains no usage field', () => {
  const fixture = createFixture();
  fs.mkdirSync(fixture.snapshotDir, { recursive: true });
  fs.writeFileSync(
    fixture.cachePath,
    JSON.stringify({ schema: CACHE_SCHEMA, configDir: fixture.configDir, projectKey: fixture.projectKey, files: {} })
  );
  assert.deepEqual(listSnapshots(fixture.snapshotDir), []);

  const model = { workspaceRoot: '/workspace', packages: [], totals: {} };
  const snapshot = snapshotFromModel(model);
  assert.equal('usage' in snapshot, false);
  assert.equal('cache' in snapshot, false);
});

test('claude-usage stays read-only and keeps its JSON shape', () => {
  const fixture = createFixture();
  writeLog(fixture, 'session.jsonl', [
    assistantRecord({ id: 'msg-1', cwd: fixture.root, output: 9 }),
  ]);
  const before = fs.readdirSync(fixture.root, { recursive: true }).sort();

  const result = spawnSync(process.execPath, [CLAUDE_USAGE, '-d', fixture.root], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: fixture.configDir },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    Object.keys(JSON.parse(result.stdout)),
    ['period', 'prices_usd_per_1m', 'projects', 'holidays', 'rows', 'total']
  );
  assert.deepEqual(fs.readdirSync(fixture.root, { recursive: true }).sort(), before);
  assert.equal(fs.existsSync(fixture.cachePath), false);
});
