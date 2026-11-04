// [::TICKET::] PX-354 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-354 --for-spec --no-implementation-order`.
// [::TICKET::] PX-351 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-351 --for-spec --no-implementation-order`.
// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
// PX-349 @verifies C001 @verifies C002 @verifies C003 @verifies C004 @verifies C005 @verifies C006
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseArgs } from '../../.claude/scripts/conver/draw-progress-gif.js';
import { aggregateUsage } from '../../.claude/scripts/conver/progress-gif/usage.js';
import { CACHE_FILE_NAME, CACHE_SCHEMA } from '../../.claude/scripts/conver/progress-gif/usage-cache.js';
import { materializeBundle, writeWorkspace } from './fixtures.mjs';

const CLI = path.resolve(new URL('../../.claude/scripts/conver/draw-progress-gif.js', import.meta.url).pathname);
const EMPTY_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'conver-empty-config-'));
fs.mkdirSync(path.join(EMPTY_CONFIG_DIR, 'projects'), { recursive: true });

// [::TICKET::] PX-349, PX-352 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-349|PX-352) --for-spec --no-implementation-order`.
function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CLAUDE_CONFIG_DIR: EMPTY_CONFIG_DIR },
  });
}

// [::TICKET::] PX-353 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-353 --for-spec --no-implementation-order`.
function runWithConfig(args, configDir) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
  });
}

// [::TICKET::] PX-353 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-353 --for-spec --no-implementation-order`.
function writeUsageLog(root, configDir, record) {
  const projectDir = path.join(configDir, 'projects', root.replace(/[^a-zA-Z0-9]/g, '-'));
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'session.jsonl'), `${JSON.stringify(record)}\n`);
  return path.join(root, 'progress-gif', 'snapshots', CACHE_FILE_NAME);
}

// [::TICKET::] PX-353 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-353 --for-spec --no-implementation-order`.
function usageRecordOf(root) {
  return {
    type: 'assistant',
    timestamp: '2026-01-01T12:00:00.000Z',
    cwd: root,
    message: {
      id: 'msg-1',
      model: 'deepseek-flash',
      usage: {
        input_tokens: 1000000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 1000000,
        output_tokens: 1000000,
      },
      content: [{ type: 'text' }],
    },
  };
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function hashTree(root) {
  const hash = crypto.createHash('sha256');
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === 'progress-gif') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) hash.update(full).update(fs.readFileSync(full));
    }
  };
  walk(root);
  return hash.digest('hex');
}

test('parseArgs requires a target and accepts the documented flags', () => {
  assert.throws(() => parseArgs([]), /target/);
  const options = parseArgs(['-t', '/tmp/one', '--no-open', '--dry-run', '--frames', '30', '--fps', '5', '--scale', '1', '--max-bytes', '1000']);
  assert.equal(options.target, '/tmp/one');
  assert.equal(options.open, false);
  assert.equal(options.dryRun, true);
  assert.equal(options.frames, 30);
  assert.equal(options.fps, 5);
  assert.equal(options.scale, 1);
  assert.equal(options.maxBytes, 1000);
});

test('--frames is clamped to the browser-safe 20 to 600 range', () => {
  assert.equal(parseArgs(['-t', '/tmp/one', '--frames', '5000']).frames, 600);
  assert.equal(parseArgs(['-t', '/tmp/one', '--frames', '5']).frames, 20);
  assert.equal(parseArgs(['-t', '/tmp/one', '--frames', '240']).frames, 240);
});

test('an explicit --fps sets the initial speed while the default stays 180 ms', () => {
  const defaults = parseArgs(['-t', '/tmp/one']);
  assert.equal(defaults.speedMs, null);
  const explicit = parseArgs(['-t', '/tmp/one', '--fps', '5']);
  assert.equal(explicit.speedMs, 200);
});

test('a manifests-only workspace exits zero and writes HTML and a snapshot', () => {
  const { root } = materializeBundle('workspace-min.json');
  const before = hashTree(root);
  const result = run(['-t', root, '--no-open', '--no-source-scan']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS:/);
  assert.match(result.stdout, /canvas: 796x384/);
  assert.match(result.stdout, /overall progress: \d+%/);
  const outputDir = path.join(root, 'progress-gif');
  const html = fs.readdirSync(outputDir).filter((name) => name.endsWith('.html'));
  assert.equal(html.length, 1);
  const snapshots = fs.readdirSync(path.join(outputDir, 'snapshots')).filter((name) => name.endsWith('.json'));
  assert.equal(snapshots.length, 1);
  assert.equal(hashTree(root), before);
});

test('a 29-package workspace renders four rows at 796x440', () => {
  const packages = Array.from({ length: 29 }, (_, index) => ({
    id: `pkg-${index + 1}`,
    name: `pkg-${index + 1}`,
    path: `pkg-${index + 1}`,
    layer: 'foundation',
    kind: 'production-library',
    seed_required: true,
  }));
  const root = writeWorkspace({ packages });
  const result = run(['-t', root, '--no-open', '--dry-run', '--no-source-scan']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /canvas: 796x440/);
  assert.match(result.stdout, /overall progress: \d+%/);
});

