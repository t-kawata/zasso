// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
// PX-349 @verifies C001 @verifies C002 @verifies C003 @verifies C004 @verifies C005 @verifies C006
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { parseArgs } from '../../.claude/scripts/conver/draw-progress-gif.js';
import { materializeBundle, writeWorkspace } from './fixtures.mjs';

const CLI = path.resolve(new URL('../../.claude/scripts/conver/draw-progress-gif.js', import.meta.url).pathname);

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
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

test('a manifests-only workspace exits zero and writes HTML and a snapshot', () => {
  const { root } = materializeBundle('workspace-min.json');
  const before = hashTree(root);
  const result = run(['-t', root, '--no-open', '--no-source-scan']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS:/);
  assert.match(result.stdout, /canvas: 640x368/);
  const outputDir = path.join(root, 'progress-gif');
  const html = fs.readdirSync(outputDir).filter((name) => name.endsWith('.html'));
  assert.equal(html.length, 1);
  const snapshots = fs.readdirSync(path.join(outputDir, 'snapshots')).filter((name) => name.endsWith('.json'));
  assert.equal(snapshots.length, 1);
  assert.equal(hashTree(root), before);
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
