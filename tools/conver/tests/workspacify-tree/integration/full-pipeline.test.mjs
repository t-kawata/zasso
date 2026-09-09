// @verifies C003
// @verifies C004
// [::TICKET::] PX-178: workspacify-tree full pipeline integration tests.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-178 --for-spec --no-implementation-order`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CONVER_ROOT = process.cwd();
const RUN_SCRIPT = '.claude/scripts/workspacify-tree/run.mjs';
const FIXTURES = join(CONVER_ROOT, 'tests/workspacify-tree/fixtures');

function runCli(args) {
  return spawnSync(process.execPath, [RUN_SCRIPT, ...args], { cwd: CONVER_ROOT, encoding: 'utf8' });
}

function makeWorkingSpecDir() {
  const dir = mkdtempSync(join(tmpdir(), 'wst-pipe-'));
  cpSync(join(FIXTURES, 'long-spec.md'), join(dir, 'long-spec.md'));
  cpSync(join(FIXTURES, 'decisions-long-ok.json'), join(dir, 'decisions-long-ok.json'));
  return dir;
}

test('cli C003 [@verifies C003]: no arguments prints usage and exits non-zero', () => {
  const usage = runCli([]);
  assert.notEqual(usage.status, 0);
  assert.ok(usage.stdout.includes('usage:'));
});

test('cli C003 [@verifies C003]: parse subcommand returns the node exit code', () => {
  const parseResult = runCli(['parse', join(FIXTURES, 'small-spec.md')]);
  assert.equal(parseResult.status, 0);
  const parsed = JSON.parse(parseResult.stdout);
  assert.equal(parsed.status, 'PASS');
  assert.ok(parsed.heading_count >= 4);
});

test('pipeline C003 invariant [@verifies C003]: successful finalize publishes exactly one manifest into the spec directory', () => {
  const dir = makeWorkingSpecDir();
  const result = runCli(['finalize', `--spec=${join(dir, 'long-spec.md')}`, `--decisions=${join(dir, 'decisions-long-ok.json')}`, `--output-dir=${dir}`]);
  assert.equal(result.status, 0, result.stdout);
  const manifestPath = join(dir, 'WORKSPACIFY-TREE-MANIFEST.json');
  assert.equal(existsSync(manifestPath), true);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.status, 'COMPLETE');
});

test('pipeline C004 [@verifies C004]: an invalid decision input prevents COMPLETE', () => {
  const dir = makeWorkingSpecDir();
  cpSync(join(FIXTURES, 'decisions-review-open.json'), join(dir, 'decisions-review-open.json'));
  const result = runCli(['finalize', `--spec=${join(dir, 'long-spec.md')}`, `--decisions=${join(dir, 'decisions-review-open.json')}`, `--output-dir=${dir}`]);
  assert.notEqual(result.status, 0);
  const manifestPath = join(dir, 'WORKSPACIFY-TREE-MANIFEST.json');
  assert.equal(existsSync(manifestPath), false);
});