test('dry-run writes nothing', () => {
  const { root } = materializeBundle('workspace-min.json');
  const result = run(['-t', root, '--no-open', '--dry-run', '--no-source-scan']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(root, 'progress-gif')), false);
});

test('missing manifests exit 2 with a cause and an action', () => {
  const root = writeWorkspace({ packages: [] });
  fs.unlinkSync(path.join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'));
  const result = run(['-t', root, '--no-open', '--dry-run']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /\[ERROR\]/);
  assert.match(result.stderr, /Cause:/);
  assert.match(result.stderr, /Action:/);
});

test('a populated usage log embeds the cumulative series in the HTML', () => {
  const { root } = materializeBundle('workspace-min.json');
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conver-usage-config-'));
  const projectDir = path.join(configDir, 'projects', root.replace(/[^a-zA-Z0-9]/g, '-'));
  fs.mkdirSync(projectDir, { recursive: true });
  const record = {
    type: 'assistant',
    timestamp: '2026-01-01T12:00:00.000Z',
    cwd: root,
    message: {
      id: 'msg-1',
      model: 'deepseek-flash',
      usage: {
        input_tokens: 1000000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 1000000,
        output_tokens: 1000000,
      },
      content: [{ type: 'text' }],
    },
  };
  fs.writeFileSync(path.join(projectDir, 'session.jsonl'), `${JSON.stringify(record)}\n`);

  const result = spawnSync(process.execPath, [CLI, '-t', root, '--no-open'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
  });
  assert.equal(result.status, 0, result.stderr);

  const htmlName = fs.readdirSync(path.join(root, 'progress-gif'))
    .find((name) => name.endsWith('.html'));
  const html = fs.readFileSync(path.join(root, 'progress-gif', htmlName), 'utf8');
  assert.match(html, /"titleName":"workspace-min"/);
  assert.match(html, /"usage":\[\{/);
  assert.match(html, /"cacheHitInputTokens":1000000/);
});

test('an empty usage config keeps the legacy title and adds no warning', () => {
  const { root } = materializeBundle('workspace-min.json');
  const result = run(['-t', root, '--no-open']);
  assert.equal(result.status, 0, result.stderr);

  const htmlName = fs.readdirSync(path.join(root, 'progress-gif'))
    .find((name) => name.endsWith('.html'));
  const html = fs.readFileSync(path.join(root, 'progress-gif', htmlName), 'utf8');
  assert.match(html, /"usage":\[\]/);
  assert.match(html, /"usageAvailable":true/);
  assert.doesNotMatch(result.stdout, /usage unavailable/);
});

test('a missing usage config marks usage unavailable instead of zero', () => {
  const { root } = materializeBundle('workspace-min.json');
  const missingConfigDir = path.join(os.tmpdir(), `conver-missing-config-${process.pid}-${Date.now()}`);
  const result = runWithConfig(['-t', root, '--no-open'], missingConfigDir);
  assert.equal(result.status, 0, result.stderr);

  const htmlName = fs.readdirSync(path.join(root, 'progress-gif'))
    .find((name) => name.endsWith('.html'));
  const html = fs.readFileSync(path.join(root, 'progress-gif', htmlName), 'utf8');
  assert.match(html, /"usage":\[\]/);
  assert.match(html, /"usageAvailable":false/);
});

test('draw writes a usage cache and later runs reuse every unchanged file', async () => {
  const { root } = materializeBundle('workspace-min.json');
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conver-usage-config-'));
  const cachePath = writeUsageLog(root, configDir, usageRecordOf(root));

  const first = runWithConfig(['-t', root, '--no-open'], configDir);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(fs.existsSync(cachePath), true);

  const second = runWithConfig(['-t', root, '--no-open'], configDir);
  assert.equal(second.status, 0, second.stderr);

  const htmlNames = fs.readdirSync(path.join(root, 'progress-gif'))
    .filter((name) => name.endsWith('.html'));
  assert.equal(htmlNames.length, 2);
  for (const name of htmlNames) {
    const html = fs.readFileSync(path.join(root, 'progress-gif', name), 'utf8');
    assert.match(html, /"cacheHitInputTokens":1000000/);
    assert.match(html, /"cacheMissInputTokens":1000000/);
  }

  const reused = await aggregateUsage({ directory: root, configDir, cachePath });
  assert.equal(reused.cacheStats.filesReused, 1);
  assert.equal(reused.cacheStats.filesParsed, 0);
});

test('a corrupt usage cache is bypassed and the next draw still succeeds', () => {
  const { root } = materializeBundle('workspace-min.json');
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conver-usage-config-'));
  const cachePath = writeUsageLog(root, configDir, usageRecordOf(root));

  const first = runWithConfig(['-t', root, '--no-open'], configDir);
  assert.equal(first.status, 0, first.stderr);
  fs.writeFileSync(cachePath, '{not json');

  const second = runWithConfig(['-t', root, '--no-open'], configDir);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /PASS:/);
  assert.doesNotMatch(second.stdout, /usage unavailable/);

  const repaired = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  assert.equal(repaired.schema, CACHE_SCHEMA);
  assert.equal(Object.keys(repaired.files).length, 1);
});
