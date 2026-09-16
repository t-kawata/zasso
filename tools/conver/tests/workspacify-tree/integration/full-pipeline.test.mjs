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
const RUN_SCRIPT = join(CONVER_ROOT, '.claude/scripts/workspacify-tree/run.mjs');
const FIXTURES = join(CONVER_ROOT, 'tests/workspacify-tree/fixtures');
import { stageTreeDecisionsFrom } from '../helpers/stage-tree-decisions.mjs';

function runCli(args, cwd = CONVER_ROOT) {
  return spawnSync(process.execPath, [RUN_SCRIPT, ...args], { cwd, encoding: 'utf8' });
}

function makeWorkingSpecDir() {
  const dir = mkdtempSync(join(tmpdir(), 'wst-pipe-'));
  cpSync(join(FIXTURES, 'long-spec.md'), join(dir, 'long-spec.md'));
  return dir;
}

// [::TICKET::] PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-215 --for-spec --no-implementation-order`.
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
  stageTreeDecisionsFrom(dir, join(FIXTURES, 'decisions-long-ok.json'));
  const result = runCli(['finalize', `--spec=${join(dir, 'long-spec.md')}`], dir);
  assert.equal(result.status, 0, result.stdout);
  const manifestPath = join(dir, 'WORKSPACIFY-TREE-MANIFEST.json');
  assert.equal(existsSync(manifestPath), true);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.status, 'COMPLETE');
});

test('pipeline C004 [@verifies C004]: an invalid decision input prevents COMPLETE', () => {
  const dir = makeWorkingSpecDir();
  stageTreeDecisionsFrom(dir, join(FIXTURES, 'decisions-review-open.json'));
  const result = runCli(['finalize', `--spec=${join(dir, 'long-spec.md')}`], dir);
  assert.notEqual(result.status, 0);
  const manifestPath = join(dir, 'WORKSPACIFY-TREE-MANIFEST.json');
  assert.equal(existsSync(manifestPath), false);
});
